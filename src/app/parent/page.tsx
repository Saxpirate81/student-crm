"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { VideoCard } from "@/components/VideoCard";
import { CadenzaMessageBoard } from "@/components/messaging/CadenzaMessageBoard";
import { MOCK_DEMO_PASSWORD } from "@/lib/auth/constants";
import { getAccountDetailsForParent } from "@/lib/auth/mock-auth-store";
import { useAuth } from "@/lib/auth/auth-context";
import { useRepository } from "@/lib/useRepository";

type ParentPageId = "dashboard" | "family" | "videos";

const parentNav: Array<{ id: ParentPageId; label: string; icon: keyof typeof icons }> = [
  { id: "dashboard", label: "Overview", icon: "grid" },
  { id: "family", label: "Family", icon: "users" },
  { id: "videos", label: "Videos", icon: "clip" },
];

const appViewOptions = [
  { href: "/instructor", label: "Instructor" },
  { href: "/student", label: "Student" },
  { href: "/parent", label: "Parent" },
  { href: "/admin", label: "Admin" },
  { href: "/producer", label: "Producer" },
];

const icons = {
  grid: <path d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" />,
  clip: (
    <>
      <rect x="3" y="2" width="10" height="13" rx="1.5" />
      <path d="M6 2a2 2 0 0 1 4 0M6 7h4M6 10h3" />
    </>
  ),
  users: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="11.2" cy="6.8" r="1.8" />
      <path d="M2.5 13c0-2 2-3.4 3.5-3.4S9.5 11 9.5 13M9 13c.1-1.4 1.4-2.5 2.9-2.5 1.4 0 2.6 1 2.6 2.5" />
    </>
  ),
};

function StudioIcon({ icon, className = "" }: { icon: keyof typeof icons; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      {icons[icon]}
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ParentPage() {
  const pathname = usePathname();
  const { session, ready, addChild, resetChildPassword } = useAuth();
  const { repository, refresh, version } = useRepository();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [page, setPage] = useState<ParentPageId>("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [parentCrmId, setParentCrmId] = useState("parent-jordan");
  const [selectedStudent, setSelectedStudent] = useState("crm-alex");

  const effectiveParentCrmId = session?.kind === "parent" ? session.parentCrmId : parentCrmId;

  const children = useMemo(() => {
    void version;
    return repository.listStudents().filter((student) => student.parentCrmId === effectiveParentCrmId);
  }, [repository, effectiveParentCrmId, version]);

  const fixtureParentIds = useMemo(() => {
    void version;
    const ids = new Set(repository.listStudents().map((s) => s.parentCrmId));
    return [...ids].sort();
  }, [repository, version]);

  useEffect(() => {
    if (!children.length) {
      setSelectedStudent("");
      return;
    }
    setSelectedStudent((prev) => (children.some((c) => c.crmId === prev) ? prev : children[0].crmId));
  }, [children]);

  const videos = selectedStudent ? repository.listVideosForStudent(selectedStudent) : [];

  const [newDisplay, setNewDisplay] = useState("");
  const [newScreen, setNewScreen] = useState("");
  const [newPassword, setNewPassword] = useState(MOCK_DEMO_PASSWORD);
  const [familyMessage, setFamilyMessage] = useState<string | null>(null);

  const accountDetails = session?.kind === "parent" ? getAccountDetailsForParent(session) : null;
  const selectedStudentRow = children.find((student) => student.crmId === selectedStudent);

  const pageTitle: Record<ParentPageId, string> = {
    dashboard: "Parent Dashboard",
    family: "Family Access",
    videos: "Recent Videos",
  };

  const submitAddChild = (event: React.FormEvent) => {
    event.preventDefault();
    setFamilyMessage(null);
    const result = addChild({
      displayName: newDisplay,
      screenName: newScreen,
      password: newPassword,
    });
    if (!result.ok) {
      setFamilyMessage(result.error);
      return;
    }
    setNewDisplay("");
    setNewScreen("");
    setNewPassword(MOCK_DEMO_PASSWORD);
    setFamilyMessage("Family member added. They can log in with your email + screen name + password.");
    refresh();
  };

  return (
    <div className="cadenza-app" data-theme={theme}>
      <div className={`sidebar-overlay ${drawerOpen ? "open" : ""}`} onClick={() => setDrawerOpen(false)} />

      <aside className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <div className="logo">
          <div className="logo-name">CADENZA</div>
          <div className="logo-tag">MUSIC STUDIO</div>
        </div>
        <div className="role-toggle">
          <select
            aria-label="Switch app view"
            className="rt-select"
            value={appViewOptions.some((option) => option.href === pathname) ? pathname : "/instructor"}
            onChange={(event) => {
              const nextPath = event.target.value;
              if (nextPath) window.location.href = nextPath;
            }}
          >
            {appViewOptions.map((option) => (
              <option key={option.href} value={option.href}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <nav className="nav">
          <div className="nav-lbl">Menu</div>
          {parentNav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              type="button"
              onClick={() => {
                setPage(item.id);
                setDrawerOpen(false);
              }}
            >
              <StudioIcon icon={item.icon} className="nav-ico" />
              <span>{item.label}</span>
              {item.id === "videos" && videos.length ? <span className="nav-badge">{videos.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="su-inner">
            <div className="su-avatar">{initials(session?.kind === "parent" ? session.displayName : "Demo Parent")}</div>
            <div className="min-w-0">
              <div className="su-name">{session?.kind === "parent" ? session.displayName : "Demo Parent"}</div>
              <div className="su-role">{session?.kind === "parent" ? session.email : effectiveParentCrmId}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="c-main">
        <div className="topbar">
          <button className="hamburger" onClick={() => setDrawerOpen(true)} aria-label="Menu" type="button">
            <span />
            <span />
            <span />
          </button>
          <div className="page-title">{pageTitle[page]}</div>
          <div className="topbar-right">
            <div className="xp-pill">Household · {children.length} students</div>
            <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">
              <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
              <span className="toggle-track"><span className="toggle-knob" /></span>
              <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
          </div>
        </div>

        <CadenzaMessageBoard viewerRole="parent" />

        <div className="content">
          {page === "dashboard" ? (
            <>
              <section className="studio-hero">
                <div>
                  <p className="card-title">Parent command center</p>
                  <h1>Track progress and family access.</h1>
                  <p>
                    Preview student videos, monitor household setup, and manage family logins from the same Cadenza shell.
                  </p>
                </div>
                {session?.kind === "parent" ? (
                  <span className="badge b-green">{session.displayName}</span>
                ) : (
                  <label className="profile-select">
                    Parent profile
                    <select value={parentCrmId} onChange={(event) => setParentCrmId(event.target.value)}>
                      {fixtureParentIds.map((id) => {
                        const labelStudent = repository.listStudents().find((s) => s.parentCrmId === id);
                        return (
                          <option key={id} value={id}>
                            {labelStudent ? `${labelStudent.displayName.split(" ")[0]}'s parent (${id})` : id}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                )}
              </section>

              <section className="grid4">
                <Metric label="Students" value={`${children.length}`} sub="In household" tone="purple" />
                <Metric label="Videos" value={`${videos.length}`} sub="Selected student" tone="cyan" />
                <Metric label="Session" value={session?.kind === "parent" ? "Live" : "Demo"} sub="Parent mode" tone="green" />
                <Metric label="Parent CRM" value={effectiveParentCrmId.split("-").pop() ?? effectiveParentCrmId} sub="Current profile" tone="gold" />
              </section>

              {!ready || session?.kind !== "parent" ? (
                <section className="card">
                  <div className="section-sub">
                    Demo mode: pick a fixture parent, or <Link href="/auth/signup">sign up</Link> /{" "}
                    <Link href="/auth/login">log in</Link> for a mock household.
                  </div>
                </section>
              ) : null}

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Students in this household</div>
                    <div className="section-sub">Choose a student to drive video preview and metrics.</div>
                  </div>
                </div>
                <div className="tabs">
                  {children.map((student) => (
                    <button
                      key={student.crmId}
                      type="button"
                      className={`tab ${student.crmId === selectedStudent ? "active" : ""}`}
                      onClick={() => setSelectedStudent(student.crmId)}
                    >
                      {student.displayName}
                    </button>
                  ))}
                </div>
                {!children.length ? <p className="empty-copy">No student profiles for this parent.</p> : null}
              </section>
            </>
          ) : null}

          {page === "family" ? (
            <>
              {session?.kind === "parent" && accountDetails ? (
                <section className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Household ids (mock)</div>
                      <div className="section-sub">Organization and parent identifiers for the active account.</div>
                    </div>
                  </div>
                  <dl className="grid2 compact-grid">
                    <Metric label="Organization id" value={accountDetails.org?.id ?? "—"} sub="Org id" tone="purple" />
                    <Metric label="Organization" value={accountDetails.org?.name ?? "—"} sub="Name" tone="gold" />
                    <Metric label="Parent id" value={accountDetails.parentRow?.id ?? "—"} sub="Internal id" tone="cyan" />
                    <Metric label="Parent CRM" value={session.parentCrmId} sub="CRM id" tone="green" />
                  </dl>
                </section>
              ) : null}

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Family members (child ids)</div>
                    <div className="section-sub">Reset passwords or review child login metadata.</div>
                  </div>
                </div>
                {accountDetails?.children.map((child) => (
                  <div key={child.id} className="listen-row">
                    <div>
                      <strong>{child.screenName}</strong>
                      <span>child id: {child.id}</span>
                      <span>studentCrmId: {child.studentCrmId}</span>
                    </div>
                    <ChildPasswordRow childId={child.id} onReset={resetChildPassword} onMessage={setFamilyMessage} />
                  </div>
                ))}
                {!accountDetails?.children.length ? <p className="empty-copy">No family logins yet.</p> : null}
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Add family member</div>
                    <div className="section-sub">Creates a new child login under your parent account.</div>
                  </div>
                </div>
                <form className="instructor-form-grid" onSubmit={submitAddChild}>
                  <label className="form-grp">
                    <span className="form-lbl">Display name</span>
                    <input value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)} className="inp" />
                  </label>
                  <label className="form-grp">
                    <span className="form-lbl">Screen name</span>
                    <input value={newScreen} onChange={(e) => setNewScreen(e.target.value)} className="inp" />
                  </label>
                  <label className="form-grp">
                    <span className="form-lbl">Password</span>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="inp" />
                  </label>
                  <div className="modal-acts">
                    <button type="submit" className="btn btn-primary">Save family member</button>
                  </div>
                </form>
                {familyMessage ? <p className="section-sub">{familyMessage}</p> : null}
              </section>
            </>
          ) : null}

          {page === "videos" ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Recent videos</div>
                  <div className="section-sub">
                    {selectedStudentRow ? `${selectedStudentRow.displayName} · ${videos.length} clips` : "Select a student"}
                  </div>
                </div>
              </div>
              <div className="video-grid">
                {videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    href={`/student/videos/${video.id}`}
                    subtitle="Open student lesson view"
                  />
                ))}
              </div>
              {!videos.length ? <p className="empty-copy">No videos available yet for this profile.</p> : null}
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "purple" | "gold" | "green" | "cyan" }) {
  const colors = {
    purple: "var(--accent2)",
    gold: "var(--gold)",
    green: "var(--green)",
    cyan: "var(--cyan)",
  };
  return (
    <div className="metric">
      <div className="metric-lbl">{label}</div>
      <div className="metric-val" style={{ color: colors[tone] }}>{value}</div>
      <div className="metric-sub">{sub}</div>
    </div>
  );
}

function ChildPasswordRow({
  childId,
  onReset,
  onMessage,
}: {
  childId: string;
  onReset: (childId: string, password: string) => { ok: true } | { ok: false; error: string };
  onMessage: (message: string | null) => void;
}) {
  const [pw, setPw] = useState(MOCK_DEMO_PASSWORD);
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onMessage(null);
        const result = onReset(childId, pw);
        if (!result.ok) onMessage(result.error);
        else onMessage("Password updated for that family member.");
      }}
    >
      <label className="form-grp">
        <span className="form-lbl">New password</span>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="inp"
        />
      </label>
      <button
        type="submit"
        className="btn btn-sm"
      >
        Update
      </button>
    </form>
  );
}
