"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { addPersonAction, createOrgAction, listOrgsAction } from "./actions";

type OrgOption = { id: string; name: string; slug: string; created_at: string };

const fieldClass =
  "ui-input mt-2 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-slate-500";
const labelClass = "block text-xs font-bold uppercase tracking-wide text-slate-400";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm font-black text-white shadow-lg shadow-violet-900/40">
      {n}
    </span>
  );
}

export default function DatabaseSetupPage() {
  const [setupPassword, setSetupPassword] = useState("");
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [personName, setPersonName] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [personPassword, setPersonPassword] = useState("");
  const [personRole, setPersonRole] = useState<"parent" | "student" | "instructor" | "admin">("parent");

  const clearAlerts = () => {
    setMessage(null);
    setError(null);
  };

  const loadSchools = useCallback(async () => {
    clearAlerts();
    if (!setupPassword.trim()) {
      setError("Type your setup password first (same as STUDIO_DATABASE_SETUP_PASSWORD in .env.local).");
      return;
    }
    const res = await listOrgsAction(setupPassword);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOrgs(res.orgs);
    setMessage(`Loaded ${res.orgs.length} school(s). Pick one below to add people.`);
    setSelectedOrgId((prev) => {
      if (prev && res.orgs.some((o) => o.id === prev)) return prev;
      return res.orgs[0]?.id ?? "";
    });
  }, [setupPassword]);

  const createSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (!setupPassword.trim()) {
      setError("Type your setup password first.");
      return;
    }
    const res = await createOrgAction(setupPassword, orgName);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMessage(`Saved “${res.name}” to the database (slug: ${res.slug}).`);
    setOrgName("");
    await loadSchools();
  };

  const addPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    if (!setupPassword.trim()) {
      setError("Type your setup password first.");
      return;
    }
    if (!selectedOrgId) {
      setError("Load schools and pick which school this person belongs to.");
      return;
    }
    if (personRole !== "student" && (!personEmail.trim() || !personPassword)) {
      setError("Email and password are required for parents, instructors, and admins.");
      return;
    }
    const res = await addPersonAction({
      setupPassword,
      organizationId: selectedOrgId,
      displayName: personName,
      email: personEmail,
      password: personPassword,
      role: personRole,
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMessage(
      res.userId
        ? `Saved to the database. Person id: ${res.personId}. They can sign in with the email and password you entered (Supabase Auth).`
        : `Saved student to the database (person id: ${res.personId}). Students here do not get a login until you add email + password later.`,
    );
    setPersonName("");
    setPersonEmail("");
    setPersonPassword("");
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden overflow-y-auto bg-gradient-to-br from-[#0d0520] via-[#150a30] to-[#0a1020] pb-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-48 w-96 -translate-x-1/2 rounded-full bg-cyan-500/5 blur-3xl"
      />

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <Link
            href="/admin"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-violet-200 transition hover:border-violet-400/30 hover:bg-white/10 hover:text-white"
          >
            <span aria-hidden>←</span> Back to admin
          </Link>
        </div>

        <div className="mt-6 text-center sm:mt-8 sm:text-left">
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-violet-300/90">Admin · Supabase</p>
          <h1 className="mt-2 bg-gradient-to-r from-violet-200 via-fuchsia-200 to-violet-200 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
            Database setup
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Create organizations and people in <span className="font-mono text-violet-200/90">app_core</span> — not
            mock browser storage.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/50 p-4 backdrop-blur-xl sm:p-5">
          <p className="text-sm leading-relaxed text-slate-400">
            Add <span className="font-mono text-violet-200/90">SUPABASE_SERVICE_ROLE_KEY</span> and{" "}
            <span className="font-mono text-violet-200/90">STUDIO_DATABASE_SETUP_PASSWORD</span> to{" "}
            <span className="font-mono text-slate-300">web/.env.local</span>, restart the dev server, then use the setup
            password in the form below whenever you load or save.
          </p>
          <details className="mt-3 rounded-xl border border-amber-400/20 bg-amber-950/20 px-3 py-2 text-xs text-amber-100/90 backdrop-blur-sm [&_summary]:cursor-pointer [&_summary]:font-semibold [&_summary]:text-amber-100">
            <summary>Troubleshooting: “Invalid schema: app_core”</summary>
            <p className="mt-2 leading-relaxed text-amber-100/85">
              Supabase → <strong className="text-amber-50">Project Settings</strong> →{" "}
              <strong className="text-amber-50">Data API</strong> (or <strong className="text-amber-50">API</strong>) →{" "}
              <strong className="text-amber-50">Exposed schemas</strong>: add{" "}
              <span className="font-mono text-amber-200">app_core</span> next to{" "}
              <span className="font-mono text-amber-200">public</span>, save. Run Section 1 of{" "}
              <span className="font-mono">supabase_all_in_one_migration.sql</span> so <span className="font-mono">app_core</span>{" "}
              tables exist.
            </p>
          </details>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/55 p-5 shadow-inner shadow-black/20 backdrop-blur-xl sm:p-7">
          <div className="flex items-start gap-3">
            <StepBadge n={1} />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-white">Unlock and sync</h2>
              <p className="mt-0.5 text-xs text-slate-500">Same value as STUDIO_DATABASE_SETUP_PASSWORD in .env.local</p>
              <label className={`${labelClass} mt-4`}>
                Setup password
                <input
                  type="password"
                  autoComplete="off"
                  value={setupPassword}
                  onChange={(ev) => setSetupPassword(ev.target.value)}
                  className={fieldClass}
                  placeholder="From .env.local"
                />
              </label>
              <button
                type="button"
                className="btn btn-primary mt-4 w-full sm:w-auto"
                onClick={() => void loadSchools()}
              >
                Load schools from database
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <p
            className="mt-4 rounded-xl border border-rose-400/40 bg-rose-950/50 px-4 py-3 text-sm leading-relaxed text-rose-100 shadow-lg shadow-rose-950/30 backdrop-blur-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-xl border border-emerald-400/35 bg-emerald-950/40 px-4 py-3 text-sm leading-relaxed text-emerald-50 shadow-lg shadow-emerald-950/20 backdrop-blur-sm">
            {message}
          </p>
        ) : null}

        {orgs.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-violet-400/25 bg-violet-950/30 p-4 backdrop-blur-sm sm:p-5">
            <p className={`${labelClass} text-violet-200/90`}>Schools loaded ({orgs.length})</p>
            <p className="mt-1 text-xs text-slate-500">
              Pick one in <strong className="text-slate-300">Add a person</strong> below. Use <strong className="text-slate-300">Create a school</strong> only to add another organization.
            </p>
            <ul className="mt-3 space-y-2">
              {orgs.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-col gap-0.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-semibold text-white">{o.name}</span>
                  <span className="font-mono text-xs text-violet-200/80">{o.slug}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl sm:p-7">
          <div className="flex items-start gap-3">
            <StepBadge n={2} />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-white">Create a school</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Optional — add another org. Inserts into <span className="font-mono text-slate-400">app_core.organizations</span>
                . Your seed / loaded schools are listed above.
              </p>
              <form className="mt-4 space-y-4" onSubmit={(e) => void createSchool(e)}>
                <label className={labelClass}>
                  School name
                  <input
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className={fieldClass}
                    placeholder="e.g. NH Pulse"
                  />
                </label>
                <button type="submit" className="btn btn-primary w-full sm:w-auto">
                  Save school
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl sm:p-7">
          <div className="flex items-start gap-3">
            <StepBadge n={3} />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-white">Add a person</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Parents, instructors, and admins get Supabase Auth + profile. Students can be profile-only until you add
                login fields.
              </p>
              <form className="mt-4 space-y-4" onSubmit={(e) => void addPerson(e)}>
                <label className={labelClass}>
                  School
                  <select
                    required
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Load schools first…</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.slug})
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Display name
                  <input
                    required
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    className={fieldClass}
                    placeholder="Full name"
                  />
                </label>
                <label className={labelClass}>
                  Email {personRole === "student" ? <span className="font-normal text-slate-500">(optional)</span> : null}
                  <input
                    type={personRole === "student" ? "text" : "email"}
                    value={personEmail}
                    onChange={(e) => setPersonEmail(e.target.value)}
                    className={fieldClass}
                    placeholder={personRole === "student" ? "Optional for students" : "name@example.com"}
                  />
                </label>
                <label className={labelClass}>
                  Password {personRole === "student" ? <span className="font-normal text-slate-500">(optional)</span> : null}
                  <input
                    type="password"
                    value={personPassword}
                    onChange={(e) => setPersonPassword(e.target.value)}
                    className={fieldClass}
                    placeholder={personRole === "student" ? "Leave blank for profile-only" : ""}
                  />
                </label>
                <label className={labelClass}>
                  Role
                  <select
                    value={personRole}
                    onChange={(e) => setPersonRole(e.target.value as typeof personRole)}
                    className={fieldClass}
                  >
                    <option value="parent">Parent / guardian</option>
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button type="submit" className="btn btn-primary w-full sm:w-auto">
                  Save person
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
