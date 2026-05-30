import React, { useMemo, useState } from "react";
import styles from "./stats.module.css";
import { getSimpleFrenchErrorMessage } from "@/lib/userFacingErrors";
import { fmtInt, type CubeModel } from "./stats.shared";

function Donut({ segments }: { segments: Array<{ label: string; value: number; colorVar: string }> }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const bg = useMemo(() => {
    if (total <= 0) return "conic-gradient(rgba(255,255,255,.10) 0deg 360deg)";
    let cur = 0;
    const parts = segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const a0 = (cur / total) * 360;
        cur += s.value;
        const a1 = (cur / total) * 360;
        return `var(${s.colorVar}) ${a0.toFixed(2)}deg ${a1.toFixed(2)}deg`;
      });
    return `conic-gradient(${parts.join(", ")})`;
  }, [segments, total]);

  return (
    <div className={styles.donutWrap}>
      <div className={styles.donut} style={{ background: bg }} aria-hidden>
        <div className={styles.donutHole} />
      </div>
      <div className={styles.legend}>
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <div key={s.label} className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: `var(${s.colorVar})` }} aria-hidden />
              <span className={styles.legendLabel}>{s.label}</span>
              <span className={styles.legendVal}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RingScore({ value, tone }: { value: number; tone: "low" | "ok" | "solid" | "excellent" }) {
  const deg = Math.round(Math.max(0, Math.min(1, value / 100)) * 360);
  return (
    <div className={`${styles.ring} ${styles[`ring_${tone}`]}`} style={{ ["--deg" as any]: `${deg}deg` }}>
      <div className={styles.ringInner}>
        <div className={styles.ringValue}>{value}</div>
        <div className={styles.ringSub}>/100</div>
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`${styles.pill} ${ok ? styles.pillOn : styles.pillOff}`}>{label}</span>;
}


function MiniMetricGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  if (!items.length) {
    return <div className={styles.metricEmpty}>Données non exploitables pour le moment.</div>;
  }

  return (
    <div className={styles.metricMiniGrid}>
      {items.map((item) => (
        <div key={item.label} className={styles.metricMiniCard}>
          <span>{item.label}</span>
          <b>{item.value}</b>
        </div>
      ))}
    </div>
  );
}


function PlugIcon() {
  return (
    <svg className={styles.plugSvgIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3v5" />
      <path d="M15 3v5" />
      <path d="M8 8h8v4a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4V8Z" />
      <path d="M12 16v5" />
      <path d="M9.5 21h5" />
    </svg>
  );
}


export function SummaryBar({
  centralPotential30,
  summaryDisplayReady,
  centralByCube,
  summaryActionsOpen,
  onToggleActions,
  onScrollTo,
  summaryActionItems,
}: {
  centralPotential30: number;
  summaryDisplayReady: boolean;
  centralByCube: Record<import("./stats.shared").CubeKey, number>;
  summaryActionsOpen: boolean;
  onToggleActions: () => void;
  onScrollTo: (key: import("./stats.shared").CubeKey) => void;
  summaryActionItems: Array<{
    key: import("./stats.shared").CubeKey;
    opportunities: number;
    revenue: number;
    label: string;
    kicker: string;
    motive: string;
    badge: string;
  }>;
}) {
  return (
    <div className={styles.summaryBar} aria-label="Récapitulatif iNrStats">
      <div className={styles.summaryMain}>
        <span
          className={styles.summaryValueBubble}
          aria-label={summaryDisplayReady
            ? `+${fmtInt(centralPotential30)} opportunités à activer pour générer + de clients et + de CA potentiel`
            : "Opportunités en cours de chargement"}
        >
          <span className={styles.summaryValue}>{summaryDisplayReady ? `+${fmtInt(centralPotential30)}` : "—"}</span>
        </span>
        <span className={styles.summaryLabel}>opportunités à activer pour générer + de clients et + de CA potentiel</span>
        <span className={styles.summarySub}>projection sur 30 jours si actions menées</span>
      </div>
      <div className={styles.summaryModules}>
        <button type="button" className={styles.summaryItem} onClick={() => onScrollTo("site_inrcy")}>
          <span>Site iNrCy</span>
          <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.site_inrcy)}` : "—"}</b>
        </button>
        <button type="button" className={styles.summaryItem} onClick={() => onScrollTo("site_web")}>
          <span>Site Web</span>
          <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.site_web)}` : "—"}</b>
        </button>
        <button type="button" className={styles.summaryItem} onClick={() => onScrollTo("gmb")}>
          <span>Google Business</span>
          <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.gmb)}` : "—"}</b>
        </button>
        <button type="button" className={styles.summaryItem} onClick={() => onScrollTo("facebook")}>
          <span>Facebook</span>
          <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.facebook)}` : "—"}</b>
        </button>
        <button type="button" className={styles.summaryItem} onClick={() => onScrollTo("instagram")}>
          <span>Instagram</span>
          <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.instagram)}` : "—"}</b>
        </button>
        <button type="button" className={styles.summaryItem} onClick={() => onScrollTo("linkedin")}>
          <span>LinkedIn</span>
          <b>{summaryDisplayReady ? `+${fmtInt(centralByCube.linkedin)}` : "—"}</b>
        </button>
      </div>
      <div className={styles.summaryActionsWrap}>
        <button
          type="button"
          className={styles.summaryActionsToggle}
          onClick={onToggleActions}
          aria-expanded={summaryActionsOpen}
        >
          {summaryActionsOpen ? "Masquer les actions" : "Voir les actions"}
        </button>

        {summaryActionsOpen ? (
          <div className={styles.summaryActionsPanel}>
            {summaryActionItems.map((item) => (
              <div key={item.key} className={styles.summaryActionItem}>
                <div className={styles.summaryActionTopRow}>
                  <div className={styles.summaryActionLeft}>
                    <div className={styles.summaryActionBadge}>{item.badge}</div>
                    <div className={styles.summaryActionTitleBlock}>
                      <div className={styles.summaryActionTitleRow}>
                        <span className={styles.summaryActionTitle}>{item.label}</span>
                        {item.opportunities > 0 ? (
                          <span className={styles.summaryActionOpp}>{fmtInt(item.opportunities)} opportunités à capter</span>
                        ) : (
                          <span className={styles.summaryActionOpp}>potentiel non exploité</span>
                        )}
                      </div>
                      <div className={styles.summaryActionKicker}>{item.kicker}</div>
                    </div>
                  </div>
                  {item.opportunities > 0 ? (
                    <div className={styles.summaryActionRevenueBubble}>+{fmtInt(item.revenue)} €</div>
                  ) : (
                    <div className={styles.summaryActionRevenueGhost}>À activer</div>
                  )}
                </div>
                <div className={styles.summaryActionMeta}>{item.motive}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getForcedCubeContextLabel(key: CubeModel["key"]) {
  switch (key) {
    case "site_inrcy":
    case "site_web":
      return "URL associée";
    case "gmb":
      return "Fiche Google";
    case "facebook":
      return "Page Facebook";
    case "instagram":
      return "Compte Instagram";
    case "linkedin":
      return "Compte LinkedIn";
    default:
      return "Canal associé";
  }
}

export function Cube({
  model,
  onNavigate,
  forceOpen = false,
  hideDetailsToggle = false,
  estimatedRevenue = 0,
}: {
  model: CubeModel;
  onNavigate: (href: string) => void;
  forceOpen?: boolean;
  hideDetailsToggle?: boolean;
  estimatedRevenue?: number;
}) {
  const [open, setOpen] = useState(false);
  const detailsOpen = forceOpen || open;
  const isSite = model.key === "site_inrcy" || model.key === "site_web";

  const action = (model as any).action ?? ({ key: "connect", title: "Connexion", detail: "", href: "#", pill: "Connexion" } as const);
  const pill = (action as any)?.pill ?? "Connexion";
  const pillKey = String(pill).toLowerCase();

  const connectionOk = isSite
    ? !!model.connections.ga4 || !!model.connections.gsc
    : !!model.connections.main;
  const headerTitle = hideDetailsToggle ? getForcedCubeContextLabel(model.key) : model.title;

  return (
    <section className={`${styles.cube} ${connectionOk ? styles.cubeOn : styles.cubeOff}`} aria-label={model.title}>
      <div className={`${styles.cubeTop} ${hideDetailsToggle ? styles.cubeTopCompact : ""}`}>
        <div className={hideDetailsToggle ? styles.cubeHeaderInline : undefined}>
          {hideDetailsToggle ? (
            <>
              <div className={styles.cubeTitleInlineGroup}>
                <h2 className={styles.cubeTitle}>{`${headerTitle} :`}</h2>
                {model.loading ? <span className={styles.spinner} aria-hidden /> : null}
              </div>
              {model.accountLabel ? <div className={styles.cubeIdentityInline}>{model.accountLabel}</div> : null}
            </>
          ) : (
            <>
              <div className={styles.cubeTitleRow}>
                <h2 className={styles.cubeTitle}>{headerTitle}</h2>
                {model.loading ? <span className={styles.spinner} aria-hidden /> : null}
              </div>
              {model.accountLabel ? <div className={styles.cubeIdentity}>{model.accountLabel}</div> : null}
              <div className={styles.cubeSub}>{model.subtitle}</div>
            </>
          )}
        </div>

        <div className={styles.cubeBadges}>
          <div className={styles.pills}>
            {isSite ? (
              <>
                <StatusPill ok={!!model.connections.ga4} label="GA4" />
                <StatusPill ok={!!model.connections.gsc} label="GSC" />
              </>
            ) : (
              <StatusPill ok={!!model.connections.main} label={model.connections.main ? "Connecté" : "Déconnecté"} />
            )}
          </div>
          {!hideDetailsToggle ? (
            <button
              type="button"
              className={styles.detailsBtn}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={detailsOpen}
            >
              {detailsOpen ? "Masquer les détails" : "Voir les détails"}
            </button>
          ) : null}
        </div>
      </div>

      {model.error ? <div className={styles.error}>{getSimpleFrenchErrorMessage(model.error, "Impossible de charger les statistiques pour le moment.")}</div> : null}

      {hideDetailsToggle ? (
        <div className={styles.mobileChannelHero}>
          <div className={styles.mobileChannelEyebrow}>Canal actif</div>
          <h2 className={styles.mobileChannelTitle}>{model.title}</h2>
          <p className={styles.mobileChannelSub}>{model.subtitle}</p>

          {model.accountLabel ? (
            <div className={styles.mobileChannelLink}>{model.accountLabel}</div>
          ) : null}

          <div className={styles.mobileChannelPills}>
            {isSite ? (
              <>
                <StatusPill ok={!!model.connections.ga4} label="GA4" />
                <StatusPill ok={!!model.connections.gsc} label="GSC" />
              </>
            ) : (
              <StatusPill ok={!!model.connections.main} label={model.connections.main ? "Connecté" : "Déconnecté"} />
            )}
          </div>

          <div className={styles.mobileChannelMetricGrid}>
            <div>
              <span>Opportunités</span>
              <b>+{fmtInt(model.opportunity30)}</b>
            </div>
            <div>
              <span>CA potentiel</span>
              <b>+{fmtInt(estimatedRevenue)} €</b>
            </div>
            <div>
              <span>Demandes captées 7j</span>
              <b>{model.capturedLeadsUnavailable ? "—" : fmtInt(model.capturedLeads.week)}</b>
            </div>
            <div>
              <span>Demandes captées 30j</span>
              <b>{model.capturedLeadsUnavailable ? "—" : fmtInt(model.capturedLeads.month)}</b>
            </div>
          </div>
        </div>
      ) : null}

      {!hideDetailsToggle ? (
        <div className={styles.actionCompact}>
          <div className={styles.actionLeft}>
            <div className={styles.actionTopRow}>
              <span className={`${styles.actionPill} ${styles[`action_${pillKey}`]}`}>{pill}</span>

              {pill === "Connexion" ? (
                <div className={styles.actionTopText}>
                  <span className={styles.actionTitle}>{action.title}</span>
                </div>
              ) : null}

              {action.effort ? (
                <span className={`${styles.effort} ${styles[`effort_${action.effort.level}`]}`}>{action.effort.label}</span>
              ) : null}
            </div>

            <div className={styles.actionDetail}>{action.detail}</div>
          </div>

          <button
            className={`${styles.actionBtn} ${connectionOk ? styles.actionBtnOn : styles.actionBtnOff}`}
            onClick={() => (action.href ? onNavigate(action.href) : undefined)}
            disabled={model.loading || !action.href}
            aria-disabled={model.loading || !action.href}
          >
            <span className={styles.actionBtnDesktop}>{connectionOk ? "GO ⚡" : <>GO <PlugIcon /></>}</span>
            <span className={styles.actionBtnMobile}>{connectionOk ? "GO ⚡" : <>GO <PlugIcon /></>}</span>
          </button>
        </div>
      ) : null}

      {detailsOpen ? (
        <div className={styles.cubeBody}>
          <div className={styles.detailTopRow}>
            <div className={`${styles.block} ${styles.metricOverviewBlock}`}>
              <div className={styles.blockTitle}>Visibilité du canal</div>
              <MiniMetricGrid items={model.visibilityStats} />
            </div>

            <div className={`${styles.block} ${styles.provenanceCompactBlock}`}>
              <div className={styles.blockTitle}>Provenance</div>
              <Donut segments={model.provenance} />
              {model.provenanceHint ? <div className={styles.provenanceHint}>{model.provenanceHint}</div> : null}
            </div>
          </div>

          <div className={styles.blockRow}>
            <div className={styles.block}>
              <div className={styles.blockTitle}>Qualité</div>
              <div className={styles.qualityRow}>
                <RingScore value={model.qualityScore} tone={model.qualityTone} />
                <div>
                  <div className={styles.qualityLabel}>{model.qualityLabel}</div>
                  <div className={styles.qualitySub}>Structure & exploitabilité</div>
                </div>
              </div>
            </div>

            <div className={`${styles.block} ${styles.metricOverviewBlock}`}>
              <div className={styles.blockTitle}>Actions utiles</div>
              <MiniMetricGrid items={model.actionStats} />
            </div>
          </div>

          <div className={`${styles.block} ${hideDetailsToggle ? styles.lectureBusinessActionBlock : ""}`}>
            <div className={styles.lectureBusinessContent}>
              <div className={styles.blockTitle}>Lecture business</div>
              <ul className={styles.bullets}>
                {model.insights.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>

            {hideDetailsToggle ? (
              <div className={styles.channelInlineActionStack}>
                <div className={styles.channelInlineAction}>
                  <div className={styles.channelInlineActionLabel}>Action recommandée</div>
                  <div className={styles.channelInlineActionTop}>
                    <span className={`${styles.actionPill} ${styles[`action_${pillKey}`]}`}>{pill}</span>
                    {action.effort ? (
                      <span className={`${styles.effort} ${styles[`effort_${action.effort.level}`]}`}>{action.effort.label}</span>
                    ) : null}
                  </div>
                </div>

                <button
                  className={`${styles.actionBtn} ${styles.channelInlineGoButton} ${connectionOk ? styles.actionBtnOn : styles.actionBtnOff}`}
                  onClick={() => (action.href ? onNavigate(action.href) : undefined)}
                  disabled={model.loading || !action.href}
                  aria-disabled={model.loading || !action.href}
                >
                  <span className={styles.actionBtnDesktop}>{connectionOk ? "GO ⚡" : <>GO <PlugIcon /></>}</span>
                  <span className={styles.actionBtnMobile}>{connectionOk ? "GO ⚡" : <>GO <PlugIcon /></>}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
