"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { VideoCard } from "@/components/VideoCard";
import { CadenzaMessageBoard } from "@/components/messaging/CadenzaMessageBoard";
import { useRepository } from "@/lib/useRepository";
import { useRotatingHeroHeadline } from "@/hooks/useRotatingHeroHeadline";
import { useCadenzaTheme } from "@/hooks/useCadenzaTheme";

const FALLBACK_VIDEO = "https://www.w3schools.com/html/mov_bbb.mp4";
const FALLBACK_POSTER =
  "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217";

type AdminPageId = "dashboard" | "uploads" | "inventory";

const adminNav: Array<{ id: AdminPageId; label: string; icon: keyof typeof icons }> = [
  { id: "dashboard", label: "Overview", icon: "grid" },
  { id: "uploads", label: "Uploads", icon: "video" },
  { id: "inventory", label: "Inventory", icon: "clip" },
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
  video: (
    <>
      <rect x="1" y="3" width="10" height="10" rx="1.5" />
      <path d="m11 6 4-2v8l-4-2" />
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

export default function AdminPage() {
  const pathname = usePathname();
  const { repository, refresh } = useRepository();
  const { theme, toggleTheme } = useCadenzaTheme();
  const [page, setPage] = useState<AdminPageId>("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [studentCrmId, setStudentCrmId] = useState("crm-alex");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("cat-tutorial");
  const [showArchived, setShowArchived] = useState(true);

  const videos = repository.listVideosForStudent(studentCrmId, {
    includeArchived: showArchived,
  });
  const students = repository.listStudents();
  const categories = repository.listCategories();
  const studentName = students.find((student) => student.crmId === studentCrmId)?.displayName ?? "Student";
  const adminHeadline = useRotatingHeroHeadline("admin", "Admin");
  const activeVideos = repository.listVideosForStudent(studentCrmId);

  const pageTitle: Record<AdminPageId, string> = {
    dashboard: "Admin Dashboard",
    uploads: "Admin Upload Desk",
    inventory: "Video Inventory",
  };

  const addAdminUpload = () => {
    if (!title.trim()) return;
    repository.addVideo({
      studentCrmId,
      lessonId: null,
      categoryId,
      title: title.trim(),
      playbackUrl: FALLBACK_VIDEO,
      thumbnailUrl: FALLBACK_POSTER,
      durationSec: 10,
      uploaderRole: "admin",
    });
    setTitle("");
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
          {adminNav.map((item) => (
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
              {item.id === "inventory" && videos.length ? <span className="nav-badge">{videos.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="su-inner">
            <div className="su-avatar">AD</div>
            <div className="min-w-0">
              <div className="su-name">Admin Mode</div>
              <div className="su-role">Mock command center</div>
            </div>
          </div>
          <button className="theme-toggle menu-theme-toggle" onClick={toggleTheme} type="button">
            <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
            <span className="toggle-track"><span className="toggle-knob" /></span>
            <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
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
            <div className="xp-pill">{studentName} · {videos.length} videos</div>
            <button className="theme-toggle" onClick={toggleTheme} type="button">
              <span className="toggle-icon">{theme === "dark" ? "Moon" : "Sun"}</span>
              <span className="toggle-track"><span className="toggle-knob" /></span>
              <span className="toggle-lbl">{theme === "dark" ? "Dark" : "Light"}</span>
            </button>
            <button className="btn btn-primary" type="button" onClick={addAdminUpload}>
              Add Upload
            </button>
          </div>
        </div>
        <div className="content">
          {page === "dashboard" ? (
            <>
              <section className="studio-hero instructor-hero">
                <div>
                  <p className="card-title">Admin command center</p>
                  <h1>{adminHeadline}</h1>
                  <p>Upload, archive, restore, and delete student-attached videos in the shared Cadenza shell.</p>
                </div>
                <label className="profile-select">
                  Student
                  <select value={studentCrmId} onChange={(event) => setStudentCrmId(event.target.value)}>
                    {students.map((student) => (
                      <option key={student.crmId} value={student.crmId}>
                        {student.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              <CadenzaMessageBoard viewerRole="admin" />
              <section className="grid4">
                <Metric label="Visible" value={`${videos.length}`} sub="Current filter" tone="cyan" />
                <Metric label="Active" value={`${activeVideos.length}`} sub="Not archived" tone="green" />
                <Metric label="Students" value={`${students.length}`} sub="Total roster" tone="purple" />
                <Metric label="Categories" value={`${categories.length}`} sub="Upload groups" tone="gold" />
              </section>
            </>
          ) : null}

          {page === "uploads" ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Add admin upload</div>
                  <div className="section-sub">Creates a mock admin video entry for the selected student.</div>
                </div>
              </div>
              <div className="instructor-form-grid">
                <label className="form-grp">
                  <span className="form-lbl">Student</span>
                  <select className="inp" value={studentCrmId} onChange={(event) => setStudentCrmId(event.target.value)}>
                    {students.map((student) => (
                      <option key={student.crmId} value={student.crmId}>
                        {student.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-grp">
                  <span className="form-lbl">Category</span>
                  <select className="inp" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-grp wide">
                  <span className="form-lbl">Video title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Weekly retention check-in"
                    className="inp"
                  />
                </label>
              </div>
              <div className="modal-acts">
                <button type="button" onClick={addAdminUpload} className="btn btn-primary">
                  Add Admin Upload
                </button>
              </div>
            </section>
          ) : null}

          {page === "inventory" ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Video inventory</div>
                  <div className="section-sub">{studentName} · {videos.length} entries in current view</div>
                </div>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(event) => setShowArchived(event.target.checked)}
                  />
                  Show archived
                </label>
              </div>
              <div className="video-grid">
                {videos.map((video) => (
                  <div key={video.id} className="space-y-2">
                    <VideoCard video={video} href={`/student/videos/${video.id}`} />
                    <div className="flex flex-wrap gap-2">
                      {video.archivedAt ? (
                        <button
                          type="button"
                          onClick={() => {
                            repository.unarchiveVideo(video.id);
                            refresh();
                          }}
                          className="btn btn-sm"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            repository.archiveVideo(video.id);
                            refresh();
                          }}
                          className="btn btn-sm"
                        >
                          Archive
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          repository.deleteVideo(video.id);
                          refresh();
                        }}
                        className="ui-button-danger rounded-md px-3 py-1 text-xs font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
