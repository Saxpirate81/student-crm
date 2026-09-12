export type MockSupabaseParentSignupPayload = {
  mockOrganizationId: string;
  organizationName: string;
  createdNewOrganization: boolean;
  parent: {
    mockParentId: string;
    email: string;
    password: string;
    displayName: string;
    parentCrmId: string;
  };
  child?: {
    mockChildId: string;
    displayName: string;
    screenName: string;
    studentCrmId: string;
  };
};
