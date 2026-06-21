# QRIVARA — Collaboration & Social Module
### UX / UI + Architecture Design Spec (v1)

> Status: **Design / illustration phase.** No code yet — this is the blueprint we build from.
>
> **Decisions locked (2026-06-20):** (1) Real-time = **async-first + light presence** (no CRDT co-editing on the physics model). (2) Messaging = **full Slack-like chat — channels + DMs + threads** (not just comments). (3) Build order = **Phase 1 sharing first**. (4) Auth = **mock multi-user in dev** (seeded users + "Act as" switcher), real Supabase auth deferred but kept swappable.
> Design language: existing "Quantum Metal" theme (copper `#C8803A` · gold `#E0B255` · violet `#B47CF0`, warm-dark surfaces). All screens reuse the existing component kit (`Card`, `Button`, `Modal`, `Tabs`, `Avatar`, `Badge`, `Form`, `PageHeader`).

---

## 1. Vision & Mental Model

QRIVARA is a **heavy, IP-sensitive engineering tool** (quantum circuits + EM/quantum simulation + reports). So collaboration here is **engineering collaboration**, not casual co-writing. The right mental model — proven by the research — is a blend:

| Borrow from | For |
|---|---|
| **GitHub + Figma** | per-resource sharing, roles, presence |
| **Google Drive Share dialog** | the share UX (people + general access split) |
| **Slack + Linear** | org / team structure, workspace switcher |
| **LinkedIn / Facebook** | individual connection (friend) requests |
| **Slack** | **full chat — channels, DMs, threads** + notification inbox |
| **Notion / Slack** | activity feed, empty states |

**Three foundational rules** that drive everything:

1. **Private by default. Invisible, not denied.** A project nobody shared with you doesn't show "Access denied" — it simply *doesn't exist* in your view (Linear's private-team model). This is the literal requirement: "others cannot see or work on your projects until you give them permissions."
2. **Sharing is per-project and explicit.** You invite *one person* to *one project*; they see *only that project* on your profile. This is a **relationship (ReBAC)** problem, not a roles-per-user problem.
3. **Connections ≠ access.** Being someone's connection (friend) is social discoverability only. It never auto-grants project access. You still explicitly share each project.

---

## 2. Information Architecture

### 2.1 Two spaces, one identity
Every user has **one account** that lives in:
- **Personal space** (B2C / Facebook-like): their own projects + social graph (connections).
- **Org workspace(s)** (B2B / Enterprise plan / Slack-like): member directory, teams, shared org projects.

A **workspace switcher** at the top of the sidebar toggles context. Projects belong to exactly one space; sharing across the personal↔org boundary is just another grant.

```
┌─ Sidebar (top) ───────────────┐
│  ▾ NexVista Quantum Labs  ⌄    │  ← workspace switcher (click to open)
│     • Personal                 │
│     • NexVista Quantum Labs ✓  │   (Enterprise)
│     • + Join / create org      │
└────────────────────────────────┘
```

### 2.2 Where it lives in the nav
The existing nav already has **Collaboration → `/app/collaboration`**. We expand it into a **hub with sub-tabs**, and add a few integrated surfaces that live *outside* the hub (because they're invoked in context):

```
Collaboration hub  /app/collaboration
├── Network          (connections · requests · find people)      [Personal]
├── Shared with me   (projects others shared with you)
├── Organization     (members directory · teams)                 [Org only]
└── Activity         (feed of everything you're part of)

Messages             /app/messages       Slack-like chat: channels + DMs + threads
Profile page         /app/u/:handle      (own + others' public profiles)
Notification inbox   topbar bell ⌁       (global dropdown)
Share dialog         invoked from any Project / Designer / Results
Collaborators panel  inside a project    (manage who has access + presence)
```

**Messages** is large enough to be its own top-level surface (`/app/messages`, with a `MessageSquare` Lucide nav item). It's the Slack-like layer: org/personal channels, 1:1 and group DMs, threads, @mentions, and the ability to drop a project link into a channel (which can prompt a Share grant). It's **org-scoped** (channels belong to a workspace); DMs work between any two connected users across spaces.

`Settings → Collaboration` holds privacy defaults (who can send requests, default project visibility, notification prefs).

---

## 3. Permission Model (the core)

### 3.1 Roles
**Project-level (ReBAC grants):**

| Role | Can | Notable |
|---|---|---|
| **Owner** | everything incl. delete, transfer, manage access | creator; exactly one (transferable) |
| **Editor** | edit design, **run simulations**, save versions, comment | "run sim" gated here — compute costs money |
| **Commenter** | view + comment/annotate results & reports | cannot run sims or edit |
| **Viewer** | read-only view of design + results | cannot comment |

**Org-level (classic RBAC):** `Org Owner · Org Admin · Member · Guest`
**Team-level:** `Team Admin · Member`

Keep roles **sparse** — resist Slack-style role sprawl until enterprise customers demand it.

### 3.2 Visibility
A project has one visibility state (default **Private**):

| Visibility | Who can open |
|---|---|
| **Private** *(default)* | only people/teams with an explicit grant |
| **Org** | anyone in the owning org workspace |
| **Link** | anyone with the link (still role-scoped) |
| **Public** | anyone (future — for published reference designs) |

### 3.3 Why ReBAC, not RBAC/ABAC
The requirement "owner invites person X to project Y; X sees only Y" is the textbook **relationship-based access control** case (how Google Drive/Zanzibar works). Pure RBAC would explode into a role per (user, project) pair. We model **grants as relationship tuples**:

```
project:42 #owner    @ user:alice          alice created it
project:42 #editor   @ user:bob            alice shared it with bob
project:42 #viewer   @ team:lab-x          a whole team granted view
design:99  #parent   @ project:42          inheritance (design belongs to project)
```

**Authorization check** = "does a relation path connect the viewer to the project with ≥ required role?"
**Profile visibility** falls out for free: when V views O's profile, list only projects where `owner=O AND (V=O OR a grant links V — or a team V is in — to that project)`. Everything else is simply absent.

**Implementation path:** start with a relational `project_grant` table (ships fast, below). Keep the API relationship-shaped so we can later swap in **OpenFGA / SpiceDB** (open-source Zanzibar) if the graph gets complex. ABAC stays in reserve for compliance overlays only (e.g. "ITAR-flagged designs can't leave the org region").

---

## 4. Data Model (fits the existing SQLModel backend)

Existing: `User(id,email,name,role,org,…)`, `Project(id,…,created_by FK,collaborators=[names])`, `Comment`, `Activity`. We **deprecate `Project.collaborators` (names list)** in favor of real grants, and add:

```python
# --- Identity / profile (extend, don't replace, User) ---
class UserProfile(SQLModel, table=True):
    user_id: str = Field(foreign_key="user.id", primary_key=True)
    handle: str = Field(index=True, unique=True)      # @karthik — for /app/u/:handle
    avatar_url: Optional[str] = None
    headline: str = ""                                 # "Lead Quantum Engineer @ NexVista"
    bio: str = ""
    institution: str = ""
    links: list[str] = Field(default_factory=list, sa_column=Column(JSON))  # orcid, scholar, site
    # privacy
    discoverable: bool = True
    who_can_request: str = "anyone"   # anyone | connections_of_connections | handle_only
    updated_at: datetime = Field(default_factory=now)

# --- Social graph (B2C connections) ---
class Connection(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    requester_id: str = Field(foreign_key="user.id", index=True)
    addressee_id: str = Field(foreign_key="user.id", index=True)
    status: str = "pending"           # pending | accepted | blocked
    created_at: datetime = Field(default_factory=now)
    responded_at: Optional[datetime] = None
    # UNIQUE(requester_id, addressee_id); app enforces single edge per pair

# --- Per-project sharing (ReBAC grant) ---
class ProjectGrant(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    subject_type: str                 # "user" | "team"
    subject_id: str = Field(index=True)
    role: str                         # owner | editor | commenter | viewer
    granted_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    # UNIQUE(project_id, subject_type, subject_id)

# --- Invite a not-yet-registered person by email ---
class ShareInvite(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    email: str = Field(index=True)
    role: str
    token: str = Field(index=True)    # accept link
    status: str = "pending"           # pending | accepted | revoked
    invited_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)

# --- Enterprise org / teams (B2B) ---
class Organization(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    plan: str = "enterprise"          # individual | team | enterprise
    created_at: datetime = Field(default_factory=now)

class OrgMembership(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    org_id: str = Field(foreign_key="organization.id", index=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    role: str = "member"              # owner | admin | member | guest
    created_at: datetime = Field(default_factory=now)

class Team(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    org_id: str = Field(foreign_key="organization.id", index=True)
    name: str
    visibility: str = "open"          # open | private (private = invisible to non-members)
    created_at: datetime = Field(default_factory=now)

class TeamMembership(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    team_id: str = Field(foreign_key="team.id", index=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    role: str = "member"              # admin | member

# --- Notifications (actionable inbox) ---
class Notification(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)   # recipient
    type: str        # connection_request | project_shared | comment | mention | sim_done | org_invite
    actor_id: Optional[str] = Field(default=None, foreign_key="user.id")
    payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    read: bool = False
    created_at: datetime = Field(default_factory=now)

# --- Messaging (Slack-like: channels + DMs + threads) ---
class Channel(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    org_id: Optional[str] = Field(default=None, foreign_key="organization.id", index=True)  # null = personal
    name: str                          # "general", "fab-lab"
    topic: str = ""
    visibility: str = "public"         # public | private (private = invite-only, invisible)
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)

class Conversation(SQLModel, table=True):   # DM container (1:1 or group)
    id: str = Field(default_factory=uid, primary_key=True)
    kind: str = "dm"                   # dm | group
    created_at: datetime = Field(default_factory=now)

class ChatMembership(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    channel_id: Optional[str] = Field(default=None, foreign_key="channel.id", index=True)
    conversation_id: Optional[str] = Field(default=None, foreign_key="conversation.id", index=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    role: str = "member"              # admin | member
    last_read_at: Optional[datetime] = None   # drives unread counts
    joined_at: datetime = Field(default_factory=now)

class Message(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    channel_id: Optional[str] = Field(default=None, foreign_key="channel.id", index=True)
    conversation_id: Optional[str] = Field(default=None, foreign_key="conversation.id", index=True)
    parent_id: Optional[str] = Field(default=None, foreign_key="message.id", index=True)  # thread reply
    author_id: str = Field(foreign_key="user.id")
    body: str
    attachments: list[Any] = Field(default_factory=list, sa_column=Column(JSON))  # files, project refs
    project_ref: Optional[str] = Field(default=None, foreign_key="project.id")     # shared project card
    edited_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=now)

# extend existing Project with: visibility: str = "private"
# extend existing Activity with: project_id (scope feeds), org_id

`Project` gains `visibility: str = "private"`. Add **Alembic** before these land (the backend currently uses `create_all()` — fine for dev, but new tables in prod want migrations).

---

## 5. API Surface (new endpoints, FastAPI)

```
# Profiles
GET   /users/{handle}                  public profile (respects visibility)
PATCH /me/profile                      edit own profile/privacy
GET   /users/search?q=                 find people (typeahead)

# Connections (B2C)
POST  /connections                     {addressee_id}  → send request
POST  /connections/{id}/accept
POST  /connections/{id}/decline        (silent to requester)
DELETE /connections/{id}               withdraw / unfriend
POST  /connections/{id}/block
GET   /connections?status=accepted|pending|incoming

# Sharing (ReBAC)
GET   /projects/{id}/grants            who has access (+ roles)
POST  /projects/{id}/grants            {subject_type,subject_id|email,role}  → share
PATCH /projects/{id}/grants/{gid}      change role
DELETE /projects/{id}/grants/{gid}     revoke
PATCH /projects/{id}/visibility        {visibility}
POST  /invites/{token}/accept          accept email invite

# Org / teams (B2B)
GET   /orgs/{id}/members
POST  /orgs/{id}/invites
GET   /orgs/{id}/teams
POST  /orgs/{id}/teams ; POST /teams/{id}/members

# Feeds & notifications
GET   /notifications?unread=           inbox
POST  /notifications/{id}/read ; POST /notifications/read-all
GET   /activity?project_id=&scope=     filtered feed

# Shared-with-me
GET   /shared-with-me                  projects granted to current user

# Messaging (Slack-like)
GET   /channels?org_id=                channels visible to me
POST  /channels                        create channel
GET   /channels/{id}/messages?before=  paginated history
POST  /channels/{id}/messages          send (body, attachments, project_ref, parent_id)
POST  /channels/{id}/read              mark read (sets last_read_at)
GET   /conversations                   my DMs (with unread counts)
POST  /conversations                   {user_ids[]} → open/find DM
GET   /conversations/{id}/messages
POST  /conversations/{id}/messages
GET   /messages/{id}/thread            thread replies
WS    /ws/chat                         live message delivery + typing indicators

# Presence (real-time) — see §8
WS    /ws/presence/{project_id}
```

Every project read endpoint must run through an **authorization guard** (`require_role(project_id, "viewer")`) so the "invisible unless granted" rule is enforced server-side, not just hidden in the UI.

---

## 6. Screens (illustrations)

> Wireframes are schematic; real screens use the Quantum-Metal cards, copper primary buttons, violet/gold accents, Framer-Motion fade/scale, Lucide icons.

### 6.1 Collaboration Hub — `Network` tab (Personal)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⌂ …  ›  Collaboration                                          [⌁3] (KN)  │  topbar (bell badge=3)
├──────────────────────────────────────────────────────────────────────────┤
│  ◐ Collaboration                                  [ + Invite ]  [Find ⌕]   │  PageHeader (icon in surface box)
│     Your network, shared work and team activity                            │
│                                                                            │
│  ┌ Tabs ─────────────────────────────────────────────────────────────┐    │
│  │ ● Network   Shared with me (4)   Organization   Activity           │    │  underline tabs (copper indicator)
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌ Requests ──────────────────────── 2 ─┐  ┌ Suggested ──────────────┐    │
│  │ (A) Aisha Rao            wants to     │  │ (M) Meera   @ IISc       │    │
│  │     @aisha · IIT-B       connect      │  │     [ + Connect ]        │    │
│  │     [ Accept ]  [ Ignore ]            │  │ (R) Rahul   @ TIFR       │    │
│  │ (D) David Lin · Stanford             │  │     [ + Connect ]        │    │
│  │     [ Accept ]  [ Ignore ]            │  └──────────────────────────┘    │
│  └───────────────────────────────────────┘                                │
│                                                                            │
│  ┌ Connections ─────────────────────────────────────── 18 ──────────┐     │
│  │  (K) Karan M.   ● online   Quantum Eng @ NexVista   [ Share ▾ ]   │     │  green StatusDot = online
│  │  (P) Priya S.   ○          PhD @ IISc               [ Share ▾ ]   │     │
│  │  (S) Sam O.     ● online   Fab Lead @ NexVista      [ Message ]   │     │
│  │  …                                                                │     │
│  └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Profile page — `/app/u/:handle`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ╔═ cover (subtle copper→violet gradient, animated logomark watermark) ═╗  │
│  ║                                                                      ║  │
│  ║   ( KN )  Karthik Nair                              [ + Connect ]    ║  │  primary btn (or "Pending"/"Connected ✓")
│  ║   48px    @karthik · ● online                       [ Share ▾ ]      ║  │
│  ║           Lead Quantum Engineer · NexVista Quantum Labs              ║  │
│  ║           ◷ IISc alum · ORCID ↗ · scholar ↗                          ║  │
│  ╚══════════════════════════════════════════════════════════════════════╝  │
│   ┌ Tabs ── Overview · Projects (visible to you) · Activity ──────────┐    │
│   ├────────────────────────────────────────────────────────────────────┤   │
│   │  ┌ Shared with you ── 2 ──┐   ┌ Stats ──────────┐                  │   │
│   │  │ ▸ Transmon-v3  Editor  │   │ 12 projects      │                  │   │  ← only projects THIS viewer
│   │  │   8-qubit · ⚙ running  │   │ 18 connections   │                  │   │    has a grant to are listed.
│   │  │ ▸ Coupler-X    Viewer  │   │ 240 sims run     │                  │   │    Others are invisible.
│   │  └────────────────────────┘   └──────────────────┘                  │   │
│   └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```
> Key: a stranger viewing this profile sees **0 projects**. A connection with a grant sees **only the granted ones**, each tagged with their role.

### 6.3 ★ The Share dialog (centerpiece — Google-Drive pattern)

Invoked from any project header / Designer / Results via **[ Share ]**.

```
        ┌─ Modal (scale+fade in, backdrop blur 40-60%) ──────────────────┐
        │  Share "Transmon-v3"                                      [ ✕ ] │
        │  ───────────────────────────────────────────────────────────── │
        │  ┌ Add people, teams, or email ─────────────────┐ [ Editor ▾ ]  │  typeahead + role for invitees
        │  │ ⌕ kar|                                        │              │
        │  │   (K) Karan M.   @karan · connection         │              │  ← autocompletes connections/org
        │  │   (P) Priya S.   @priya                       │              │
        │  │   ✉ invite "kara@lab.edu" by email           │              │
        │  └───────────────────────────────────────────────┘  [ Invite ] │
        │                                                                  │
        │  People with access                                              │
        │   (KN) Karthik Nair   you            Owner                       │
        │   (B)  Bob Chen       @bob           [ Editor ▾ ]   ⋯            │  role dropdown + revoke
        │   (L)  Lab-X team      5 members      [ Viewer ▾ ]   ⋯           │
        │   ✉   kara@lab.edu     invited        [ Editor ▾ ]   (pending)   │
        │  ─────────────────────────────────────────────────────────────  │
        │  General access                                                  │
        │   🔒 Private — only invited people         [ Private ▾ ]         │  default; Private|Org|Link|Public
        │   "Only invited people can open this link."                      │
        │                                                                  │
        │   [ 🔗 Copy link ]                              [ Done ]         │  link inert while Private
        └──────────────────────────────────────────────────────────────────┘
```

**Role dropdown menu** (with the cost-aware distinction):
```
  ┌────────────────────────────┐
  │ ● Editor   edit + run sims  │
  │ ○ Commenter view + comment  │
  │ ○ Viewer   read-only        │
  │ ──────────────────────────  │
  │ ⟳ Transfer ownership        │
  │ ✕ Remove access             │
  └────────────────────────────┘
```

### 6.4 Project collaborators + presence (inside a project)

```
┌ Project header (Designer / Results) ───────────────────────────────────────┐
│  Transmon-v3   ⚙ running           (K)(B)(L)+2  ● 3 viewing   [ Share ]     │  AvatarGroup + live presence
│                                     └ presence stack: who's here now ─┘      │
└─────────────────────────────────────────────────────────────────────────────┘
   On the editable canvas: soft-lock banner →  "🔒 Bob is editing the qubit layout"
   On read-only Results:   live cursors + pinned comments allowed
```

### 6.5 Shared-with-me

```
┌ Shared with me ────────────────────────────────────────────────────────────┐
│  Filter: [ All ▾ ] [ Owner ▾ ] [ Role ▾ ]                       ⌕ search    │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│  │ Transmon-v3   Editor │ │ Coupler-X    Viewer  │ │ Readout-2  Commenter │ │  project cards
│  │ by (KN) Karthik      │ │ by (A) Aisha         │ │ by (D) David         │ │  (hover: -translate-y .5)
│  │ 8q · ⚙ running       │ │ 2q · ✓ done          │ │ 4q · review          │ │
│  │ shared 2d ago        │ │ shared 1w ago        │ │ shared 3w ago        │ │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.6 Organization (Enterprise) — Members + Teams

```
┌ Organization · NexVista Quantum Labs ──────────────────────────────────────┐
│  Tabs:  ● Members (24)   Teams (4)   Settings                [ + Invite ]   │
│  ┌ Members ───────────────────────────────────────────────────────────┐    │
│  │  ⌕ search        Role: [ All ▾ ]   Team: [ All ▾ ]                  │    │
│  │  (KN) Karthik Nair   Lead QE     Org Admin   ● online   [ ⋯ ]      │    │
│  │  (S)  Sam O.         Fab Lead    Member      ● online   [ ⋯ ]      │    │
│  │  (P)  Priya S.       Researcher  Member      ○          [ ⋯ ]      │    │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  Teams tab → cards: "Lab-X (5) · private 🔒",  "Fabrication (8) · open"      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.7 Notification inbox (topbar bell dropdown)

```
        ┌─ Notifications ───────────────────────── [ Mark all read ] ─┐
        │ ● (A) Aisha wants to connect          2m   [Accept] [Ignore]│  actionable inline
        │ ● (KN) Karthik shared "Transmon-v3"   1h   [ Open ]         │
        │ ○ (B) Bob commented on S-param plot   3h   [ View ]         │
        │ ○ ⚙ Simulation "freq-sweep" finished  5h   [ Results ]      │  long sims → high-value notif
        │ ────────────────────────────────────────────────────────── │
        │                 See all activity →                          │
        └──────────────────────────────────────────────────────────────┘
```
Accurate unread badges are non-negotiable — wrong counts erode trust in the whole feed.

### 6.8 Activity feed
Per-project + global stream that doubles as an **audit log** (valuable for IP/compliance): "Sim run #12 completed (Q=8400)", "Carol commented", "David added as Editor", "Visibility changed to Org".

### 6.9 ★ Messages — Slack-like chat (`/app/messages`)

Three-pane layout: channel/DM rail · message stream + composer · optional thread panel.

```
┌─────────────┬──────────────────────────────────────────────┬──────────────┐
│ NexVista ▾  │  # fab-lab            🔍   (K)(S)(P) ● 3       │  Thread      │  channel header + presence
│             │  ──────────────────────────────────────────── │  ──────────  │
│ Channels  + │  (S) Sam O.            10:02                   │  (P) Priya   │
│  # general  │   Re-ran the freq sweep, Q hit 8400 🎉         │   Which      │
│  # fab-lab ●│                                                │   substrate? │
│  # readout  │  (K) Karkarthik       10:05                    │   ───────    │
│             │   Sharing the project here:                    │  (S) Sam     │
│ Direct  +   │   ┌ Transmon-v3 · 8q · ⚙ running ──┐           │   Sapphire   │
│  (B) Bob  3 │   │ [ Open ]   [ Request access ]   │          │              │  project card in chat
│  (A) Aisha  │   └──────────────────────────────────┘         │  ┌ reply ─┐  │
│  (P) Priya ●│  (P) Priya S.         10:06  💬 2 replies →     │  │ …      │  │
│             │  ──────────────────────────────────────────── │  └────────┘  │
│ (KN) you ▾  │  [ ＋  Message #fab-lab…            @  📎  ▶ ]  │              │  composer
└─────────────┴──────────────────────────────────────────────┴──────────────┘
```
Features: unread dots/counts (from `last_read_at`), `@mention` → notification, drop a **project card** into chat with inline `[Open]`/`[Request access]` (ties chat back to the ReBAC sharing model), threads in the right pane, typing indicators + live delivery over `WS /ws/chat`. Private channels are invisible to non-members (Linear principle).

---

## 7. Component Inventory

**Reuse (already in `src/components/ui` + `common`):** `Card/CardHeader/CardContent`, `Button`, `IconButton`, `Modal`, `Tabs`, `Avatar`, `AvatarGroup`, `Badge`, `StatusDot`, `Input/Textarea/Select`, `PageHeader`, `EmptyState`, `Skeleton`, `Tooltip`.

**New (build for this module):**
| Component | Purpose |
|---|---|
| `WorkspaceSwitcher` | sidebar personal↔org toggle |
| `ShareDialog` | the §6.3 centerpiece (people + general access) |
| `RoleSelect` | Owner/Editor/Commenter/Viewer dropdown w/ descriptions |
| `PeoplePicker` | typeahead over connections/org/email |
| `ConnectionButton` | Connect / Pending / Connected ✓ / Message states |
| `ProfileHeader` | cover + avatar + connect/share actions |
| `PresenceStack` | live "who's viewing" avatars (WS-driven) |
| `NotificationInbox` | bell dropdown, actionable items |
| `ActivityItem` | one feed/audit row |
| `RequestCard` | accept/ignore connection request |
| `MemberRow` / `TeamCard` | org directory |
| `SharedProjectCard` | shared-with-me grid item |
| `ChatLayout` | 3-pane Messages shell |
| `ChannelRail` | channels + DMs list w/ unread |
| `MessageList` / `MessageItem` | virtualized stream (50+ rows) |
| `Composer` | input + @mention + attach + project-ref |
| `ThreadPanel` | right-side thread replies |
| `ProjectRefCard` | project card embedded in a message |
| `DevUserSwitcher` | "Act as" seeded-user picker (dev only) |

All follow existing conventions: `rounded-2xl border-line bg-surface shadow-card`, copper primary, Framer `ease:[0.16,1,0.3,1]`, list stagger 30–50ms, modal scale-from-trigger.

---

## 8. Real-time / Presence (async-first, light live layer)

Research is decisive here: **do NOT do Figma-style CRDT live co-editing on the physics model.** Two people simultaneously editing a coupling parameter on a netlist isn't a merge conflict — it's a *physically invalid design*, and re-running sims is expensive. Instead:

- **Async core (GitHub-PR model):** versioned design edits (the backend already has `DesignVersion`), change requests/reviews, threaded comments anchored to a component / sim run / plot region.
- **Light real-time layer:**
  - **Presence** — avatar stack of who's viewing a project (WebSocket, coalesced updates like Figma to bound bandwidth).
  - **Soft lock** — "Bob is editing the qubit layout" banner on the editable canvas (prevents collisions without true CRDT).
  - **Live cursors + pinned comments** allowed *only* on the read-only Results/Report canvas, where simultaneous viewing is safe and useful.

Phase 1 can ship presence via simple polling and add the WS channel in Phase 2.

## 8b. Dev auth — mock multi-user (decision #4)

Sharing/connections/chat are meaningless with one user, but we're deferring real auth. So for dev:

- **Seed ~5 users** with full profiles: Karthik (Lead QE), Bob Chen, Aisha Rao, Priya S., Sam O. — plus the org `NexVista Quantum Labs` and a couple of teams.
- **"Act as" switcher** (`DevUserSwitcher`, dev-only) in the topbar. Selecting a user sets a `X-Dev-User-Id` header on every API call; the backend `get_current_user()` honors it **only when `supabase_jwt_secret` is unset** (dev mode). This lets you log in as Alice, share a project, switch to Bob, and verify Bob sees exactly that one project.
- **Swap path:** the guard stays the same shape, so flipping to real Supabase JWT later is a one-function change — no UI rewrite. Keep all authorization server-side (`require_role`) so the mock layer never weakens the model.

---

## 9. Empty States & Onboarding (one headline + one CTA each)

| Surface | Headline | Sub + CTA |
|---|---|---|
| No connections | "Build your research network" | "Connect with collaborators to share projects instantly." → **[ Find people ]** |
| Nothing shared | "Nothing shared with you yet" | "When a colleague shares a project, it shows up here." → **[ Create a project ]** |
| Empty org | "Your team is just getting started" | "Invite engineers to your workspace." → **[ Invite members ]** (+ copyable link) |
| First share | toast: "Shared! Bob can now view Transmon-v3." | celebrates the privacy-positive moment |

Onboarding checklist (Linear/Notion style): *Complete profile → Connect with 1 colleague → Share or receive 1 project.*

---

## 10. Phased Roadmap (reflecting locked decisions)

**Phase 0 — Dev auth foundation.**
Seed users + org + teams · `DevUserSwitcher` + `X-Dev-User-Id` guard (§8b). Prereq for everything below.

**Phase 1 — Sharing that works (FIRST).**
`ProjectGrant` + `Project.visibility` + server-side `require_role` guard · **Share dialog** · `RoleSelect`/`PeoplePicker` · Shared-with-me · `UserProfile` + profile page (enforcing "invisible unless granted") · collaborators panel + basic presence (polling). *Satisfies the core requirement.*

**Phase 2 — Social graph (B2C).**
`Connection` model · Network tab · connection requests · notification inbox · people search · privacy settings.

**Phase 3 — Full chat (Slack-like).**
`Channel`/`Conversation`/`Message` · Messages 3-pane UI · channels + DMs + threads · @mentions · project-ref cards in chat · `WS /ws/chat` live delivery + typing.

**Phase 4 — Enterprise (B2B).**
`Organization`/`Team` · workspace switcher · member directory · teams · org-scoped sharing & channels · email invites.

**Phase 5 — Real-time & polish.**
`WS /ws/presence` · soft-lock on canvas · live cursors + pinned comments on Results · activity/audit feed · onboarding checklist · *(swap mock auth → real Supabase JWT)*.

---

## 11. Decisions — LOCKED ✓
1. **Real-time depth** → async-first + light presence (no CRDT co-editing).
2. **"Slack-like" scope** → **full chat: channels + DMs + threads** (§6.9, §3 messaging models).
3. **Build order** → **Phase 1 sharing first** (after Phase 0 dev-auth prereq).
4. **Auth** → **mock multi-user in dev** (§8b), real Supabase JWT swapped in at Phase 5.

---
*Sources: GitHub/Figma/Google-Drive/Notion sharing docs; Google Zanzibar & ReBAC (Oso, AuthZed, WorkOS); Slack/Linear/Notion org models; LinkedIn/Facebook connection flows; Figma multiplayer; empty-state UX (Smashing, Eleken, Chameleon). Full citation list in design research notes.*
