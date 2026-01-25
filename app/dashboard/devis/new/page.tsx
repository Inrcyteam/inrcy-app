"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

const VAT_OPTIONS = [0, 5.5, 10, 20];

export default function NewDevisPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const vatDispense = !!profile?.vat_dispense;

  // IMPORTANT: stable SSR/CSR
  const [number, setNumber] = useState<string>("");
  const [docDateISO, setDocDateISO] = useState<string>(""); // pour affichage stable

  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const [validityDays, setValidityDays] = useState<number>(30);

  // IMPORTANT: id stable au 1er render
  const [lines, setLines] = useState<LineItem[]>([
    { id: "l_1", label: "Prestation", qty: 1, unitPrice: 100, vatRate: 20 },
  ]);

  useEffect(() => {
    setNumber(generateNumber("DEV"));
    setDocDateISO(new Date().toISOString().slice(0, 10));
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
        id: uid("l"), // OK: action utilisateur
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
    const finalNumber = number || generateNumber("DEV");
    if (!number) setNumber(finalNumber);

    const createdAtISO = docDateISO
      ? new Date(docDateISO).toISOString()
      : new Date().toISOString();

    const doc: DocRecord = {
      id: uid("doc"),
      kind: "devis",
      number: finalNumber,
      createdAtISO,
      clientName: clientName.trim() || "—",
      clientAddress: clientAddress.trim(),
      clientEmail: clientEmail.trim(),
      status: "brouillon",
      lines,
      vatDispense,
     validityDays,
    };
    upsertDoc(doc);
    router.push("/dashboard/devis");
  };

  const print = () => window.print();

  return (
    <div className={dash.page}>
      <div className={styles.container}>
        <h2>Créer un devis</h2>

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

<div className={styles.field}>
  <label>Durée de validité (jours)</label>
  <input
    type="number"
    min={1}
    value={validityDays}
    onChange={(e) => setValidityDays(Math.max(1, Number(e.target.value) || 1))}
    placeholder="30"
  />
</div>


        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
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

      <div className={styles.preview}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>DEVIS</div>
            <div>{number || "—"}</div>
            <div style={{ marginTop: 6, color: "#444" }}>
              Date :{" "}
              {docDateISO
                ? new Date(docDateISO).toLocaleDateString("fr-FR")
                : "—"}
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
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <input
                    value={l.label}
                    onChange={(e) =>
                      updateLine(l.id, { label: e.target.value })
                    }
                    placeholder="Ex: Entretien boîte de vitesse"
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
                      updateLine(l.id, { unitPrice: Number(e.target.value) })
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
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 260px",
            marginTop: 18,
            gap: 24,
          }}
        >
          <div style={{ fontSize: 12, color: "#444", lineHeight: 1.4 }}>
            {vatDispense ? (
              <>
                <strong>TVA non applicable</strong> — Article 293 B du CGI.
              </>
            ) : (
              <>Les prix sont exprimés en euros. Le devis est valable {validityDays} jours.</>
            )}
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
          </div>
        </div>
      </div>
    </div>
  );
}
