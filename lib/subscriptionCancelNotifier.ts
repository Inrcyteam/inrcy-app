import "server-only";

import { sendTxMail } from "@/lib/txMailer";

type CancellationNoticeInput = {
  userId: string;
  accountEmail: string | null;
  adminEmail: string | null;
  stripeSubscriptionId: string;
};

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendSubscriptionCancellationNotice(input: CancellationNoticeInput) {
  const accountEmail = input.accountEmail?.trim() || "Non renseigné";
  const adminEmail = input.adminEmail?.trim() || "Non renseigné";
  const subject = `Résiliation abonnement iNrCy — ${input.userId}`;

  const text = [
    "Une résiliation d'abonnement iNrCy vient d'être demandée.",
    "",
    `User_id : ${input.userId}`,
    `Email du compte : ${accountEmail}`,
    `Email admin : ${adminEmail}`,
    `Stripe subscription_id : ${input.stripeSubscriptionId}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111827">
      <h2 style="margin:0 0 16px">Résiliation d'abonnement demandée</h2>
      <p style="margin:0 0 12px">Une résiliation d'abonnement iNrCy vient d'être demandée.</p>
      <table style="border-collapse:collapse">
        <tr>
          <td style="padding:6px 12px 6px 0;font-weight:700">User_id</td>
          <td style="padding:6px 0">${esc(input.userId)}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;font-weight:700">Email du compte</td>
          <td style="padding:6px 0">${esc(accountEmail)}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;font-weight:700">Email admin</td>
          <td style="padding:6px 0">${esc(adminEmail)}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;font-weight:700">Stripe subscription_id</td>
          <td style="padding:6px 0">${esc(input.stripeSubscriptionId)}</td>
        </tr>
      </table>
    </div>
  `;

  await sendTxMail({
    to: "abonnement@inrcy.com",
    subject,
    text,
    html,
  });
}
