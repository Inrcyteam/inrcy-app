import "server-only";
import { ImapFlow } from "imapflow";

export type ImapConfig = {
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
};

type SpecialUse = "\\Sent" | "\\Drafts" | "\\Junk" | "\\Trash";

export function mapFolderToImapMailbox(folder: string): string {
  const f = String(folder || "inbox").toLowerCase();
  if (f === "inbox" || f === "important") return "INBOX";
  if (f === "sent") return "Sent";
  if (f === "drafts") return "Drafts";
  if (f === "spam") return "Junk";
  if (f === "trash") return "Trash";
  return "INBOX";
}

async function resolveMailbox(client: ImapFlow, folder: string): Promise<string> {
  const f = String(folder || "inbox").toLowerCase();
  if (f === "inbox" || f === "important") return "INBOX";

  const wanted: SpecialUse | null =
    f === "sent"
      ? "\\Sent"
      : f === "drafts"
      ? "\\Drafts"
      : f === "spam"
      ? "\\Junk"
      : f === "trash"
      ? "\\Trash"
      : null;

  if (!wanted) return mapFolderToImapMailbox(folder);

  try {
    const list = await client.list();

    // SPECIAL-USE (quand dispo)
    const hit = list.find(
      (mb: any) => Array.isArray(mb.specialUse) && mb.specialUse.includes(wanted)
    );
    if (hit?.path) return String(hit.path);

    // Heuristiques (quand SPECIAL-USE n’est pas exposé)
    const paths = list
      .map((mb: any) => String(mb.path || ""))
      .filter(Boolean);

    if (wanted === "\\Sent") {
      return (
        paths.find((p) => /(^|\.|\/)sent($|\b)/i.test(p)) ||
        paths.find((p) => /envoy/i.test(p)) ||
        paths.find((p) => /messages.*envoy/i.test(p)) ||
        mapFolderToImapMailbox(folder)
      );
    }

    if (wanted === "\\Trash") {
      return (
        paths.find((p) => /(^|\.|\/)trash($|\b)/i.test(p)) ||
        paths.find((p) => /corbeil/i.test(p)) ||
        paths.find((p) => /deleted/i.test(p)) ||
        mapFolderToImapMailbox(folder)
      );
    }

    if (wanted === "\\Junk") {
      return paths.find((p) => /junk|spam|indesirable|indésirable/i.test(p)) || mapFolderToImapMailbox(folder);
    }

    if (wanted === "\\Drafts") {
      return paths.find((p) => /draft/i.test(p)) || paths.find((p) => /brouillon/i.test(p)) || mapFolderToImapMailbox(folder);
    }
  } catch {
    // ignore -> fallback
  }

  return mapFolderToImapMailbox(folder);
}

export async function withImap<T>(
  cfg: ImapConfig,
  fn: (_client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });

  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

export async function appendRawMessage(cfg: ImapConfig, folder: string, raw: Buffer) {
  return withImap(cfg, async (client) => {
    const mailbox = await resolveMailbox(client, folder);
    await client.mailboxOpen(mailbox);

    const lock = await client.getMailboxLock(mailbox);
    try {
      await client.append(mailbox, raw, ["\\Seen"], new Date());
      return { ok: true, mailbox };
    } finally {
      lock.release();
    }
  });
}
