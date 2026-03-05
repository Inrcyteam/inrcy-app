"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";

type Props = {
  mode?: "page" | "drawer";
};

function getPasswordStrength(pw: string) {
  const rules = {
    minLen: pw.length >= 8,
    hasLetter: /[a-zA-Z]/.test(pw),
    hasNumber: /\d/.test(pw),
    hasUpper: /[A-Z]/.test(pw),
    hasSymbol: /[^a-zA-Z0-9]/.test(pw),
  };
  const score = Object.values(rules).filter(Boolean).length; // 0..5
  const isStrong = score === 5;
  return { rules, score, isStrong };
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", opacity: ok ? 1 : 0.75 }}>
      <span aria-hidden style={{ fontSize: 12 }}>{ok ? "●" : "○"}</span>
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

export default function AccountContent({ mode: _mode = "page" }: Props) {
  const [email, setEmail] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [ok, setOk] = useState<string>("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");
      setOk("");
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error) throw new Error(error.message);
        setEmail(data.user?.email || "");
        const raw = (data.user as any)?.created_at as string | undefined;
        if (raw) {
          const d = new Date(raw);
          setCreatedAt(
            Number.isFinite(d.getTime()) ? d.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) : ""
          );
        }
      } catch (e: unknown) {
        setMsg(e instanceof Error ? e.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const canSubmit = !busy && !!currentPassword && !!newPassword && newPassword === confirm && strength.isStrong;

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.045)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.22)",
    color: "white",
    padding: "10px 12px",
    outline: "none",
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.85, marginBottom: 6 };

  const primaryBtn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background:
      "linear-gradient(135deg, rgba(255, 77, 166, 0.35), rgba(97, 87, 255, 0.28), rgba(0, 200, 255, 0.22))",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    width: "100%",
    opacity: busy ? 0.7 : 1,
  };

  const dangerBtn: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255, 65, 105, 0.20)",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    width: "100%",
    opacity: deleteBusy ? 0.7 : 1,
  };

  async function onDeleteAccount() {
    setDeleteMsg("");
    setOk("");

    if (deleteConfirm.trim().toUpperCase() !== "SUPPRIMER") {
      setDeleteMsg('Veuillez taper "SUPPRIMER" pour confirmer.');
      return;
    }

    if (!window.confirm("Dernière confirmation : supprimer définitivement votre compte iNrCy ?")) return;

    setDeleteBusy(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const detail = json?.error || "La suppression n'a pas pu être terminée.";
        setDeleteMsg(detail);
        return;
      }

      // Best-effort sign out on client side.
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // no-op
      }

      window.location.href = "/?account_deleted=1";
    } catch (e: unknown) {
      setDeleteMsg(e instanceof Error ? e.message : "Erreur lors de la suppression du compte");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onChangePassword() {
    setMsg("");
    setOk("");
    if (!currentPassword) {
      setMsg("Veuillez saisir votre mot de passe actuel.");
      return;
    }
    if (!strength.isStrong) {
      setMsg("Mot de passe trop faible : 8+ caractères, lettre, chiffre, majuscule et symbole requis.");
      return;
    }
    if (newPassword !== confirm) {
      setMsg("Les deux mots de passe ne sont pas identiques.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();

      // 🔐 Vérifier le mot de passe actuel (ré-auth)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) {
        setMsg("Mot de passe actuel incorrect.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setOk("✅ Mot de passe mis à jour.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Erreur lors de la mise à jour du mot de passe");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ opacity: 0.85 }}>Chargement…</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={card}>
        {createdAt ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>Date de création</div>
            <div style={{ fontSize: 13, fontWeight: 900, opacity: 0.92 }}>{createdAt}</div>
          </div>
        ) : null}

        <h2 style={{ margin: 0, fontSize: 16 }}>Identifiants</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
          Votre email de connexion est affiché ci-dessous. Vous pouvez modifier votre mot de passe.
        </p>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div>
            <div style={label}>Mail</div>
            <input style={{ ...input, opacity: 0.9 }} value={email} readOnly />
          </div>


          <div>
            <div style={label}>Mot de passe actuel</div>
            <input
              style={input}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <div>
            <div style={label}>Nouveau mot de passe</div>
            <input
              style={input}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          <div>
            <div style={label}>Confirmer le mot de passe</div>
            <input
              style={input}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          <div style={{ display: "grid", gap: 6, opacity: 0.9 }}>
            <Rule ok={strength.rules.minLen} label="8+ caractères" />
            <Rule ok={strength.rules.hasLetter} label="1 lettre" />
            <Rule ok={strength.rules.hasNumber} label="1 chiffre" />
            <Rule ok={strength.rules.hasUpper} label="1 majuscule" />
            <Rule ok={strength.rules.hasSymbol} label="1 symbole" />
          </div>

          <button type="button" onClick={onChangePassword} style={primaryBtn} disabled={!canSubmit}>
            Modifier le mot de passe
          </button>

          {msg ? <div style={{ marginTop: 6, opacity: 0.9 }}>⚠️ {msg}</div> : null}
          {ok ? <div style={{ marginTop: 6, opacity: 0.95 }}>{ok}</div> : null}
        </div>
      </div>

      {/* Zone de suppression (RGPD) */}
      <div style={{ ...card, border: "1px solid rgba(255, 65, 105, 0.30)" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Suppression du compte</h2>
        <p style={{ margin: "8px 0 0", opacity: 0.8 }}>
          Conformément au RGPD, vous pouvez supprimer définitivement votre compte et les données associées.
        </p>

        {!deleteOpen ? (
          <button
            type="button"
            style={{ ...dangerBtn, marginTop: 12 }}
            onClick={() => {
              setDeleteOpen(true);
              setDeleteConfirm("");
              setDeleteMsg("");
            }}
          >
            ⚠️ Supprimer mon compte
          </button>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ opacity: 0.9, fontSize: 13 }}>
              Cette action est <strong>irréversible</strong>. Tapez <strong>SUPPRIMER</strong> pour confirmer.
            </div>
            <input
              style={input}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="SUPPRIMER"
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                style={dangerBtn}
                onClick={onDeleteAccount}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Suppression en cours…" : "Confirmer la suppression"}
              </button>
              <button
                type="button"
                style={{ ...primaryBtn, background: "rgba(255,255,255,0.06)" }}
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirm("");
                  setDeleteMsg("");
                }}
                disabled={deleteBusy}
              >
                Annuler
              </button>
            </div>

            {deleteMsg ? <div style={{ opacity: 0.92 }}>⚠️ {deleteMsg}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
