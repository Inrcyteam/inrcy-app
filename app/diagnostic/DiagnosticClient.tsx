"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type ServerCheck = {
  key: string;
  label: string;
  status: "ok" | "http" | "fail" | "skipped";
  httpStatus?: number;
  durationMs?: number;
  message: string;
};

type ServerPayload = {
  ok?: boolean;
  warning?: boolean;
  timestamp?: string;
  supabaseHost?: string | null;
  checks?: ServerCheck[];
};

type LaunchContext = {
  from: "login" | "unknown";
  reason: "network" | "technical" | "unknown";
  label: string;
  detail: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const TEST_TIMEOUT_MS = 8000;

function nowIso() {
  return new Date().toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function getLaunchContextFromUrl(): LaunchContext | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  const reason = params.get("reason");

  if (from !== "login") return null;

  if (reason === "network") {
    return {
      from: "login",
      reason: "network",
      label: "Diagnostic lancé depuis la page de connexion",
      detail:
        "Le client a cliqué sur « Diagnostiquer l’erreur » après un message indiquant que le serveur iNrCy était inaccessible.",
    };
  }

  return {
    from: "login",
    reason: reason === "technical" ? "technical" : "unknown",
    label: "Diagnostic lancé depuis la page de connexion",
    detail:
      "Le client a cliqué sur « Diagnostiquer l’erreur » après une erreur technique au moment de la connexion.",
  };
}

function getSupabaseOrigin(): string | null {
  if (!SUPABASE_URL) return null;

  try {
    return new URL(SUPABASE_URL).origin;
  } catch {
    return null;
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

    return {
      response,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function supabaseHeaders(): HeadersInit {
  return SUPABASE_ANON_KEY
    ? {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      }
    : {};
}

function checkFromHttp(
  id: string,
  title: string,
  description: string,
  target: string,
  response: Response,
  durationMs: number,
  options?: { acceptHttpErrorAsReachable?: boolean }
): DiagnosticCheck {
  if (response.ok) {
    return {
      id,
      title,
      description,
      target,
      severity: "ok",
      statusText: "OK",
      detail: `Réponse HTTP ${response.status} reçue en ${durationMs} ms.`,
      durationMs,
      httpStatus: response.status,
    };
  }

  return {
    id,
    title,
    description,
    target,
    severity: options?.acceptHttpErrorAsReachable ? "warn" : "error",
    statusText: options?.acceptHttpErrorAsReachable ? "Joignable" : "Erreur HTTP",
    detail: options?.acceptHttpErrorAsReachable
      ? `Réponse HTTP ${response.status} reçue en ${durationMs} ms. Le domaine répond, même si l'endpoint refuse la requête.`
      : `Réponse HTTP ${response.status} reçue en ${durationMs} ms.`,
    durationMs,
    httpStatus: response.status,
  };
}

function checkFromError(
  id: string,
  title: string,
  description: string,
  target: string,
  error: unknown
): DiagnosticCheck {
  return {
    id,
    title,
    description,
    target,
    severity: "error",
    statusText: "Bloqué / inaccessible",
    detail: getErrorMessage(error),
  };
}

function serverSeverity(status: ServerCheck["status"]): Severity {
  if (status === "ok") return "ok";
  if (status === "http" || status === "skipped") return "warn";
  return "error";
}

function serverStatusText(status: ServerCheck["status"]): string {
  if (status === "ok") return "OK";
  if (status === "http") return "Joignable";
  if (status === "skipped") return "Ignoré";
  return "Erreur";
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

function buildInitialChecks(): DiagnosticCheck[] {
  return [
    {
      id: "browser",
      title: "Navigateur",
      description: "Vérifie les informations de base du navigateur et la connexion déclarée.",
      target: "Navigateur client",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "storage-local",
      title: "Stockage navigateur",
      description: "Vérifie que localStorage fonctionne pour conserver la session et les préférences.",
      target: "localStorage",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "cookies",
      title: "Cookies navigateur",
      description: "Vérifie que les cookies first-party peuvent être écrits et relus.",
      target: "Cookies iNrCy",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "api-ping",
      title: "API iNrCy",
      description: "Vérifie que le PC peut appeler une route API sur le domaine app.inrcy.com.",
      target: "/api/network/diagnostic/ping",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "server-supabase",
      title: "Supabase depuis iNrCy",
      description: "Vérifie côté serveur Vercel que Supabase répond bien à l'application.",
      target: "/api/network/diagnostic/server",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "supabase-direct-auth",
      title: "Supabase direct depuis le PC",
      description: "Vérifie si le réseau professionnel laisse le navigateur joindre Supabase directement.",
      target: "Supabase Auth direct",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "supabase-proxy-auth",
      title: "Supabase via iNrCy",
      description: "Vérifie la couche compatibilité réseau pro ajoutée côté app.inrcy.com.",
      target: "/api/network/supabase-proxy/auth/v1/health",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "storage-direct",
      title: "Storage direct depuis le PC",
      description: "Vérifie si le réseau autorise les appels navigateur vers le stockage Supabase.",
      target: "Supabase Storage direct",
      severity: "pending",
      statusText: "En attente",
    },
    {
      id: "storage-proxy",
      title: "Storage via iNrCy",
      description: "Vérifie si les petites opérations Storage peuvent passer par le domaine iNrCy.",
      target: "/api/network/supabase-proxy/storage/v1/bucket",
      severity: "pending",
      statusText: "En attente",
    },
  ];
}

export default function DiagnosticClient() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>(() => buildInitialChecks());
  const [startedAt, setStartedAt] = useState<string>("");
  const [finished, setFinished] = useState(false);
  const [serverDetails, setServerDetails] = useState<ServerPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [clientName, setClientName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">("idle");
  const [sendStatusText, setSendStatusText] = useState("");
  const [launchContext, setLaunchContext] = useState<LaunchContext | null>(null);

  const updateCheck = useCallback((id: string, patch: Partial<DiagnosticCheck>) => {
    setChecks((current) => current.map((check) => (check.id === id ? { ...check, ...patch } : check)));
  }, []);

  useEffect(() => {
    setLaunchContext(getLaunchContextFromUrl());
  }, []);

  const runLocalTests = useCallback(() => {
    const connection = navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number };
    };

    updateCheck("browser", {
      severity: navigator.onLine ? "ok" : "warn",
      statusText: navigator.onLine ? "En ligne" : "Hors ligne déclaré",
      detail: [
        `Navigateur : ${navigator.userAgent}`,
        connection.connection?.effectiveType ? `Connexion : ${connection.connection.effectiveType}` : null,
        typeof connection.connection?.rtt === "number" ? `RTT estimé : ${connection.connection.rtt} ms` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });

    try {
      const key = "inrcy_network_diag";
      window.localStorage.setItem(key, "ok");
      const value = window.localStorage.getItem(key);
      window.localStorage.removeItem(key);

      updateCheck("storage-local", {
        severity: value === "ok" ? "ok" : "error",
        statusText: value === "ok" ? "OK" : "Lecture impossible",
        detail: value === "ok" ? "localStorage fonctionne." : "La valeur écrite n'a pas pu être relue.",
      });
    } catch (error) {
      updateCheck("storage-local", {
        severity: "error",
        statusText: "Bloqué",
        detail: getErrorMessage(error),
      });
    }

    try {
      document.cookie = "inrcy_diag_cookie=ok; Max-Age=60; Path=/; SameSite=Lax";
      const ok = document.cookie.includes("inrcy_diag_cookie=ok");
      document.cookie = "inrcy_diag_cookie=; Max-Age=0; Path=/; SameSite=Lax";

      updateCheck("cookies", {
        severity: ok ? "ok" : "error",
        statusText: ok ? "OK" : "Bloqués",
        detail: ok
          ? "Les cookies first-party fonctionnent sur le domaine iNrCy."
          : "Le cookie de test n'a pas pu être relu.",
      });
    } catch (error) {
      updateCheck("cookies", {
        severity: "error",
        statusText: "Bloqués",
        detail: getErrorMessage(error),
      });
    }
  }, [updateCheck]);

  const runFetchTest = useCallback(
    async (
      id: string,
      title: string,
      description: string,
      target: string,
      url: string,
      init?: RequestInit,
      options?: { acceptHttpErrorAsReachable?: boolean; readServerPayload?: boolean }
    ) => {
      updateCheck(id, { severity: "running", statusText: "Test en cours", detail: undefined });

      try {
        const { response, durationMs } = await fetchWithTimeout(url, init);
        const result = checkFromHttp(id, title, description, target, response, durationMs, options);
        updateCheck(id, result);

        if (options?.readServerPayload) {
          try {
            const payload = (await response.json()) as ServerPayload;
            setServerDetails(payload);

            if (Array.isArray(payload.checks)) {
              const failed = payload.checks.filter((check) => check.status === "fail").length;
              const warnings = payload.checks.filter((check) => check.status === "http" || check.status === "skipped").length;

              updateCheck(id, {
                severity: failed > 0 ? "error" : warnings > 0 ? "warn" : "ok",
                statusText: failed > 0 ? "Erreur serveur" : warnings > 0 ? "Joignable" : "OK",
                detail: payload.checks
                  .map((check) => `${check.label} : ${serverStatusText(check.status)}${check.httpStatus ? ` (${check.httpStatus})` : ""}`)
                  .join(" · "),
              });
            }
          } catch {
            // La réponse HTTP suffit au diagnostic principal.
          }
        }
      } catch (error) {
        updateCheck(id, checkFromError(id, title, description, target, error));
      }
    },
    [updateCheck]
  );

  const runAllTests = useCallback(async () => {
    setChecks(buildInitialChecks());
    setServerDetails(null);
    setCopied(false);
    setSendStatus("idle");
    setSendStatusText("");
    setFinished(false);
    setStartedAt(nowIso());

    window.setTimeout(() => {
      runLocalTests();
    }, 0);

    const supabaseOrigin = getSupabaseOrigin();
    const headers = supabaseHeaders();

    const tests: Array<Promise<void>> = [
      runFetchTest(
        "api-ping",
        "API iNrCy",
        "Vérifie que le PC peut appeler une route API sur le domaine app.inrcy.com.",
        "/api/network/diagnostic/ping",
        "/api/network/diagnostic/ping"
      ),
      runFetchTest(
        "server-supabase",
        "Supabase depuis iNrCy",
        "Vérifie côté serveur Vercel que Supabase répond bien à l'application.",
        "/api/network/diagnostic/server",
        "/api/network/diagnostic/server",
        undefined,
        { readServerPayload: true }
      ),
    ];

    if (!supabaseOrigin || !SUPABASE_ANON_KEY) {
      updateCheck("supabase-direct-auth", {
        severity: "error",
        statusText: "Configuration absente",
        detail: "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY est absent côté navigateur.",
      });
      updateCheck("storage-direct", {
        severity: "error",
        statusText: "Configuration absente",
        detail: "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY est absent côté navigateur.",
      });
    } else {
      tests.push(
        runFetchTest(
          "supabase-direct-auth",
          "Supabase direct depuis le PC",
          "Vérifie si le réseau professionnel laisse le navigateur joindre Supabase directement.",
          `${supabaseOrigin}/auth/v1/health`,
          `${supabaseOrigin}/auth/v1/health`,
          { headers },
          { acceptHttpErrorAsReachable: true }
        )
      );

      tests.push(
        runFetchTest(
          "storage-direct",
          "Storage direct depuis le PC",
          "Vérifie si le réseau autorise les appels navigateur vers le stockage Supabase.",
          `${supabaseOrigin}/storage/v1/bucket`,
          `${supabaseOrigin}/storage/v1/bucket`,
          { headers },
          { acceptHttpErrorAsReachable: true }
        )
      );
    }

    tests.push(
      runFetchTest(
        "supabase-proxy-auth",
        "Supabase via iNrCy",
        "Vérifie la couche compatibilité réseau pro ajoutée côté app.inrcy.com.",
        "/api/network/supabase-proxy/auth/v1/health",
        "/api/network/supabase-proxy/auth/v1/health",
        undefined,
        { acceptHttpErrorAsReachable: true }
      )
    );

    tests.push(
      runFetchTest(
        "storage-proxy",
        "Storage via iNrCy",
        "Vérifie si les petites opérations Storage peuvent passer par le domaine iNrCy.",
        "/api/network/supabase-proxy/storage/v1/bucket",
        "/api/network/supabase-proxy/storage/v1/bucket",
        undefined,
        { acceptHttpErrorAsReachable: true }
      )
    );

    await Promise.allSettled(tests);
    setFinished(true);
  }, [runFetchTest, runLocalTests, updateCheck]);

  useEffect(() => {
    void runAllTests();
  }, [runAllTests]);

  const summary = useMemo(() => {
    const errors = checks.filter((check) => check.severity === "error");
    const warnings = checks.filter((check) => check.severity === "warn");
    const running = checks.filter((check) => check.severity === "running" || check.severity === "pending");
    const directSupabase = checks.find((check) => check.id === "supabase-direct-auth");
    const proxySupabase = checks.find((check) => check.id === "supabase-proxy-auth");
    const apiPing = checks.find((check) => check.id === "api-ping");

    if (running.length > 0 && !finished) {
      return {
        severity: "running" as Severity,
        title: "Diagnostic en cours",
        text: "Les tests réseau sont en cours. Attends quelques secondes puis envoie la capture complète.",
      };
    }

    if (apiPing?.severity === "error") {
      return {
        severity: "error" as Severity,
        title: "Le poste bloque même l'API iNrCy",
        text: "Le domaine app.inrcy.com ou les appels API HTTPS semblent filtrés. Il faudra demander à l'IT d'autoriser app.inrcy.com.",
      };
    }

    if (directSupabase?.severity === "error" && proxySupabase?.severity !== "error") {
      return {
        severity: "warn" as Severity,
        title: "Réseau pro détecté : Supabase direct semble bloqué",
        text: "La compatibilité iNrCy via app.inrcy.com répond. L'application a donc plus de chances de fonctionner après le correctif réseau pro.",
      };
    }

    if (errors.length === 0) {
      return {
        severity: warnings.length > 0 ? ("warn" as Severity) : ("ok" as Severity),
        title: warnings.length > 0 ? "Compatible, avec points à vérifier" : "Diagnostic OK",
        text:
          warnings.length > 0
            ? "Les domaines répondent, mais certains endpoints ont retourné un statut HTTP à vérifier. Ce n'est pas forcément bloquant."
            : "Le poste arrive à joindre iNrCy, Supabase et la couche compatibilité réseau.",
      };
    }

    return {
      severity: "error" as Severity,
      title: "Blocage réseau probable",
      text: "Un ou plusieurs appels réseau échouent. Envoie cette capture pour identifier précisément le domaine ou le service bloqué.",
    };
  }, [checks, finished]);

  const reportText = useMemo(() => {
    const lines = [
      "Diagnostic réseau iNrCy",
      `Date : ${startedAt || nowIso()}`,
      `URL : ${typeof window !== "undefined" ? window.location.href : "/diagnostic"}`,
      ...(launchContext
        ? [
            `Origine : ${launchContext.label}`,
            `Contexte : ${launchContext.detail}`,
            `Raison : ${launchContext.reason}`,
          ]
        : []),
      `Résumé : ${summary.title} — ${summary.text}`,
      "",
      ...checks.map((check) => {
        const parts = [
          `- ${check.title}`,
          `[${statusLabel(check.severity)}]`,
          check.httpStatus ? `HTTP ${check.httpStatus}` : null,
          check.durationMs ? `${check.durationMs} ms` : null,
          `cible: ${check.target}`,
          check.detail ? `détail: ${check.detail}` : null,
        ].filter(Boolean);
        return parts.join(" · ");
      }),
    ];

    if (serverDetails?.supabaseHost) {
      lines.push("", `Host Supabase : ${serverDetails.supabaseHost}`);
    }

    return lines.join("\n");
  }, [checks, launchContext, serverDetails?.supabaseHost, startedAt, summary.text, summary.title]);

  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [reportText]);

  const sendReport = useCallback(async () => {
    if (sendingReport) return;

    setSendingReport(true);
    setSendStatus("idle");
    setSendStatusText("");

    try {
      const response = await fetch("/api/network/diagnostic/send-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          report: reportText,
          summary: `${summary.title} — ${summary.text}`,
          clientName,
          company,
          phone,
          message,
          launchContext,
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSendStatus("success");
      setSendStatusText("Rapport envoyé à contact@inrcy.com.");
    } catch (error) {
      setSendStatus("error");
      setSendStatusText(
        `Envoi impossible depuis ce poste. Utilise Copier le rapport. ${getErrorMessage(error)}`
      );
    } finally {
      setSendingReport(false);
    }
  }, [clientName, company, launchContext, message, phone, reportText, sendingReport, summary.text, summary.title]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBadge}>iNrCy · Réseaux pros</div>
        <h1>Diagnostic réseau</h1>
        <p>
          Cette page vérifie si un PC professionnel sécurisé peut joindre l'application, les API iNrCy,
          Supabase et la couche de compatibilité réseau.
        </p>
        {launchContext ? (
          <div className={styles.contextNotice}>
            <strong>{launchContext.label}</strong>
            <span>{launchContext.detail}</span>
          </div>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={() => void runAllTests()}>
            Relancer le diagnostic
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => void copyReport()}>
            {copied ? "Rapport copié" : "Copier le rapport"}
          </button>
        </div>

        <div className={styles.reportPanel}>
          <div className={styles.reportPanelHeader}>
            <strong>Envoyer le rapport à iNrCy</strong>
            <span>Le rapport arrive directement sur contact@inrcy.com.</span>
          </div>
          <div className={styles.reportForm}>
            <input
              type="text"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Nom du client"
              autoComplete="name"
            />
            <input
              type="text"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Société"
              autoComplete="organization"
            />
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Téléphone"
              autoComplete="tel"
            />
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Message rapide, ex : PC AXA, impossible d'ouvrir l'app"
              rows={3}
            />
          </div>
          <div className={styles.reportActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void sendReport()}
              disabled={sendingReport}
            >
              {sendingReport ? "Envoi en cours..." : "Envoyer à iNrCy"}
            </button>
            {sendStatusText ? (
              <span className={`${styles.sendStatus} ${sendStatus === "success" ? styles.sendSuccess : styles.sendError}`}>
                {sendStatusText}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`${styles.summary} ${styles[summary.severity]}`}>
        <div>
          <span className={styles.summaryLabel}>Résultat</span>
          <h2>{summary.title}</h2>
          <p>{summary.text}</p>
        </div>
        <div className={styles.summaryMeta}>
          <span>{startedAt || "Démarrage..."}</span>
          <strong>{finished ? "Tests terminés" : "Tests en cours"}</strong>
        </div>
      </section>

      <section className={styles.grid}>
        {checks.map((check) => (
          <article key={check.id} className={`${styles.card} ${styles[check.severity]}`}>
            <div className={styles.cardTopline}>
              <span className={styles.statusDot} aria-hidden="true" />
              <span>{statusLabel(check.severity)}</span>
            </div>
            <h3>{check.title}</h3>
            <p>{check.description}</p>
            <dl>
              <div>
                <dt>Cible</dt>
                <dd>{check.target}</dd>
              </div>
              <div>
                <dt>Statut</dt>
                <dd>{check.statusText}</dd>
              </div>
              {check.httpStatus ? (
                <div>
                  <dt>HTTP</dt>
                  <dd>{check.httpStatus}</dd>
                </div>
              ) : null}
              {check.durationMs ? (
                <div>
                  <dt>Temps</dt>
                  <dd>{check.durationMs} ms</dd>
                </div>
              ) : null}
            </dl>
            {check.detail ? <div className={styles.detail}>{check.detail}</div> : null}
          </article>
        ))}
      </section>

      {serverDetails?.checks?.length ? (
        <section className={styles.serverBox}>
          <div>
            <span className={styles.summaryLabel}>Serveur iNrCy</span>
            <h2>Contrôles côté Vercel</h2>
            <p>
              Ces tests indiquent si le serveur iNrCy arrive lui-même à joindre Supabase. Ils ne
              modifient aucune donnée.
            </p>
          </div>
          <div className={styles.serverList}>
            {serverDetails.checks.map((check) => (
              <div key={check.key} className={`${styles.serverItem} ${styles[serverSeverity(check.status)]}`}>
                <strong>{check.label}</strong>
                <span>
                  {serverStatusText(check.status)}
                  {check.httpStatus ? ` · HTTP ${check.httpStatus}` : ""}
                  {check.durationMs ? ` · ${check.durationMs} ms` : ""}
                </span>
                <small>{check.message}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.footerNote}>
        <h2>À transmettre au service informatique si besoin</h2>
        <p>
          Autoriser le domaine <strong>app.inrcy.com</strong>, les appels HTTPS/API, les cookies
          first-party, le stockage navigateur, et si nécessaire le domaine Supabase affiché dans le rapport.
        </p>
      </section>
    </main>
  );
}
