"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./crm.module.css";

type Category = "" | "particulier" | "professionnel" | "collectivite_publique";
type ContactType = "" | "client" | "prospect" | "fournisseur" | "partenaire" | "autre";

type CrmContact = {
  id: string;
  last_name: string;
  first_name: string;
  company_name?: string;
  siret?: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  postal_code?: string;
  category: Category;
  notes?: string;
  important?: boolean;

  contact_type: ContactType;
  created_at: string;
};

const CATEGORY_LABEL: Record<Exclude<Category, "">, string> = {
  particulier: "Particulier",
  professionnel: "Professionnel",
  collectivite_publique: "Collectivité publique",
};

const TYPE_LABEL: Record<Exclude<ContactType, "">, string> = {
  client: "Client",
  prospect: "Prospect",
  fournisseur: "Fournisseur",
  partenaire: "Partenaire",
  autre: "Autre",
};

function emptyDraft() {
  return {
    display_name: "",
    siret: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    category: "" as Category,
    contact_type: "" as ContactType,
    notes: "",
    important: false,
  };
}


function buildDisplayName(c: Pick<CrmContact, "last_name" | "first_name" | "company_name">) {
  const left = [c.last_name ?? "", c.first_name ?? ""].join(" ").replace(/\s+/g, " ").trim();
  const right = (c.company_name ?? "").trim();
  if (left && right) return `${left} / ${right}`;
  return left || right;
}

function parseDisplayName(v: string) {
  const raw = (v || "").trim();
  if (!raw) return { last_name: "", first_name: "", company_name: "" };

  const parts = raw.split("/");
  const left = (parts[0] || "").trim();
  const right = (parts.slice(1).join("/") || "").trim();

  // ⚠️ Heuristique simple (en attendant Supabase): on stocke "Nom Prénom" dans last_name,
  // first_name reste vide, et la partie après "/" va dans company_name.
  return { last_name: left, first_name: "", company_name: right };
}

function typeBadgeClass(t: ContactType) {
  if (!t) return `${styles.typeBadge}`;
  if (t === "client") return `${styles.typeBadge} ${styles.typeClient}`;
  if (t === "prospect") return `${styles.typeBadge} ${styles.typeProspect}`;
  if (t === "fournisseur") return `${styles.typeBadge} ${styles.typeFournisseur}`;
  return `${styles.typeBadge} ${styles.typePartenaire}`;
}

function categoryBadgeClass(c: Category) {
  if (!c) return `${styles.catBadge}`;
  if (c === "professionnel") return `${styles.catBadge} ${styles.catPro}`;
  if (c === "collectivite_publique") return `${styles.catBadge} ${styles.catPublic}`;
  return `${styles.catBadge} ${styles.catPart}`;
}

export default function CRMClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [query, setQuery] = useState("");

  // ✅ Sélection multi-contacts (pour actions : mail, etc.)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(() => new Set());
  const [importantIds, setImportantIds] = useState<Set<string>>(() => new Set());
  const [notesById, setNotesById] = useState<Record<string, string>>(() => ({}));

  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft>>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadContacts() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/crm/contacts", { method: "GET" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Impossible de charger le CRM.");
      const base = Array.isArray(j?.contacts) ? j.contacts : [];
      // Merge local notes/important (if backend doesn't provide them yet)
      const merged = base.map((c: any) => ({
        ...c,
        notes: (c?.notes ?? notesById?.[c.id] ?? "") as string,
        important: Boolean(c?.important ?? importantIds.has(c.id)),
      }));
      setContacts(merged);
    } catch (e: any) {
      setError(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    // Persist local (front-only) for ⭐ important + notes (safe even if backend doesn't support it yet)
    try {
      const impRaw = localStorage.getItem("inrcy_crm_important_ids");
      if (impRaw) {
        const ids = JSON.parse(impRaw);
        if (Array.isArray(ids)) setImportantIds(new Set(ids.filter((x) => typeof x === "string")));
      }
      const notesRaw = localStorage.getItem("inrcy_crm_notes_by_id");
      if (notesRaw) {
        const obj = JSON.parse(notesRaw);
        if (obj && typeof obj === "object") setNotesById(obj as Record<string, string>);
      }
    } catch {}
  }, []);


  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const blob = [
        buildDisplayName(c),
        c.siret ?? "",
        c.email,
        c.phone,
        c.address,
        c.city ?? "",
        c.postal_code ?? "",
        c.category ? CATEGORY_LABEL[c.category as Exclude<Category, "">] : "",
        c.contact_type ? TYPE_LABEL[c.contact_type as Exclude<ContactType, "">] : "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [contacts, query]);

  // ✅ KPI (lecture rapide)
  const kpis = useMemo(() => {
    const total = contacts.length;
    const prospects = contacts.filter((c) => c.contact_type === "prospect").length;
    const clients = contacts.filter((c) => c.contact_type === "client").length;
    const partenaires = contacts.filter((c) => c.contact_type === "partenaire").length;
        const fournisseurs = contacts.filter((c) => c.contact_type === "fournisseur").length;
    const autres = contacts.filter((c) => !c.contact_type || c.contact_type === "autre").length;
    return { total, prospects, clients, partenaires, fournisseurs, autres };
  }, [contacts]);

  useEffect(() => {
    // Re-apply local ⭐ / notes on already loaded contacts when local state changes
    setContacts((prev) =>
      prev.map((c) => ({
        ...c,
        notes: (c?.notes ?? notesById?.[c.id] ?? "") as string,
        important: Boolean(c?.important ?? importantIds.has(c.id)),
      }))
    );
  }, [notesById, importantIds]);

  // ✅ Nettoie la sélection si des contacts disparaissent (après suppression / reload)
  useEffect(() => {
    setSelectedContactIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(contacts.map((c) => c.id));
      const next = new Set(Array.from(prev).filter((id) => allowed.has(id)));
      return next;
    });
  }, [contacts]);

  const selectedContacts = useMemo(() => {
    if (selectedContactIds.size === 0) return [] as CrmContact[];
    const map = new Map(contacts.map((c) => [c.id, c] as const));
    return Array.from(selectedContactIds).map((id) => map.get(id)).filter(Boolean) as CrmContact[];
  }, [selectedContactIds, contacts]);

  const selectedEmails = useMemo(() => {
    const emails = selectedContacts
      .map((c) => (c.email || "").trim())
      .filter(Boolean);
    // unique
    return Array.from(new Set(emails));
  }, [selectedContacts]);

  const toggleSelect = (id: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      const filteredIds = filtered.map((c) => c.id);
      const allSelected = filteredIds.length > 0 && filteredIds.every((id) => next.has(id));
      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };


  const persistImportant = (next: Set<string>) => {
    try {
      localStorage.setItem("inrcy_crm_important_ids", JSON.stringify(Array.from(next)));
    } catch {}
  };

  const persistNotes = (next: Record<string, string>) => {
    try {
      localStorage.setItem("inrcy_crm_notes_by_id", JSON.stringify(next));
    } catch {}
  };

  const toggleImportant = (id: string) => {
    setImportantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistImportant(next);
      return next;
    });
  };

  const setNoteForId = (id: string, note: string) => {
    setNotesById((prev) => {
      const next = { ...prev, [id]: note };
      persistNotes(next);
      return next;
    });
  };


  const sendMailToSelected = () => {
    if (selectedEmails.length === 0) return;
    const params = new URLSearchParams({ compose: "1", to: selectedEmails.join(",") , from: "crm" });
    router.push(`/dashboard/mails?${params.toString()}`);
  };

  function startNew() {
    setEditingId(null);
    setDraft(emptyDraft());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(c: CrmContact) {
    setEditingId(c.id);
    setDraft({
      display_name: buildDisplayName(c),
      siret: (c.siret ?? "") as string,
      email: (c.email ?? "") as string,
      phone: (c.phone ?? "") as string,
      address: (c.address ?? "") as string,
      city: (c.city ?? "") as string,
      postal_code: (c.postal_code ?? "") as string,
      // ✅ évite le warning React (uncontrolled -> controlled)
      category: ((c.category as any) ?? "") as Category,
      contact_type: ((c.contact_type as any) ?? "") as ContactType,
      notes: ((c.notes as any) ?? "") as string,
      important: importantIds.has(c.id),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setSaving(true);
    setError(null);

    const { last_name, first_name, company_name } = parseDisplayName(draft.display_name);

    const payload = {
      // champ unique
      display_name: draft.display_name.trim(),

      // champs legacy (en attendant Supabase)
      last_name,
      first_name,
      company_name,

      // autres champs
      siret: (draft.siret || "").trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      address: draft.address.trim(),
      city: (draft.city || "").trim(),
      postal_code: (draft.postal_code || "").trim(),
      category: draft.category,
      contact_type: draft.contact_type,
      notes: (draft.notes || "").trim(),
      important: Boolean(draft.important),
    };

    try {
      const r = await fetch("/api/crm/contacts", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Impossible d'enregistrer.");
      await loadContacts();
      // If editing, persist ⭐ + notes locally (works even if backend doesn't store it yet)
      if (editingId) {
        setNoteForId(editingId, (draft.notes || "").trim());
        if (draft.important) {
          setImportantIds((prev) => {
            const next = new Set(prev);
            next.add(editingId);
            persistImportant(next);
            return next;
          });
        } else {
          setImportantIds((prev) => {
            const next = new Set(prev);
            next.delete(editingId);
            persistImportant(next);
            return next;
          });
        }
      }
      startNew();
    } catch (e: any) {
      setError(e?.message || "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected() {
    if (selectedContactIds.size === 0) return;
    const n = selectedContactIds.size;
    if (!confirm(`🗑️ Supprimer ${n} contact${n > 1 ? "s" : ""} ?`)) return;

    setSaving(true);
    setError(null);
    try {
      const ids = Array.from(selectedContactIds);
      // Suppression en parallèle (API actuelle : 1 id par requête)
      await Promise.all(
        ids.map(async (id) => {
          const r = await fetch(`/api/crm/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j?.error || "Impossible de supprimer.");
        })
      );

      // reload + reset states
      await loadContacts();
      setSelectedContactIds(new Set());
      if (editingId && ids.includes(editingId)) startNew();
    } catch (e: any) {
      setError(e?.message || "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("🗑️ ce contact ?")) return;

    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/crm/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Impossible de supprimer.");
      await loadContacts();
      if (editingId === id) startNew();
    } catch (e: any) {
      setError(e?.message || "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.shell}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        // Clique "vide" = en dehors des cards
        if (t.closest(`.${styles.card}`)) return;
        startNew();
      }}
    >
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <div className={styles.titleBubble}>
            <span className={styles.logoDot}></span>
            <h1 className={styles.h1}>CRM iNrCy</h1>
          </div>
          <p className={styles.subInline}>
            Un tableau simple et connecté pour suivre tous vos contacts.
          </p>
        </div>

        <button aria-label="action"
          className={styles.backBtn}
          type="button"
          onClick={() => router.push("/dashboard")}
        >
         Fermer
        </button>
      </header>

      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Contacts</div>
          <div className={styles.kpiValue}>{kpis.total}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Prospects</div>
          <div className={styles.kpiValue}>{kpis.prospects}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Clients</div>
          <div className={styles.kpiValue}>{kpis.clients}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Partenaires</div>
          <div className={styles.kpiValue}>{kpis.partenaires}</div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Fournisseurs</div>
          <div className={styles.kpiValue}>{kpis.fournisseurs}</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Autres</div>
          <div className={styles.kpiValue}>{kpis.autres}</div>
        </div>
      </div>

      <section className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardHead}>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}

                
<div className={styles.formGrid}>
  {/* Ligne 1 */}
  <label className={`${styles.label} ${styles.col4}`}>
    <span>Nom Prénom / Raison sociale</span>
    <input
      className={styles.input}
      value={draft.display_name}
      onChange={(e) => setDraft((s) => ({ ...s, display_name: e.target.value }))}
      placeholder="Dupont Marie / SAS Exemple"
      autoComplete="name"
    />
  </label>

  <label className={`${styles.label} ${styles.col1}`}>
    <span>SIREN</span>
    <input
      className={styles.input}
      value={draft.siret}
      onChange={(e) => setDraft((s) => ({ ...s, siret: e.target.value }))}
      placeholder="123 456 789"
      inputMode="numeric"
    />
  </label>

  <label className={`${styles.label} ${styles.col2}`}>
    <span>Catégorie</span>
    <select
      className={styles.select}
      value={draft.category}
      onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value as Category }))}
    >
      <option value="">—</option>
      <option value="particulier">Particulier</option>
      <option value="professionnel">Professionnel</option>
      <option value="collectivite_publique">Collectivité publique</option>
    </select>
  </label>

  <label className={`${styles.label} ${styles.col2}`}>
    <span>Type</span>
    <select
      className={styles.select}
      value={draft.contact_type}
      onChange={(e) => setDraft((s) => ({ ...s, contact_type: e.target.value as ContactType }))}
    >
      <option value="">—</option>
      <option value="client">Client</option>
      <option value="prospect">Prospect</option>
      <option value="fournisseur">Fournisseur</option>
      <option value="partenaire">Partenaire</option>
      <option value="autre">Autre</option>
    </select>
  </label>

  <label className={`${styles.label} ${styles.col1}`}>
    <span>Téléphone</span>
    <input
      className={styles.input}
      value={draft.phone}
      onChange={(e) => setDraft((s) => ({ ...s, phone: e.target.value }))}
      placeholder="06 00 00 00 00"
      autoComplete="tel"
    />
  </label>


  <label className={`${styles.label} ${styles.starField} ${styles.col2}`}>
    <span>⭐ Important</span>
    <button
      type="button"
      className={styles.starToggle}
      onClick={() => {
        // If editing: persist on the contact id. If new: just toggle the draft.
        if (editingId) toggleImportant(editingId);
        setDraft((s) => ({ ...s, important: !s.important }));
      }}
      aria-pressed={draft.important ? "true" : "false"}
      title={draft.important ? "Contact important" : "Marquer comme important"}
    >
      {draft.important ? "★" : "☆"}
    </button>
  </label>

  {/* Ligne 2 */}
  <label className={`${styles.label} ${styles.col2}`}>
    <span>Mail</span>
    <input
      className={styles.input}
      value={draft.email}
      onChange={(e) => setDraft((s) => ({ ...s, email: e.target.value }))}
      placeholder="marie@exemple.fr"
      autoComplete="email"
    />
  </label>

  <label className={`${styles.label} ${styles.col4}`}>
    <span>Adresse</span>
    <input
      className={styles.input}
      value={draft.address}
      onChange={(e) => setDraft((s) => ({ ...s, address: e.target.value }))}
      placeholder="12 rue ... "
      autoComplete="street-address"
    />
  </label>

  <label className={`${styles.label} ${styles.col2}`}>
    <span>Ville</span>
    <input
      className={styles.input}
      value={draft.city}
      onChange={(e) => setDraft((s) => ({ ...s, city: e.target.value }))}
      placeholder="Paris"
      autoComplete="address-level2"
    />
  </label>

  <label className={`${styles.label} ${styles.col1}`}>
    <span>CP</span>
    <input
      className={styles.input}
      value={draft.postal_code}
      onChange={(e) => setDraft((s) => ({ ...s, postal_code: e.target.value }))}
      placeholder="75000"
      autoComplete="postal-code"
      inputMode="numeric"
    />
  </label>


  <label className={`${styles.label} ${styles.col2}`}>
    <span>Notes</span>
    <input
      className={styles.input}
      value={draft.notes}
      onChange={(e) => {
        const v = e.target.value;
        setDraft((s) => ({ ...s, notes: v }));
        if (editingId) setNoteForId(editingId, v);
      }}
      placeholder="Info utile sur ce contact..."
    />
  </label>


  <div className={`${styles.formActions} ${styles.col1}`}>
    {editingId ? (
      <>
        <button
          aria-label="Retour"
          className={`${styles.ghostBtn} ${styles.iconBtn}`}
          type="button"
          onClick={startNew}
          disabled={saving}
          title="Retour"
        >
          ↩
        </button>
        <button
          aria-label="Mettre à jour"
          className={`${styles.primaryBtn} ${styles.iconBtn}`}
          type="button"
          onClick={save}
          disabled={saving}
          title="Mettre à jour"
        >
          ✔
        </button>
      </>
    ) : (
      <button
        aria-label="Ajouter"
        className={`${styles.primaryBtn} ${styles.plusBtn} ${styles.iconBtn}`}
        type="button"
        onClick={save}
        disabled={saving}
        title="Ajouter"
      >
        +
      </button>
    )}
  </div>
</div>
      </section>

      <section className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardHead}>
          <h2 className={styles.h2}>Tableau CRM</h2>
          <div className={styles.tableToolbar}>
            <div className={styles.searchWrap}>
              <input
                className={styles.search}
                placeholder="Rechercher..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className={styles.count}>{filtered.length}</span>
            </div>

            <div className={styles.bulkActions}>
              <button aria-label="action"
                className={styles.ghostBtn}
                type="button"
                onClick={() => setSelectedContactIds(new Set())}
                disabled={selectedContactIds.size === 0 || saving}
                title={selectedContactIds.size === 0 ? "Aucun contact sélectionné" : "Vider la sélection"}
              >
                Désélectionner
              </button>

              <button
                aria-label="Supprimer"
                className={`${styles.smallBtn} ${styles.dangerBtn}`}
                type="button"
                onClick={removeSelected}
                disabled={selectedContactIds.size === 0 || saving}
                title={selectedContactIds.size === 0 ? "Sélectionne 1 ou plusieurs contacts" : `Supprimer ${selectedContactIds.size} contact(s)`}
              >
                🗑️
              </button>

              <button aria-label="action"
                className={styles.primaryBtn}
                type="button"
                onClick={sendMailToSelected}
                disabled={selectedEmails.length === 0}
                title={selectedEmails.length === 0 ? "Sélectionne 1 ou plusieurs contacts avec un email" : "Ouvrir iNr'Box avec les destinataires pré-remplis"}
              >
                Envoyer un mail{selectedContactIds.size ? ` (${selectedContactIds.size})` : ""}
              </button>
            </div>
          </div>
        </div>

        {loading ? <div className={styles.muted}>Chargement...</div> : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
                        <thead>
              <tr>
                <th className={styles.thSelect}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    onClick={(e) => e.stopPropagation()}
                    onChange={toggleSelectAllFiltered}
                    checked={filtered.length > 0 && filtered.every((c) => selectedContactIds.has(c.id))}
                    aria-label="Sélectionner tous les contacts filtrés"
                  />
                </th>
                <th>Nom Prénom / RS</th>
                <th>Mail</th>
                <th>Téléphone</th>
                <th>Ville</th>
                <th>CP</th>
                <th>Catégorie</th>
                <th>Type</th>
                <th>⭐</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.empty}>
                    Aucun contact pour le moment.
                  </td>
                </tr>
              ) : (
                                filtered.map((c) => (
                  <tr key={c.id} className={selectedContactIds.has(c.id) ? styles.rowSelected : undefined} onClick={() => startEdit(c)} style={{ cursor: "pointer" }}>
                    <td className={styles.tdSelect}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedContactIds.has(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(c.id)}
                        aria-label={`Sélectionner ${buildDisplayName(c)}`}
                      />
                    </td>
                    <td>{buildDisplayName(c)}</td>
                    <td className={styles.mono}>{c.email}</td>
                    <td className={styles.mono}>{c.phone}</td>
                    <td>{c.city ?? ""}</td>
                    <td className={styles.mono}>{c.postal_code ?? ""}</td>
                    <td>
                      {c.category ? (
                        <span className={categoryBadgeClass(c.category)}>{CATEGORY_LABEL[c.category as Exclude<Category, "">]}</span>
                      ) : (
                        <span className={styles.dash}>—</span>
                      )}
                    </td>
                    <td>
                      {c.contact_type ? (
                        <span className={typeBadgeClass(c.contact_type)}>{TYPE_LABEL[c.contact_type as Exclude<ContactType, "">]}</span>
                      ) : (
                        <span className={styles.dash}>—</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.starBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleImportant(c.id);
                        }}
                        aria-label={importantIds.has(c.id) ? "Retirer des importants" : "Marquer important"}
                        title={importantIds.has(c.id) ? "Important" : "Marquer important"}
                      >
                        {importantIds.has(c.id) ? "★" : "☆"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>        
      </section>
    </div>
  );
}
