export type InrcyAccountRole = "owner" | "admin" | "member";

export type InrcyAccountSummary = {
  id: string;
  displayName: string;
  role: InrcyAccountRole;
  isDefault: boolean;
};

export type InrcyMultiAccountConfig = {
  multiAccountEnabled: boolean;
  maxEstablishments: number;
};

export type InrcyAccountScope = {
  authUserId: string;
  activeUserId: string;
  activeAccount: InrcyAccountSummary;
  accounts: InrcyAccountSummary[];
  config: InrcyMultiAccountConfig;
};
