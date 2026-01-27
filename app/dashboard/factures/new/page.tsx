"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import styles from "../../_documents/documents.module.css";
import dash from "../../dashboard.module.css";
import {
  DocRecord,
  LineItem,
  calcLineHT,
  calcTotals,
  formatEuro,
  generateNumber,
  uid,
  upsertDoc,
} from "../../_documents/docUtils";

type Profile = {
  user_id: string;
  company_legal_name?: string | null;
  hq_address?: string | null;
  hq_zip?: string | null;
  hq_city?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  siren?: string | null;
  rcs_city?: string | null;
  vat_number?: string | null;
  vat_dispense?: boolean | null;
  logo_url?: string | null;
};

const VAT_OPTIONS = [0, 5.5, 10, 20] as const;

const PAYMENT_METHODS = [
  { key: "virement", label: "Virement bancaire" },
  { key: "cb", label: "Carte bancaire" },
  { key: "cheque", label: "Chèque" },
  { key: "especes", label: "Espèces" },
] as const;

export default function NewFacturePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const vatDispense = !!profile?.vat_dispense;

  // --- Mobile: this screen is unusable in portrait -> require landscape
  const [mustRotate, setMustRotate] = useState(false);

  const tryLockLandscape = async () => {
    try {
      // Works only on some mobile browsers and often requires a user gesture
      // so we also keep a blocking overlay until the user rotates.
      // @ts-ignore
      await screen?.orientation?.lock?.("landscape");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const update = () => {
      if (typeof window === "undefined") return;
      const isMobile = window.matchMedia("(max-width: 900px)").matches;
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      setMustRotate(isMobile && isPortrait);
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mustRotate ? "hidden" : "";
    if (mustRotate) void tryLockLandscape();
    return () => {
      document.body.style.overflow = "";
    };
  }, [mustRotate]);

  // IMPORTANT: valeur stable SSR/CSR -> on initialise à vide, puis on remplit après mount
  const [number, setNumber] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");


  // ✅ Pré-remplissage depuis CRM / iNrBox
  useEffect(() => {
    const name = searchParams.get("clientName") || searchParams.get("name") || "";
    const email = searchParams.get("clientEmail") || searchParams.get("email") || "";
    const address = searchParams.get("clientAddress") || searchParams.get("address") || "";
    if (name) setClientName((prev) => prev || name);
    if (email) setClientEmail((prev) => prev || email);
    if (address) setClientAddress((prev) => prev || address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [status, setStatus] = useState<DocRecord["status"]>("brouillon");

  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["key"]>("virement");

  const [paymentDetails, setPaymentDetails] = useState("");
  const [notes, setNotes] = useState("");

  // IMPORTANT: id stable au 1er render (pas de uid() ici)
  const [lines, setLines] = useState<LineItem[]>([
    { id: "l_1", label: "Prestation", qty: 1, unitPrice: 120, vatRate: 20 },
  ]);

  // Init client-only (évite mismatch SSR/CSR)
  useEffect(() => {
    // Numéro + dates
    setNumber(generateNumber("FAC"));

    const d = new Date();
    setInvoiceDate(d.toISOString().slice(0, 10));

    const dd = new Date();
    dd.setDate(dd.getDate() + 30);
    setDueDate(dd.toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) return;

      const { data } = await supabase
        .from("profiles")
        .select(
          "user_id,company_legal_name,hq_address,hq_zip,hq_city,contact_email,phone,siren,rcs_city,vat_number,vat_dispense,logo_url"
        )
        .eq("user_id", user.id)
        .single();

      setProfile((data as Profile) ?? null);
    };
    load();
  }, [supabase]);

  const totals = useMemo(
    () => calcTotals(lines, vatDispense),
    [lines, vatDispense]
  );

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        id: uid("l"), // OK: appelé suite à action utilisateur (après hydration)
        label: "",
        qty: 1,
        unitPrice: 0,
        vatRate: vatDispense ? 0 : 20,
      },
    ]);

  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((l) => l.id !== id));

  const updateLine = (id: string, patch: Partial<LineItem>) =>
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );

  const save = () => {
    // Sécurité : si l’utilisateur clique ultra vite
    const finalNumber = number || generateNumber("FAC");
    if (!number) setNumber(finalNumber);

    const safeInvoiceDate = invoiceDate || new Date().toISOString().slice(0, 10);
    const safeDueDate = dueDate || "";

    const doc: DocRecord = {
      id: uid("doc"),
      kind: "facture",
      number: finalNumber,
      createdAtISO: new Date(safeInvoiceDate).toISOString(),
      dueAtISO: safeDueDate ? new Date(safeDueDate).toISOString() : null,
      clientName: clientName.trim() || "—",
      clientAddress: clientAddress.trim(),
      clientEmail: clientEmail.trim(),
      status,
      lines,
      vatDispense,
    };
    upsertDoc(doc);
    router.push("/dashboard/factures");
  };

  const print = () => window.print();

  const paymentLabel =
    PAYMENT_METHODS.find((m) => m.key === paymentMethod)?.label ?? "—";

  return (

    <>
      {mustRotate ? (
        <div className={styles.landscapeGate} role="dialog" aria-modal="true">
          <div className={styles.landscapeGateCard}>
            <div className={styles.landscapeGateIcon}>🔁</div>
            <div className={styles.landscapeGateTitle}>Passez en mode paysage</div>
            <div className={styles.landscapeGateText}>
              La création de facture est optimisée en écran <strong>paysage</strong> sur mobile.
            </div>
          </div>
        </div>
      ) : null}

      <div className={`${dash.page} ${styles.editorPage}`}>
      <div className={styles.container}>
        {/* Formulaire */}
        <div className={styles.panel}>
         <div className={styles.panelHeader}>
  <h1>Créer une facture</h1>

  <button
    className={styles.closeBtn}
    onClick={() => router.push("/dashboard")}
  >
    <span className={styles.closeText}>Fermer</span>
    <span className={styles.closeIcon}>✕</span>
  </button>
</div>

        <div className={styles.field}>
          <label>Client</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Nom du client"
          />
        </div>

        <div className={styles.field}>
          <label>Adresse client</label>
          <input
            value={clientAddress}
            onChange={(e) => setClientAddress(e.target.value)}
            placeholder="Adresse, ville"
          />
        </div>

        <div className={styles.field}>
          <label>Email client</label>
          <input
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
            placeholder="email@client.fr"
          />
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div className={styles.field}>
            <label>Date de facture</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Échéance</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div className={styles.field}>
            <label>Statut</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as DocRecord["status"])
              }
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "white",
              }}
            >
              <option value="brouillon">brouillon</option>
              <option value="envoye">envoyé</option>
              <option value="paye">payé</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>Mode de paiement</label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value as (typeof PAYMENT_METHODS)[number]["key"]
                )
              }
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "10px 12px",
                color: "white",
              }}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label>Détails paiement (IBAN, lien, etc.)</label>
          <input
            value={paymentDetails}
            onChange={(e) => setPaymentDetails(e.target.value)}
            placeholder="Ex: IBAN FR76 .... / Paiement sous 30 jours"
          />
        </div>

        <div className={styles.field}>
          <label>Notes (optionnel)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Merci pour votre confiance."
          />
        </div>

        <div
          style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}
        >
          <button type="button" onClick={addLine}>
            + Ajouter une ligne
          </button>
          <button type="button" onClick={save}>
            Enregistrer
          </button>
          <button type="button" onClick={print}>
            Imprimer / PDF
          </button>
        </div>

          {vatDispense ? (
            <p style={{ marginTop: 12, opacity: 0.9 }}>
              TVA désactivée :{" "}
              <strong>TVA non applicable (article 293 B du CGI)</strong>
            </p>
          ) : null}
        </div>

        {/* Aperçu document */}
        <div className={styles.preview}>
        <div className={styles.previewHeader}>
          <div>
            <div className={styles.title}>FACTURE</div>
            <div>{number || "—"}</div>
            <div style={{ marginTop: 6, color: "#444" }}>
              Date :{" "}
              {invoiceDate
                ? new Date(invoiceDate).toLocaleDateString("fr-FR")
                : "—"}
              {dueDate ? (
                <>
                  {" "}
                  · Échéance : {new Date(dueDate).toLocaleDateString("fr-FR")}
                </>
              ) : null}
            </div>
          </div>
          {profile?.logo_url ? (
  <img src={profile.logo_url} alt="Logo" className={styles.logo} />
) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Prestataire</div>
            <div style={{ fontWeight: 600 }}>
              {profile?.company_legal_name ?? "—"}
            </div>
            <div>{profile?.hq_address ?? ""}</div>
            <div>
              {(profile?.hq_zip ?? "")} {(profile?.hq_city ?? "")}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
              {profile?.phone ? (
                <>
                  Tél : {profile.phone}
                  <br />
                </>
              ) : null}
              {profile?.contact_email ? (
                <>
                  Email : {profile.contact_email}
                  <br />
                </>
              ) : null}
              {profile?.siren ? (
                <>
                  SIREN : {profile.siren}
                  <br />
                </>
              ) : null}
              {profile?.vat_number ? (
                <>
                  TVA : {profile.vat_number}
                  <br />
                </>
              ) : null}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Client</div>
            <div style={{ fontWeight: 600 }}>{clientName || "—"}</div>
            <div>{clientAddress || ""}</div>
            <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>
              {clientEmail || ""}
            </div>
          </div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Désignation</th>
              <th style={{ width: 70 }}>Qté</th>
              <th style={{ width: 120 }}>PU HT</th>
              <th style={{ width: 90 }}>TVA</th>
              <th style={{ width: 120, textAlign: "right" }}>Total HT</th>
              <th style={{ width: 0 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={l.id}>
                <td>
                  <input
                    value={l.label}
                    onChange={(e) =>
                      updateLine(l.id, { label: e.target.value })
                    }
                    placeholder="Ex: Réparation / entretien"
                    style={{
                      width: "100%",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={l.qty}
                    onChange={(e) =>
                      updateLine(l.id, { qty: Number(e.target.value) })
                    }
                    style={{
                      width: 64,
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={l.unitPrice}
                    onChange={(e) =>
                      updateLine(l.id, {
                        unitPrice: Number(e.target.value),
                      })
                    }
                    style={{
                      width: 110,
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  />
                </td>
                <td>
                  <select
                    value={vatDispense ? 0 : l.vatRate}
                    disabled={vatDispense}
                    onChange={(e) =>
                      updateLine(l.id, { vatRate: Number(e.target.value) })
                    }
                    style={{
                      width: 80,
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    {VAT_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}%
                      </option>
                    ))}
                  </select>
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatEuro(calcLineHT(l))}
                </td>
                <td style={{ textAlign: "right" }}>
                  {idx > 0 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(l.id)}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "transparent",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                      }}
                      title="Supprimer la ligne"
                    >
                      −
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 280px",
            marginTop: 18,
            gap: 24,
          }}
        >
          <div style={{ fontSize: 12, color: "#444", lineHeight: 1.4 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>Paiement :</strong> {paymentLabel}
              {paymentDetails ? <> — {paymentDetails}</> : null}
            </div>
            {vatDispense ? (
              <div>
                <strong>TVA non applicable</strong> — Article 293 B du CGI.
              </div>
            ) : null}
            {notes ? <div style={{ marginTop: 8 }}>{notes}</div> : null}
          </div>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span>Total HT</span>
              <strong>{formatEuro(totals.totalHT)}</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span>TVA</span>
              <strong>{formatEuro(totals.totalTVA)}</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 10,
                fontSize: 18,
              }}
            >
              <span>Total TTC</span>
              <strong>{formatEuro(totals.totalTTC)}</strong>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#444" }}>
              <strong>Statut :</strong> {status}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
    </>
  );
}
