import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractInrBadgeUserIdFromSlug } from "@/lib/inrBadge";
import { normalizeInrBadgeShareSettings, resolveInrBadgeAppointmentSettings } from "@/lib/inrBadgeSettings";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";
import RdvBookingClient from "./RdvBookingClient";

export const dynamic = "force-dynamic";

function getBadgeManifestUrl(slug: string) {
  return `/badge/${encodeURIComponent(slug)}/manifest.webmanifest`;
}

function getBadgeIconUrl(slug: string) {
  return `/badge/${encodeURIComponent(slug)}/icon.png`;
}

function trim(value: unknown) {
  return String(value || "").trim();
}

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isRejectedAgendaEvent(event: Record<string, unknown>) {
  const meta = safeObj(event.meta);
  return String(meta.status || "").toLowerCase() === "rejected";
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> | { slug: string } }): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = trim(resolvedParams.slug);
  const iconUrl = getBadgeIconUrl(slug);
  return {
    title: "Prendre RDV - iNr'Badge",
    manifest: getBadgeManifestUrl(slug),
    icons: {
      icon: iconUrl,
      shortcut: iconUrl,
      apple: iconUrl,
    },
  };
}

export default async function InrBadgeRdvPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const resolvedParams = await params;
  const slug = trim(resolvedParams.slug);
  const userId = extractInrBadgeUserIdFromSlug(slug);
  if (!userId) notFound();

  const [profileRes, toolsRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("user_id,logo_url,logo_path,company_legal_name,first_name,last_name,contact_email,phone")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("pro_tools_configs")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) notFound();

  const rootSettings = safeObj((toolsRes.data as { settings?: unknown } | null)?.settings);
  const shareSettings = normalizeInrBadgeShareSettings(rootSettings.inrBadgeShareSettings);
  const appointmentSettings = resolveInrBadgeAppointmentSettings(rootSettings);
  if (!shareSettings.appointment) notFound();

  const profile = profileRes.data as Record<string, unknown>;
  const logo = await resolveProfileLogoUrl(supabaseAdmin, {
    logo_path: trim(profile.logo_path) || null,
    logo_url: trim(profile.logo_url) || null,
  });

  const now = new Date();
  const rangeEnd = new Date(now.getTime() + (appointmentSettings.daysAhead + 2) * 24 * 60 * 60 * 1000);
  const { data: events } = await supabaseAdmin
    .from("agenda_events")
    .select("id,title,start_at,end_at,all_day,meta")
    .eq("user_id", userId)
    .lt("start_at", rangeEnd.toISOString())
    .gt("end_at", now.toISOString())
    .order("start_at", { ascending: true })
    .limit(500);

  const firstName = trim(profile.first_name);
  const lastName = trim(profile.last_name);
  const displayName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <RdvBookingClient
      slug={slug}
      company={trim(profile.company_legal_name) || "Entreprise iNrCy"}
      displayName={displayName}
      logoUrl={logo.logoUrl || ""}
      settings={appointmentSettings}
      events={(events || []).filter((event: Record<string, unknown>) => !isRejectedAgendaEvent(event)).map((event: Record<string, unknown>) => ({
        id: String(event.id || ""),
        start: String(event.start_at || ""),
        end: String(event.end_at || ""),
      }))}
    />
  );
}
