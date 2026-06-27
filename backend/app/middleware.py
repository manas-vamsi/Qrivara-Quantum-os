"""Production hardening for the QRIVARA API — wired in ``main.py``.

Four concerns, each independently toggled in ``config.Settings``:

  • Request-ID + structured access logging  (observability)
  • Global exception handler                (never leak a stack trace; clean 500)
  • Per-IP token-bucket rate limiting        (cheap DoS / abuse guard)
  • Body-size limit + security headers        (defensive defaults)

All of this is request-path middleware, so it is invisible to the pure-function
test suite (no DB / no network). The rate limiter is in-process (per uvicorn
worker); a multi-node deployment should also front the API with a gateway limit.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict
from threading import Lock

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings

logger = logging.getLogger("qrivara.api")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(_h)
    logger.setLevel(logging.INFO)


# --------------------------------------------------------------------------- #
# Rate limiting — token bucket per client IP                                  #
# --------------------------------------------------------------------------- #
class _TokenBucket:
    """Classic token bucket: ``capacity`` tokens, refilled at ``rate`` tokens/sec.
    A request costs one token; an empty bucket → throttle. O(1), lock-guarded."""

    __slots__ = ("tokens", "capacity", "rate", "last")

    def __init__(self, capacity: float, rate: float, now: float):
        self.tokens = capacity
        self.capacity = capacity
        self.rate = rate
        self.last = now

    def take(self, now: float) -> bool:
        self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rate)
        self.last = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


class RateLimiter:
    """Per-IP token buckets with periodic pruning so idle clients don't leak memory."""

    def __init__(self, rpm: int, burst: int):
        self.rate = max(rpm, 1) / 60.0
        self.capacity = max(rpm / 60.0 + burst, 1.0)
        self._buckets: dict[str, _TokenBucket] = {}
        self._lock = Lock()
        self._last_prune = 0.0

    def allow(self, key: str, now: float) -> bool:
        with self._lock:
            b = self._buckets.get(key)
            if b is None:
                b = _TokenBucket(self.capacity, self.rate, now)
                self._buckets[key] = b
            ok = b.take(now)
            # prune buckets that have fully refilled and gone idle (>5 min)
            if now - self._last_prune > 300.0:
                self._buckets = {
                    k: v for k, v in self._buckets.items()
                    if not (v.tokens >= v.capacity and now - v.last > 300.0)
                }
                self._last_prune = now
            return ok


def _client_ip(request: Request) -> str:
    """Client IP for rate-limiting. Honours X-Forwarded-For ONLY when
    ``trust_forwarded_for`` is set (a trusted proxy is in front) — otherwise a client
    could spoof XFF to get a fresh bucket per request and bypass the limit. Defaults
    to the real socket peer."""
    if settings.trust_forwarded_for:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------------- #
# Middleware                                                                  #
# --------------------------------------------------------------------------- #
class HardeningMiddleware(BaseHTTPMiddleware):
    """Single pass: assign a request id, enforce body-size + rate limits, time the
    request, attach security headers, and emit one structured access-log line."""

    def __init__(self, app):
        super().__init__(app)
        self._limiter = (
            RateLimiter(settings.rate_limit_rpm, settings.rate_limit_burst)
            if settings.rate_limit_enabled else None
        )

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = rid
        path = request.url.path
        exempt = path == "/health" or request.method == "OPTIONS"

        # 1) body-size guard — checks the DECLARED Content-Length only (cheap, rejects
        # before the body is read). A client that omits the header or uses chunked
        # transfer-encoding is NOT bounded here; enforce a hard cap at the reverse
        # proxy / ASGI layer for untrusted ingress.
        if not exempt:
            clen = request.headers.get("content-length")
            if clen and clen.isdigit() and int(clen) > settings.max_body_bytes:
                return self._err(413, "Request body too large", rid)

        # 2) rate limit per client IP
        if self._limiter is not None and not exempt:
            if not self._limiter.allow(_client_ip(request), time.monotonic()):
                logger.warning("rate_limited ip=%s path=%s rid=%s", _client_ip(request), path, rid)
                resp = self._err(429, "Rate limit exceeded — slow down", rid)
                resp.headers["Retry-After"] = "1"
                return resp

        # 3) run the handler, timing it; unhandled errors → clean 500 (no stack leak)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001 — last line of defence
            dur_ms = (time.perf_counter() - start) * 1000.0
            logger.exception("unhandled method=%s path=%s rid=%s dur_ms=%.1f", request.method, path, rid, dur_ms)
            return self._err(500, "Internal server error", rid)

        dur_ms = (time.perf_counter() - start) * 1000.0
        response.headers["X-Request-ID"] = rid
        response.headers["X-Response-Time-ms"] = f"{dur_ms:.1f}"
        if settings.security_headers:
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault("Referrer-Policy", "no-referrer")
        if settings.log_requests and not exempt:
            logger.info(
                "method=%s path=%s status=%s dur_ms=%.1f ip=%s rid=%s",
                request.method, path, response.status_code, dur_ms, _client_ip(request), rid,
            )
        return response

    @staticmethod
    def _err(status: int, detail: str, rid: str) -> JSONResponse:
        return JSONResponse({"detail": detail, "request_id": rid}, status_code=status)


def install(app: FastAPI) -> None:
    """Attach the hardening middleware to ``app``.

    The middleware's own ``try/except`` around ``call_next`` is the single 500
    handler: it sits inside Starlette's ServerErrorMiddleware, so an endpoint
    exception is caught HERE (logged with request id + duration, returned as a clean
    JSON 500 with no stack trace) before it can reach a registered ``exception_handler``
    — so we deliberately do NOT also register one (it would be dead code). CORS must
    be the OUTERMOST middleware (added last in main.py) so this 500/429/413 response
    still receives Access-Control-Allow-Origin headers and the browser can read it."""
    app.add_middleware(HardeningMiddleware)
