/** Shared mock password for demos; stored in plain text in local mock auth only. */
export const MOCK_DEMO_PASSWORD = "password";

/** Fixed mock producer account email (password: {@link MOCK_DEMO_PASSWORD}). */
export const MOCK_PRODUCER_EMAIL = "producer@realschool.mock";

/**
 * Temporary developer bypass so producer + staff UI work can proceed without sign-in.
 * Keep the allowed routes narrow and remove this flag when auth testing resumes.
 */
export const DEV_SKIP_LOGIN_FOR_STAFF_WORK = true;

/** Routes that stay reachable while {@link DEV_SKIP_LOGIN_FOR_STAFF_WORK} is enabled. */
export const DEV_SKIP_LOGIN_ALLOWED_PREFIXES = [
  "/producer",
  "/instructor",
  "/parent",
  "/student",
  "/admin",
] as const;
