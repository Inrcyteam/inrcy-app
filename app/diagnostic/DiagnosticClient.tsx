"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import styles from "./diagnostic.module.css";

type Severity = "ok" | "warn" | "error" | "running" | "pending";

type DiagnosticCheck = {
  id: string;
  title: string;
  description: string;
  target: string;
  severity: Severity;
  statusText: string;
  detail?: string;
  durationMs?: number;
  httpStatus?: number;
};

type SendState = "idle" | "sending" | "sent" | "error";

const TEST_TIMEOUT_MS = 8000;

function nowLabel() {
  return new Date().toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function statusLabel(severity: Severity) {
  switch (severity) {
    case "ok":
      return "OK";
    case "warn":
      return "À vérifier";
    case "error":
      return "Bloqué";
    case "running":
      return "Test en cours";
    default:
      return "En attente";
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Erreur inconnue";
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<{ response: Response; durationMs: number }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  const started = performance.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    return { response, durationMs: Math.round(performance.now() - started) };
  } finally {
    window.clearTimeout(timeout);
  }
}

function buildInitialChecks(): DiagnosticCheck[] {
  return [
    {
      id: "browser",
      title: "Navigateur",
      description: "Vérifie les informations de base du navigateur et l’état de connexion déclaré.",
      target: "Navigateur client",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "local-storage",
      title: "Stockage local",
      description: "Vérifie que le navigateur peut conserver les données nécessaires à la session.",
      target: "localStorage",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "session-storage",
      title: "Stockage de session",
      description: "Vérifie que le stockage temporaire du navigateur fonctionne correctement.",
      target: "sessionStorage",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "cookies",
      title: "Cookies navigateur",
      description: "Vérifie que les cookies du domaine iNrCy peuvent être écrits et relus.",
      target: "Cookies iNrCy",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "api-ping",
      title: "API iNrCy",
      description: "Vérifie que le PC peut appeler une route API simple sur le domaine iNrCy.",
      target: "/api/diagnostic/ping",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "asset-logo",
      title: "Ressources iNrCy",
      description: "Vérifie que les ressources publiques de l’application se chargent correctement.",
      target: "/logo-inrcy.png",
      severity: "pending",
      statusText: "En attente",
    },
  ];
}

function makeCheck(id: string, patch: Partial<DiagnosticCheck>): DiagnosticCheck {
  const base = buildInitialChecks().find((check) => check.id === id);
  return {
    id,
    title: base?.title || id,
    description: base?.description || "",
    target: base?.target || "",
    severity: patch.severity || "pending",
    statusText: patch.statusText || "En attente",
    detail: patch.detail,
    durationMs: patch.durationMs,
    httpStatus: patch.httpStatus,
  };
}

function checkFromHttp(id: string, response: Response, durationMs: number): DiagnosticCheck {
  if (response.ok) {
    return makeCheck(id, {
      severity: "ok",
      statusText: "OK",
      detail: `Réponse HTTP ${response.status} reçue en ${durationMs} ms.`,
      durationMs,
      httpStatus: response.status,
    });
  }

  return makeCheck(id, {
    severity: response.status >= 500 ? "error" : "warn",
    statusText: response.status >= 500 ? "Erreur serveur" : "Joignable",
    detail: `Réponse HTTP ${response.status} reçue en ${durationMs} ms.`,
    durationMs,
    httpStatus: response.status,
  });
}

function checkFromError(id: string, error: unknown): DiagnosticCheck {
  return makeCheck(id, {
    severity: "error",
    statusText: "Bloqué / inaccessible",
    detail: getErrorMessage(error),
  });
}

function storageCheck(kind: "localStorage" | "sessionStorage"): DiagnosticCheck {
  const id = kind === "localStorage" ? "local-storage" : "session-storage";
  const key = `inrcy_diag_${Date.now()}`;

  try {
    const storage = kind === "localStorage" ? window.localStorage : window.sessionStorage;
    storage.setItem(key, "ok");
    const value = storage.getItem(key);
    storage.removeItem(key);

    if (value === "ok") {
      return makeCheck(id, {
        severity: "ok",
        statusText: "OK",
        detail: `${kind} fonctionne correctement.`,
      });
    }

    return makeCheck(id, {
      severity: "warn",
      statusText: "À vérifier",
      detail: `${kind} a répondu, mais la valeur relue est inattendue.`,
    });
  } catch (error) {
    return makeCheck(id, {
      severity: "error",
      statusText: "Bloqué",
      detail: getErrorMessage(error),
    });
  }
}

function cookieCheck(): DiagnosticCheck {
  const name = `inrcy_diag_${Date.now()}`;

  try {
    document.cookie = `${name}=ok; path=/; max-age=60; SameSite=Lax`;
    const found = document.cookie.split(";").some((part) => part.trim() === `${name}=ok`);
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;

    if (found) {
      return makeCheck("cookies", {
        severity: "ok",
        statusText: "OK",
        detail: "Les cookies du domaine iNrCy peuvent être écrits et relus.",
      });
    }

    return makeCheck("cookies", {
      severity: "error",
      statusText: "Bloqué",
      detail: "Le cookie de test n’a pas pu être relu. Le navigateur ou la politique entreprise bloque peut-être les cookies.",
    });
  } catch (error) {
    return makeCheck("cookies", {
      severity: "error",
      statusText: "Bloqué",
      detail: getErrorMessage(error),
    });
  }
}

export default function DiagnosticClient() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "direct";
  const reason = searchParams.get("reason") || "manual";
  const auto = searchParams.get("auto") === "1";

  const [checks, setChecks] = useState<DiagnosticCheck[]>(buildInitialChecks);
  const [running, setRunning] = useState(false);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const autoSendStartedRef = useRef(false);

  const summary = useMemo(() => {
    const errors = checks.filter((check) => check.severity === "error").length;
    const warnings = checks.filter((check) => check.severity === "warn").length;
    const pending = checks.filter((check) => check.severity === "pending" || check.severity === "running").length;

    if (pending > 0 || running) return "Diagnostic en cours";
    if (errors > 0) return `${errors} point${errors > 1 ? "s" : ""} bloqué${errors > 1 ? "s" : ""}`;
    if (warnings > 0) return `${warnings} point${warnings > 1 ? "s" : ""} à vérifier`;
    return "Tous les tests principaux sont OK";
  }, [checks, running]);

  const report = useMemo(() => {
    const lines = [
      "Diagnostic connexion iNrCy",
      `Date navigateur : ${nowLabel()}`,
      `Origine : ${from}`,
      `Raison : ${reason}`,
      `URL : ${typeof window !== "undefined" ? window.location.href : "-"}`,
      `Navigateur : ${typeof navigator !== "undefined" ? navigator.userAgent : "-"}`,
      `En ligne : ${typeof navigator !== "undefined" ? String(navigator.onLine) : "-"}`,
      `Résumé : ${summary}`,
      "",
      "--- Tests ---",
      ...checks.map((check) => {
        const duration = typeof check.durationMs === "number" ? ` · ${check.durationMs} ms` : "";
        const status = typeof check.httpStatus === "number" ? ` · HTTP ${check.httpStatus}` : "";
        return [
          `[${statusLabel(check.severity)}] ${check.title}`,
          `Cible : ${check.target}`,
          `Statut : ${check.statusText}${status}${duration}`,
          check.detail ? `Détail : ${check.detail}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      }),
    ];

    return lines.join("\n\n");
  }, [checks, from, reason, summary]);

  const runDiagnostic = useCallback(async () => {
    setRunning(true);
    setCopied(false);
    setSendState("idle");
    setSendMessage(null);
    autoSendStartedRef.current = false;
    setFinishedAt(null);
    setChecks(buildInitialChecks().map((check) => ({ ...check, severity: "running", statusText: "Test en cours" })));

    const next: DiagnosticCheck[] = [];

    next.push(
      makeCheck("browser", {
        severity: navigator.onLine ? "ok" : "warn",
        statusText: navigator.onLine ? "OK" : "Hors ligne déclaré",
        detail: `Navigateur : ${navigator.userAgent}. Langue : ${navigator.language}. En ligne : ${String(navigator.onLine)}.`,
      }),
    );
    setChecks((previous) => previous.map((check) => (check.id === "browser" ? next[next.length - 1] : check)));

    const local = storageCheck("localStorage");
    next.push(local);
    setChecks((previous) => previous.map((check) => (check.id === local.id ? local : check)));

    const session = storageCheck("sessionStorage");
    next.push(session);
    setChecks((previous) => previous.map((check) => (check.id === session.id ? session : check)));

    const cookies = cookieCheck();
    next.push(cookies);
    setChecks((previous) => previous.map((check) => (check.id === cookies.id ? cookies : check)));

    try {
      const { response, durationMs } = await fetchWithTimeout("/api/diagnostic/ping");
      const api = checkFromHttp("api-ping", response, durationMs);
      next.push(api);
      setChecks((previous) => previous.map((check) => (check.id === api.id ? api : check)));
    } catch (error) {
      const api = checkFromError("api-ping", error);
      next.push(api);
      setChecks((previous) => previous.map((check) => (check.id === api.id ? api : check)));
    }

    try {
      const { response, durationMs } = await fetchWithTimeout(`/logo-inrcy.png?t=${Date.now()}`);
      const asset = checkFromHttp("asset-logo", response, durationMs);
      next.push(asset);
      setChecks((previous) => previous.map((check) => (check.id === asset.id ? asset : check)));
    } catch (error) {
      const asset = checkFromError("asset-logo", error);
      next.push(asset);
      setChecks((previous) => previous.map((check) => (check.id === asset.id ? asset : check)));
    }

    setRunning(false);
    setFinishedAt(nowLabel());
  }, []);

  const sendReport = useCallback(
    async (automatic = false) => {
      setSendState("sending");
      setSendMessage(automatic ? "Envoi automatique du rapport à iNrCy…" : "Envoi du rapport à iNrCy…");

      try {
        const response = await fetch("/api/diagnostic/send-report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            report,
            summary,
            clientName,
            company,
            phone,
            message,
            url: window.location.href,
            userAgent: navigator.userAgent,
            source: from,
            reason,
            automatic,
          }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        setSendState("sent");
        setSendMessage(automatic ? "Rapport envoyé automatiquement à iNrCy." : "Rapport envoyé à iNrCy.");
      } catch (error) {
        setSendState("error");
        setSendMessage(`Envoi impossible pour le moment. Vous pouvez copier le rapport. ${getErrorMessage(error)}`);
      }
    },
    [clientName, company, from, message, phone, reason, report, summary],
  );

  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [report]);

  useEffect(() => {
    void runDiagnostic();
  }, [runDiagnostic]);

  useEffect(() => {
    if (!auto || !finishedAt || running || autoSendStartedRef.current) return;
    autoSendStartedRef.current = true;
    void sendReport(true);
  }, [auto, finishedAt, running, sendReport]);

  const pageSubtitle = from === "login" ? "Diagnostic lancé depuis la page de connexion" : "Diagnostic technique iNrCy";

  return (
    <main className={styles.pageShell}>
      <div className={styles.orbOne} />
      <div className={styles.orbTwo} />
      <section className={styles.heroCard}>
        <div className={styles.topPill}>iNrCy · Assistance connexion</div>
        <div className={styles.heroGrid}>
          <div>
            <h1>Diagnostic de connexion</h1>
            <p>{pageSubtitle}. La page teste uniquement le navigateur, les cookies, le stockage local et l’accès au domaine iNrCy.</p>
          </div>
          <div className={styles.summaryCard} data-severity={summary.includes("bloqué") ? "error" : summary.includes("vérifier") ? "warn" : "ok"}>
            <span>Résumé</span>
            <strong>{summary}</strong>
            {finishedAt ? <small>Terminé à {finishedAt}</small> : <small>Analyse en cours…</small>}
          </div>
        </div>

        <div className={styles.actionsRow}>
          <button type="button" className={styles.primaryButton} onClick={() => void runDiagnostic()} disabled={running}>
            {running ? "Diagnostic en cours…" : "Relancer le diagnostic"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={copyReport}>
            {copied ? "Rapport copié" : "Copier le rapport"}
          </button>
        </div>
      </section>

      <section className={styles.checkGrid}>
        {checks.map((check) => (
          <article key={check.id} className={styles.checkCard} data-severity={check.severity}>
            <div className={styles.checkHeader}>
              <div>
                <h2>{check.title}</h2>
                <p>{check.description}</p>
              </div>
              <span>{statusLabel(check.severity)}</span>
            </div>
            <div className={styles.checkMeta}>{check.target}</div>
            {check.detail ? <div className={styles.checkDetail}>{check.detail}</div> : null}
          </article>
        ))}
      </section>

      <section className={styles.sendCard}>
        <div>
          <div className={styles.sectionPill}>Envoi à iNrCy</div>
          <h2>Le bilan est transmis à contact@inrcy.com</h2>
          <p>
            Depuis la page de connexion, l’envoi se lance automatiquement. Vous pouvez ajouter vos informations puis renvoyer le rapport si besoin.
          </p>
        </div>

        <div className={styles.formGrid}>
          <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nom du client" />
          <input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Société" />
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Téléphone" />
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message rapide ou contexte du blocage" rows={3} />
        </div>

        <div className={styles.actionsRow}>
          <button type="button" className={styles.primaryButton} onClick={() => void sendReport(false)} disabled={sendState === "sending" || running}>
            {sendState === "sending" ? "Envoi en cours…" : "Envoyer à iNrCy"}
          </button>
          <a className={styles.backLink} href="/login">Retour connexion</a>
        </div>

        {sendMessage ? <div className={styles.sendStatus} data-state={sendState}>{sendMessage}</div> : null}
      </section>
    </main>
  );
}
