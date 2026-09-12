"use server";

import {
  isStudioPersonRole,
  studioAddPerson,
  studioCreateOrganization,
  studioListOrganizations,
} from "@/lib/supabase/studio-setup-server";

function augmentStudioSetupError(message: string, fallback: string) {
  const m = message || fallback;
  if (/invalid schema:\s*app_core/i.test(m)) {
    return `${m} In Supabase: Project Settings → Data API → Exposed schemas → add app_core, save, then retry.`;
  }
  return m;
}

export async function listOrgsAction(setupPassword: string) {
  try {
    const orgs = await studioListOrganizations(setupPassword);
    return { ok: true as const, orgs };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Could not load schools.";
    return { ok: false as const, message: augmentStudioSetupError(raw, "Could not load schools.") };
  }
}

export async function createOrgAction(setupPassword: string, orgName: string) {
  try {
    const row = await studioCreateOrganization(setupPassword, orgName);
    return { ok: true as const, ...row };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Could not create the school.";
    return { ok: false as const, message: augmentStudioSetupError(raw, "Could not create the school.") };
  }
}

export async function addPersonAction(input: {
  setupPassword: string;
  organizationId: string;
  displayName: string;
  email: string;
  password: string;
  role: string;
}) {
  try {
    if (!isStudioPersonRole(input.role)) {
      return { ok: false as const, message: "Pick a valid role." };
    }
    const row = await studioAddPerson({
      setupPassword: input.setupPassword,
      organizationId: input.organizationId,
      displayName: input.displayName,
      email: input.email,
      password: input.password,
      role: input.role,
    });
    return { ok: true as const, ...row };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Could not add this person.";
    return { ok: false as const, message: augmentStudioSetupError(raw, "Could not add this person.") };
  }
}
