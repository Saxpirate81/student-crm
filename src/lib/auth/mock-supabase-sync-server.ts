import type { SupabaseClient } from "@supabase/supabase-js";
import type { MockSupabaseParentSignupPayload } from "@/lib/auth/mock-supabase-sync-payload";
import { getAppCoreServiceClient } from "@/lib/supabase/service";

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

async function resolveOrganizationId(
  client: SupabaseClient,
  payload: MockSupabaseParentSignupPayload,
): Promise<{ organizationId: string; error?: string }> {
  if (payload.createdNewOrganization) {
    const salt = payload.mockOrganizationId.replace(/[^a-z0-9]/gi, "").slice(-10) || "mock";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const slug = buildOrgSlug(payload.organizationName, salt, attempt);
      const { data, error } = await client
        .from("organizations")
        .insert({
          slug,
          name: payload.organizationName,
          status: "active",
          metadata: {
            mock_local_organization_id: payload.mockOrganizationId,
            mock_signup_sync: true,
          },
        })
        .select("id")
        .single();
      if (!error && data?.id) return { organizationId: data.id as string };
      if (error && !`${error.message}`.toLowerCase().includes("duplicate") && error.code !== "23505") {
        return { organizationId: "", error: error.message };
      }
    }
    return { organizationId: "", error: "Could not create organization (slug conflicts)." };
  }

  const { data, error } = await client
    .from("organizations")
    .select("id")
    .contains("metadata", { mock_local_organization_id: payload.mockOrganizationId })
    .maybeSingle();

  if (error) return { organizationId: "", error: error.message };
  if (!data?.id) {
    return {
      organizationId: "",
      error:
        "No matching organization in Supabase for this mock org. Create the school once with bootstrap sync, or run sync after the first parent.",
    };
  }
  return { organizationId: data.id as string };
}

async function fetchRoleId(client: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await client.from("roles").select("id").eq("key", key).maybeSingle();
  if (error || !data?.id) return null;
  return data.id as string;
}

export type MockSupabaseSyncResult = { ok: true } | { ok: false; status: number; message: string };

export async function syncMockParentSignupToSupabase(
  payload: MockSupabaseParentSignupPayload,
): Promise<MockSupabaseSyncResult> {
  const client = getAppCoreServiceClient();
  if (!client) {
    return { ok: false, status: 503, message: "Supabase service client is not configured (SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const { organizationId, error: orgErr } = await resolveOrganizationId(client, payload);
  if (!organizationId) {
    return { ok: false, status: 400, message: orgErr ?? "Organization resolution failed." };
  }

  const { data: authUser, error: authError } = await client.auth.admin.createUser({
    email: payload.parent.email,
    password: payload.parent.password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    return {
      ok: false,
      status: authError?.message?.includes("already been registered") ? 409 : 400,
      message: authError?.message ?? "Auth user creation failed.",
    };
  }

  const userId = authUser.user.id;
  const { firstName, lastName } = splitDisplayName(payload.parent.displayName);
  const emailNorm = normEmail(payload.parent.email);
  const nameNorm = normName(payload.parent.displayName);

  const { data: parentPerson, error: personErr } = await client
    .from("persons")
    .insert({
      organization_id: organizationId,
      display_name: payload.parent.displayName.trim(),
      first_name: firstName,
      last_name: lastName,
      normalized_name: nameNorm,
      email: payload.parent.email.trim(),
      normalized_email: emailNorm,
      profile_status: "active",
      metadata: {
        mock_parent_local_id: payload.parent.mockParentId,
        parent_crm_id: payload.parent.parentCrmId,
        mock_signup_sync: true,
      },
    })
    .select("id")
    .single();

  if (personErr || !parentPerson?.id) {
    return { ok: false, status: 400, message: personErr?.message ?? "Parent person insert failed." };
  }

  const parentPersonId = parentPerson.id as string;

  const parentRoleId = await fetchRoleId(client, "parent");
  if (parentRoleId) {
    await client.from("person_roles").insert({
      organization_id: organizationId,
      person_id: parentPersonId,
      role_id: parentRoleId,
      effective_start: new Date().toISOString().slice(0, 10),
      active: true,
      metadata: { mock_signup_sync: true },
    });
  }

  const orgRole = payload.createdNewOrganization ? "owner" : "member";
  const { error: memErr } = await client.from("organization_memberships").insert({
    organization_id: organizationId,
    user_id: userId,
    org_role: orgRole,
    status: "active",
    joined_at: new Date().toISOString(),
    metadata: { mock_signup_sync: true },
  });
  if (memErr) {
    return { ok: false, status: 400, message: memErr.message };
  }

  const { error: paiErr } = await client.from("person_auth_identities").insert({
    organization_id: organizationId,
    person_id: parentPersonId,
    user_id: userId,
    identity_status: "active",
    is_primary: true,
  });
  if (paiErr) {
    return { ok: false, status: 400, message: paiErr.message };
  }

  if (emailNorm) {
    await client.from("person_contact_points").insert({
      organization_id: organizationId,
      person_id: parentPersonId,
      contact_type: "email",
      raw_value: payload.parent.email.trim(),
      normalized_value: emailNorm,
      is_primary: true,
      active: true,
      metadata: { mock_signup_sync: true },
    });
  }

  if (payload.child) {
    const c = payload.child;
    const childNameNorm = normName(c.displayName);
    const cf = splitDisplayName(c.displayName);
    const { data: studentPerson, error: stErr } = await client
      .from("persons")
      .insert({
        organization_id: organizationId,
        display_name: c.displayName.trim(),
        first_name: cf.firstName,
        last_name: cf.lastName,
        normalized_name: childNameNorm,
        profile_status: "active",
        metadata: {
          mock_child_local_id: c.mockChildId,
          student_crm_id: c.studentCrmId,
          mock_screen_name: c.screenName,
          parent_crm_id: payload.parent.parentCrmId,
          mock_signup_sync: true,
        },
      })
      .select("id")
      .single();

    if (!stErr && studentPerson?.id) {
      const studentRoleId = await fetchRoleId(client, "student");
      if (studentRoleId) {
        await client.from("person_roles").insert({
          organization_id: organizationId,
          person_id: studentPerson.id as string,
          role_id: studentRoleId,
          effective_start: new Date().toISOString().slice(0, 10),
          active: true,
          metadata: { mock_signup_sync: true },
        });
      }
    }
  }

  return { ok: true };
}
