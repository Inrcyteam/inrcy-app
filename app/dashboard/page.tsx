"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

type UserInfo = { email?: string | null };

type ToolSeed = {
  key: string;
  label: string;
  desc: string;
  href?: string;
  icon: string; // unicode safe
  color: string;
};

type NodeSim = ToolSeed & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function dist(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
function initialPoints(n: number, cx: number, cy: number, radius: number) {
  return Array.from({ length: n }).map((_, i) => {
    const a = (i / n) * Math.PI * 2 + rand(-0.35, 0.35);
    const r = radius * rand(0.92, 1.08);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const nodeElsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const nodesRef = useRef<NodeSim[]>([]);
  const [readyNodes, setReadyNodes] = useState<NodeSim[]>([]);

  // ✅ 9 bulles (UNICODE ESCAPES => pas de souci d'encodage)
  const seed: ToolSeed[] = useMemo(
    () => [
      { key: "facebook", label: "Facebook", desc: "Meta Pages", icon: "\u{1F4D8}", color: "#3b82f6", href: "/dashboard/facebook" }, // 📘
      { key: "site-inrcy", label: "Site iNrCy", desc: "Pages + tracking", icon: "\u{1F9E9}", color: "#a855f7", href: "/dashboard/site" }, // 🧩
      { key: "gmb", label: "GMB", desc: "Business Profile", icon: "\u{1F4CD}", color: "#22c55e", href: "/dashboard/gmb" }, // 📍
      { key: "mails", label: "Mails", desc: "Inbox & relances", icon: "\u2709\uFE0F", color: "#f97316", href: "/dashboard/messages" }, // ✉️
      { key: "publier", label: "Publier", desc: "Posts multi-canaux", icon: "\u{1F6F0}\uFE0F", color: "#06b6d4", href: "/dashboard/publish" }, // 🛰️
      { key: "houzz", label: "Houzz", desc: "Profil & posts", icon: "\u{1F3E0}", color: "#10b981" }, // 🏠
      { key: "site-web", label: "Site web", desc: "Votre site client", icon: "\u{1F310}", color: "#eab308" }, // 🌐
      { key: "stats", label: "Stats", desc: "Clics, appels, leads", icon: "\u{1F4C8}", color: "#ef4444", href: "/dashboard/stats" }, // 📈
      { key: "annuaire", label: "Annuaire", desc: "Citations / NAP", icon: "\u{1F4D2}", color: "#8b5cf6" }, // 📒
    ],
    []
  );

  // auth
  useEffect(() => {
    let ignore = false;

    async function boot() {
      const { data, error } = await supabase.auth.getUser();
      if (!data?.user || error) {
        router.replace("/login");
        return;
      }
      if (!ignore) {
        setUser({ email: data.user.email });
        setLoading(false);
      }
    }

    boot();
    return () => {
      ignore = true;
    };
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function onToolClick(t: NodeSim) {
    if (t.href) return router.push(t.href);
    alert(`Bientôt : ${t.label}`);
  }

  // ✅ INIT : on force une taille réelle => bulles ne peuvent plus être vides
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    let stopped = false;

    const setup = () => {
      if (stopped) return;

      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // le container a une height inline => ça devrait être OK
      if (w < 200 || h < 200) {
        raf = requestAnimationFrame(setup);
        return;
      }

      const cx = w / 2;
      const cy = h / 2;

      // tailles (plus d’espace entre bulles)
      const bubble = Math.round(clamp(w * 0.18, 130, 170));
      const minGap = 36;
      const minDist = bubble + minGap;

      const radius = Math.min(w, h) * 0.42;

      const pts = initialPoints(seed.length, cx, cy, radius);

      const nodes: NodeSim[] = [];
      const boundsPad = bubble * 0.65;

      for (let i = 0; i < seed.length; i++) {
        const s = seed[i];
        let x = pts[i].x + rand(-40, 40);
        let y = pts[i].y + rand(-40, 40);

        let tries = 0;
        while (tries < 500) {
          let ok = true;
          for (const n of nodes) {
            if (dist(x, y, n.x, n.y) < minDist) {
              ok = false;
              break;
            }
          }
          if (ok) break;

          const a = rand(0, Math.PI * 2);
          const r = radius * rand(0.95, 1.10);
          x = cx + Math.cos(a) * r;
          y = cy + Math.sin(a) * r;
          tries++;
        }

        x = clamp(x, boundsPad, w - boundsPad);
        y = clamp(y, boundsPad, h - boundsPad);

        nodes.push({
          ...s,
          x,
          y,
          vx: rand(-0.3, 0.3),
          vy: rand(-0.3, 0.3),
          ax: x,
          ay: y,
        });
      }

      nodesRef.current = nodes;
      setReadyNodes(nodes);
    };

    raf = requestAnimationFrame(setup);

    const ro = new ResizeObserver(() => {
      // on réinitialise propre en cas de resize
      setReadyNodes([]);
      raf = requestAnimationFrame(setup);
    });
    ro.observe(el);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [seed]);

  // SIM + collisions + lignes (core -> bulles)
  useEffect(() => {
    const container = containerRef.current;
    const core = coreRef.current;
    const svg = svgRef.current;
    if (!container || !core || !svg) return;
    if (!readyNodes.length) return;

    let raf = 0;

    // reset svg
    svg.innerHTML = "";
    const lines = readyNodes.map(() => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", "rgba(15,23,42,0.18)");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
      return line;
    });

    const tick = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const bubble = Math.round(clamp(w * 0.18, 130, 170));
      const radius = bubble * 0.5;
      const minGap = 36;
      const minDist = bubble + minGap;

      const pad = radius + 14;

      const coreRect = core.getBoundingClientRect();
      const cx = coreRect.left - rect.left + coreRect.width / 2;
      const cy = coreRect.top - rect.top + coreRect.height / 2;
      const coreR = Math.max(coreRect.width, coreRect.height) * 0.58;

      const nodes = nodesRef.current;

      // forces
      for (const n of nodes) {
        // drift aléatoire doux
        n.vx += rand(-0.08, 0.08);
        n.vy += rand(-0.08, 0.08);

        // retour vers ancre douce
        n.vx += (n.ax - n.x) * 0.0011;
        n.vy += (n.ay - n.y) * 0.0011;

        // repousse du noyau (elles passent derrière mais jamais dessus)
        const dC = dist(n.x, n.y, cx, cy);
        const push = coreR + radius + 55;
        if (dC < push) {
          const dx = n.x - cx;
          const dy = n.y - cy;
          const inv = 1 / Math.max(dC, 0.001);
          const strength = (push - dC) * 0.011;
          n.vx += dx * inv * strength;
          n.vy += dy * inv * strength;
        }

        // friction
        n.vx *= 0.93;
        n.vy *= 0.93;
      }

      // collisions bulles (anti-chevauchement)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = dist(a.x, a.y, b.x, b.y);
          if (d < minDist) {
            const overlap = (minDist - d) * 0.55;
            const dx = (a.x - b.x) / Math.max(d, 0.001);
            const dy = (a.y - b.y) / Math.max(d, 0.001);

            a.x += dx * overlap;
            a.y += dy * overlap;
            b.x -= dx * overlap;
            b.y -= dy * overlap;

            a.vx += dx * overlap * 0.02;
            a.vy += dy * overlap * 0.02;
            b.vx -= dx * overlap * 0.02;
            b.vy -= dy * overlap * 0.02;
          }
        }
      }

      // integrate + bounds + apply
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;

        if (n.x < pad) { n.x = pad; n.vx *= -0.7; }
        if (n.x > w - pad) { n.x = w - pad; n.vx *= -0.7; }
        if (n.y < pad) { n.y = pad; n.vy *= -0.7; }
        if (n.y > h - pad) { n.y = h - pad; n.vy *= -0.7; }

        const elNode = nodeElsRef.current[n.key];
        if (elNode) {
          elNode.style.left = `${n.x}px`;
          elNode.style.top = `${n.y}px`;
        }
      }

      // lines core -> nodes (synergie)
      nodes.forEach((n, i) => {
        const elNode = nodeElsRef.current[n.key];
        const line = lines[i];
        if (!elNode || !line) return;

        const r = elNode.getBoundingClientRect();
        const ex = r.left - rect.left + r.width / 2;
        const ey = r.top - rect.top + r.height / 2;

        line.setAttribute("x1", `${cx}`);
        line.setAttribute("y1", `${cy}`);
        line.setAttribute("x2", `${ex}`);
        line.setAttribute("y2", `${ey}`);

        const d = dist(ex, ey, cx, cy);
        const op = clamp(0.26 - d / 1800, 0.10, 0.22);
        line.setAttribute("stroke", `rgba(15,23,42,${op})`);
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [readyNodes]);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center inrcy-soft-noise">
        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 shadow-2xl px-8 py-6">
          <div className="text-sm text-slate-600">Chargement de l’espace client…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen inrcy-soft-noise relative overflow-hidden">
      <header className="relative z-10 max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo-inrcy.png" alt="iNrCy" width={42} height={42} priority />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">Espace Client</div>
            <div className="text-xs text-slate-600">{user?.email}</div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-xl bg-white/70 hover:bg-white/85 border border-white/70 shadow-sm backdrop-blur text-sm text-slate-800"
        >
          Se déconnecter
        </button>
      </header>

      <section className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-3xl bg-white/60 backdrop-blur-xl border border-white/60 shadow-2xl p-6 md:p-8">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Dashboard iNrCy</h1>
            <p className="mt-2 text-slate-700 text-sm">
              Centre = Générateur iNrCy. Autour = bulles en mouvement (synergie).
            </p>
          </div>

          <div className="mt-8">
            {/* ✅ taille FORCÉE inline => plus jamais 0px */}
            <div
              ref={containerRef}
              className="relative w-full mx-auto"
              style={{
                height: "min(72vh, 680px)",
                minHeight: "560px",
                isolation: "isolate",
              }}
            >
              {/* liens derrière les bulles */}
              <svg
                ref={svgRef}
                className="absolute inset-0"
                style={{ zIndex: 1, pointerEvents: "none" }}
                aria-hidden="true"
              />

              {/* bulles */}
              {readyNodes.map((n) => (
                <button
                  key={n.key}
                  ref={(el) => { nodeElsRef.current[n.key] = el; }}
                  type="button"
                  onClick={() => onToolClick(n)}
                  title={`${n.label} — ${n.desc}`}
                  className="absolute grid place-items-center text-center select-none"
                  style={{
                    left: `${n.x}px`,
                    top: `${n.y}px`,
                    transform: "translate(-50%, -50%)",
                    zIndex: 2,
                    width: "clamp(130px, 18vw, 170px)",
                    height: "clamp(130px, 18vw, 170px)",
                    borderRadius: "9999px",
                    border: "2px solid rgba(255,255,255,0.80)",
                    boxShadow: "0 20px 55px rgba(0,0,0,0.12)",
                    background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), ${n.color} 58%)`,
                    padding: "12px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    className="grid place-items-center"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9999,
                      background: "rgba(255,255,255,0.65)",
                      boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
                      marginBottom: 8,
                      fontSize: 18,
                    }}
                    aria-hidden="true"
                  >
                    {n.icon}
                  </div>

                  <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.1, color: "rgba(15,23,42,0.92)" }}>
                    {n.label}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.2, color: "rgba(15,23,42,0.70)" }}>
                    {n.desc}
                  </div>
                </button>
              ))}

              {/* noyau AU-DESSUS (bulles passent derrière) */}
              <div
                ref={coreRef}
                className="absolute left-1/2 top-1/2 text-center"
                style={{
                  transform: "translate(-50%, -50%)",
                  zIndex: 5,
                  width: "min(300px, 92%)",
                  borderRadius: 22,
                  padding: "18px 16px",
                  background: "rgba(255,255,255,0.72)",
                  border: "1px solid rgba(255,255,255,0.85)",
                  backdropFilter: "blur(14px)",
                  boxShadow: "0 22px 80px rgba(15,23,42,0.18)",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "rgba(15,23,42,0.72)",
                    background: "rgba(15,23,42,0.06)",
                    border: "1px solid rgba(255,255,255,0.8)",
                    padding: "6px 10px",
                    borderRadius: 9999,
                  }}
                >
                  ⚙️ Générateur
                </div>

                <div style={{ marginTop: 10, fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", color: "rgba(15,23,42,0.92)" }}>
                  iNrCy
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "rgba(15,23,42,0.66)" }}>
                  Automatisation - SEO - Social - Tracking
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs text-slate-600">
              Astuce : clique sur une bulle. (On branchera chaque module ensuite.)
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

