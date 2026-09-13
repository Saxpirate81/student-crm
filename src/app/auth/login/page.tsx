"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { MOCK_DEMO_PASSWORD, MOCK_PRODUCER_EMAIL, MOCK_TESTER_EMAIL, MOCK_TESTER_PASSWORD, MOCK_TESTER_SCREEN_NAME, isMockTesterLogin } from "@/lib/auth/constants";
import { ensureSimpleTestOrgInBundle, previewParentInvite } from "@/lib/auth/mock-auth-store";
import {
  getSimpleMockTestInviteToken,
  getSimpleMockTestOrgName,
  isSimpleMockTestOrgEnabled,
} from "@/lib/config/mock-simple-test-org";
import { safeInternalNextPath } from "@/lib/navigation/safe-internal-next-path";

type SignInTab = "parent" | "student" | "producer" | "staff";
type Screen = "signin" | "signup";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginAsParent, loginAsChild, loginAsProducer, signUp } = useAuth();

  const [screen, setScreen] = useState<Screen>("signin");
  const [signInTab, setSignInTab] = useState<SignInTab>("staff");

  const [parentEmail, setParentEmail] = useState(MOCK_TESTER_EMAIL);
  const [parentPassword, setParentPassword] = useState(MOCK_TESTER_PASSWORD);
  const [familyParentEmail, setFamilyParentEmail] = useState(MOCK_TESTER_EMAIL);
  const [screenName, setScreenName] = useState(MOCK_TESTER_SCREEN_NAME);
  const [familyPassword, setFamilyPassword] = useState(MOCK_TESTER_PASSWORD);
  const [producerEmail, setProducerEmail] = useState(MOCK_TESTER_EMAIL);
  const [producerPassword, setProducerPassword] = useState(MOCK_TESTER_PASSWORD);

  const [orgName, setOrgName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [parentDisplayName, setParentDisplayName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [addStudentNow, setAddStudentNow] = useState(true);
  const [childDisplayName, setChildDisplayName] = useState("");
  const [childScreenName, setChildScreenName] = useState("");
  const [childPassword, setChildPassword] = useState("");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureSimpleTestOrgInBundle();
    setInviteToken(searchParams.get("invite")?.trim() ?? "");
    if (searchParams.get("mode") === "signup") {
      setScreen("signup");
    }
  }, [searchParams]);

  const invitePreview = useMemo(() => {
    if (!inviteToken) return null;
    return previewParentInvite(inviteToken);
  }, [inviteToken]);

  const postLoginReturnTo = useMemo(() => safeInternalNextPath(searchParams.get("next")), [searchParams]);

  function replaceLoginSearch(next: URLSearchParams) {
    const qs = next.toString();
    router.replace(qs ? `/auth/login?${qs}` : "/auth/login");
  }

  function redirectAfterSignIn(fallback: string) {
    const next = safeInternalNextPath(searchParams.get("next"));
    router.push(next ?? fallback);
  }

  useEffect(() => {
    if (!isSimpleMockTestOrgEnabled()) return;
    if (screen !== "signup") return;
    if (searchParams.get("invite")?.trim()) return;
    const token = getSimpleMockTestInviteToken();
    const next = new URLSearchParams(searchParams.toString());
    next.set("mode", "signup");
    next.set("invite", token);
    replaceLoginSearch(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to screen / invite presence
  }, [screen, searchParams]);

  const submitParent = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (isMockTesterLogin(parentEmail, parentPassword)) {
      const ok = await loginAsProducer(parentEmail, parentPassword);
      if (!ok) {
        setError("Tester sign-in failed. Try Staff with the tester email and password.");
        return;
      }
      redirectAfterSignIn("/parent");
      return;
    }
    if (parentEmail.trim().toLowerCase() === MOCK_PRODUCER_EMAIL.toLowerCase()) {
      setError(
        `“${MOCK_PRODUCER_EMAIL}” is the studio producer demo, not a parent account. Tap the Producer tab above, enter the same email, password “${MOCK_DEMO_PASSWORD}”, then Continue.`,
      );
      return;
    }
    const ok = await loginAsParent(parentEmail, parentPassword);
    if (!ok) {
      setError("Email or password does not match.");
      return;
    }
    redirectAfterSignIn("/parent");
  };

  const submitFamily = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (isMockTesterLogin(familyParentEmail, familyPassword)) {
      const ok = await loginAsProducer(familyParentEmail, familyPassword);
      if (!ok) {
        setError("Tester sign-in failed. Try Staff with the tester email and password.");
        return;
      }
      redirectAfterSignIn("/student");
      return;
    }
    const ok = await loginAsChild(familyParentEmail, screenName, familyPassword);
    if (!ok) {
      setError("Check parent account email, screen name, and password.");
      return;
    }
    redirectAfterSignIn("/student");
  };

  const submitProducer = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const ok = await loginAsProducer(producerEmail, producerPassword);
    if (!ok) {
      if (producerEmail.trim().toLowerCase() === MOCK_PRODUCER_EMAIL.toLowerCase()) {
        setError(
          `Demo producer password is “${MOCK_DEMO_PASSWORD}”. (STUDIO_DATABASE_SETUP_PASSWORD is only for Admin → Database setup.)`,
        );
      } else {
        setError("Producer email or password does not match.");
      }
      return;
    }
    redirectAfterSignIn("/producer");
  };

  const submitStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const ok = await loginAsProducer(producerEmail, producerPassword);
    if (!ok) {
      setError(
        `Use ${MOCK_TESTER_EMAIL} / ${MOCK_TESTER_PASSWORD}, or ${MOCK_PRODUCER_EMAIL} / ${MOCK_DEMO_PASSWORD}.`,
      );
      return;
    }
    redirectAfterSignIn("/instructor");
  };

  const submitSignup = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!invitePreview) return;
    const firstChild =
      addStudentNow && childDisplayName.trim() && childScreenName.trim() && childPassword
        ? {
            displayName: childDisplayName.trim(),
            screenName: childScreenName.trim(),
            password: childPassword,
          }
        : undefined;
    const result = signUp(
      {
        organizationName: invitePreview?.mode === "bootstrap" ? orgName.trim() : undefined,
        parentDisplayName: parentDisplayName.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
      },
      firstChild,
      inviteToken,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    redirectAfterSignIn("/parent");
  };

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-slate-950/55 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/25 p-1">
        <button
          type="button"
          onClick={() => {
            setScreen("signin");
            setError(null);
            const next = new URLSearchParams(searchParams.toString());
            next.delete("mode");
            replaceLoginSearch(next);
          }}
          className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${
            screen === "signin"
              ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setScreen("signup");
            setError(null);
            const next = new URLSearchParams(searchParams.toString());
            next.set("mode", "signup");
            if (isSimpleMockTestOrgEnabled()) {
              next.set("invite", getSimpleMockTestInviteToken());
            }
            replaceLoginSearch(next);
          }}
          className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${
            screen === "signup"
              ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Create account
        </button>
      </div>

      <p className="mt-4 rounded-xl border border-violet-400/30 bg-violet-950/40 px-3 py-3 text-xs leading-relaxed text-violet-100">
        <strong className="text-white">Tester login</strong>
        <span className="mt-1 block font-mono text-sm font-semibold text-violet-50">
          {MOCK_TESTER_EMAIL}
        </span>
        <span className="font-mono text-sm font-semibold text-violet-50">password: {MOCK_TESTER_PASSWORD}</span>
        <span className="mt-1 block text-violet-200/90">
          Use Staff to open instructor, or Parent / Student / Producer with the same email and password. Then switch
          views from the header.
        </span>
      </p>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Older producer demo still works:{" "}
        <span className="font-mono text-slate-300">{MOCK_PRODUCER_EMAIL}</span> /{" "}
        <span className="font-mono text-slate-300">{MOCK_DEMO_PASSWORD}</span>
      </p>
      {isSimpleMockTestOrgEnabled() ? (
        <p className="mt-2 rounded-xl border border-emerald-400/25 bg-emerald-950/25 px-3 py-2 text-xs leading-relaxed text-emerald-100/95">
          <strong className="text-emerald-50">Simple test org</strong> is on: every signup uses{" "}
          <span className="font-mono text-emerald-200">{getSimpleMockTestOrgName()}</span> with invite token{" "}
          <span className="font-mono text-emerald-200">{getSimpleMockTestInviteToken()}</span>. Rename the org with{" "}
          <span className="font-mono">NEXT_PUBLIC_MOCK_TEST_ORG_NAME</span> in <span className="font-mono">.env.local</span>
          , then restart dev.
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Production-style signups need an <strong className="text-slate-300">invite link</strong>. First school in an
          empty browser: set <span className="font-mono text-violet-200/90">NEXT_PUBLIC_MOCK_ORG_BOOTSTRAP_TOKEN</span>{" "}
          and open <span className="font-mono text-violet-200/90">/auth/login?mode=signup&amp;invite=…that token…</span>.
          For one fixed test school, set <span className="font-mono">NEXT_PUBLIC_MOCK_USE_SIMPLE_TEST_ORG=1</span>{" "}
          instead.
        </p>
      )}
      {postLoginReturnTo ? (
        <p className="mt-3 rounded-xl border border-violet-400/35 bg-violet-950/35 px-3 py-2 text-xs leading-relaxed text-violet-100">
          You tried to open a page that requires sign-in first. Use your normal app login below (e.g. demo password{" "}
          <span className="font-mono font-semibold text-violet-200">{MOCK_DEMO_PASSWORD}</span>
          {postLoginReturnTo.includes("database-setup") ? (
            <>
              ). After a successful sign-in you’ll go to <span className="font-mono text-violet-200">{postLoginReturnTo}</span>{" "}
              — that is where you type <span className="font-mono">STUDIO_DATABASE_SETUP_PASSWORD</span>, not here.
            </>
          ) : (
            <>
              ). After sign-in you’ll continue to <span className="font-mono text-violet-200">{postLoginReturnTo}</span>.
            </>
          )}
        </p>
      ) : null}
      {process.env.NEXT_PUBLIC_ENABLE_MOCK_SUPABASE_SYNC === "1" ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Mock → Supabase mirror is enabled (see <span className="font-mono">MOCK_SUPABASE_SYNC_SECRET</span> + service
          role in <span className="font-mono">.env.local</span>).
        </p>
      ) : null}

      {error && (
        <p
          className="mt-4 rounded-xl border border-rose-400/40 bg-rose-950/50 px-3 py-2 text-sm font-medium text-rose-100"
          role="alert"
        >
          {error}
        </p>
      )}

      {screen === "signup" && !inviteToken && !isSimpleMockTestOrgEnabled() ? (
        <div className="mt-5 space-y-3 rounded-xl border border-amber-400/25 bg-amber-950/25 px-4 py-4 text-sm text-amber-50/95">
          <p className="font-semibold text-amber-100">Invitation required</p>
          <p className="leading-relaxed text-amber-100/85">
            Parent signup is only available through an invite link from someone already at your organization. Check
            your email or message from the school, or ask a parent who already has an account to generate one from the
            Parent app (Family).
          </p>
          <p className="text-xs leading-relaxed text-amber-100/70">
            Developers: use <span className="font-mono">NEXT_PUBLIC_MOCK_ORG_BOOTSTRAP_TOKEN</span> with an empty
            mock-auth store for the first school, or sign in as a parent and create an invite link.
          </p>
        </div>
      ) : null}

      {screen === "signup" && inviteToken && !invitePreview ? (
        <div className="mt-5 space-y-2 rounded-xl border border-rose-400/30 bg-rose-950/30 px-4 py-4 text-sm text-rose-100">
          <p className="font-semibold">This signup link is not valid</p>
          <p className="leading-relaxed text-rose-100/90">
            The token may be wrong, revoked, or the first-time setup token may already have been used. Ask your school
            for a new link.
          </p>
        </div>
      ) : null}

      {screen === "signup" && invitePreview ? (
        <form className="mt-5 space-y-4" onSubmit={submitSignup}>
          {invitePreview.mode === "bootstrap" ? (
            <label className="block text-sm font-semibold text-slate-100">
              Organization / school name (first account)
              <input
                required
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                placeholder="e.g. Cadenza North"
              />
            </label>
          ) : (
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-950/20 px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-200/80">Joining organization</p>
              <p className="mt-1 text-base font-semibold text-white">{invitePreview.organizationName}</p>
            </div>
          )}
          <label className="block text-sm font-semibold text-slate-100">
            Your name (parent)
            <input
              required
              type="text"
              value={parentDisplayName}
              onChange={(e) => setParentDisplayName(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              placeholder="Alex Jordan"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-100">
            Parent email
            <input
              required
              type="email"
              autoComplete="email"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-100">
            Password
            <input
              required
              type="password"
              autoComplete="new-password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={addStudentNow}
              onChange={(e) => setAddStudentNow(e.target.checked)}
              className="accent-violet-500"
            />
            Add a student profile now (recommended for testing)
          </label>

          {addStudentNow && (
            <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="block text-sm font-semibold text-slate-100">
                Student display name
                <input
                  required={addStudentNow}
                  type="text"
                  value={childDisplayName}
                  onChange={(e) => setChildDisplayName(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                  placeholder="Jamie Jordan"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-100">
                Screen name (login)
                <input
                  required={addStudentNow}
                  type="text"
                  autoComplete="nickname"
                  value={childScreenName}
                  onChange={(e) => setChildScreenName(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                  placeholder="jamie"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-100">
                Student password
                <input
                  required={addStudentNow}
                  type="password"
                  autoComplete="new-password"
                  value={childPassword}
                  onChange={(e) => setChildPassword(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110"
          >
            Create account & continue
          </button>
        </form>
      ) : null}

      {screen === "signin" && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/25 p-1 sm:grid-cols-4">
            {(
              [
                ["parent", "Parent"],
                ["student", "Student"],
                ["producer", "Producer"],
                ["staff", "Staff"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSignInTab(id);
                  setError(null);
                }}
                className={`rounded-lg px-2 py-2 text-[10px] font-bold transition sm:text-xs ${
                  signInTab === id
                    ? "bg-white/10 text-white ring-1 ring-violet-400/50"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {signInTab === "parent" && (
            <form className="mt-5 space-y-4" onSubmit={submitParent}>
              <label className="block text-sm font-semibold text-slate-100">
                Parent email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-100">
                Password
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={parentPassword}
                  onChange={(e) => setParentPassword(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/40"
              >
                Continue to parent home
              </button>
            </form>
          )}

          {signInTab === "student" && (
            <form className="mt-5 space-y-4" onSubmit={submitFamily}>
              <label className="block text-sm font-semibold text-slate-100">
                Parent account email
                <input
                  required
                  type="email"
                  autoComplete="username"
                  value={familyParentEmail}
                  onChange={(e) => setFamilyParentEmail(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-100">
                Screen name
                <input
                  required
                  type="text"
                  autoComplete="nickname"
                  value={screenName}
                  onChange={(e) => setScreenName(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-100">
                Password
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={familyPassword}
                  onChange={(e) => setFamilyPassword(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/40"
              >
                Continue to student studio
              </button>
            </form>
          )}

          {signInTab === "producer" && (
            <form className="mt-5 space-y-4" onSubmit={submitProducer}>
              <label className="block text-sm font-semibold text-slate-100">
                Producer email
                <input
                  required
                  type="email"
                  autoComplete="username"
                  value={producerEmail}
                  onChange={(e) => setProducerEmail(e.target.value)}
                  placeholder={MOCK_TESTER_EMAIL}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-100">
                Password
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={producerPassword}
                  onChange={(e) => setProducerPassword(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/40"
              >
                Continue to producer workspace
              </button>
            </form>
          )}

          {signInTab === "staff" && (
            <form className="mt-5 space-y-4" onSubmit={submitStaff}>
              <p className="text-xs text-slate-400">
                Instructor and admin views use the tester account. Sign in, then switch views from the header if you
                need Admin or Parent.
              </p>
              <label className="block text-sm font-semibold text-slate-100">
                Producer email
                <input
                  required
                  type="email"
                  autoComplete="username"
                  value={producerEmail}
                  onChange={(e) => setProducerEmail(e.target.value)}
                  placeholder={MOCK_TESTER_EMAIL}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-100">
                Password
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={producerPassword}
                  onChange={(e) => setProducerPassword(e.target.value)}
                  className="ui-input mt-1 w-full rounded-xl border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/40"
              >
                Continue to instructor view
              </button>
            </form>
          )}
        </>
      )}

      <div className="mt-6 border-t border-white/10 pt-5 text-center text-xs text-slate-500">
        {screen === "signin" ? (
          <p>
            New household?{" "}
            <button
              type="button"
              className="font-bold text-violet-300 hover:underline"
              onClick={() => {
                setScreen("signup");
                setError(null);
                const next = new URLSearchParams(searchParams.toString());
                next.set("mode", "signup");
                if (isSimpleMockTestOrgEnabled()) {
                  next.set("invite", getSimpleMockTestInviteToken());
                }
                replaceLoginSearch(next);
              }}
            >
              Create an account
            </button>
          </p>
        ) : (
          <p>
            Already registered?{" "}
            <button
              type="button"
              className="font-bold text-violet-300 hover:underline"
              onClick={() => {
                setScreen("signin");
                setError(null);
                const next = new URLSearchParams(searchParams.toString());
                next.delete("mode");
                replaceLoginSearch(next);
              }}
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-400">Loading…</div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
