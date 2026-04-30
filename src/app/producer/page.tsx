"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { ProducerMatrixView } from "@/components/producer/ProducerMatrixView";
import { ProducerPlaybookView } from "@/components/producer/ProducerPlaybookView";
import { ProducerQueueView } from "@/components/producer/ProducerQueueView";
import { CadenzaMessageBoard } from "@/components/messaging/CadenzaMessageBoard";
import { useProducerWorkspace } from "@/hooks/useProducerWorkspace";
import { useAuth } from "@/lib/auth/auth-context";
import { useRotatingHeroHeadline } from "@/hooks/useRotatingHeroHeadline";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";

type ProducerPageId = "queue" | "playbook" | "matrix";

const producerNav: Array<{ id: ProducerPageId; label: string; icon: keyof typeof icons }> = [
  { id: "queue", label: "View Queue", icon: "clip" },
  { id: "playbook", label: "View Playbook", icon: "book" },
  { id: "matrix", label: "View Matrix", icon: "users" },
];

const appViewOptions = [
  { href: "/instructor", label: "Instructor" },
  { href: "/student", label: "Student" },
  { href: "/parent", label: "Parent" },
  { href: "/admin", label: "Admin" },
  { href: "/producer", label: "Producer" },
];

const icons = {
  clip: (
    <>
      <rect x="3" y="2" width="10" height="13" rx="1.5" />
      <path d="M6 2a2 2 0 0 1 4 0M6 7h4M6 10h3" />
    </>
  ),
  book: (
    <>
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2H13v11H3.5A1.5 1.5 0 0 0 2 14.5z" />
      <path d="M13 2v11M4.5 5h6M4.5 8h6" />
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

export default function ProducerPage() {
  const pathname = usePathname();
  const { session, ready } = useAuth();
  const { theme, toggleTheme } = useCadenzaTheme();
  const [page, setPage] = useState<ProducerPageId>("queue");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { playbookVersion, setPlaybookVersion, rules, setRules, tasks, setTasks, playbookVersions } = useProducerWorkspace();

  const producerHeroName = session?.kind === "producer" ? session.displayName : "Producer";
  const producerHeadline = useRotatingHeroHeadline("producer", producerHeroName);

  const pageTitle: Record<ProducerPageId, string> = {
    queue: "View Queue",
    playbook: "View Playbook",
    matrix: "View Matrix",
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
          <div className="nav-lbl">Producer</div>
          {producerNav.map((item) => (
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
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <button className="theme-toggle menu-theme-toggle" onClick={toggleTheme} type="button">
            <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
            <span className="toggle-track"><span className="toggle-knob" /></span>
            <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
          <div className="su-inner">
            <div className="su-avatar">PR</div>
            <div className="min-w-0">
              <div className="su-name">{session?.kind === "producer" ? session.displayName : "Producer Preview"}</div>
              <div className="su-role">{session?.kind === "producer" ? session.email : "Scaffold Mode"}</div>
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
            <div className="xp-pill">Producer Console</div>
            <button className="theme-toggle" onClick={toggleTheme} type="button">
              <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
              <span className="toggle-track"><span className="toggle-knob" /></span>
              <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
          </div>
        </div>
        <div className="content">
          <section className="studio-hero instructor-hero">
            <div>
              <p className="card-title">Producer workspace scaffold</p>
              <h1>{producerHeadline}</h1>
            </div>
            {ready && session?.kind === "producer" ? (
              <span className="badge b-green">Signed in as {session.displayName}</span>
            ) : (
              <span className="badge b-gold">Preview mode</span>
            )}
          </section>

          <CadenzaMessageBoard viewerRole="producer" />

          {page === "queue" ? (
            <ProducerQueueView
              tasks={tasks}
              setTasks={setTasks}
              playbookVersion={playbookVersion}
              setPlaybookVersion={setPlaybookVersion}
              playbookVersions={playbookVersions}
            />
          ) : null}
          {page === "playbook" ? (
            <ProducerPlaybookView
              rules={rules}
              setRules={setRules}
              playbookVersion={playbookVersion}
              setPlaybookVersion={setPlaybookVersion}
              playbookVersions={playbookVersions}
            />
          ) : null}
          {page === "matrix" ? (
            <ProducerMatrixView
              rules={rules}
              tasks={tasks}
              playbookVersion={playbookVersion}
              setPlaybookVersion={setPlaybookVersion}
              playbookVersions={playbookVersions}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
