import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppCoreServiceClient } from "@/lib/supabase/service";

export type StudioOrgRow = { id: string; name: string; slug: string; created_at: string };

const PERSON_ROLES = ["student", "parent", "instructor", "admin"] as const;
export type StudioPersonRole = (typeof PERSON_ROLES)[number];

export function isStudioPersonRole(value: string): value is StudioPersonRole {
  return (PERSON_ROLES as readonly string[]).includes(value);
}

function assertSetupPassword(setupPassword: string) {
  const expected = process.env.STUDIO_DATABASE_SETUP_PASSWORD?.trim();
  if (!expected) {
    throw new Error(
      "Server is missing STUDIO_DATABASE_SETUP_PASSWORD. Add it to web/.env.local and restart the dev server.",
    );
  }
  if (setupPassword !== expected) {
    throw new Error("That setup password does not match your .env.local file.");
  }
}

function requireServiceClient(): SupabaseClient {
  const client = getAppCoreServiceClient();
  if (!client) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in web/.env.local. Copy the service_role key from Supabase → Project Settings → API (never share it or put it in the browser).",
    );
  }
  return client;
}

function normEmail(email: string) {
  const e = email.trim().toLowerCase();
  return e === "" ? null : e;
}

function normName(displayName: string) {
  const n = displayName.trim().toLowerCase().replace(/\s+/g, " ");
  return n === "" ? null : n;
}

function splitDisplayName(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  const firstName = parts[0] ?? displayName.trim();
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { firstName, lastName };
}

function buildOrgSlug(name: string, salt: string, attempt: number): string {
  const piece = `${name}-${salt}-${attempt}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  let slug = piece || `school-${salt}`.replace(/[^a-z0-9-]/g, "");
  if (slug.length < 3) slug = `org-${salt}`.replace(/[^a-z0-9]/g, "x").slice(0, 20);
  if (!/^[a-z0-9]/.test(slug)) slug = `o-${slug}`;
  if (!/[a-z0-9]$/.test(slug)) slug = `${slug}x`;
  return slug.slice(0, 63);
}

async function fetchRoleId(client: SupabaseClient, key: string): Promise<string> {
  const { data, error } = await client.from("roles").select("id").eq("key", key).maybeSingle();
  if (error || !data?.id) throw new Error(`Could not look up role “${key}” in the database.`);
  return data.id as string;
}

export async function studioListOrganizations(setupPassword: string): Promise<StudioOrgRow[]> {
  assertSetupPassword(setupPassword);
  const client = requireServiceClient();
  const { data, error } = await client
    .from("organizations")
    .select("id,name,slug,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as StudioOrgRow[];
}

export async function studioCreateOrganization(
  setupPassword: string,
  schoolName: string,
): Promise<{ id: string; slug: string; name: string }> {
  assertSetupPassword(setupPassword);
  const name = schoolName.trim();
  if (!name) throw new Error("School name is required.");

  const client = requireServiceClient();
  const salt = Math.random().toString(36).slice(2, 12);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const slug = buildOrgSlug(name, salt, attempt);
    const { data, error } = await client
      .from("organizations")
      .insert({
        slug,
        name,
        status: "active",
        metadata: { source: "studio_database_setup" },
      })
      .select("id,slug,name")
      .single();
    if (!error && data?.id) {
      return { id: data.id as string, slug: data.slug as string, name: data.name as string };
    }
    if (error && error.code !== "23505") {
      throw new Error(error.message);
    }
  }
  throw new Error("Could not create the school (try a slightly different name).");
}

export async function studioAddPerson(args: {
  setupPassword: string;
  organizationId: string;
  displayName: string;
  email: string;
  password: string;
  role: StudioPersonRole;
}): Promise<{ personId: string; userId?: string }> {
  assertSetupPassword(args.setupPassword);
  const displayName = args.displayName.trim();
  if (!displayName) throw new Error("Display name is required.");

  const email = args.email.trim();
  const password = args.password;
  const needsLogin = args.role !== "student";
  if (needsLogin) {
    if (!email) throw new Error("Email is required for this role so they can sign in.");
    if (!password) throw new Error("Password is required for this role.");
  }

  const client = requireServiceClient();
  const orgId = args.organizationId.trim();
  if (!orgId) throw new Error("Pick a school first.");

  let userId: string | undefined;
  if (needsLogin) {
    const { data: authUser, error: authError } = await client.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
    });
    if (authError || !authUser.user) {
      throw new Error(authError?.message ?? "Could not create the login for this email.");
    }
    userId = authUser.user.id;
  }

  const emailNorm = normEmail(email);
  const nameNorm = normName(displayName);
  const { firstName, lastName } = splitDisplayName(displayName);

  const { data: personRow, error: personErr } = await client
    .from("persons")
    .insert({
      organization_id: orgId,
      display_name: displayName,
      first_name: firstName,
      last_name: lastName,
      normalized_name: nameNorm,
      email: email || null,
      normalized_email: emailNorm,
      profile_status: "active",
      metadata: {
        source: "studio_database_setup",
        studio_role: args.role,
      },
    })
    .select("id")
    .single();

  if (personErr || !personRow?.id) {
    throw new Error(personErr?.message ?? "Could not save the person.");
  }
  const personId = personRow.id as string;

  const roleId = await fetchRoleId(client, args.role);
  await client.from("person_roles").insert({
    organization_id: orgId,
    person_id: personId,
    role_id: roleId,
    effective_start: new Date().toISOString().slice(0, 10),
    active: true,
    metadata: { source: "studio_database_setup" },
  });

  if (userId) {
    const { count, error: countErr } = await client
      .from("organization_memberships")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId);

    if (countErr) throw new Error(countErr.message);
    const n = count ?? 0;
    let orgRole: string;
    if (n === 0) orgRole = "owner";
    else if (args.role === "instructor") orgRole = "employee";
    else orgRole = "member";

    const { error: memErr } = await client.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: userId,
      org_role: orgRole,
      status: "active",
      joined_at: new Date().toISOString(),
      metadata: { source: "studio_database_setup" },
    });
    if (memErr) throw new Error(memErr.message);

    const { error: paiErr } = await client.from("person_auth_identities").insert({
      organization_id: orgId,
      person_id: personId,
      user_id: userId,
      identity_status: "active",
      is_primary: true,
    });
    if (paiErr) throw new Error(paiErr.message);

    if (emailNorm) {
      await client.from("person_contact_points").insert({
        organization_id: orgId,
        person_id: personId,
        contact_type: "email",
        raw_value: email,
        normalized_value: emailNorm,
        is_primary: true,
        active: true,
        metadata: { source: "studio_database_setup" },
      });
    }
  }

  return { personId, userId };
}
