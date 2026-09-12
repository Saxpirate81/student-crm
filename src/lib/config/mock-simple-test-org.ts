/** Stable mock org id used when simple test-org mode is enabled. */
export const MOCK_DEV_TEST_ORG_ID = "__dev_test_org__";

/**
 * When `NEXT_PUBLIC_MOCK_USE_SIMPLE_TEST_ORG=1`, the app seeds one organization + one
 * reusable invite in localStorage so you can test signups without bootstrap tokens or
 * parent-generated links. Configure name/token via env (see login page copy).
 */
export function isSimpleMockTestOrgEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_USE_SIMPLE_TEST_ORG === "1";
}

export function getSimpleMockTestInviteToken(): string {
  return process.env.NEXT_PUBLIC_MOCK_TEST_INVITE_TOKEN?.trim() || "dev";
}

export function getSimpleMockTestOrgName(): string {
  return process.env.NEXT_PUBLIC_MOCK_TEST_ORG_NAME?.trim() || "Test organization";
}
