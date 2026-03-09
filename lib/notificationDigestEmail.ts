import 'server-only';

import type { NotificationCategory, NotificationRow } from '@/lib/notifications';

export type NotificationDigestItem = Pick<NotificationRow, 'category' | 'title' | 'body' | 'cta_label' | 'cta_url' | 'created_at'>;

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function categoryLabel(category: NotificationCategory) {
  if (category === 'performance') return 'Performance';
  if (category === 'action') return 'Action';
  return 'Information';
}

function categoryColors(category: NotificationCategory) {
  if (category === 'performance') {
    return { pillBg: 'rgba(14,165,233,0.14)', pillText: '#0ea5e9', border: 'rgba(14,165,233,0.18)' };
  }
  if (category === 'action') {
    return { pillBg: 'rgba(244,114,182,0.14)', pillText: '#ec4899', border: 'rgba(244,114,182,0.18)' };
  }
  return { pillBg: 'rgba(249,115,22,0.14)', pillText: '#f97316', border: 'rgba(249,115,22,0.18)' };
}

function greeting(firstName?: string | null, companyName?: string | null) {
  const name = (firstName || '').trim();
  if (name) return `Bonjour ${name},`;
  const company = (companyName || '').trim();
  if (company) return `Bonjour ${company},`;
  return 'Bonjour,';
}

function buildCard(item: NotificationDigestItem) {
  const colors = categoryColors(item.category);
  const title = escapeHtml(item.title);
  const body = escapeHtml(item.body);
  const ctaUrl = (item.cta_url || 'https://app.inrcy.com/dashboard').trim();
  const ctaLabel = escapeHtml((item.cta_label || 'Ouvrir mon espace iNrCy').trim());

  return `
    <tr>
      <td style="padding:0 0 14px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;background:rgba(255,255,255,0.92);border:1px solid ${colors.border};border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:18px 18px 16px 18px;">
              <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:${colors.pillBg};color:${colors.pillText};font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;letter-spacing:.02em;">${categoryLabel(item.category)}</div>
              <div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:#081226;font-weight:800;">${title}</div>
              <div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#475569;">${body}</div>
              <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:linear-gradient(135deg,#0ea5e9,#8b5cf6 55%,#ec4899);color:#fff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;">${ctaLabel}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

export function buildNotificationDigestEmail(args: {
  firstName?: string | null;
  companyName?: string | null;
  items: NotificationDigestItem[];
  dashboardUrl?: string;
}) {
  const dashboardUrl = args.dashboardUrl || 'https://app.inrcy.com/dashboard';
  const cards = args.items.map(buildCard).join('');
  const count = args.items.length;
  const subtitle =
    count > 1
      ? `${count} signaux utiles viennent d'être détectés dans votre cockpit.`
      : `1 signal utile vient d'être détecté dans votre cockpit.`;

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:28px 16px 40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="padding:0 0 16px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;border-radius:26px;overflow:hidden;background:radial-gradient(circle at top left, rgba(14,165,233,.22), transparent 30%), radial-gradient(circle at top right, rgba(236,72,153,.18), transparent 28%), linear-gradient(135deg,#06122b 0%, #0a1c44 48%, #0d1240 100%);box-shadow:0 28px 70px rgba(2,8,23,.18);">
                  <tr>
                    <td style="padding:28px 28px 30px 28px;">
                      <img src="https://app.inrcy.com/logo-appli-inrcy.png" alt="iNrCy" width="118" style="display:block;width:118px;height:auto;border:0;outline:none;" />
                      <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:rgba(255,255,255,.78);">${escapeHtml(greeting(args.firstName, args.companyName))}</div>
                      <div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:1.2;color:#ffffff;font-weight:900;max-width:520px;">Votre cloche iNrCy s’est réveillée.</div>
                      <div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:rgba(255,255,255,.82);max-width:560px;">${escapeHtml(subtitle)} Nous les regroupons dans un seul email tous les 2 jours pour garder votre outil vivant sans vous submerger.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0;">
                ${cards}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0 0 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid rgba(15,23,42,.08);border-radius:22px;overflow:hidden;">
                  <tr>
                    <td style="padding:22px 24px 24px 24px;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.35;color:#0f172a;font-weight:800;">Passez à l’action depuis votre cockpit</div>
                      <div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.75;color:#475569;">Retrouvez vos relances dans la cloche de l’application, ajustez vos préférences dans <b>Mon compte → Notifications</b> et activez le levier qui compte maintenant.</div>
                      <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
                      <a href="${escapeHtml(dashboardUrl)}?panel=notifications" style="display:inline-block;padding:13px 20px;border-radius:12px;background:#0f172a;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;">Ouvrir mes notifications</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 0 0 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;line-height:1.7;">
                iNrCy — notifications Performance / Action / Information<br />
                Cet email a été généré automatiquement depuis votre générateur de business.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    greeting(args.firstName, args.companyName),
    '',
    'Votre cloche iNrCy s’est réveillée.',
    subtitle,
    '',
    ...args.items.flatMap((item) => [
      `[${categoryLabel(item.category)}] ${item.title}`,
      item.body,
      item.cta_url || dashboardUrl,
      '',
    ]),
    `Ouvrir mes notifications : ${dashboardUrl}?panel=notifications`,
  ];

  return {
    subject: count > 1 ? `iNrCy — ${count} actions à mener dans votre cockpit` : 'iNrCy — 1 nouvelle action à mener',
    html,
    text: textLines.join('\n'),
  };
}
