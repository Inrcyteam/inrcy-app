// Lightweight placeholder renderer for iNrCy templates.
// Replaces {{key}} tokens with values derived from:
// - profiles
// - business_profiles
// - connected tools (Site iNrCy / site web / Facebook / Google Business)

export type TemplateContext = Record<string, string>;

export function renderWithContext(input: string, ctx: TemplateContext): string {
  if (!input) return "";
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = ctx[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

export function buildDefaultContext(args: {
  profile?: any;
  business?: any;
  links?: { site_url?: string; facebook_url?: string; gmb_url?: string; review_url?: string };
}): TemplateContext {
  const p = args.profile ?? {};
  const b = args.business ?? {};
  const links = args.links ?? {};

  const services = Array.isArray(b.services) ? b.services.filter(Boolean).join(", ") : "";
  const zones = Array.isArray(b.intervention_zones) ? b.intervention_zones.filter(Boolean).join(", ") : "";
  const strengths = Array.isArray(b.strengths) ? b.strengths.filter(Boolean).join(", ") : "";

  const nomEntreprise = String(p.company_legal_name || "").trim();
  const ville = String(p.hq_city || "").trim();

  
const preferred = String(b.preferred_cta || "").trim();
const ctaLabel =
  preferred === "appeler" ? "Appeler" : preferred === "message" ? "Envoyer un message" : "Demander un devis";
const ctaUrl =
  preferred === "appeler"
    ? (String(p.phone || "").trim() ? `tel:${String(p.phone || "").trim()}` : "")
    : preferred === "message"
      ? (String(p.contact_email || "").trim() ? `mailto:${String(p.contact_email || "").trim()}` : "")
      : String(links.site_url || "").trim();
return {
    // Profile
    nom_entreprise: nomEntreprise,
    prenom: String(p.first_name || "").trim(),
    nom: String(p.last_name || "").trim(),
    telephone: String(p.phone || "").trim(),
    email: String(p.contact_email || "").trim(),
    ville,
    code_postal: String(p.hq_zip || "").trim(),
    adresse: String(p.hq_address || "").trim(),

    // Activity
    secteur: String(b.sector || "").trim(),
    services,
    zones,
    jours_ouverture: String(b.opening_days || "").trim(),
    horaires_ouverture: String(b.opening_hours || "").trim(),
    forces: strengths,
    ton: String(b.tone || "").trim(),
    cta_preferee: String(b.preferred_cta || "").trim(),

    // Links
    site_url: String(links.site_url || "").trim(),
    facebook_url: String(links.facebook_url || "").trim(),
    gmb_url: String(links.gmb_url || "").trim(),
    avis_url: String(links.review_url || links.gmb_url || links.site_url || "").trim(),

    // CTA
    cta_label: ctaLabel,
    cta_url: ctaUrl,
  };
}
