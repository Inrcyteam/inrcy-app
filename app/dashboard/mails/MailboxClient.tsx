"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./mails.module.css";
import SettingsDrawer from "../SettingsDrawer";
import MailsSettingsContent from "../settings/_components/MailsSettingsContent";
import { createClient } from "@/lib/supabaseClient";

type Folder = "mails" | "newsletters" | "factures" | "devis" | "drafts" | "deleted";
type SendType = "mail" | "newsletter" | "facture" | "devis";
type Status = "draft" | "sent" | "deleted" | "error";

type MailAccount = {
  id: string;
  provider: "gmail" | "microsoft" | "imap";
  email_address: string;
  display_name: string | null;
  status: string;
};

type SendItem = {
  id: string;
  mail_account_id: string | null;
  type: SendType;
  status: Status;
  to_emails: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

function folderLabel(f: Folder) {
  switch (f) {
    case "mails":
      return "Mails";
    case "newsletters":
      return "Newsletters";
    case "factures":
      return "Factures";
    case "devis":
      return "Devis";
    case "drafts":
      return "Brouillons";
    case "deleted":
      return "Supprimés";
  }
}

function folderCountQuery(folder: Folder, item: SendItem) {
  // client-side count (we also fetch server-side counts but keep this as a fallback)
  if (folder === "drafts") return item.status === "draft";
  if (folder === "deleted") return item.status === "deleted";
  if (folder === "mails") return item.status === "sent" && item.type === "mail";
  if (folder === "newsletters") return item.status === "sent" && item.type === "newsletter";
  if (folder === "factures") return item.status === "sent" && item.type === "facture";
  if (folder === "devis") return item.status === "sent" && item.type === "devis";
  return false;
}

function pill(provider?: string | null) {
  const p = (provider || "").toLowerCase();
  if (p === "gmail") return { label: "Gmail", cls: styles.badgeGmail };
  if (p === "microsoft") return { label: "Microsoft", cls: styles.badgeMicrosoft };
  if (p === "imap") return { label: "IMAP", cls: styles.badgeImap };
  return { label: provider || "Mail", cls: styles.badgeDefault };
}

export default function MailboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [folder, setFolder] = useState<Folder>("mails");
  const [items, setItems] = useState<SendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [mailAccounts, setMailAccounts] = useState<MailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // Compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [composeType, setComposeType] = useState<SendType>("mail");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sendBusy, setSendBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // CRM selection (compose)
  type CrmContact = {
    id: string;
    full_name: string | null;
    email: string | null;
    category: "particulier" | "professionnel" | "collectivite_publique" | null;
    contact_type: "client" | "prospect" | "fournisseur" | "partenaire" | "autre" | null;
    important: boolean;
  };

  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmFilter, setCrmFilter] = useState("");
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmPickerOpen, setCrmPickerOpen] = useState(false);
  const [crmCategory, setCrmCategory] = useState<"all" | CrmContact["category"]>("all");
  const [crmContactType, setCrmContactType] = useState<"all" | CrmContact["contact_type"]>("all");
  const [crmImportantOnly, setCrmImportantOnly] = useState(false);

  // Used to trigger the hidden file input with a nice button
  const fileInputId = "inrsend-attachments";

  function normalizeEmails(v: string) {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function toggleEmailInTo(email: string) {
    const list = normalizeEmails(to);
    const lower = email.toLowerCase();
    const exists = list.some((x) => x.toLowerCase() === lower);
    const next = exists ? list.filter((x) => x.toLowerCase() !== lower) : [...list, email];
    setTo(next.join(", "));
  }

  // Recherche dans l'historique iNr'Send
  const [historyQuery, setHistoryQuery] = useState("");

  const filteredContacts = useMemo(() => {
    const q = crmFilter.trim().toLowerCase();
    return crmContacts.filter((c) => {
      if (crmImportantOnly && !c.important) return false;
      if (crmCategory !== "all" && c.category !== crmCategory) return false;
      if (crmContactType !== "all" && c.contact_type !== crmContactType) return false;
      if (!q) return true;
      const hay = `${c.full_name || ""} ${c.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [crmContacts, crmFilter, crmImportantOnly, crmCategory, crmContactType]);

  const selectedToSet = useMemo(() => {
    return new Set(normalizeEmails(to).map((e) => e.toLowerCase()));
  }, [to]);

  const selectedCrmCount = useMemo(() => {
    let n = 0;
    for (const c of crmContacts) {
      if (c.email && selectedToSet.has(String(c.email).toLowerCase())) n += 1;
    }
    return n;
  }, [crmContacts, selectedToSet]);

  const counts = useMemo(() => {
    const c: Record<Folder, number> = { mails: 0, newsletters: 0, factures: 0, devis: 0, drafts: 0, deleted: 0 };
    for (const it of items) {
      (Object.keys(c) as Folder[]).forEach((f) => {
        if (folderCountQuery(f, it)) c[f] += 1;
      });
    }
    return c;
  }, [items]);

  function resetCompose() {
    setDraftId(null);
    setComposeType("mail");
    setTo("");
    setSubject("");
    setText("");
    setFiles([]);
    setCrmPickerOpen(false);
  }

  async function loadAccounts() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;

    const { data, error } = await supabase
      .from("mail_accounts")
      .select("id, provider, email_address, display_name, status")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMailAccounts(data as any);
      // Default selection
      const connected = (data as any[]).filter((a) => a.status === "connected");
      const defaultId = connected[0]?.id || (data as any[])[0]?.id || "";
      setSelectedAccountId((prev) => prev || defaultId);
    }
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      // We fetch a "reasonable" amount for MVP; can be paginated later.
      const { data, error } = await supabase
        .from("send_items")
        .select(
          "id, mail_account_id, type, status, to_emails, subject, body_text, body_html, provider, provider_message_id, error, sent_at, created_at, updated_at"
        )
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        console.error(error);
        return;
      }
      const list = (data || []) as SendItem[];
      setItems(list);

      // Keep selection stable
      if (list.length > 0) {
        setSelectedId((prev) => prev || list[0].id);
      } else {
        setSelectedId(null);
      }
    } finally {
      setLoading(false);
    }
  }

  const visibleItems = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (!folderCountQuery(folder, it)) return false;
      if (!q) return true;
      const hay = `${it.subject || ""} ${it.to_emails || ""} ${it.provider || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, folder, historyQuery]);

  const selected = useMemo(() => {
    return visibleItems.find((x) => x.id === selectedId) || null;
  }, [visibleItems, selectedId]);

  const selectedAccount = useMemo(() => {
    return mailAccounts.find((a) => a.id === selectedAccountId) || null;
  }, [mailAccounts, selectedAccountId]);

  // initial
  useEffect(() => {
    (async () => {
      await loadAccounts();
      await loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // open folder from URL
  useEffect(() => {
    const q = (searchParams?.get("folder") || "").toLowerCase();
    const allowed: Record<string, Folder> = {
      mails: "mails",
      newsletters: "newsletters",
      factures: "factures",
      devis: "devis",
      brouillons: "drafts",
      drafts: "drafts",
      supprimes: "deleted",
      deleted: "deleted",
    };
    if (q && allowed[q]) setFolder(allowed[q]);
  }, [searchParams]);

  async function loadCrmContacts() {
    if (crmLoading) return;
    setCrmError(null);
    setCrmLoading(true);

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 12000);
    try {
      // We go through the API route so the same auth method is used as the CRM screens.
      const res = await fetch("/api/crm/contacts", {
        method: "GET",
        credentials: "include",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const json = (await res.json().catch(() => ({}))) as any;
      const rows = Array.isArray(json?.contacts) ? json.contacts : [];
      const mapped = rows.map((c: any) => {
        const left = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
        const company = (c.company_name || "").trim();
        const full = company && left ? `${company} — ${left}` : company || left || null;
        return {
          id: String(c.id),
          full_name: full,
          email: c.email || null,
          category: (c.category as any) ?? null,
          contact_type: (c.contact_type as any) ?? null,
          important: Boolean(c.important),
        };
      });
      setCrmContacts(mapped);
    } catch (e: any) {
      console.error("CRM load error", e);
      const msg = e?.name === "AbortError" ? "Le chargement a expiré. Clique sur “Réessayer”." : "Impossible de charger les contacts.";
      setCrmError(msg);
    } finally {
      clearTimeout(timeout);
      setCrmLoading(false);
    }
  }

  // load CRM when compose opens (lazy)
  useEffect(() => {
    if (!composeOpen) return;
    if (crmContacts.length > 0) return;
    void loadCrmContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeOpen]);

  function updateFolder(next: Folder) {
    setFolder(next);
    router.replace(`/dashboard/mails?folder=${encodeURIComponent(next)}`);
    // reset selection to first item in that folder
    setSelectedId(null);
  }

  async function saveDraft() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;

    const payload = {
      user_id: auth.user.id,
      mail_account_id: selectedAccountId || null,
      type: composeType,
      status: "draft" as const,
      to_emails: to.trim(),
      subject: subject.trim() || null,
      body_text: text || null,
      body_html: null,
      provider: selectedAccount?.provider || null,
    };

    if (draftId) {
      const { error } = await supabase.from("send_items").update(payload).eq("id", draftId);
      if (!error) {
        setToast("Brouillon sauvegardé");
        await loadHistory();
      }
      return;
    }

    const { data, error } = await supabase.from("send_items").insert(payload).select("id").single();
    if (!error && data?.id) {
      setDraftId(data.id);
      setToast("Brouillon sauvegardé");
      await loadHistory();
    }
  }

  function providerSendEndpoint(provider: string) {
    if (provider === "gmail") return "/api/inbox/gmail/send";
    if (provider === "microsoft") return "/api/inbox/microsoft/send";
    return "/api/inbox/imap/send";
  }

  async function doSend() {
    if (!selectedAccount) {
      setToast("Connecte une boîte d’envoi dans Réglages.");
      return;
    }
    const recipients = to.trim();
    if (!recipients) {
      setToast("Ajoute au moins un destinataire.");
      return;
    }
    setSendBusy(true);
    try {
      const fd = new FormData();
      fd.set("accountId", selectedAccount.id);
      fd.set("to", recipients);
      fd.set("subject", subject.trim() || "(sans objet)");
      fd.set("text", text || "");
      // iNr'Send = envoi simple (texte). On garde le champ côté API pour compatibilité,
      // mais on n'expose pas d'éditeur HTML dans l'UI.
      fd.set("html", "");
      fd.set("type", composeType);
      if (draftId) fd.set("sendItemId", draftId);

      for (const f of files) fd.append("files", f);

      const res = await fetch(providerSendEndpoint(selectedAccount.provider), { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(data?.error || "Erreur d’envoi");
        return;
      }

      setToast("Envoyé ✅");
      setComposeOpen(false);
      resetCompose();
      await loadHistory();
      updateFolder(composeType === "newsletter" ? "newsletters" : composeType === "facture" ? "factures" : composeType === "devis" ? "devis" : "mails");
    } finally {
      setSendBusy(false);
    }
  }

  async function moveToDeleted(id: string) {
    const { error } = await supabase.from("send_items").update({ status: "deleted" }).eq("id", id);
    if (!error) await loadHistory();
  }

  async function restoreFromDeleted(id: string) {
    // Restore as sent by default (keeps type)
    const { data, error } = await supabase.from("send_items").select("status, type").eq("id", id).single();
    if (error) return;
    const nextStatus: Status = data.status === "deleted" ? "sent" : data.status;
    const { error: e2 } = await supabase.from("send_items").update({ status: nextStatus }).eq("id", id);
    if (!e2) await loadHistory();
  }

  async function openItem(it: SendItem) {
    setSelectedId(it.id);
    if (it.status === "draft") {
      setComposeOpen(true);
      setDraftId(it.id);
      setComposeType(it.type);
      setTo(it.to_emails || "");
      setSubject(it.subject || "");
      setText(it.body_text || "");
      setFiles([]);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        {/* Header (on garde le layout iNr'Box) */}
        <div className={styles.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="/inrsend-logo.png"
              alt="iNr’Send"
              style={{ width: 154, height: 64, display: "block" }}
            />
            <div className={styles.titleRow}>
              <div className={styles.sub}>Toutes vos communications, depuis une seule et même machine.</div>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={`${styles.btnGhost} ${styles.hamburgerBtn}`}
              onClick={() => setMobileFoldersOpen(true)}
              type="button"
              aria-label="Ouvrir les dossiers"
              title="Dossiers"
            >
              ☰ Dossiers
            </button>

            <button
              className={styles.btnGhost}
              onClick={() => setSettingsOpen(true)}
              type="button"
              title="Réglages"
            >
              ⚙️ Réglages
            </button>

            <SettingsDrawer
              title="Réglages iNr’Send"
              isOpen={settingsOpen}
              onClose={() => setSettingsOpen(false)}
            >
              <MailsSettingsContent />
            </SettingsDrawer>

            <button
              className={styles.btnPrimary}
              onClick={() => {
                resetCompose();
                setComposeOpen(true);
              }}
              type="button"
            >
              ✍️ Écrire
            </button>

            <Link className={styles.btnGhost} href="/dashboard" title="Fermer iNr’Send">
              Fermer
            </Link>
          </div>
        </div>

        {/* Mobile: menu dossiers (hamburger) */}
        {mobileFoldersOpen ? (
          <div className={styles.mobileMenuOverlay} onClick={() => setMobileFoldersOpen(false)}>
            <div className={styles.mobileMenu} onClick={(e) => e.stopPropagation()}>
              <div className={styles.mobileMenuHeader}>
                <div className={styles.mobileMenuTitle}>Dossiers</div>
                <button className={styles.btnGhost} onClick={() => setMobileFoldersOpen(false)} type="button">
                  ✕
                </button>
              </div>
              <div className={styles.mobileMenuBody}>
                {(["mails", "newsletters", "factures", "devis", "drafts", "deleted"] as Folder[]).map((f) => {
                  const active = f === folder;
                  return (
                    <button
                      key={f}
                      className={`${styles.mobileFolderBtn} ${active ? styles.mobileFolderBtnActive : ""}`}
                      onClick={() => {
                        updateFolder(f);
                        setMobileFoldersOpen(false);
                      }}
                      type="button"
                    >
                      <span>{folderLabel(f)}</span>
                      <span className={styles.badgeCount}>{counts[f] || 0}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.grid}>
          {/* List */}
          <div className={styles.card}>
            {/* Tabs (en haut comme iNr'Box) */}
            <div className={styles.folderTabs}>
              {(["mails", "newsletters", "factures", "devis", "drafts", "deleted"] as Folder[]).map((f) => {
                const active = f === folder;
                return (
                  <button
                    key={f}
                    className={`${styles.folderTabBtn} ${active ? styles.folderTabBtnActive : ""}`}
                    onClick={() => updateFolder(f)}
                    type="button"
                    title={folderLabel(f)}
                  >
                    <span className={styles.folderTabLabel}>{folderLabel(f)}</span>
                    <span className={styles.badgeCount}>{counts[f] || 0}</span>
                  </button>
                );
              })}
            </div>

            {/* Toolbar (recherche + sélection boîte + refresh) */}
            <div className={styles.toolbarRow}>
              <div className={styles.searchRow}>
                <input
                  className={styles.searchInput}
                  placeholder="Rechercher un envoi…"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                />
                <div className={styles.searchIconRight}>⌕</div>
              </div>

              <div className={styles.toolbarActions}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.78)" }}>Boîte d’envoi :</div>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    style={{
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(255,255,255,0.18)",
                      color: "rgba(255,255,255,0.9)",
                      borderRadius: 12,
                      padding: "8px 10px",
                      minWidth: 260,
                    }}
                  >
                    {mailAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.display_name ? `${a.display_name} — ` : "") + a.email_address + ` (${a.provider})`}
                      </option>
                    ))}
                  </select>

                  {selectedAccount ? (
                    <span className={`${styles.badge} ${pill(selectedAccount.provider).cls}`}>{pill(selectedAccount.provider).label}</span>
                  ) : (
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Aucune boîte connectée</span>
                  )}
                </div>

                <button className={styles.toolbarBtn} onClick={loadHistory} type="button">
                  ↻ Actualiser
                </button>
              </div>
            </div>

            <div className={styles.scrollArea}>
              {loading ? (
                <div style={{ padding: 14, color: "rgba(255,255,255,0.75)" }}>Chargement…</div>
              ) : visibleItems.length === 0 ? (
                <div style={{ padding: 14, color: "rgba(255,255,255,0.65)" }}>Aucun élément.</div>
              ) : (
                <div className={styles.list}>
                  {visibleItems.map((it) => {
                    const active = it.id === selectedId;
                    const p = pill(it.provider);
                    return (
                      <button
                        key={it.id}
                        className={active ? styles.itemActive : styles.item}
                        onClick={() => openItem(it)}
                        type="button"
                      >
                        <div className={styles.itemTop}>
                          <div className={styles.fromRow}>
                            <div className={styles.from}>{(it.subject || "(sans objet)").slice(0, 70)}</div>
                            <span className={`${styles.badge} ${p.cls}`}>{p.label}</span>
                          </div>
                          <div className={styles.date}>{new Date(it.created_at).toLocaleString()}</div>
                        </div>
                        <div className={styles.subject}>{it.to_emails}</div>
                        <div className={styles.preview}>{(it.body_text || it.body_html || "").toString().replace(/<[^>]+>/g, "").slice(0, 110)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>Détails</div>
              {selected ? rememberActions(selected, folder, moveToDeleted, restoreFromDeleted) : null}
            </div>

            <div className={styles.scrollArea} style={{ padding: 14 }}>
              {!selected ? (
                <div style={{ color: "rgba(255,255,255,0.65)" }}>Sélectionne un élément.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>{selected.subject || "(sans objet)"}</div>
                    <span className={`${styles.badge} ${pill(selected.provider).cls}`}>{pill(selected.provider).label}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                      {selected.status === "draft" ? "Brouillon" : selected.sent_at ? `Envoyé • ${new Date(selected.sent_at).toLocaleString()}` : "Créé"}
                    </span>
                  </div>

                  <div style={{ marginTop: 10, color: "rgba(255,255,255,0.75)", fontSize: 13 }}>
                    <b>À :</b> {selected.to_emails}
                  </div>

                  {selected.error ? (
                    <div style={{ marginTop: 10, color: "rgba(255,80,80,0.9)", fontSize: 13 }}>
                      <b>Erreur :</b> {selected.error}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 14 }}>
                    {selected.body_html ? (
                      <div
                        style={{ color: "rgba(255,255,255,0.86)", fontSize: 14, lineHeight: 1.55 }}
                        dangerouslySetInnerHTML={{ __html: selected.body_html }}
                      />
                    ) : (
                      <pre style={{ whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.86)", fontSize: 14, lineHeight: 1.55 }}>
                        {selected.body_text || ""}
                      </pre>
                    )}
                  </div>

                  {selected.status === "draft" ? (
                    <div style={{ marginTop: 14, color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
                      Astuce : clique sur ce brouillon dans la liste pour l’ouvrir en édition.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Compose modal */}
        {composeOpen ? (
          <div className={styles.modalOverlay} onClick={() => setComposeOpen(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "rgba(255,255,255,0.95)" }}>
                    {draftId ? "Éditer le brouillon" : "Nouveau message"}
                  </div>
                  <select
                    value={composeType}
                    onChange={(e) => setComposeType(e.target.value as SendType)}
                    style={{
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(255,255,255,0.18)",
                      color: "rgba(255,255,255,0.9)",
                      borderRadius: 12,
                      padding: "6px 8px",
                    }}
                  >
                    <option value="mail">Mail</option>
                    <option value="newsletter">Newsletter</option>
                    <option value="facture">Facture</option>
                    <option value="devis">Devis</option>
                  </select>
                </div>

                <button className={styles.btnGhost} onClick={() => setComposeOpen(false)} type="button">
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>Boîte d’envoi :</div>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      style={{
                        background: "rgba(0,0,0,0.22)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        color: "rgba(255,255,255,0.9)",
                        borderRadius: 12,
                        padding: "8px 10px",
                        minWidth: 280,
                      }}
                    >
                      {mailAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {(a.display_name ? `${a.display_name} — ` : "") + a.email_address + ` (${a.provider})`}
                        </option>
                      ))}
                    </select>
                    {selectedAccount ? (
                      <span className={`${styles.badge} ${pill(selectedAccount.provider).cls}`}>{pill(selectedAccount.provider).label}</span>
                    ) : null}
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>À</span>
                    <input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="email@exemple.com, autre@exemple.com"
                      style={inputStyle}
                    />
                  </label>

                  {/* CRM picker (dropdown + checkboxes) */}
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => setCrmPickerOpen((v) => !v)}
                      style={{
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 14,
                        borderColor: "rgba(255,255,255,0.14)",
                        background: "rgba(0,0,0,0.18)",
                      }}
                    >
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>Contacts CRM</span>
                        <span className={styles.badge} style={{ opacity: 0.9 }}>
                          {selectedCrmCount} sélectionné{selectedCrmCount > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span style={{ opacity: 0.85 }}>{crmPickerOpen ? "▴" : "▾"}</span>
                    </button>

                    {crmPickerOpen ? (
                      <div
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 14,
                          padding: 10,
                          background: "rgba(0,0,0,0.16)",
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            <input
                              value={crmFilter}
                              onChange={(e) => setCrmFilter(e.target.value)}
                              placeholder="Rechercher…"
                              style={{ ...inputStyle, padding: "8px 10px", maxWidth: 240 }}
                            />
                            <select
                              value={crmCategory ?? "all"}
                              onChange={(e) => setCrmCategory(e.target.value as any)}
                              style={{
                                background: "rgba(0,0,0,0.22)",
                                border: "1px solid rgba(255,255,255,0.18)",
                                color: "rgba(255,255,255,0.9)",
                                borderRadius: 12,
                                padding: "8px 10px",
                              }}
                              title="Filtrer par catégorie"
                            >
                              <option value="all">Toutes catégories</option>
                              <option value="particulier">Particuliers</option>
                              <option value="professionnel">Professionnels</option>
                              <option value="collectivite_publique">Collectivités</option>
                            </select>
                            <select
                              value={crmContactType ?? "all"}
                              onChange={(e) => setCrmContactType(e.target.value as any)}
                              style={{
                                background: "rgba(0,0,0,0.22)",
                                border: "1px solid rgba(255,255,255,0.18)",
                                color: "rgba(255,255,255,0.9)",
                                borderRadius: 12,
                                padding: "8px 10px",
                              }}
                              title="Filtrer par type"
                            >
                              <option value="all">Tous types</option>
                              <option value="client">Clients</option>
                              <option value="prospect">Prospects</option>
                              <option value="fournisseur">Fournisseurs</option>
                              <option value="partenaire">Partenaires</option>
                              <option value="autre">Autres</option>
                            </select>
                            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
                              <input type="checkbox" checked={crmImportantOnly} onChange={(e) => setCrmImportantOnly(e.target.checked)} />
                              Important
                            </label>
                          </div>

                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => void loadCrmContacts()}
                            disabled={crmLoading}
                            title="Recharger les contacts"
                            style={{ padding: "8px 10px" }}
                          >
                            ↻
                          </button>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              const current = normalizeEmails(to);
                              const setLower = new Set(current.map((e) => e.toLowerCase()));
                              const add = filteredContacts
                                .map((c) => c.email)
                                .filter(Boolean)
                                .map((e) => String(e));
                              const next = [...current];
                              for (const e of add) {
                                if (!setLower.has(e.toLowerCase())) {
                                  next.push(e);
                                  setLower.add(e.toLowerCase());
                                }
                              }
                              setTo(next.join(", "));
                            }}
                            disabled={crmLoading || filteredContacts.length === 0}
                          >
                            Tout sélectionner
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              const removeSet = new Set(
                                filteredContacts
                                  .map((c) => c.email)
                                  .filter(Boolean)
                                  .map((e) => String(e).toLowerCase())
                              );
                              const current = normalizeEmails(to);
                              const next = current.filter((e) => !removeSet.has(e.toLowerCase()));
                              setTo(next.join(", "));
                            }}
                            disabled={crmLoading || filteredContacts.length === 0}
                          >
                            Tout désélectionner
                          </button>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                            {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""} (filtrés)
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            border: "1px solid rgba(255,255,255,0.10)",
                            borderRadius: 12,
                            padding: 8,
                            maxHeight: 190,
                            overflow: "auto",
                          }}
                        >
                          {crmLoading ? (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Chargement des contacts…</div>
                          ) : crmError ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>{crmError}</div>
                              <button
                                className={styles.btnPrimary}
                                type="button"
                                onClick={() => void loadCrmContacts()}
                                style={{ width: "fit-content" }}
                              >
                                Réessayer
                              </button>
                            </div>
                          ) : filteredContacts.length === 0 ? (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Aucun contact.</div>
                          ) : (
                            <div style={{ display: "grid", gap: 6 }}>
                              {filteredContacts.slice(0, 200).map((c) => {
                                const email = c.email ? String(c.email) : "";
                                const checked = email ? selectedToSet.has(email.toLowerCase()) : false;
                                return (
                                  <label
                                    key={c.id}
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      alignItems: "center",
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      background: checked ? "rgba(56,189,248,0.10)" : "rgba(0,0,0,0.10)",
                                      cursor: email ? "pointer" : "not-allowed",
                                      opacity: email ? 1 : 0.6,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!email}
                                      checked={checked}
                                      onChange={() => {
                                        if (!email) return;
                                        toggleEmailInTo(email);
                                      }}
                                    />
                                    <div style={{ display: "grid", lineHeight: 1.15 }}>
                                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", fontWeight: 700 }}>
                                        {c.full_name || "(Sans nom)"}
                                        {c.important ? <span style={{ marginLeft: 8, opacity: 0.75 }}>★</span> : null}
                                      </div>
                                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>{email}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Objet</span>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet" style={inputStyle} />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Message (texte)</span>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={textareaStyle} />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Pièces jointes</span>
                    <input
                      id={fileInputId}
                      type="file"
                      multiple
                      onChange={(e) => {
                        const next = Array.from(e.target.files || []);
                        setFiles(next);
                      }}
                      className={styles.hiddenFileInput}
                    />

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <label htmlFor={fileInputId} className={styles.btnAttach}>
                        📎 Joindre
                      </label>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                        {files.length > 0 ? `${files.length} fichier(s)` : "Aucun fichier"}
                      </span>
                    </div>

                    {files.length > 0 ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {files.map((f, idx) => (
                          <span key={idx} className={styles.fileChip} title={f.name}>
                            {f.name}
                            <button
                              type="button"
                              className={styles.fileChipRemove}
                              onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                              aria-label={`Retirer ${f.name}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </label>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button className={styles.btnGhost} onClick={saveDraft} type="button" disabled={sendBusy}>
                  💾 Sauvegarder brouillon
                </button>
                <button className={styles.btnPrimary} onClick={doSend} type="button" disabled={sendBusy}>
                  {sendBusy ? "Envoi…" : "Envoyer"}
                </button>
              </div>

              {toast ? (
                <div style={{ padding: "10px 14px", color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                  {toast}{" "}
                  <button className={styles.btnGhost} onClick={() => setToast(null)} type="button">
                    OK
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function rememberActions(
  selected: SendItem,
  folder: Folder,
  moveToDeleted: (id: string) => Promise<void>,
  restoreFromDeleted: (id: string) => Promise<void>
) {
  if (!selected) return null;
  if (folder === "deleted") {
    return (
      <button className={styles.btnPrimary} onClick={() => restoreFromDeleted(selected.id)} type="button">
        Restaurer
      </button>
    );
  }
  return (
    <button className={styles.btnGhost} onClick={() => moveToDeleted(selected.id)} type="button">
      Supprimer
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.22)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.92)",
  borderRadius: 12,
  padding: "10px 12px",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  fontFamily: "inherit",
};
