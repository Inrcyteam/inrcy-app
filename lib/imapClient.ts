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
  if (f === "sent") return "Sent";
  if (f === "drafts") return "Drafts";
  if (f === "spam") return "Junk";
  if (f === "trash") return "Trash";
  return "INBOX";
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
  const mailbox = mapFolderToImapMailbox(folder);

  return withImap(cfg, async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const total = client.mailbox && typeof client.mailbox !== "boolean"
  ? client.mailbox.exists
  : 0;
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
  const mailbox = mapFolderToImapMailbox(folder);
  return withImap(cfg, async (client) => {
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