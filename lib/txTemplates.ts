import "server-only";

import { INRCY_EMAIL_LOGO_CID, INRCY_SIGNATURE_CID } from "@/lib/txEmailAssets";

type TrialReminderInput = {
  endDateFr: string;
  ctaUrl: string;
  daysBeforeEnd: number;
};

type TrialScheduledSubscriptionReminderInput = {
  endDateFr: string;
  ctaUrl: string;
  daysBeforeEnd: number;
};

type AnnualRenewalReminderInput = {
  renewalDateFr: string;
  ctaUrl: string;
  daysBeforeRenewal: number;
  amountLabel?: string;
};

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmailButton(href: string, label: string) {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 18px 0;border-collapse:separate;border-spacing:0;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;">
            <tr>
              <td align="center" bgcolor="#0f172a" style="border-radius:12px;background-color:#0f172a;">
                <a href="${safeHref}" style="display:inline-block;padding:14px 26px;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;line-height:1.2;">${safeLabel}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function buildSignatureBlock() {
  return `
    <tr>
      <td style="padding:18px 24px 22px 24px;">
        <div style="border-top:1px solid #eef2f7;height:1px;line-height:1px;font-size:0;">&nbsp;</div>
        <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
        <img src="cid:${escapeHtml(INRCY_SIGNATURE_CID)}" alt="iNrCy — Service client" width="512" style="width:100%;max-width:512px;height:auto;display:block;border:0;outline:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.2;color:#0f172a;" />
        <p style="margin:10px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6;">
          Besoin d’aide ? Répondez simplement à cet email ou contactez-nous via
          <a href="https://inrcy.com" style="color:#0ea5e9;text-decoration:underline;">inrcy.com</a>.
        </p>
      </td>
    </tr>`;
}

function buildShell(input: { title: string; subtitle: string; children: string }) {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>iNrCy — ${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;background-color:#f4f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f7fb" style="background:#f4f7fb;background-color:#f4f7fb;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:620px;background:#ffffff;background-color:#ffffff;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.08);overflow:hidden;">
            <tr>
              <td style="padding:22px 24px 10px 24px;">
                <img src="cid:${escapeHtml(INRCY_EMAIL_LOGO_CID)}" alt="iNrCy" width="108" height="41" style="display:block;width:108px;max-width:100%;height:auto;border:0;outline:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.2;color:#0f172a;" />
                <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#0f172a;line-height:1.25;">
                  iNrCy — ${escapeHtml(input.title)}
                </h1>
                <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;line-height:1.5;">
                  ${escapeHtml(input.subtitle)}
                </p>
              </td>
            </tr>
            ${input.children}
            ${buildSignatureBlock()}
          </table>
          <p style="margin:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;text-align:center;">
            © iNrCy — Cet email a été envoyé automatiquement.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildTrialReminderEmail(input: TrialReminderInput) {
  const { endDateFr, ctaUrl, daysBeforeEnd } = input;

  const safeEndDateFr = escapeHtml(endDateFr);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const title = daysBeforeEnd <= 1 ? "Votre essai se termine demain" : "Votre essai se termine bientôt";
  const subtitle = "Continuez sans interruption en activant votre abonnement. Le prélèvement ne commencera qu’à la fin de l’essai.";
  const body1 = daysBeforeEnd <= 1
    ? `Votre essai iNrCy se termine <strong>demain</strong> (${safeEndDateFr}).`
    : `Votre essai iNrCy se termine le <strong>${safeEndDateFr}</strong> (J-${daysBeforeEnd}).`;
  const body2 = daysBeforeEnd <= 1
    ? "Pour continuer sans coupure, connectez-vous et cliquez sur <strong>“S’abonner”</strong> aujourd’hui."
    : "Pour continuer après l’essai, connectez-vous et cliquez sur <strong>“S’abonner”</strong>.";

  const html = buildShell({
    title,
    subtitle,
    children: `
      <tr>
        <td style="padding:0 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <p style="margin:14px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">Bonjour,</p>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">${body1}</p>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">${body2}</p>
          ${buildEmailButton(ctaUrl, "Ouvrir mon espace iNrCy")}
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
            Si le bouton ne fonctionne pas, copiez/collez ce lien dans votre navigateur :
            <br />
            <a href="${safeCtaUrl}" style="color:#0ea5e9;text-decoration:underline;word-break:break-all;">${safeCtaUrl}</a>
          </p>
          <p style="margin:12px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
            Si vous avez déjà souscrit, vous pouvez ignorer cet email.
          </p>
        </td>
      </tr>`,
  });

  const text = daysBeforeEnd <= 1
    ? `Bonjour,\n\nVotre essai iNrCy se termine demain (${endDateFr}).\n\nPour continuer sans coupure, connectez-vous et cliquez sur “S’abonner” aujourd’hui.\n\n${ctaUrl}\n\nÀ très vite !`
    : `Bonjour,\n\nVotre essai iNrCy se termine le ${endDateFr} (J-${daysBeforeEnd}).\n\nPour continuer après l’essai, connectez-vous et cliquez sur “S’abonner”.\n\n${ctaUrl}\n\nÀ très vite !`;

  return { html, text };
}

export function buildTrialScheduledSubscriptionReminderEmail(input: TrialScheduledSubscriptionReminderInput) {
  const { endDateFr, ctaUrl, daysBeforeEnd } = input;

  const safeEndDateFr = escapeHtml(endDateFr);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const title = daysBeforeEnd <= 1 ? "Votre abonnement démarre demain" : "Votre abonnement démarre bientôt";
  const subtitle = "Votre abonnement iNrCy est déjà programmé : vous n’avez aucune action à faire.";
  const body1 = daysBeforeEnd <= 1
    ? `Votre essai iNrCy se termine <strong>demain</strong> (${safeEndDateFr}).`
    : `Votre essai iNrCy se termine le <strong>${safeEndDateFr}</strong> (J-${daysBeforeEnd}).`;
  const body2 = "Votre abonnement est déjà enregistré et démarrera automatiquement à la fin de l’essai.";
  const body3 = "Vous n’avez pas besoin de cliquer sur “S’abonner” : tout est déjà prêt pour continuer sans coupure.";

  const html = buildShell({
    title,
    subtitle,
    children: `
      <tr>
        <td style="padding:0 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <p style="margin:14px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">Bonjour,</p>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">${body1}</p>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">${body2}</p>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">${body3}</p>
          ${buildEmailButton(ctaUrl, "Voir mon abonnement")}
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
            Si le bouton ne fonctionne pas, copiez/collez ce lien dans votre navigateur :
            <br />
            <a href="${safeCtaUrl}" style="color:#0ea5e9;text-decoration:underline;word-break:break-all;">${safeCtaUrl}</a>
          </p>
        </td>
      </tr>`,
  });

  const text = daysBeforeEnd <= 1
    ? `Bonjour,\n\nVotre essai iNrCy se termine demain (${endDateFr}).\n\nVotre abonnement est déjà enregistré et démarrera automatiquement à la fin de l’essai.\n\nVous n’avez pas besoin de cliquer sur “S’abonner” : tout est déjà prêt pour continuer sans coupure.\n\n${ctaUrl}\n\nÀ très vite !`
    : `Bonjour,\n\nVotre essai iNrCy se termine le ${endDateFr} (J-${daysBeforeEnd}).\n\nVotre abonnement est déjà enregistré et démarrera automatiquement à la fin de l’essai.\n\nVous n’avez pas besoin de cliquer sur “S’abonner” : tout est déjà prêt pour continuer sans coupure.\n\n${ctaUrl}\n\nÀ très vite !`;

  return { html, text };
}

export function buildAnnualRenewalReminderEmail(input: AnnualRenewalReminderInput) {
  const { renewalDateFr, ctaUrl, daysBeforeRenewal, amountLabel = "690 € TTC" } = input;
  const safeRenewalDateFr = escapeHtml(renewalDateFr);
  const safeAmountLabel = escapeHtml(amountLabel);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const title = daysBeforeRenewal <= 1 ? "Votre abonnement annuel sera renouvelé demain" : "Votre abonnement annuel sera renouvelé bientôt";
  const body1 = daysBeforeRenewal <= 1
    ? `Votre abonnement annuel iNrCy sera renouvelé <strong>demain</strong> (${safeRenewalDateFr}).`
    : `Votre abonnement annuel iNrCy sera renouvelé le <strong>${safeRenewalDateFr}</strong> (J-${daysBeforeRenewal}).`;
  const body2 = `Le montant du renouvellement est de <strong>${safeAmountLabel}</strong>. Si vous souhaitez continuer, vous n’avez rien à faire.`;
  const body3 = "Si vous ne souhaitez pas renouveler votre abonnement annuel, vous pouvez le résilier avant l’échéance depuis votre espace iNrCy.";

  const html = buildShell({
    title,
    subtitle: "Rappel automatique avant reconduction annuelle.",
    children: `
      <tr>
        <td style="padding:0 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <p style="margin:14px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">Bonjour,</p>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">${body1}</p>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">${body2}</p>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">${body3}</p>
          ${buildEmailButton(ctaUrl, "Gérer mon abonnement")}
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
            Si le bouton ne fonctionne pas, copiez/collez ce lien dans votre navigateur :
            <br />
            <a href="${safeCtaUrl}" style="color:#0ea5e9;text-decoration:underline;word-break:break-all;">${safeCtaUrl}</a>
          </p>
        </td>
      </tr>`,
  });

  const text = daysBeforeRenewal <= 1
    ? `Bonjour,\n\nVotre abonnement annuel iNrCy sera renouvelé demain (${renewalDateFr}).\nMontant du renouvellement : ${amountLabel}.\n\nSi vous souhaitez continuer, vous n’avez rien à faire. Si vous ne souhaitez pas renouveler, vous pouvez résilier avant l’échéance depuis votre espace iNrCy.\n\n${ctaUrl}\n\nÀ très vite !`
    : `Bonjour,\n\nVotre abonnement annuel iNrCy sera renouvelé le ${renewalDateFr} (J-${daysBeforeRenewal}).\nMontant du renouvellement : ${amountLabel}.\n\nSi vous souhaitez continuer, vous n’avez rien à faire. Si vous ne souhaitez pas renouveler, vous pouvez résilier avant l’échéance depuis votre espace iNrCy.\n\n${ctaUrl}\n\nÀ très vite !`;

  return { html, text };
}
