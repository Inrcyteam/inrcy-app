import { NextResponse } from "next/server";
import { jsonUserFacingError } from "@/lib/apiUserFacingErrors";
import { createSupabaseServer } from "@/lib/supabaseServer";

type Category = "particulier" | "professionnel" | "collectivite_publique";
type ContactType = "client" | "prospect" | "fournisseur" | "partenaire" | "autre";

type ContactSummary = {
  total: number;
  prospects: number;
  clients: number;
  partenaires: number;
  fournisseurs: number;
  autres: number;
};

const CONTACT_SELECT = [
  "id",
  "user_id",
  "last_name",
  "first_name",
  "company_name",
  "siret",
  "email",
  "phone",
  "address",
  "billing_address",
  "delivery_address",
  "vat_number",
  "city",
  "postal_code",
  "category",
  "contact_type",
  "notes",
  "important",
  "created_at",
].join(", ");

function isCategory(v: unknown): v is Category {
  return v === "particulier" || v === "professionnel" || v === "collectivite_publique";
}

function isContactType(v: unknown): v is ContactType {
  return v === "client" || v === "prospect" || v === "fournisseur" || v === "partenaire" || v === "autre";
}

function cleanString(v: unknown) {
  if (typeof v !== "string") return "";
  return v.trim();
}

function cleanDepartment(value: string | null) {
  const cleaned = (value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (/^(97|98)\d/.test(cleaned)) return cleaned.slice(0, 3);
  return cleaned.slice(0, 2);
}

function parseImportantParam(value: string | null) {
  return ["1", "true", "yes", "oui"].includes((value ?? "").trim().toLowerCase());
}

function parseDisplayName(v: unknown) {
  const raw = cleanString(v);
  if (!raw) return { last_name: "", first_name: "", company_name: "" };

  const parts = raw.split("/");
  const left = cleanString(parts[0]);
  const right = cleanString(parts.slice(1).join("/"));

  // ⚠️ Heuristique simple (en attendant un vrai modèle Supabase):
  // - on stocke "Nom Prénom" dans last_name (first_name vide)
  // - la partie après "/" devient company_name
  return { last_name: left, first_name: "", company_name: right };
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function escapeIlikeValue(value: string) {
  return value
    .replace(/[%_]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/,+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyContactSearch<T>(builder: T, rawQuery: string): T {
  const cleaned = escapeIlikeValue(rawQuery);
  if (!cleaned) return builder;

  const pattern = `%${cleaned}%`;
  return (builder as any).or(
    [
      `last_name.ilike.${pattern}`,
      `first_name.ilike.${pattern}`,
      `company_name.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `address.ilike.${pattern}`,
      `billing_address.ilike.${pattern}`,
      `delivery_address.ilike.${pattern}`,
      `vat_number.ilike.${pattern}`,
      `city.ilike.${pattern}`,
      `postal_code.ilike.${pattern}`,
      `siret.ilike.${pattern}`,
    ].join(","),
  ) as T;
}

function applyContactFilters<T>(
  builder: T,
  filters: {
    category: string;
    contactType: string;
    department: string;
    importantOnly: boolean;
  },
): T {
  let next: any = builder;

  if (isCategory(filters.category)) {
    next = next.eq("category", filters.category);
  }

  if (isContactType(filters.contactType)) {
    next = next.eq("contact_type", filters.contactType);
  }

  if (filters.department) {
    next = next.like("postal_code", `${filters.department}%`);
  }

  if (filters.importantOnly) {
    next = next.eq("important", true);
  }

  return next as T;
}

async function buildSummary(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  userId: string,
  query: string,
  filters: {
    category: string;
    contactType: string;
    department: string;
    importantOnly: boolean;
  },
) {
  const countWithType = async (contactType?: ContactType) => {
    let builder: any = supabase.from("crm_contacts").select("id", { count: "exact", head: true }).eq("user_id", userId);
    builder = applyContactSearch(builder, query);
    builder = applyContactFilters(builder, filters);
    if (contactType) {
      builder = builder.eq("contact_type", contactType);
    } else {
      builder = builder.or("contact_type.is.null,contact_type.eq.autre");
    }

    const { count, error } = await builder;
    if (error) throw error;
    return count ?? 0;
  };

  const [prospects, clients, partenaires, fournisseurs, autres] = await Promise.all([
    countWithType("prospect"),
    countWithType("client"),
    countWithType("partenaire"),
    countWithType("fournisseur"),
    countWithType(),
  ]);

  const total = prospects + clients + partenaires + fournisseurs + autres;

  return {
    total,
    prospects,
    clients,
    partenaires,
    fournisseurs,
    autres,
  } satisfies ContactSummary;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = parsePositiveInt(url.searchParams.get("page"), 1, 100000);
  const all = ["1", "true", "yes"].includes((url.searchParams.get("all") ?? "").toLowerCase());
  const pageSize = all
    ? parsePositiveInt(url.searchParams.get("pageSize"), 20, 200)
    : 20;
  const query = cleanString(url.searchParams.get("q"));
  const filters = {
    category: cleanString(url.searchParams.get("category")),
    contactType: cleanString(url.searchParams.get("contactType")),
    department: cleanDepartment(url.searchParams.get("department")),
    importantOnly: parseImportantParam(url.searchParams.get("important")),
  };

  let builder: any = supabase
    .from("crm_contacts")
    .select(CONTACT_SELECT, { count: "exact" })
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });

  builder = applyContactSearch(builder, query);
  builder = applyContactFilters(builder, filters);

  if (!all) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    builder = builder.range(from, to);
  }

  const [{ data, error, count }, summary] = await Promise.all([
    builder,
    buildSummary(supabase, userData.user.id, query, filters),
  ]);

  if (error) {
    return jsonUserFacingError(error, { status: 500 });
  }

  const total = count ?? summary.total ?? 0;
  const pageCount = all ? (total > 0 ? 1 : 0) : Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    contacts: data ?? [],
    total,
    page: all ? 1 : page,
    pageSize: all ? Math.max(total, pageSize) : pageSize,
    pageCount,
    summary,
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // ✅ Bulk import: PUT { contacts: [...] }
  if (Array.isArray(body?.contacts)) {
    const rows = body.contacts;
    const payloads = rows
      .map((row: Record<string, unknown>) => {
        const fromDisplay = parseDisplayName(row.display_name);
        const p = {
          user_id: userData.user.id,
          last_name: fromDisplay.last_name || cleanString(row.last_name),
          first_name: fromDisplay.first_name || cleanString(row.first_name),
          company_name: fromDisplay.company_name || cleanString(row.company_name),
          siret: cleanString(row.siret),
          email: cleanString(row.email),
          phone: cleanString(row.phone),
          address: cleanString(row.address),
          billing_address: cleanString((row as any).billing_address),
          delivery_address: cleanString((row as any).delivery_address),
          vat_number: cleanString((row as any).vat_number),
          city: cleanString(row.city),
          postal_code: cleanString(row.postal_code),
          category: isCategory(row.category) ? row.category : ("particulier" as Category),
          contact_type: isContactType(row.contact_type) ? row.contact_type : ("prospect" as ContactType),
          notes: cleanString(row.notes),
          important: Boolean(row.important),
        };

        // Minimum validation
        if (!p.last_name && !p.first_name && !p.company_name && !p.email && !p.phone) return null;
        return p;
      })
      .filter(Boolean) as unknown[];

    if (payloads.length === 0) {
      return NextResponse.json({ error: "Aucune ligne importable." }, { status: 400 });
    }

    const { error } = await supabase.from("crm_contacts").insert(payloads);

    if (error) {
      return jsonUserFacingError(error, { status: 500 });
    }

    return NextResponse.json({ ok: true, inserted: payloads.length });
  }

  const fromDisplay = parseDisplayName(body.display_name);

  const payload = {
    user_id: userData.user.id,
    last_name: fromDisplay.last_name || cleanString(body.last_name),
    first_name: fromDisplay.first_name || cleanString(body.first_name),
    company_name: fromDisplay.company_name || cleanString(body.company_name),
    siret: cleanString(body.siret),
    email: cleanString(body.email),
    phone: cleanString(body.phone),
    address: cleanString(body.address),
    billing_address: cleanString((body as any).billing_address),
    delivery_address: cleanString((body as any).delivery_address),
    vat_number: cleanString((body as any).vat_number),
    city: cleanString(body.city),
    postal_code: cleanString(body.postal_code),
    category: isCategory(body.category) ? body.category : ("particulier" as Category),
    contact_type: isContactType(body.contact_type) ? body.contact_type : ("prospect" as ContactType),
    notes: cleanString(body.notes),
    important: Boolean(body.important),
  };

  // minimum de validation
  if (!payload.last_name && !payload.first_name && !payload.company_name && !payload.email && !payload.phone) {
    return NextResponse.json(
      { error: "Renseigne au moins un champ d'identité (nom, prénom, mail ou téléphone)." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.from("crm_contacts").insert(payload).select("id").single();

  if (error) {
    return jsonUserFacingError(error, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PUT(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // ✅ Bulk import: PUT { contacts: [...] }
  if (Array.isArray(body?.contacts)) {
    const rows = body.contacts;
    const payloads = rows
      .map((row: Record<string, unknown>) => {
        const fromDisplay = parseDisplayName(row.display_name);
        const p = {
          user_id: userData.user.id,
          last_name: fromDisplay.last_name || cleanString(row.last_name),
          first_name: fromDisplay.first_name || cleanString(row.first_name),
          company_name: fromDisplay.company_name || cleanString(row.company_name),
          siret: cleanString(row.siret),
          email: cleanString(row.email),
          phone: cleanString(row.phone),
          address: cleanString(row.address),
          billing_address: cleanString((row as any).billing_address),
          delivery_address: cleanString((row as any).delivery_address),
          vat_number: cleanString((row as any).vat_number),
          city: cleanString(row.city),
          postal_code: cleanString(row.postal_code),
          category: isCategory(row.category) ? row.category : ("particulier" as Category),
          contact_type: isContactType(row.contact_type) ? row.contact_type : ("prospect" as ContactType),
        };

        // Minimum validation
        if (!p.last_name && !p.first_name && !p.company_name && !p.email && !p.phone) return null;
        return p;
      })
      .filter(Boolean) as unknown[];

    if (payloads.length === 0) {
      return NextResponse.json({ error: "Aucune ligne importable." }, { status: 400 });
    }

    const { error } = await supabase.from("crm_contacts").insert(payloads);

    if (error) {
      return jsonUserFacingError(error, { status: 500 });
    }

    return NextResponse.json({ ok: true, inserted: payloads.length });
  }
  const id = cleanString(body.id);
  if (!id) return NextResponse.json({ error: "L'identifiant du contact est manquant." }, { status: 400 });

  const fromDisplay = parseDisplayName(body.display_name);

  const patch = {
    last_name: fromDisplay.last_name || cleanString(body.last_name),
    first_name: fromDisplay.first_name || cleanString(body.first_name),
    company_name: fromDisplay.company_name || cleanString(body.company_name),
    siret: cleanString(body.siret),
    email: cleanString(body.email),
    phone: cleanString(body.phone),
    address: cleanString(body.address),
    billing_address: cleanString((body as any).billing_address),
    delivery_address: cleanString((body as any).delivery_address),
    vat_number: cleanString((body as any).vat_number),
    city: cleanString(body.city),
    postal_code: cleanString(body.postal_code),
    category: isCategory(body.category) ? body.category : ("particulier" as Category),
    contact_type: isContactType(body.contact_type) ? body.contact_type : ("prospect" as ContactType),
    // Keep these editable from the UI (star + notes)
    notes: cleanString(body.notes),
    important: typeof body.important === "boolean" ? body.important : Boolean(body.important),
  };

  const { error } = await supabase
    .from("crm_contacts")
    .update(patch)
    .eq("id", id)
    // double sécurité si RLS pas en place
    .eq("user_id", userData.user.id);

  if (error) {
    return jsonUserFacingError(error, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Votre session a expiré. Merci de vous reconnecter." }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "L'identifiant du contact est manquant." }, { status: 400 });

  const { error } = await supabase
    .from("crm_contacts")
    .delete()
    .eq("id", id)
    // double sécurité si RLS pas en place
    .eq("user_id", userData.user.id);

  if (error) {
    return jsonUserFacingError(error, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
