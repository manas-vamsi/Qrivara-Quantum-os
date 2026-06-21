from sqlmodel import Session, select

from .db import engine
from .models import (
    Activity,
    Channel,
    ChannelMember,
    Connection,
    Design,
    Message,
    Notification,
    Project,
    ProjectGrant,
    Team,
    TeamMember,
    User,
)


def make_doc(qubits: int) -> dict:
    """Generate a representative layout (qubits + readout resonators + feedline)."""
    n = max(1, min(qubits, 12))  # cap for clarity in the 3D view
    cols = 3
    nodes: list = []
    edges: list = []
    for i in range(n):
        c, r = i % cols, i // cols
        x, y = 80 + c * 260, 100 + r * 200
        nodes.append({
            "id": f"q{i+1}", "type": "quantum", "position": {"x": x, "y": y},
            "data": {"label": f"Q{i+1}", "kind": "transmon", "color": "primary",
                     "params": {"target_freq_GHz": round(5.0 + 0.04 * i, 2), "anharmonicity_MHz": -300}},
        })
        nodes.append({
            "id": f"r{i+1}", "type": "quantum", "position": {"x": x + 130, "y": y},
            "data": {"label": f"R{i+1}", "kind": "resonator", "color": "cyan",
                     "params": {"frequency_GHz": round(7.0 + 0.04 * i, 2)}},
        })
        edges.append({"id": f"eq{i+1}", "source": f"q{i+1}", "target": f"r{i+1}"})
    fx = 80 + cols * 260 + 160
    fy = 100 + ((n - 1) // cols) * 100
    nodes.append({
        "id": "feed", "type": "quantum", "position": {"x": fx, "y": fy},
        "data": {"label": "Feedline", "kind": "feedline", "color": "success", "params": {}},
    })
    for i in range(n):
        edges.append({"id": f"ef{i+1}", "source": f"r{i+1}", "target": "feed"})
    return {"nodes": nodes, "edges": edges}


def seed() -> None:
    with Session(engine) as s:
        if not s.exec(select(User)).first():
            user = User(
                email="karthik@nexvista.com", name="Karthik Nair",
                role="Lead Quantum Engineer", org="NexVista Quantum Labs",
            )
            s.add(user)
            s.commit()
            s.refresh(user)
            for p in [
                Project(name="Falcon-17 Processor", description="17-qubit heavy-hex lattice with tunable couplers",
                        qubits=17, status="active", progress=72, tags=["heavy-hex", "flagship"],
                        collaborators=["Karthik Nair", "Lena Müller", "Diego Santos"], created_by=user.id),
                Project(name="Sparrow Test Chip", description="2-qubit gate-fidelity characterization device",
                        qubits=2, status="simulating", progress=91, tags=["test", "two-qubit"],
                        collaborators=["Lena Müller", "Aisha Khan"], created_by=user.id),
                Project(name="Condor Readout Array", description="Multiplexed readout for 8 qubits",
                        qubits=8, status="review", progress=58, tags=["readout", "multiplexed"],
                        collaborators=["Diego Santos", "Priya Raman"], created_by=user.id),
            ]:
                s.add(p)
            s.add(Activity(actor="Karthik Nair", action="created", target="Falcon-17 Processor", type="design"))
            s.commit()

        # Backfill: ensure every project has a 'main' design (idempotent).
        for p in s.exec(select(Project)).all():
            has_design = s.exec(select(Design).where(Design.project_id == p.id)).first()
            if not has_design:
                s.add(Design(project_id=p.id, name="main", doc=make_doc(p.qubits)))
        s.commit()

        seed_collaboration(s)
        seed_chat_and_teams(s)


def _get_or_create_user(s: Session, *, email: str, name: str, role: str,
                        org: str, handle: str, institution: str = "") -> User:
    u = s.exec(select(User).where(User.email == email)).first()
    if u:
        if not u.handle:  # backfill profile fields for pre-existing rows
            u.handle = handle
            u.institution = institution
            s.add(u)
        return u
    u = User(email=email, name=name, role=role, org=org, handle=handle,
             institution=institution)
    s.add(u)
    s.commit()
    s.refresh(u)
    return u


def _ensure_grant(s: Session, *, project: Project, grantee: User, role: str,
                  granter: User) -> None:
    """Idempotently share a project; notify the grantee on first grant."""
    existing = s.exec(
        select(ProjectGrant).where(
            ProjectGrant.project_id == project.id,
            ProjectGrant.subject_type == "user",
            ProjectGrant.subject_id == grantee.id,
        )
    ).first()
    if existing:
        return
    s.add(ProjectGrant(project_id=project.id, subject_type="user",
                       subject_id=grantee.id, role=role, granted_by=granter.id))
    names = list(project.collaborators or [])
    if grantee.name not in names:
        names.append(grantee.name)
        project.collaborators = names
        s.add(project)
    s.add(Notification(
        user_id=grantee.id, type="project_shared", actor_id=granter.id,
        payload={"project_id": project.id, "project_name": project.name,
                 "role": role, "actor_name": granter.name},
    ))
    s.commit()


def seed_collaboration(s: Session) -> None:
    """Seed extra users, shares, a pending connection and notifications so the
    collaboration module + notification inbox are populated on first run."""
    owner = s.exec(select(User).where(User.email == "karthik@nexvista.com")).first()
    if not owner:
        owner = s.exec(select(User).order_by(User.created_at)).first()
    if not owner:
        return
    if not owner.handle:
        owner.handle = "karthik"
        s.add(owner)
        s.commit()

    bob = _get_or_create_user(s, email="bob@nexvista.com", name="Bob Chen",
                              role="Quantum Engineer", org="NexVista Quantum Labs",
                              handle="bob")
    aisha = _get_or_create_user(s, email="aisha@iitb.ac.in", name="Aisha Rao",
                                role="PhD Researcher", org="IIT Bombay",
                                handle="aisha", institution="IIT Bombay")
    priya = _get_or_create_user(s, email="priya@iisc.ac.in", name="Priya Raman",
                                role="Researcher", org="IISc",
                                handle="priya", institution="IISc")
    _get_or_create_user(s, email="sam@nexvista.com", name="Sam Okafor",
                        role="Fabrication Lead", org="NexVista Quantum Labs",
                        handle="sam")

    projects = s.exec(
        select(Project).where(Project.created_by == owner.id)
        .order_by(Project.created_at)
    ).all()
    if projects:
        _ensure_grant(s, project=projects[0], grantee=bob, role="editor", granter=owner)
        _ensure_grant(s, project=projects[0], grantee=aisha, role="viewer", granter=owner)
        if len(projects) > 2:
            _ensure_grant(s, project=projects[2], grantee=priya, role="commenter",
                          granter=owner)

    # A pending incoming connection request for the owner + its notification.
    existing_conn = s.exec(
        select(Connection).where(
            Connection.requester_id == aisha.id,
            Connection.addressee_id == owner.id,
        )
    ).first()
    if not existing_conn:
        s.add(Connection(requester_id=aisha.id, addressee_id=owner.id,
                         status="pending"))
        s.add(Notification(user_id=owner.id, type="connection_request",
                           actor_id=aisha.id, payload={"actor_name": aisha.name}))
        s.commit()


def _add_members(s: Session, channel: Channel, users: list[User]) -> None:
    for u in users:
        if not u:
            continue
        exists = s.exec(
            select(ChannelMember).where(
                ChannelMember.channel_id == channel.id,
                ChannelMember.user_id == u.id,
            )
        ).first()
        if not exists:
            s.add(ChannelMember(channel_id=channel.id, user_id=u.id))


def seed_chat_and_teams(s: Session) -> None:
    """Seed a team plus starter channels, a DM and sample messages so the
    Messages module and Teams view are populated on first run. Idempotent: only
    runs the channel/message seed when no channels exist yet."""
    owner = s.exec(select(User).where(User.email == "karthik@nexvista.com")).first()
    if not owner:
        return
    bob = s.exec(select(User).where(User.email == "bob@nexvista.com")).first()
    sam = s.exec(select(User).where(User.email == "sam@nexvista.com")).first()

    # ---- Team (NexVista) ----
    team = s.exec(select(Team).where(Team.name == "Falcon Core")).first()
    if not team:
        team = Team(org=owner.org, name="Falcon Core",
                    description="Core team for the Falcon-17 processor",
                    created_by=owner.id)
        s.add(team)
        s.commit()
        s.refresh(team)
        for u, role in ((owner, "lead"), (bob, "member"), (sam, "member")):
            if u:
                s.add(TeamMember(team_id=team.id, user_id=u.id, role=role))
        s.commit()

    # Backfill dm_key for any DM created before the column existed (idempotent).
    for ch in s.exec(select(Channel).where(Channel.kind == "dm")).all():
        if not ch.dm_key:
            ids = [m.user_id for m in s.exec(
                select(ChannelMember).where(ChannelMember.channel_id == ch.id)
            ).all()]
            if len(ids) == 2:
                ch.dm_key = "|".join(sorted(ids))
                s.add(ch)
    s.commit()

    # ---- Channels + messages (only if none exist) ----
    if s.exec(select(Channel)).first():
        return

    org_users = [u for u in s.exec(select(User).where(User.org == owner.org)).all()]

    general = Channel(kind="channel", name="general", topic="Lab-wide announcements",
                      org=owner.org, created_by=owner.id)
    fab = Channel(kind="channel", name="fabrication", topic="Process & yield",
                  org=owner.org, created_by=owner.id)
    s.add(general)
    s.add(fab)
    s.commit()
    s.refresh(general)
    s.refresh(fab)

    _add_members(s, general, org_users)
    _add_members(s, fab, [owner, sam])
    s.commit()

    for author, body in [
        (owner, "Welcome to the QRIVARA workspace 👋 Use #general for announcements."),
        (bob, "Falcon-17 frequency sweep finished — results look clean."),
        (sam, "Heads up: new substrate batch arrives Thursday, will update #fabrication."),
    ]:
        if author:
            s.add(Message(channel_id=general.id, user_id=author.id, body=body))
    s.commit()

    # ---- A DM between Karthik and Bob ----
    if bob:
        dm = Channel(kind="dm", org=owner.org, created_by=owner.id,
                     dm_key="|".join(sorted([owner.id, bob.id])))
        s.add(dm)
        s.commit()
        s.refresh(dm)
        _add_members(s, dm, [owner, bob])
        s.commit()
        s.add(Message(channel_id=dm.id, user_id=bob.id,
                      body="Can you review the coupler params on Falcon-17?"))
        s.add(Message(channel_id=dm.id, user_id=owner.id,
                      body="Sure — looking now, will comment on the design."))
        s.commit()
