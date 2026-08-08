import "server-only";
import { ImapFlow } from "imapflow";

export type ImapConfig = {
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
  tls?: {
    rejectUnauthorized?: boolean;
  };
  connectionTimeoutMs?: number;
  greetingTimeoutMs?: number;
  socketTimeoutMs?: number;
  operationTimeoutMs?: number;
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

    const hit = list.find(
      (mb: any) => Array.isArray(mb.specialUse) && mb.specialUse.includes(wanted)
    );
    if (hit?.path) return String(hit.path);

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
  const connectionTimeout = Math.max(
    5_000,
    Math.min(60_000, Number(cfg.connectionTimeoutMs || 15_000)),
  );
  const greetingTimeout = Math.max(
    5_000,
    Math.min(30_000, Number(cfg.greetingTimeoutMs || 10_000)),
  );
  const socketTimeout = Math.max(
    10_000,
    Math.min(120_000, Number(cfg.socketTimeoutMs || 45_000)),
  );
  const operationTimeout = Math.max(
    15_000,
    Math.min(180_000, Number(cfg.operationTimeoutMs || 90_000)),
  );
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    tls: cfg.tls,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    disableAutoIdle: true,
    maxLiteralSize: 32 * 1024 * 1024,
  });

  let rejectClientError: ((error: Error) => void) | null = null;
  const clientError = new Promise<never>((_resolve, reject) => {
    rejectClientError = reject;
  });
  const handleClientError = (rawError: unknown) => {
    const error = rawError instanceof Error
      ? rawError
      : new Error(String(rawError || "Erreur IMAP inconnue"));
    rejectClientError?.(error);
  };
  client.on("error", handleClientError);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const hardTimeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = Object.assign(
        new Error("Le serveur de messagerie n'a pas répondu dans le délai imparti."),
        { code: "IMAP_OPERATION_TIMEOUT" },
      );
      client.close();
      reject(error);
    }, operationTimeout);
  });

  try {
    await Promise.race([client.connect(), clientError, hardTimeout]);
    return await Promise.race([fn(client), clientError, hardTimeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    try {
      if (client.usable) {
        await Promise.race([
          client.logout(),
          new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
        ]);
      }
    } catch {
      // ignore
    } finally {
      client.close();
      client.removeListener("error", handleClientError);
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
