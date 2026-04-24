"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { VideoCard } from "@/components/VideoCard";
import { MOCK_DEMO_PASSWORD } from "@/lib/auth/constants";
import { getAccountDetailsForParent } from "@/lib/auth/mock-auth-store";
import { useAuth } from "@/lib/auth/auth-context";
import { useRepository } from "@/lib/useRepository";

export default function ParentPage() {
  const { session, ready, addChild, resetChildPassword } = useAuth();
  const { repository, refresh, version } = useRepository();
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
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Parent View</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Read-only progress and media updates. Sign in to manage your real household ids and family logins.
        </p>

        {ready && session?.kind !== "parent" && (
          <p className="mt-3 rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-2 text-sm text-indigo-950 dark:border-indigo-500/25 dark:bg-indigo-950/35 dark:text-indigo-100">
            Demo mode: pick a fixture parent, or{" "}
            <Link href="/auth/signup" className="font-bold underline-offset-2 hover:underline">
              sign up
            </Link>{" "}
            /{" "}
            <Link href="/auth/login" className="font-bold underline-offset-2 hover:underline">
              log in
            </Link>{" "}
            for a mock household.
          </p>
        )}

        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:max-w-xl">
            {session?.kind === "parent" ? (
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-950/30 dark:text-emerald-100">
                Signed in as <span className="font-bold">{session.displayName}</span> ({session.email})
              </div>
            ) : (
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Parent profile (fixture)
                <select
                  value={parentCrmId}
                  onChange={(event) => setParentCrmId(event.target.value)}
                  className="ui-select mt-1 w-full rounded-lg px-2 py-1"
                >
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
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Students in this household</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Tap a student to preview their videos and progress here. Student sign-in still uses the dedicated
              student view.
            </p>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Household students">
              {children.map((student) => {
                const active = student.crmId === selectedStudent;
                return (
                  <button
                    key={student.crmId}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedStudent(student.crmId)}
                    className={`rounded-full border px-4 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? "border-indigo-500 bg-indigo-600 text-white shadow-sm dark:border-indigo-400 dark:bg-indigo-500"
                        : "border-slate-200/90 bg-white text-slate-800 hover:border-indigo-300/80 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:border-indigo-500/40"
                    }`}
                  >
                    {student.displayName}
                  </button>
                );
              })}
            </div>
            {!children.length && (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No student profiles for this parent.</p>
            )}
          </div>
        </div>
      </section>

      {session?.kind === "parent" && accountDetails && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Household &amp; ids (mock)</h2>
          <dl className="grid gap-2 text-xs font-mono text-slate-700 dark:text-slate-300 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/50">
              <dt className="font-sans text-[10px] font-bold uppercase text-slate-500">Organization id</dt>
              <dd className="break-all">{accountDetails.org?.id ?? "—"}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/50">
              <dt className="font-sans text-[10px] font-bold uppercase text-slate-500">Organization name</dt>
              <dd className="break-all font-sans text-sm font-semibold">{accountDetails.org?.name ?? "—"}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/50">
              <dt className="font-sans text-[10px] font-bold uppercase text-slate-500">Parent id</dt>
              <dd className="break-all">{accountDetails.parentRow?.id ?? "—"}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-950/50">
              <dt className="font-sans text-[10px] font-bold uppercase text-slate-500">Parent CRM id</dt>
              <dd className="break-all">{session.parentCrmId}</dd>
            </div>
          </dl>

          <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Family members (child ids)</h3>
            <ul className="mt-2 space-y-2 text-xs">
              {accountDetails.children.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-slate-200/80 bg-white p-2 dark:border-white/10 dark:bg-slate-900/60"
                >
                  <div className="font-mono text-slate-800 dark:text-slate-200">
                    <span className="font-sans text-[10px] font-bold uppercase text-slate-500">child id </span>
                    {c.id}
                  </div>
                  <div className="mt-1 font-mono text-slate-700 dark:text-slate-300">
                    <span className="font-sans text-[10px] font-bold uppercase text-slate-500">screen </span>
                    {c.screenName}
                    <span className="mx-2 font-sans text-slate-400">·</span>
                    <span className="font-sans text-[10px] font-bold uppercase text-slate-500"> studentCrmId </span>
                    {c.studentCrmId}
                  </div>
                  <ChildPasswordRow childId={c.id} onReset={resetChildPassword} onMessage={setFamilyMessage} />
                </li>
              ))}
              {!accountDetails.children.length && (
                <li className="text-sm text-slate-500 dark:text-slate-400">No family logins yet — add one below.</li>
              )}
            </ul>
          </div>

          <form className="space-y-3 rounded-xl border border-indigo-200/70 bg-indigo-50/50 p-4 dark:border-indigo-500/20 dark:bg-indigo-950/25" onSubmit={submitAddChild}>
            <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-100">Add family member</h3>
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Display name
              <input
                value={newDisplay}
                onChange={(e) => setNewDisplay(e.target.value)}
                className="ui-input mt-1 w-full rounded-lg px-2 py-1 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Screen name (unique in org)
              <input
                value={newScreen}
                onChange={(e) => setNewScreen(e.target.value)}
                className="ui-input mt-1 w-full rounded-lg px-2 py-1 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="ui-input mt-1 w-full rounded-lg px-2 py-1 text-sm"
              />
            </label>
            <button
              type="submit"
              className="ui-button-primary rounded-lg px-3 py-2 text-xs font-bold"
            >
              Save family member
            </button>
          </form>

          {familyMessage && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-200">
              {familyMessage}
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Recent Videos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              href={`/student/videos/${video.id}`}
              subtitle="Open student lesson view"
            />
          ))}
        </div>
        {!videos.length && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No videos available yet for this profile.</p>
        )}
      </section>
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
      className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2 dark:border-white/5"
      onSubmit={(e) => {
        e.preventDefault();
        onMessage(null);
        const result = onReset(childId, pw);
        if (!result.ok) onMessage(result.error);
        else onMessage("Password updated for that family member.");
      }}
    >
      <label className="min-w-[140px] flex-1 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
        New password (mock)
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="ui-input mt-0.5 w-full rounded px-1.5 py-1 text-xs"
        />
      </label>
      <button
        type="submit"
        className="ui-button-secondary rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
      >
        Update
      </button>
    </form>
  );
}
