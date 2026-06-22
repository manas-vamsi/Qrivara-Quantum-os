import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import {
  Play,
  RefreshCw,
  FileCode,
  Folder,
  FolderOpen,
  Cpu,
  Radio,
  Link2,
  Check,
  Trash2,
  TerminalSquare,
  MoreHorizontal,
  Box,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Braces,
  Download,
  Copy,
  RotateCcw,
  X,
  FilePlus,
  FolderPlus,
  Pencil,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Form";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useDesignStore } from "@/store/useDesignStore";

/* ──────────────────────────────────────────────────────────────────────────
 * Real, self-contained sample scripts (NumPy only). Each runs as-is with
 * `python <file>` and mirrors QRIVARA's server-side physics. The design scripts
 * (falcon17 / generated) carry QUBITS/RESONATORS/COUPLINGS literals that the
 * "Run" round-trip parses back onto the Visual Designer canvas.
 * ------------------------------------------------------------------------- */

const FALCON = `"""Falcon-9 — 9-qubit processor (sample design).

Self-contained: requires only NumPy (pip install numpy).
Run it:  python falcon17.py
Edit a design in the QRIVARA Visual Designer and click "Code" to generate
this script from your own canvas. Physics mirrors QRIVARA's server engine.
"""
import numpy as np


# --- Physics (Koch 2007 transmon; Krantz 2019 cQED) -------------------------
def transmon_levels(ej, ec, ng=0.0, ncut=31, levels=3):
    """Exact transmon spectrum by charge-basis diagonalization."""
    n = np.arange(-ncut, ncut + 1)
    H = np.diag(4.0 * ec * (n - ng) ** 2)
    off = -0.5 * ej * np.ones(len(n) - 1)
    H += np.diag(off, 1) + np.diag(off, -1)
    ev = np.sort(np.linalg.eigvalsh(H))
    return ev[:levels] - ev[0]


def f01_anharm(ej, ec):
    lv = transmon_levels(ej, ec, levels=3)
    f01 = lv[1] - lv[0]
    return f01, ((lv[2] - lv[1]) - f01) * 1000.0


def design_for_target(f01_ghz, anharm_mhz):
    ec = max(abs(anharm_mhz) / 1000.0, 1e-3)
    ej = (max(f01_ghz, 0.01) + ec) ** 2 / (8.0 * ec)
    return ej, ec


def coupling_g(fq, fr, cg_ff=8.0, cq_ff=70.0, cr_ff=120.0):
    beta = cg_ff / np.sqrt(cq_ff * cr_ff)
    return 0.5 * beta * np.sqrt(max(fq * fr, 0.0)) * 1000.0


def dispersive_shift(g_mhz, fq, fr, anh_mhz):
    delta = (fq - fr) * 1000.0
    if abs(delta) < 1e-6 or abs(delta + anh_mhz) < 1e-6:
        return 0.0
    return (g_mhz ** 2 / delta) * (anh_mhz / (delta + anh_mhz))


# --- Design (9-qubit lattice) -----------------------------------------------
QUBITS = [
    {"name": "Q1", "target_f01_GHz": 5.21, "anharm_MHz": -300.0},
    {"name": "Q2", "target_f01_GHz": 4.98, "anharm_MHz": -300.0},
    {"name": "Q3", "target_f01_GHz": 5.34, "anharm_MHz": -300.0},
    {"name": "Q4", "target_f01_GHz": 5.07, "anharm_MHz": -300.0},
    {"name": "Q5", "target_f01_GHz": 5.19, "anharm_MHz": -300.0},
    {"name": "Q6", "target_f01_GHz": 4.92, "anharm_MHz": -300.0},
    {"name": "Q7", "target_f01_GHz": 5.28, "anharm_MHz": -300.0},
    {"name": "Q8", "target_f01_GHz": 5.11, "anharm_MHz": -300.0},
    {"name": "Q9", "target_f01_GHz": 5.02, "anharm_MHz": -300.0},
]
RESONATORS = [
    {"name": "R1", "freq_GHz": 7.00, "kappa_MHz": 1.2},
    {"name": "R2", "freq_GHz": 7.05, "kappa_MHz": 1.2},
    {"name": "R3", "freq_GHz": 7.10, "kappa_MHz": 1.2},
    {"name": "R4", "freq_GHz": 7.15, "kappa_MHz": 1.2},
    {"name": "R5", "freq_GHz": 7.20, "kappa_MHz": 1.2},
    {"name": "R6", "freq_GHz": 7.25, "kappa_MHz": 1.2},
    {"name": "R7", "freq_GHz": 7.30, "kappa_MHz": 1.2},
    {"name": "R8", "freq_GHz": 7.35, "kappa_MHz": 1.2},
    {"name": "R9", "freq_GHz": 7.40, "kappa_MHz": 1.2},
]
COUPLINGS = [
    ("Q1", "R1"), ("Q2", "R2"), ("Q3", "R3"), ("Q4", "R4"), ("Q5", "R5"),
    ("Q6", "R6"), ("Q7", "R7"), ("Q8", "R8"), ("Q9", "R9"),
]


def main():
    print("QRIVARA design simulation")
    print("=" * 68)
    solved = {}
    for q in QUBITS:
        ej, ec = design_for_target(q["target_f01_GHz"], q["anharm_MHz"])
        f01, anh = f01_anharm(ej, ec)
        solved[q["name"]] = {"f01": f01, "anh": anh}
        print("[qubit] {:>6}: EJ={:7.2f} GHz  EC={:6.3f} GHz  ->  f01={:6.3f} GHz"
              "  alpha={:7.1f} MHz".format(q["name"], ej, ec, f01, anh))
    for qn, rn in COUPLINGS:
        q = solved[qn]
        r = next(x for x in RESONATORS if x["name"] == rn)
        g = coupling_g(q["f01"], r["freq_GHz"])
        chi = dispersive_shift(g, q["f01"], r["freq_GHz"], q["anh"])
        print("[disp ] {}<->{}: g={:6.2f} MHz  chi={:7.3f} MHz".format(qn, rn, g, chi))
    print("=" * 68)
    print("{} qubit(s), {} resonator(s)".format(len(QUBITS), len(RESONATORS)))


if __name__ == "__main__":
    main()
`;

const LATTICE = `"""Frequency-collision check for a fixed-frequency CR lattice (sample).
NumPy only. IBM heavy-hex collision model (Hertzberg et al., npj QI 2021).
Run:  python lattice.py
"""
import numpy as np

ALPHA = -330.0                      # anharmonicity (MHz)
MARGIN = {"m1": 17, "m2": 4, "m3": 30, "m4": 30}   # tolerance bounds (MHz)


def pair_collisions(f_i, f_j, alpha=ALPHA):
    """Nearest-neighbour CR collision types for a connected pair (MHz)."""
    d = abs(alpha)
    diff = abs(f_i - f_j)
    out = []
    if diff <= MARGIN["m1"]:                 out.append(1)   # 01-01 resonance
    if abs(diff - d / 2) <= MARGIN["m2"]:    out.append(2)   # 01-02/2 two-photon
    if abs(diff - d) <= MARGIN["m3"]:        out.append(3)   # 01-12
    if diff >= d + MARGIN["m4"]:             out.append(4)   # slow gate
    return out


def main():
    # 3-frequency repeating pattern on a chain (a valid heavy-hex colouring)
    freqs = [5000, 5130, 5260, 5000, 5130, 5260]   # MHz
    edges = [(i, i + 1) for i in range(len(freqs) - 1)]
    print("QRIVARA frequency-collision check  (alpha = %d MHz)" % ALPHA)
    print("=" * 56)
    total = 0
    for a, b in edges:
        c = pair_collisions(freqs[a], freqs[b])
        total += len(c)
        print("Q%d-Q%d  detuning=%4d MHz   collisions=%s"
              % (a + 1, b + 1, abs(freqs[a] - freqs[b]), c or "none"))
    print("=" * 56)
    print("total collisions: %d   (0 = manufacturable plan)" % total)


if __name__ == "__main__":
    main()
`;

const COUPLERS = `"""Tunable coupler — asymmetric-SQUID f01(flux) and static ZZ (sample).
NumPy only.  Run:  python couplers.py
"""
import numpy as np


def squid_ej(ej_sum, flux, d=0.1):
    """Effective EJ of an asymmetric SQUID vs external flux (Phi / Phi0)."""
    return ej_sum * np.sqrt(np.cos(np.pi * flux) ** 2 + (d * np.sin(np.pi * flux)) ** 2)


def f01(ej, ec):
    return np.sqrt(8.0 * ej * ec) - ec


def static_zz(fq, fc, anh=-300.0, g_mhz=50.0):
    """Perturbative qubit-coupler static ZZ (MHz)."""
    delta = (fq - fc) * 1000.0
    if abs(delta) < 1e-6 or abs(delta + anh) < 1e-6:
        return 0.0
    return 2.0 * g_mhz ** 2 * anh / (delta * (delta + anh))


def main():
    ec, ej_sum = 0.30, 18.0
    print("Phi/Phi0    EJ(GHz)   f01(GHz)   ZZ(MHz)")
    print("=" * 44)
    for flux in np.linspace(0.0, 0.5, 6):
        ej = squid_ej(ej_sum, flux)
        fq = f01(ej, ec)
        print("  %4.2f     %7.2f   %7.3f   %7.2f"
              % (flux, ej, fq, static_zz(fq, 5.0)))
    print("=" * 44)
    print("net-zero ZZ is reached near the flux where f_q - f_c = -alpha")


if __name__ == "__main__":
    main()
`;

const READOUT = `"""Dispersive readout — chi, SNR and assignment fidelity (sample).
NumPy only.  Run:  python readout.py
"""
import numpy as np
from math import erfc


def chi(g_mhz, fq, fr, anh_mhz):
    """Dispersive shift chi (MHz)  (Koch 2007)."""
    delta = (fq - fr) * 1000.0
    return (g_mhz ** 2 / delta) * (anh_mhz / (delta + anh_mhz))


def snr(chi_mhz, kappa_mhz, n_bar, t_ns, eta=0.5):
    """Heterodyne single-shot SNR (Gambetta 2007)."""
    chi_r = 2 * np.pi * chi_mhz * 1e6
    kap = 2 * np.pi * kappa_mhz * 1e6
    t = t_ns * 1e-9
    r = 2 * chi_r / kap
    return np.sqrt(max(2 * eta * kap * t * n_bar * (r * r / (1 + r * r)), 0.0))


def assignment_fidelity(s):
    return 1.0 - 0.5 * erfc(s / 2.0)


def main():
    g, fq, fr, anh, kappa, n_bar, t = 92.0, 5.0, 7.1, -300.0, 1.2, 5.0, 500.0
    x = chi(g, fq, fr, anh)
    s = snr(x, kappa, n_bar, t)
    print("QRIVARA dispersive readout")
    print("=" * 50)
    print("chi          = %7.3f MHz" % x)
    print("2*chi split  = %7.3f MHz" % (2 * x))
    print("SNR          = %7.2f      (n_bar=%.0f, t=%.0f ns)" % (s, n_bar, t))
    print("fidelity     = %7.4f" % assignment_fidelity(s))


if __name__ == "__main__":
    main()
`;

const EIGENMODE = `"""Coupled LC eigenmodes from a capacitance + Josephson-L matrix (sample).
NumPy only.  Run:  python eigenmode.py
"""
import numpy as np


def lc_eigenmodes(c_matrix_fF, l_inv):
    """Normal-mode frequencies (GHz) of the generalized eigenproblem C w^2 = Linv."""
    C = np.array(c_matrix_fF, float) * 1e-15
    Li = np.array(l_inv, float)
    w2 = np.linalg.eigvals(np.linalg.inv(C) @ Li)
    f = np.sqrt(np.abs(w2)) / (2 * np.pi) / 1e9
    return np.sort(f)


def main():
    # two transmons, mutual capacitance -2 fF, Lj = 10 nH each
    C = [[80.0, -2.0], [-2.0, 80.0]]
    lj = [10e-9, 10e-9]
    Li = [[1.0 / lj[0], 0.0], [0.0, 1.0 / lj[1]]]
    f = lc_eigenmodes(C, Li)
    print("QRIVARA coupled LC eigenmodes")
    print("=" * 40)
    for i, fi in enumerate(f):
        print("mode %d : %6.3f GHz" % (i + 1, fi))
    print("mode splitting = %.1f MHz" % ((f[1] - f[0]) * 1000.0))


if __name__ == "__main__":
    main()
`;

const SWEEP = `"""Parameter sweep — f01 vs total capacitance C_Sigma (sample).
NumPy only.  Run:  python sweep.py
"""
import numpy as np

E = 1.602176634e-19
H = 6.62607015e-34


def ec_from_capacitance(c_ff):
    """Charging energy EC (GHz) from total capacitance (fF)."""
    return (E * E) / (2 * c_ff * 1e-15 * H) / 1e9


def f01(ej, ec):
    return np.sqrt(8.0 * ej * ec) - ec


def main():
    ej = 14.0
    print("C_Sigma(fF)   EC(MHz)   f01(GHz)")
    print("=" * 36)
    for c in np.linspace(60.0, 100.0, 9):
        ec = ec_from_capacitance(c)
        print("   %6.1f     %7.1f   %7.3f" % (c, ec * 1000.0, f01(ej, ec)))


if __name__ == "__main__":
    main()
`;

// Default workspace — folder-pathed (VS Code-style). The whole workspace (files,
// folders, open tabs) persists in localStorage, so the project survives reloads.
const DEFAULT_FILES: Record<string, string> = {
  "design/falcon17.py": FALCON,
  "design/lattice.py": LATTICE,
  "components/couplers.py": COUPLERS,
  "components/readout.py": READOUT,
  "analysis/eigenmode.py": EIGENMODE,
  "analysis/sweep.py": SWEEP,
};
const DEFAULT_FOLDERS = ["design", "components", "analysis"];

const LS_FILES = "qrivara:codestudio:files";
const LS_FOLDERS = "qrivara:codestudio:folders";
const LS_TABS = "qrivara:codestudio:tabs";

const basename = (p: string) => p.split("/").pop() || p;
const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

type TreeNode = { name: string; path: string; isFile: boolean; children: TreeNode[] };

/** Build a nested folder tree from file paths + explicit (possibly empty) folders. */
function buildTree(filePaths: string[], folderPaths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFile: false, children: [] };
  const ensureFolder = (path: string): TreeNode => {
    const parts = path.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      const sub = parts.slice(0, i + 1).join("/");
      let child = cur.children.find((c) => !c.isFile && c.name === part);
      if (!child) {
        child = { name: part, path: sub, isFile: false, children: [] };
        cur.children.push(child);
      }
      cur = child;
    });
    return cur;
  };
  folderPaths.forEach((f) => f && ensureFolder(f));
  filePaths.forEach((p) => {
    const dir = dirname(p);
    const parent = dir ? ensureFolder(dir) : root;
    if (!parent.children.find((c) => c.isFile && c.path === p))
      parent.children.push({ name: basename(p), path: p, isFile: true, children: [] });
  });
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) =>
      a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1,
    );
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.children;
}

function loadFiles(): Record<string, string> {
  let base: Record<string, string> = { ...DEFAULT_FILES };
  try {
    const saved = localStorage.getItem(LS_FILES);
    if (saved) base = JSON.parse(saved);
    const gen = sessionStorage.getItem("qrivara:generated");
    if (gen) base["generated.py"] = gen;
  } catch {
    /* ignore */
  }
  return base;
}
function loadFolders(): string[] {
  try {
    const saved = localStorage.getItem(LS_FOLDERS);
    if (saved) return JSON.parse(saved);
  } catch {
    /* ignore */
  }
  return [...DEFAULT_FOLDERS];
}
function loadTabs(): string[] {
  const f = loadFiles();
  try {
    const saved = localStorage.getItem(LS_TABS);
    if (saved) {
      const t = JSON.parse(saved).filter((x: string) => x in f);
      if (t.length) return t;
    }
  } catch {
    /* ignore */
  }
  return ["generated.py"]
    .filter((x) => x in f)
    .concat(["design/falcon17.py", "components/couplers.py"].filter((x) => x in f));
}

type LogKind = "prompt" | "info" | "ok" | "warn" | "out";

/** Lightweight client-side analysis of a script for the outline + metrics. */
function analyze(src: string) {
  const qubits = (src.match(/"target_f01_GHz"\s*:/g) || []).length;
  const resonators = (src.match(/"freq_GHz"\s*:/g) || []).length;
  const couplings = (src.match(/\(\s*"[^"]+"\s*,\s*"[^"]+"\s*\)/g) || []).length;
  const functions = (src.match(/^\s*def\s+\w+/gm) || []).length;
  const hasMain = /def\s+main\s*\(/.test(src);
  const lines = src.split("\n").length;
  const isDesign = /\bQUBITS\s*=\s*\[/.test(src);
  return { qubits, resonators, couplings, functions, hasMain, lines, isDesign };
}

export default function CodeStudio() {
  const navigate = useNavigate();
  const setGraph = useDesignStore((s) => s.setGraph);

  // Workspace — path-keyed files + explicit folders, persisted in localStorage.
  const [files, setFiles] = useState<Record<string, string>>(loadFiles);
  const [folders, setFolders] = useState<string[]>(loadFolders);
  const [openTabs, setOpenTabs] = useState<string[]>(loadTabs);
  const [active, setActive] = useState<string>(() => loadTabs()[0] ?? Object.keys(loadFiles())[0] ?? "");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const e: Record<string, boolean> = {};
    loadFolders().forEach((f) => (e[f] = true));
    return e;
  });

  // Persist the workspace so the project (files & folders) survives reloads.
  useEffect(() => { try { localStorage.setItem(LS_FILES, JSON.stringify(files)); } catch { /* ignore */ } }, [files]);
  useEffect(() => { try { localStorage.setItem(LS_FOLDERS, JSON.stringify(folders)); } catch { /* ignore */ } }, [folders]);
  useEffect(() => { try { localStorage.setItem(LS_TABS, JSON.stringify(openTabs)); } catch { /* ignore */ } }, [openTabs]);

  const tree = useMemo(() => buildTree(Object.keys(files), folders), [files, folders]);
  const [liveSync, setLiveSync] = useState(true);
  const [running, setRunning] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [log, setLog] = useState<{ k: LogKind; t: string }[]>([
    { k: "info", t: "Ready — edit a script and click Run to parse a design back onto the canvas." },
  ]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const code = files[active] ?? "";
  const stats = useMemo(() => analyze(code), [code]);

  // close the "more" menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  const openFile = (f: string) => {
    if (!(f in files)) return;
    setActive(f);
    setOpenTabs((t) => (t.includes(f) ? t : [...t, f]));
  };

  const closeTab = (f: string) => {
    const next = openTabs.filter((x) => x !== f);
    setOpenTabs(next);
    if (active === f) setActive(next[next.length - 1] ?? "");
  };

  // ── File / folder operations (VS Code-style, persisted in the workspace) ────
  const newFile = (dir = "") => {
    const input = window.prompt("New file path:", dir ? `${dir}/untitled.py` : "untitled.py");
    if (!input) return;
    let path = input.trim().replace(/^\/+|\/+$/g, "");
    if (!path) return;
    if (!/\.[A-Za-z0-9]+$/.test(path)) path += ".py";
    if (path in files) { openFile(path); return; }
    setFiles((f) => ({ ...f, [path]: `# ${path}\n` }));
    setOpenTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
    const d = dirname(path);
    if (d) setExpanded((e) => ({ ...e, [d]: true }));
  };

  const newFolder = (parent = "") => {
    const input = window.prompt("New folder path:", parent ? `${parent}/new-folder` : "new-folder");
    if (!input) return;
    const path = input.trim().replace(/^\/+|\/+$/g, "");
    if (!path) return;
    setFolders((fs) => (fs.includes(path) ? fs : [...fs, path]));
    setExpanded((e) => ({ ...e, [path]: true }));
  };

  const renameItem = (path: string, isFile: boolean) => {
    const input = window.prompt(`Rename ${isFile ? "file" : "folder"}:`, path);
    if (!input) return;
    const np = input.trim().replace(/^\/+|\/+$/g, "");
    if (!np || np === path) return;
    if (isFile) {
      setFiles((f) => { const c = { ...f }; const v = c[path]; delete c[path]; c[np] = v; return c; });
      setOpenTabs((t) => t.map((x) => (x === path ? np : x)));
      if (active === path) setActive(np);
    } else {
      const re = (x: string) => (x === path ? np : x.startsWith(path + "/") ? np + x.slice(path.length) : x);
      setFiles((f) => { const c: Record<string, string> = {}; for (const k in f) c[re(k)] = f[k]; return c; });
      setFolders((fs) => fs.map(re));
      setOpenTabs((t) => t.map(re));
      setActive((a) => re(a));
    }
  };

  const deleteItem = (path: string, isFile: boolean) => {
    if (!window.confirm(`Delete ${isFile ? "file" : "folder"} "${path}"${isFile ? "" : " and everything inside it"}?`)) return;
    if (isFile) {
      setFiles((f) => { const c = { ...f }; delete c[path]; return c; });
      const next = openTabs.filter((x) => x !== path);
      setOpenTabs(next);
      if (active === path) setActive(next[next.length - 1] ?? "");
    } else {
      const under = (x: string) => x === path || x.startsWith(path + "/");
      setFiles((f) => { const c = { ...f }; for (const k in c) if (under(k)) delete c[k]; return c; });
      setFolders((fs) => fs.filter((x) => !under(x)));
      const next = openTabs.filter((x) => !under(x));
      setOpenTabs(next);
      if (under(active)) setActive(next[next.length - 1] ?? "");
    }
  };

  const run = async () => {
    if (!active) return;
    setRunning(true);
    const add: { k: LogKind; t: string }[] = [{ k: "prompt", t: `$ python ${basename(active)}` }];
    try {
      // 1) REAL execution — actual stdout/stderr from the server interpreter
      const res = await api.runCode(code, basename(active));
      const out = (res.stdout || "").replace(/\n+$/, "");
      const err = (res.stderr || "").replace(/\n+$/, "");
      if (out) out.split("\n").forEach((t: string) => add.push({ k: "out", t }));
      if (err) err.split("\n").forEach((t: string) => add.push({ k: "warn", t }));
      if (!out && !err) add.push({ k: "info", t: "(no output)" });
      add.push({
        k: res.exit_code === 0 ? "ok" : "warn",
        t: `[exit ${res.exit_code} · ${res.duration_ms} ms${res.timed_out ? " · timed out" : ""}]`,
      });
      // 2) design scripts also round-trip onto the Visual Designer canvas
      if (stats.isDesign && liveSync) {
        try {
          const ex = await api.executeCode(code);
          if (ex?.doc?.nodes?.length) {
            setGraph(ex.doc.nodes, ex.doc.edges);
            add.push({ k: "ok", t: `✓ Synced ${ex.metrics?.qubits ?? ex.doc.nodes.length} component(s) to the Visual Designer canvas` });
          }
        } catch {
          /* canvas sync is best-effort */
        }
      }
    } catch (err: any) {
      // in-app execution disabled/unavailable → honest, runnable-locally fallback
      add.push({ k: "warn", t: `Run failed: ${err?.message ?? "unknown error"}` });
      add.push({ k: "info", t: `${basename(active)} is self-contained — Download it and run \`python ${basename(active)}\` locally.` });
    } finally {
      setLog((l) => [...l, ...add]);
      setRunning(false);
    }
  };

  const download = () => {
    const blob = new Blob([code], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = basename(active) || "script.py";
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setLog((l) => [...l, { k: "ok", t: `Copied ${basename(active)} to clipboard` }]);
    } catch {
      setLog((l) => [...l, { k: "warn", t: "Clipboard unavailable in this browser" }]);
    }
    setMenuOpen(false);
  };

  const resetFile = () => {
    if (active in DEFAULT_FILES) {
      setFiles((f) => ({ ...f, [active]: DEFAULT_FILES[active] }));
      setLog((l) => [...l, { k: "info", t: `Reset ${basename(active)} to the sample` }]);
    }
    setMenuOpen(false);
  };

  const logColor: Record<LogKind, string> = {
    prompt: "text-primary",
    info: "text-fg-muted",
    ok: "text-success",
    warn: "text-warning",
    out: "text-fg",
  };

  // Recursive file-tree renderer (folders + files, hover actions like VS Code).
  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const pad = { paddingLeft: `${0.4 + depth * 0.8}rem` };
      if (node.isFile) {
        return (
          <div key={node.path} className="group/row flex items-center">
            <button
              onClick={() => openFile(node.path)}
              style={pad}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1.5 pr-1 text-xs transition-colors",
                active === node.path ? "bg-primary/12 text-primary" : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
              )}
            >
              <FileCode className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
            <RowActions onRename={() => renameItem(node.path, true)} onDelete={() => deleteItem(node.path, true)} />
          </div>
        );
      }
      const open = expanded[node.path] ?? true;
      return (
        <div key={node.path}>
          <div className="group/row flex items-center">
            <button
              onClick={() => setExpanded((e) => ({ ...e, [node.path]: !(e[node.path] ?? true) }))}
              style={pad}
              className="flex min-w-0 flex-1 items-center gap-1 rounded-lg py-1.5 pr-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2"
              aria-expanded={open}
            >
              {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-warning" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />}
              <span className="truncate">{node.name}</span>
            </button>
            <RowActions
              onNewFile={() => newFile(node.path)}
              onNewFolder={() => newFolder(node.path)}
              onRename={() => renameItem(node.path, false)}
              onDelete={() => deleteItem(node.path, false)}
            />
          </div>
          {open && renderNodes(node.children, depth + 1)}
        </div>
      );
    });

  // Outline + metrics derived from the active file (no hardcoded numbers).
  const outline: { icon: any; name: string; tone: string }[] = [];
  if (stats.qubits) outline.push({ icon: Cpu, name: `QUBITS · ${stats.qubits} transmon${stats.qubits === 1 ? "" : "s"}`, tone: "text-primary" });
  if (stats.resonators) outline.push({ icon: Radio, name: `RESONATORS · ${stats.resonators} readout`, tone: "text-cyan" });
  if (stats.couplings) outline.push({ icon: Link2, name: `COUPLINGS · ${stats.couplings} pair${stats.couplings === 1 ? "" : "s"}`, tone: "text-success" });
  outline.push({ icon: Braces, name: `${stats.functions} function${stats.functions === 1 ? "" : "s"} defined`, tone: "text-violet" });
  if (stats.hasMain) outline.push({ icon: Play, name: "main() · entry point", tone: "text-warning" });

  const metrics: [string, string | number][] = [
    ["Lines of code", stats.lines],
    ["Functions", stats.functions],
  ];
  if (stats.qubits) metrics.push(["Qubits", stats.qubits]);
  if (stats.resonators) metrics.push(["Resonators", stats.resonators]);
  if (stats.couplings) metrics.push(["Couplings", stats.couplings]);

  const problems = log.filter((l) => l.k === "warn").length;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface/50 px-2">
        {openTabs.map((f) => (
          <div
            key={f}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              active === f ? "bg-surface-3 text-fg" : "text-fg-subtle hover:bg-surface-2 hover:text-fg",
            )}
          >
            <button onClick={() => setActive(f)} className="flex items-center gap-2" title={f}>
              <FileCode className="h-3.5 w-3.5 text-cyan" />
              {basename(f)}
            </button>
            {openTabs.length > 1 && (
              <button
                onClick={() => closeTab(f)}
                aria-label={`Close ${f}`}
                className="rounded p-0.5 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-fg group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-2.5 pr-3 sm:flex">
            <RefreshCw className={cn("h-3.5 w-3.5 text-cyan", liveSync && "animate-spin-slow")} />
            <span className="text-2xs font-medium text-fg-muted">
              Canvas ⇄ Code · {liveSync ? "in sync" : "paused"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-fg-subtle">Live sync</span>
            <Switch checked={liveSync} onChange={setLiveSync} />
          </div>
          <Button size="sm" variant="ghost" icon={<Box className="h-3.5 w-3.5" />} onClick={() => navigate("/app/view3d?source=live")}>
            View in 3D
          </Button>
          <Button size="sm" loading={running} icon={<Play className="h-3.5 w-3.5" />} onClick={run}>
            Run
          </Button>
          <div className="relative" ref={menuRef}>
            <IconButton size="sm" onClick={() => setMenuOpen((v) => !v)} aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </IconButton>
            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-44 rounded-xl border border-line bg-surface p-1 shadow-pop">
                <MenuItem icon={<Download className="h-3.5 w-3.5" />} label="Download .py" onClick={download} />
                <MenuItem icon={<Copy className="h-3.5 w-3.5" />} label="Copy code" onClick={copyCode} />
                <MenuItem icon={<RotateCcw className="h-3.5 w-3.5" />} label="Reset to sample" onClick={resetFile} disabled={!(active in DEFAULT_FILES)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle */}
      <div className="flex min-h-0 flex-1">
        {/* File tree (VS Code-style: create/rename/delete folders & files) */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface/40 py-2 md:flex">
          <div className="flex items-center justify-between px-3 pb-1 pt-1">
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Explorer</p>
            <div className="flex items-center gap-0.5">
              <IconButton size="sm" title="New file" aria-label="New file" onClick={() => newFile("")}>
                <FilePlus className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton size="sm" title="New folder" aria-label="New folder" onClick={() => newFolder("")}>
                <FolderPlus className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-1">
            {tree.length === 0 ? (
              <p className="px-3 py-4 text-2xs text-fg-subtle">
                Empty workspace. Use the + buttons above to create a file or folder.
              </p>
            ) : (
              renderNodes(tree, 0)
            )}
          </div>
        </aside>

        {/* Editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="python"
              path={active}
              theme="vs-dark"
              value={code}
              onChange={(v) => setFiles((f) => ({ ...f, [active]: v ?? "" }))}
              onMount={(_editor, monaco) => {
                monaco.editor.defineTheme("qrivara-dark", {
                  base: "vs-dark",
                  inherit: true,
                  rules: [
                    { token: "comment", foreground: "7C756C", fontStyle: "italic" },
                    { token: "string", foreground: "40C08A" },
                    { token: "keyword", foreground: "B47CF0" },
                    { token: "number", foreground: "E0B255" },
                    { token: "type", foreground: "C8803A" },
                    { token: "function", foreground: "C8803A" },
                  ],
                  colors: {
                    "editor.background": "#161514",
                    "editor.foreground": "#F5F3EF",
                    "editor.lineHighlightBackground": "#1F1D1B",
                    "editorLineNumber.foreground": "#7C756C",
                    "editorLineNumber.activeForeground": "#B2ABA2",
                    "editorGutter.background": "#161514",
                    "editor.selectionBackground": "#C8803A44",
                    "editorCursor.foreground": "#C8803A",
                    "editorIndentGuide.background1": "#2C2926",
                    "editorWidget.background": "#1F1D1B",
                  },
                });
                monaco.editor.setTheme("qrivara-dark");
              }}
              options={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                fontLigatures: true,
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                smoothScrolling: true,
                cursorBlinking: "smooth",
                renderLineHighlight: "all",
                lineNumbersMinChars: 3,
                scrollbar: {
                  verticalScrollbarSize: 12,
                  horizontalScrollbarSize: 12,
                  alwaysConsumeMouseWheel: false,
                },
              }}
            />
          </div>
        </div>

        {/* Outline / preview — derived live from the active file */}
        <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-surface/40 xl:flex">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-fg">Generated Components</h3>
            <p className="text-2xs text-fg-subtle">
              {stats.isDesign ? "Reflected live on the canvas" : "Parsed from the active script"}
            </p>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {outline.map((o) => {
              const Icon = o.icon;
              return (
                <div key={o.name} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5">
                  <Icon className={cn("h-4 w-4 shrink-0", o.tone)} />
                  <span className="flex-1 text-xs font-medium text-fg">{o.name}</span>
                  <Check className="h-3.5 w-3.5 text-success" />
                </div>
              );
            })}
          </div>
          <div className="border-t border-line p-3">
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="mb-2 flex items-center justify-between text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
                Design Metrics
                <Badge tone={stats.isDesign ? "primary" : "neutral"}>{active}</Badge>
              </p>
              {metrics.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-fg-subtle">{k}</span>
                  <span className="font-mono text-fg">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Console */}
      <div className={cn("flex shrink-0 flex-col border-t border-line bg-bg-deep/40", consoleOpen ? "h-44" : "h-9")}>
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-3">
          <button
            type="button"
            onClick={() => setConsoleOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-fg transition-colors hover:text-primary"
            aria-expanded={consoleOpen}
            aria-label={consoleOpen ? "Collapse output panel" : "Expand output panel"}
          >
            {consoleOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            <TerminalSquare className="h-3.5 w-3.5 text-cyan" />
            Output
          </button>
          <span className={cn("text-2xs", problems ? "text-warning" : "text-fg-subtle")}>Problems ({problems})</span>
          {running && (
            <span className="flex items-center gap-1.5 text-2xs text-cyan">
              <StatusDot tone="cyan" pulse /> running…
            </span>
          )}
          <IconButton size="sm" className="ml-auto" onClick={() => setLog([])} title="Clear output">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
        {consoleOpen && (
          <div className="flex-1 space-y-0.5 overflow-y-auto p-3 font-mono text-xs">
            {log.length === 0 ? (
              <div className="text-fg-subtle">Output cleared. Click Run to execute the active script.</div>
            ) : (
              log.map((line, i) => (
                <div key={i} className={logColor[line.k]}>
                  {line.t}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors",
        disabled ? "cursor-not-allowed text-fg-subtle/50" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function RowActions({ onNewFile, onNewFolder, onRename, onDelete }: {
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover/row:opacity-100">
      {onNewFile && <ActBtn title="New file" onClick={onNewFile}><FilePlus className="h-3 w-3" /></ActBtn>}
      {onNewFolder && <ActBtn title="New folder" onClick={onNewFolder}><FolderPlus className="h-3 w-3" /></ActBtn>}
      {onRename && <ActBtn title="Rename" onClick={onRename}><Pencil className="h-3 w-3" /></ActBtn>}
      {onDelete && <ActBtn title="Delete" onClick={onDelete}><Trash2 className="h-3 w-3" /></ActBtn>}
    </div>
  );
}

function ActBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded p-1 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
    >
      {children}
    </button>
  );
}
