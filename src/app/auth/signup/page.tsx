import { redirect } from "next/navigation";

type SignupSearchParams = Promise<{ invite?: string }>;

/** Sign-up UI lives on the login page (single flow). Preserves `invite` query. */
export default async function SignupPage({ searchParams }: { searchParams: SignupSearchParams }) {
  const sp = await searchParams;
  const invite = typeof sp.invite === "string" ? sp.invite.trim() : "";
  const q = new URLSearchParams({ mode: "signup" });
  if (invite) q.set("invite", invite);
  redirect(`/auth/login?${q.toString()}`);
}
