export const DASHBOARD_CHANNEL_KEYS = [
  'site_inrcy',
  'site_web',
  'gmb',
  'facebook',
  'instagram',
  'linkedin',
] as const;

export type DashboardChannelKey = (typeof DASHBOARD_CHANNEL_KEYS)[number];

export const DASHBOARD_CHANNEL_LABELS: Record<DashboardChannelKey, string> = {
  site_inrcy: 'Site iNrCy',
  site_web: 'Site web',
  gmb: 'Google Business Profile',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

export function isDashboardChannelKey(value: unknown): value is DashboardChannelKey {
  return typeof value === 'string' && DASHBOARD_CHANNEL_KEYS.includes(value as DashboardChannelKey);
}
