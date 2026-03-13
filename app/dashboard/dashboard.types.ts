export type ModuleStatus = "connected" | "available" | "coming";
export type Accent = "cyan" | "purple" | "pink" | "orange";
export type Ownership = "none" | "rented" | "sold";

export type GoogleProduct = "ga4" | "gsc";
export type GoogleSource = "site_inrcy" | "site_web";

export type ModuleAction = {
  key: string;
  label: string;
  variant: "view" | "connect" | "danger";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export type Module = {
  key: string;
  name: string;
  description: string;
  status: ModuleStatus;
  accent: Accent;
  actions: ModuleAction[];
};

export type NotificationItem = {
  id: string;
  category: "performance" | "action" | "information";
  categoryLabel: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  relativeDate: string;
  unread: boolean;
};

export type ActusLayout = "list" | "carousel";
export type ActusFont = "site" | "inter" | "poppins" | "montserrat" | "lora";
export type ActusTheme = "white" | "dark" | "gray" | "nature" | "sand";
