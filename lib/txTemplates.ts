import "server-only";

type TrialReminderInput = {
  endDateFr: string;
  ctaUrl: string;
  reminderDay: 20 | 24 | 27 | 30;
};

export function buildTrialReminderEmail(input: TrialReminderInput) {
  const { endDateFr, ctaUrl, reminderDay } = input;

  const title =
    reminderDay === 30 ? "Dernier jour d’essai" : "Ton essai se termine bientôt";

  const subtitle =
    "Continue sans interruption en activant ton abonnement (l’abonnement démarre à la fin de l’essai).";

  const body1 =
    reminderDay === 30
      ? `C’est le dernier jour de ton essai iNrCy (fin : <strong>${endDateFr}</strong>).`
      : `Ton essai iNrCy se termine le <strong>${endDateFr}</strong>.`;

  const body2 =
    reminderDay === 30
      ? "Pour continuer, connecte-toi et clique sur <strong>“S’abonner”</strong> avant ce soir."
      : "Pour continuer après l’essai, connecte-toi et clique sur <strong>“S’abonner”</strong>.";

  // Outlook-safe HTML (table layout, inline styles)
  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>iNrCy — ${title}</title>
  </head>

  <body style="margin:0;padding:0;background:#f4f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table
            role="presentation"
            width="100%"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="max-width:620px;background:#ffffff;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.08);overflow:hidden;"
          >
            <tr>
              <td style="padding:22px 24px 10px 24px;">
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#0f172a;line-height:1.25;">
                  iNrCy — ${title}
                </h1>
                <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;line-height:1.5;">
                  ${subtitle}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 0 24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
                <p style="margin:14px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">
                  Bonjour,
                </p>

                <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">
                  ${body1}
                </p>

                <p style="margin:12px 0 0 0;font-size:14px;line-height:1.65;color:#0f172a;">
                  ${body2}
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 18px 0;">
                  <tr>
                    <td align="center">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td
                            align="center"
                            bgcolor="#E879F9"
                            style="
                              border-radius:12px;
                              background-color:#E879F9;
                              background-image: linear-gradient(90deg,#F472B6 0%,#C084FC 45%,#60A5FA 100%);
                            "
                          >
                            <a
                              href="${ctaUrl}"
                              style="
                                display:inline-block;
                                padding:14px 26px;
                                border-radius:12px;
                                font-family:Arial,Helvetica,sans-serif;
                                font-size:15px;
                                font-weight:700;
                                color:#ffffff;
                                text-decoration:none;
                                line-height:1.2;
                              "
                            >
                              Ouvrir mon espace iNrCy
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
                  Si le bouton ne fonctionne pas, copiez/collez ce lien dans votre navigateur :
                  <br />
                  <a href="${ctaUrl}" style="color:#0ea5e9;text-decoration:underline;word-break:break-all;">
                    ${ctaUrl}
                  </a>
                </p>

                <p style="margin:12px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">
                  Si tu as déjà souscrit, tu peux ignorer cet email.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px 22px 24px;">
                <div style="border-top:1px solid #eef2f7;height:1px;line-height:1px;font-size:0;">&nbsp;</div>
                <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>

                <img
                  src="https://app.inrcy.com/signature-client.png"
                  alt="iNrCy — Service client"
                  width="512"
                  style="width:100%;max-width:512px;height:auto;display:block;border:0;outline:none;"
                />

                <p style="margin:10px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6;">
                  Besoin d’aide ? Répondez simplement à cet email ou contactez-nous via
                  <a href="https://inrcy.com" style="color:#0ea5e9;text-decoration:underline;">inrcy.com</a>.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:14px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;text-align:center;">
            © iNrCy — Cet email a été envoyé automatiquement.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text =
    reminderDay === 30
      ? `Bonjour,\n\nC’est le dernier jour de ton essai iNrCy (fin : ${endDateFr}).\n\nPour continuer, connecte-toi et clique sur “S’abonner” avant ce soir.\n\n${ctaUrl}\n\nÀ très vite !`
      : `Bonjour,\n\nTon essai iNrCy se termine le ${endDateFr}.\n\nPour continuer après l’essai, connecte-toi et clique sur “S’abonner”.\n\n${ctaUrl}\n\nÀ très vite !`;

  return { html, text };
}
