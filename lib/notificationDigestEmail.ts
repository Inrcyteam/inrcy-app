import 'server-only';

import type { NotificationCategory, NotificationRow } from '@/lib/notifications';
import { INRCY_EMAIL_LOGO_CID } from '@/lib/txEmailAssets';

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
    return { pillBg: '#e0f2fe', pillText: '#0284c7', border: '#bae6fd' };
  }
  if (category === 'action') {
    return { pillBg: '#fce7f3', pillText: '#db2777', border: '#fbcfe8' };
  }
  return { pillBg: '#ffedd5', pillText: '#ea580c', border: '#fed7aa' };
}

function greeting(firstName?: string | null, companyName?: string | null) {
  const name = (firstName || '').trim();
  if (name) return `Bonjour ${name},`;
  const company = (companyName || '').trim();
  if (company) return `Bonjour ${company},`;
  return 'Bonjour,';
}

function toAbsoluteUrl(url: string, baseUrl: string) {
  const value = (url || '').trim();
  const fallback = baseUrl || 'https://app.inrcy.com/dashboard';
  if (!value) return fallback;
  try {
    return new URL(value, fallback).toString();
  } catch {
    return fallback;
  }
}

function buildEmailButton(href: string, label: string) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;">
      <tr>
        <td bgcolor="#0f172a" style="border-radius:12px;background-color:#0f172a;">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 20px;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;">${label}</a>
        </td>
      </tr>
    </table>`;
}

function buildCard(item: NotificationDigestItem, dashboardUrl: string) {
  const colors = categoryColors(item.category);
  const title = escapeHtml(item.title);
  const body = escapeHtml(item.body);
  const ctaUrl = toAbsoluteUrl(item.cta_url || dashboardUrl, dashboardUrl);
  const ctaLabel = escapeHtml((item.cta_label || 'Ouvrir mon espace iNrCy').trim());

  return `
    <tr>
      <td style="padding:0 0 14px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;border-collapse:separate;border-spacing:0;background:#ffffff;background-color:#ffffff;border:1px solid ${colors.border};border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:18px 18px 16px 18px;">
              <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:${colors.pillBg};background-color:${colors.pillBg};color:${colors.pillText};font-size:12px;font-weight:700;font-family:Arial,Helvetica,sans-serif;letter-spacing:.02em;">${categoryLabel(item.category)}</div>
              <div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;color:#081226;font-weight:800;">${title}</div>
              <div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#475569;">${body}</div>
              <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
              ${buildEmailButton(ctaUrl, ctaLabel)}
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
  const cards = args.items.map((item) => buildCard(item, dashboardUrl)).join('');
  const count = args.items.length;
  const subtitle =
    count > 1
      ? `${count} signaux utiles viennent d'être détectés dans votre cockpit.`
      : `1 signal utile vient d'être détecté dans votre cockpit.`;

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f5f7fb;background-color:#f5f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f7fb" style="width:100%;background:#f5f7fb;background-color:#f5f7fb;">
      <tr>
        <td align="center" style="padding:28px 16px 40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="padding:0 0 16px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0b1734" style="width:100%;border-collapse:separate;border-spacing:0;border-radius:26px;overflow:hidden;background:#0b1734;background-color:#0b1734;box-shadow:0 28px 70px rgba(2,8,23,.18);">
                  <tr>
                    <td style="padding:28px 28px 30px 28px;">
                      <img src="cid:${escapeHtml(INRCY_EMAIL_LOGO_CID)}" alt="iNrCy" width="108" height="41" style="display:block;width:108px;max-width:100%;height:auto;border:0;outline:none;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.2;" />
                      <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#dbeafe;">${escapeHtml(greeting(args.firstName, args.companyName))}</div>
                      <div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:1.2;color:#ffffff;font-weight:900;max-width:520px;">Votre cloche iNrCy s’est réveillée.</div>
                      <div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#e2e8f0;max-width:560px;">${escapeHtml(subtitle)} Nous les regroupons dans un seul email tous les 2 jours pour garder votre outil vivant sans vous submerger.</div>
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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;border-collapse:separate;border-spacing:0;background:#ffffff;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:22px;overflow:hidden;">
                  <tr>
                    <td style="padding:22px 24px 24px 24px;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.35;color:#0f172a;font-weight:800;">Passez à l’action depuis votre cockpit</div>
                      <div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.75;color:#475569;">Retrouvez vos relances dans la cloche de l’application, ajustez vos préférences dans <b>Mon compte → Notifications</b> et activez le levier qui compte maintenant.</div>
                      <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
                      ${buildEmailButton(`${dashboardUrl}?panel=notifications`, 'Ouvrir mes notifications')}
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
      toAbsoluteUrl(item.cta_url || dashboardUrl, dashboardUrl),
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
