export type MockOrganization = {
  id: string;
  name: string;
  createdAt: string;
};

/** Parent row: email is the account identifier; `parentCrmId` links CRM student rows. */
export type MockParent = {
  id: string;
  organizationId: string;
  /** Matches `StudentProfile.parentCrmId` for this household. */
  parentCrmId: string;
  email: string;
  /** Mock-only: stored in plain text for local testing. */
  password: string;
  displayName: string;
  createdAt: string;
};

/** Family member login: unique screen name per organization among siblings. */
export type MockChild = {
  id: string;
  organizationId: string;
  parentId: string;
  /** Lowercase trimmed; used for login lookup. */
  screenName: string;
  studentCrmId: string;
  password: string;
  createdAt: string;
};

export type MockPasswordResetToken = {
  token: string;
  email: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type MockAuthBundle = {
  organizations: MockOrganization[];
  parents: MockParent[];
  children: MockChild[];
  resetTokens: MockPasswordResetToken[];
};

export type MockSessionParent = {
  kind: "parent";
  organizationId: string;
  parentId: string;
  parentCrmId: string;
  email: string;
  displayName: string;
};

export type MockSessionChild = {
  kind: "child";
  organizationId: string;
  parentId: string;
  childId: string;
  parentCrmId: string;
  studentCrmId: string;
  screenName: string;
};

/** Mock studio / admin (producer) login — separate from household accounts. */
export type MockSessionProducer = {
  kind: "producer";
  email: string;
  displayName: string;
};

export type MockSession = MockSessionParent | MockSessionChild | MockSessionProducer;
