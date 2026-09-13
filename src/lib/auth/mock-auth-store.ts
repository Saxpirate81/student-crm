import type {
  MockAuthBundle,
  MockChild,
  MockOrganization,
  MockParent,
  MockParentInvite,
  MockPasswordResetToken,
  MockSessionChild,
  MockSessionParent,
  MockSessionProducer,
} from "@/lib/auth/types";
import {
  MOCK_DEMO_PASSWORD,
  MOCK_PRODUCER_EMAIL,
  MOCK_TESTER_EMAIL,
  MOCK_TESTER_PASSWORD,
} from "@/lib/auth/constants";
import {
  getSimpleMockTestInviteToken,
  getSimpleMockTestOrgName,
  isSimpleMockTestOrgEnabled,
  MOCK_DEV_TEST_ORG_ID,
} from "@/lib/config/mock-simple-test-org";
import type { StudentProfile } from "@/lib/domain/types";
import { appendMockStudent } from "@/lib/data/mockRepository";

const AUTH_KEY = "real-school-mock-auth-v1";
const RESET_TTL_MS = 1000 * 60 * 60 * 24;

function nowIso() {
  return new Date().toISOString();
}

function randomSegment() {
  return Math.random().toString(36).slice(2, 10);
}

function randomToken() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function emptyBundle(): MockAuthBundle {
  return {
    organizations: [],
    parents: [],
    children: [],
    resetTokens: [],
    parentInvites: [],
  };
}

export function loadAuthBundle(): MockAuthBundle {
  if (typeof window === "undefined") return emptyBundle();
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return emptyBundle();
    const parsed = JSON.parse(raw) as MockAuthBundle;
    return {
      organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
      parents: Array.isArray(parsed.parents) ? parsed.parents : [],
      children: Array.isArray(parsed.children) ? parsed.children : [],
      resetTokens: Array.isArray(parsed.resetTokens) ? parsed.resetTokens : [],
      parentInvites: Array.isArray(parsed.parentInvites) ? parsed.parentInvites : [],
    };
  } catch {
    return emptyBundle();
  }
}

function saveAuthBundle(bundle: MockAuthBundle) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(bundle));
}

/** Seeds one reusable org + invite for local testing (see `mock-simple-test-org` config). */
export function ensureSimpleTestOrgInBundle(): void {
  if (typeof window === "undefined" || !isSimpleMockTestOrgEnabled()) return;
  const name = getSimpleMockTestOrgName();
  const token = getSimpleMockTestInviteToken();
  const bundle = loadAuthBundle();
  let changed = false;
  const existingOrg = bundle.organizations.find((o) => o.id === MOCK_DEV_TEST_ORG_ID);
  if (!existingOrg) {
    bundle.organizations.push({
      id: MOCK_DEV_TEST_ORG_ID,
      name,
      createdAt: nowIso(),
    });
    changed = true;
  } else if (existingOrg.name !== name) {
    existingOrg.name = name;
    changed = true;
  }
  const hasInvite = bundle.parentInvites.some(
    (i) => i.token === token && !i.revokedAt && i.organizationId === MOCK_DEV_TEST_ORG_ID,
  );
  if (!hasInvite) {
    bundle.parentInvites.push({
      token,
      organizationId: MOCK_DEV_TEST_ORG_ID,
      createdByParentId: "__dev_seed__",
      createdAt: nowIso(),
      revokedAt: null,
    });
    changed = true;
  }
  if (changed) saveAuthBundle(bundle);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeScreenName(name: string) {
  return name.trim().toLowerCase();
}

function findParentByEmail(bundle: MockAuthBundle, email: string) {
  const key = normalizeEmail(email);
  return bundle.parents.find((p) => p.email === key);
}

function childScreenNameTaken(
  bundle: MockAuthBundle,
  organizationId: string,
  screenName: string,
  excludeChildId?: string,
) {
  const key = normalizeScreenName(screenName);
  return bundle.children.some(
    (c) =>
      c.organizationId === organizationId &&
      c.screenName === key &&
      (!excludeChildId || c.id !== excludeChildId),
  );
}

function buildStudentProfile(input: {
  studentCrmId: string;
  displayName: string;
  parentCrmId: string;
}): StudentProfile {
  return {
    crmId: input.studentCrmId,
    displayName: input.displayName,
    primaryInstructorId: "instr-morgan",
    parentCrmId: input.parentCrmId,
    enrolledPrograms: ["lessons"],
  };
}

export type SignUpParentInput = {
  /** Required only when using `NEXT_PUBLIC_MOCK_ORG_BOOTSTRAP_TOKEN` for the first org. */
  organizationName?: string;
  parentDisplayName: string;
  email: string;
  password: string;
};

export type InvitePreview = { mode: "bootstrap" } | { mode: "org"; organizationName: string };

/** Resolves an invite token for signup UI (bootstrap vs join existing org). */
export function previewParentInvite(token: string): InvitePreview | null {
  ensureSimpleTestOrgInBundle();
  const trimmed = token.trim();
  if (!trimmed) return null;
  const bundle = loadAuthBundle();
  const bootstrap = process.env.NEXT_PUBLIC_MOCK_ORG_BOOTSTRAP_TOKEN?.trim();
  if (bootstrap && trimmed === bootstrap) {
    if (bundle.organizations.length === 0) return { mode: "bootstrap" };
    return null;
  }
  const invite = bundle.parentInvites.find((i) => i.token === trimmed && !i.revokedAt);
  if (!invite) return null;
  const org = bundle.organizations.find((o) => o.id === invite.organizationId);
  if (!org) return null;
  return { mode: "org", organizationName: org.name };
}

export function createParentInviteForSession(
  session: MockSessionParent,
): { ok: true; token: string } | { ok: false; error: string } {
  const bundle = loadAuthBundle();
  const parent = bundle.parents.find((row) => row.id === session.parentId);
  if (!parent) return { ok: false, error: "Parent record missing." };
  const token = `inv_${randomSegment()}${randomSegment()}`;
  const invite: MockParentInvite = {
    token,
    organizationId: parent.organizationId,
    createdByParentId: parent.id,
    createdAt: nowIso(),
    revokedAt: null,
  };
  bundle.parentInvites.push(invite);
  saveAuthBundle(bundle);
  return { ok: true, token };
}

export type SignUpChildInput = {
  displayName: string;
  screenName: string;
  password: string;
};

export type SignUpChildSyncMeta = {
  mockChildId: string;
  displayName: string;
  screenName: string;
  studentCrmId: string;
};

export type SignUpResult =
  | {
      ok: true;
      session: MockSessionParent;
      organizationName: string;
      createdNewOrganization: boolean;
      child?: SignUpChildSyncMeta;
    }
  | { ok: false; error: string };

/**
 * Invite-only parent signup (mock). Use a parent-generated `invite` URL query, or
 * `NEXT_PUBLIC_MOCK_ORG_BOOTSTRAP_TOKEN` when there are zero organizations (first school).
 * Passwords are stored in plain text for local mock testing only.
 */
export function signUpParentWithInvite(
  inviteToken: string,
  input: SignUpParentInput,
  firstChild?: SignUpChildInput | null,
): SignUpResult {
  ensureSimpleTestOrgInBundle();
  const bundle = loadAuthBundle();
  const email = normalizeEmail(input.email);
  const trimmedInvite = inviteToken.trim();

  if (!trimmedInvite) {
    return {
      ok: false,
      error: "An invitation link is required. Ask your organization for an invite.",
    };
  }
  if (!email || !input.password) return { ok: false, error: "Email and password are required." };
  if (findParentByEmail(bundle, email)) {
    return { ok: false, error: "An account already exists for that email." };
  }
  if (!input.parentDisplayName.trim()) {
    return { ok: false, error: "Your display name is required." };
  }

  const bootstrap = process.env.NEXT_PUBLIC_MOCK_ORG_BOOTSTRAP_TOKEN?.trim();
  const bootstrapFirstOrg =
    Boolean(bootstrap) && trimmedInvite === bootstrap && bundle.organizations.length === 0;

  if (bootstrap && trimmedInvite === bootstrap && bundle.organizations.length > 0) {
    return {
      ok: false,
      error: "This first-time setup link is no longer valid. Use an invite from a parent at your school.",
    };
  }

  let organizationId: string;
  let orgToInsert: MockOrganization | null = null;

  if (bootstrapFirstOrg) {
    if (!input.organizationName?.trim()) {
      return { ok: false, error: "Organization name is required for the first account." };
    }
    orgToInsert = {
      id: `org_${randomSegment()}`,
      name: input.organizationName.trim(),
      createdAt: nowIso(),
    };
    organizationId = orgToInsert.id;
  } else {
    const invite = bundle.parentInvites.find((i) => i.token === trimmedInvite && !i.revokedAt);
    if (!invite) {
      return {
        ok: false,
        error: "Invalid or expired invitation. Ask your school to send a new signup link.",
      };
    }
    const org = bundle.organizations.find((o) => o.id === invite.organizationId);
    if (!org) {
      return { ok: false, error: "That organization no longer exists." };
    }
    organizationId = org.id;
  }

  if (firstChild?.screenName?.trim() && firstChild.displayName?.trim() && firstChild.password) {
    const sn = normalizeScreenName(firstChild.screenName);
    if (childScreenNameTaken(bundle, organizationId, sn)) {
      return { ok: false, error: "That screen name is already taken in this organization." };
    }
  }

  const parentCrmId = `parent-${randomSegment()}`;
  const parent: MockParent = {
    id: `par_${randomSegment()}`,
    organizationId,
    parentCrmId,
    email,
    password: input.password,
    displayName: input.parentDisplayName.trim(),
    createdAt: nowIso(),
  };

  if (orgToInsert) {
    bundle.organizations.push(orgToInsert);
  }
  bundle.parents.push(parent);

  let childSync: SignUpChildSyncMeta | undefined;
  if (firstChild?.screenName?.trim() && firstChild.displayName?.trim() && firstChild.password) {
    const sn = normalizeScreenName(firstChild.screenName);
    const studentCrmId = `crm-${randomSegment()}`;
    const child: MockChild = {
      id: `child_${randomSegment()}`,
      organizationId,
      parentId: parent.id,
      screenName: sn,
      studentCrmId,
      password: firstChild.password,
      createdAt: nowIso(),
    };
    bundle.children.push(child);
    appendMockStudent(
      buildStudentProfile({
        studentCrmId,
        displayName: firstChild.displayName.trim(),
        parentCrmId,
      }),
    );
    childSync = {
      mockChildId: child.id,
      displayName: firstChild.displayName.trim(),
      screenName: sn,
      studentCrmId,
    };
  }

  saveAuthBundle(bundle);

  const orgRow = bundle.organizations.find((o) => o.id === organizationId);
  const session: MockSessionParent = {
    kind: "parent",
    organizationId,
    parentId: parent.id,
    parentCrmId,
    email,
    displayName: parent.displayName,
  };
  return {
    ok: true,
    session,
    organizationName: orgRow?.name ?? "Organization",
    createdNewOrganization: Boolean(orgToInsert),
    child: childSync,
  };
}

export type AddChildResult =
  | { ok: true; child: MockChild }
  | { ok: false; error: string };

export function addChildForParent(
  parent: MockSessionParent,
  input: SignUpChildInput,
): AddChildResult {
  const bundle = loadAuthBundle();
  const p = bundle.parents.find((row) => row.id === parent.parentId);
  if (!p) return { ok: false, error: "Parent record missing." };
  if (!input.displayName.trim() || !input.screenName.trim() || !input.password) {
    return { ok: false, error: "Display name, screen name, and password are required." };
  }
  const sn = normalizeScreenName(input.screenName);
  if (childScreenNameTaken(bundle, p.organizationId, sn)) {
    return { ok: false, error: "That screen name is already taken in this organization." };
  }
  const studentCrmId = `crm-${randomSegment()}`;
  const child: MockChild = {
    id: `child_${randomSegment()}`,
    organizationId: p.organizationId,
    parentId: p.id,
    screenName: sn,
    studentCrmId,
    password: input.password,
    createdAt: nowIso(),
  };
  bundle.children.push(child);
  saveAuthBundle(bundle);
  appendMockStudent(
    buildStudentProfile({
      studentCrmId,
      displayName: input.displayName.trim(),
      parentCrmId: p.parentCrmId,
    }),
  );
  return { ok: true, child };
}

export function loginParent(email: string, password: string): MockSessionParent | null {
  const bundle = loadAuthBundle();
  const p = findParentByEmail(bundle, email);
  if (!p || p.password !== password) return null;
  return {
    kind: "parent",
    organizationId: p.organizationId,
    parentId: p.id,
    parentCrmId: p.parentCrmId,
    email: p.email,
    displayName: p.displayName,
  };
}

/** Mock producer (admin) — not stored in the household auth bundle. */
export function loginProducer(email: string, password: string): MockSessionProducer | null {
  const key = normalizeEmail(email);
  if (key === MOCK_TESTER_EMAIL && password === MOCK_TESTER_PASSWORD) {
    return {
      kind: "producer",
      email: MOCK_TESTER_EMAIL,
      displayName: "Cadenza Tester",
    };
  }
  if (key !== normalizeEmail(MOCK_PRODUCER_EMAIL)) return null;
  if (password !== MOCK_DEMO_PASSWORD) return null;
  return {
    kind: "producer",
    email: MOCK_PRODUCER_EMAIL,
    displayName: "Producer",
  };
}

export function loginChild(
  parentEmail: string,
  screenName: string,
  password: string,
): MockSessionChild | null {
  const bundle = loadAuthBundle();
  const p = findParentByEmail(bundle, parentEmail);
  if (!p) return null;
  const sn = normalizeScreenName(screenName);
  const child = bundle.children.find(
    (c) => c.parentId === p.id && c.screenName === sn && c.password === password,
  );
  if (!child) return null;
  return {
    kind: "child",
    organizationId: child.organizationId,
    parentId: child.parentId,
    childId: child.id,
    parentCrmId: p.parentCrmId,
    studentCrmId: child.studentCrmId,
    screenName: child.screenName,
  };
}

export type ResetRequestResult =
  | { ok: true; token: string; email: string }
  | { ok: false; silent: true };

/** Creates a reset token for the parent account email (mock: no real email sent). */
export function requestParentPasswordReset(email: string): ResetRequestResult {
  const bundle = loadAuthBundle();
  const p = findParentByEmail(bundle, email);
  if (!p) return { ok: false, silent: true };
  const token: MockPasswordResetToken = {
    token: randomToken(),
    email: p.email,
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    consumedAt: null,
  };
  bundle.resetTokens.push(token);
  saveAuthBundle(bundle);
  return { ok: true, token: token.token, email: p.email };
}

export type ResetCompleteResult = { ok: true } | { ok: false; error: string };

export function completeParentPasswordReset(token: string, newPassword: string): ResetCompleteResult {
  if (!newPassword.trim()) return { ok: false, error: "Choose a password." };
  const bundle = loadAuthBundle();
  const row = bundle.resetTokens.find((t) => t.token === token);
  if (!row || row.consumedAt) return { ok: false, error: "Invalid or expired reset link." };
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: "This reset link has expired." };
  }
  const parent = bundle.parents.find((p) => p.email === row.email);
  if (!parent) return { ok: false, error: "Account no longer exists." };
  parent.password = newPassword;
  row.consumedAt = nowIso();
  saveAuthBundle(bundle);
  return { ok: true };
}

export function listChildrenForParentSession(parent: MockSessionParent): MockChild[] {
  const bundle = loadAuthBundle();
  return bundle.children.filter((c) => c.parentId === parent.parentId);
}

export function getAccountDetailsForParent(parent: MockSessionParent) {
  const bundle = loadAuthBundle();
  const org = bundle.organizations.find((o) => o.id === parent.organizationId);
  const parentRow = bundle.parents.find((p) => p.id === parent.parentId);
  const children = bundle.children.filter((c) => c.parentId === parent.parentId);
  return { org, parentRow, children };
}

export type ChildPasswordResetResult = { ok: true } | { ok: false; error: string };

/** Mock “parent reset child password” (no email). */
export function resetChildPasswordByParent(
  parent: MockSessionParent,
  childId: string,
  newPassword: string,
): ChildPasswordResetResult {
  if (!newPassword.trim()) return { ok: false, error: "Password is required." };
  const bundle = loadAuthBundle();
  const child = bundle.children.find((c) => c.id === childId && c.parentId === parent.parentId);
  if (!child) return { ok: false, error: "Family member not found." };
  child.password = newPassword;
  saveAuthBundle(bundle);
  return { ok: true };
}
