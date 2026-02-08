import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type ImapConfig = {
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
};

export type SmtpConfig = {
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  starttls: boolean;
};

export function mapFolderToImapMailbox(folder: string): string {
  const f = String(folder || "inbox").toLowerCase();
  if (f === "inbox" || f === "important") return "INBOX";
  // NOTE: names vary a lot between providers. We keep a sensible default,
  // but we also try to resolve the real mailbox via SPECIAL-USE flags (see resolveMailbox()).
  if (f === "sent") return "Sent";
  if (f === "drafts") return "Drafts";
  if (f === "spam") return "Junk";
  if (f === "trash") return "Trash";
  return "INBOX";
}

type SpecialUse = "\\Sent" | "\\Drafts" | "\\Junk" | "\\Trash";

async function resolveMailbox(client: ImapFlow, folder: string): Promise<string> {
  const f = String(folder || "inbox").toLowerCase();
  if (f === "inbox" || f === "important") return "INBOX";

  const wanted: SpecialUse | null =
    f === "sent" ? "\\Sent" :
    f === "drafts" ? "\\Drafts" :
    f === "spam" ? "\\Junk" :
    f === "trash" ? "\\Trash" :
    null;

  // Fast path: if not a special folder, use default mapping
  if (!wanted) return mapFolderToImapMailbox(folder);

  try {
    // Ask server for all mailboxes and pick the one that declares the SPECIAL-USE flag.
    const list = await client.list();
    const hit = list.find((mb: any) => Array.isArray(mb.specialUse) && mb.specialUse.includes(wanted));
    if (hit?.path) return String(hit.path);

    // Heuristics fallback (many hosts don't expose SPECIAL-USE flags)
    // Try to detect by common names (EN/FR) and by INBOX.* conventions.
    const paths = list
      .map((mb: any) => String(mb.path || ""))
      .filter(Boolean);

    if (wanted === "\\Sent") {
      const sentHit = paths.find((p) => /(^|\.|\/)sent($|\b)/i.test(p))
        || paths.find((p) => /envoy/i.test(p))
        || paths.find((p) => /messages.*envoy/i.test(p));
      if (sentHit) return String(sentHit);
    }

    if (wanted === "\\Trash") {
      const trashHit = paths.find((p) => /(^|\.|\/)trash($|\b)/i.test(p))
        || paths.find((p) => /corbeil/i.test(p))
        || paths.find((p) => /deleted/i.test(p));
      if (trashHit) return String(trashHit);
    }

    if (wanted === "\\Junk") {
      const junkHit = paths.find((p) => /junk|spam|indesirable|indésirable/i.test(p));
      if (junkHit) return String(junkHit);
    }

    if (wanted === "\\Drafts") {
      const draftsHit = paths.find((p) => /draft/i.test(p))
        || paths.find((p) => /brouillon/i.test(p));
      if (draftsHit) return String(draftsHit);
    }
  } catch {
    // ignore, fallback below
  }

  // Fallback: provider-specific names differ, so keep the generic mapping.
  return mapFolderToImapMailbox(folder);
}

export async function appendRawMessage(cfg: ImapConfig, folder: string, raw: Buffer) {
  return withImap(cfg, async (client) => {
    const mailbox = await resolveMailbox(client, folder);
    await client.mailboxOpen(mailbox);
    const lock = await client.getMailboxLock(mailbox);
    try {
      // Store message in selected mailbox. "Seen" is typical for sent items.
      await client.append(mailbox, raw, ["\\Seen"], new Date());
      return { ok: true, mailbox };
    } finally {
      lock.release();
    }
  });
}

export async function withImap<T>(cfg: ImapConfig, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
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

export async function listMessages(cfg: ImapConfig, folder: string, limit = 40) {
  return withImap(cfg, async (client) => {
    const mailbox = await resolveMailbox(client, folder);

    // Explicit open makes behavior far more reliable across providers
    await client.mailboxOpen(mailbox);

    const lock = await client.getMailboxLock(mailbox);
    try {
      const total =
        client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox.exists : 0;
      if (!total) return [];

      // Fetch last `limit` messages using sequence range
      const fromSeq = Math.max(1, total - limit + 1);
      const seqRange = `${fromSeq}:${total}`;

      const out: any[] = [];
      for await (const msg of client.fetch(seqRange, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
      })) {
        const from = msg.envelope?.from?.[0];
        const fromStr = from
          ? `${from.name ? from.name + " " : ""}<${from.address}>`
          : "";
        const subject = msg.envelope?.subject || "";
        const date = msg.internalDate ? new Date(msg.internalDate).toISOString() : null;
        const unread = !((msg.flags || new Set<string>()).has("\\Seen"));
        out.push({
          uid: msg.uid,
          from: fromStr,
          subject,
          preview: "",
          date,
          unread,
          folder: mailbox,
        });
      }

      // newest first
      out.sort((a, b) => (b.uid || 0) - (a.uid || 0));
      return out;
    } finally {
      lock.release();
    }
  });
}

export async function getMessageHtml(cfg: ImapConfig, folder: string, uid: number) {
  return withImap(cfg, async (client) => {
    const mailbox = await resolveMailbox(client, folder);
    await client.mailboxOpen(mailbox);
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(uid, { source: true, uid: true }, { uid: true });

if (!msg || typeof msg === "boolean") {
  return { html: null, text: null };
}

const source = (msg as any).source;
if (!source) return { html: null, text: null };

const parsed = await simpleParser(source);

      const html = parsed.html ? String(parsed.html) : null;
      const text = parsed.text ? String(parsed.text) : null;
      return { html, text };
    } finally {
      lock.release();
    }
  });
}