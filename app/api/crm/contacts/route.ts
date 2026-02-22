import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

type Category = "particulier" | "professionnel" | "collectivite_publique";
type ContactType = "client" | "prospect" | "fournisseur" | "partenaire" | "autre";

function isCategory(v: any): v is Category {
  return v === "particulier" || v === "professionnel" || v === "collectivite_publique";
}

function isContactType(v: any): v is ContactType {
  return v === "client" || v === "prospect" || v === "fournisseur" || v === "partenaire" || v === "autre";
}

function cleanString(v: any) {
  if (typeof v !== "string") return "";
  return v.trim();
}

function parseDisplayName(v: any) {
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

export async function GET() {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("crm_contacts")
    .select("id, user_id, last_name, first_name, company_name, siret, email, phone, address, city, postal_code, category, contact_type, notes, important, created_at")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

const body = await req.json().catch(() => ({}));

// ✅ Bulk import: PUT { contacts: [...] }
if (Array.isArray(body?.contacts)) {
  const rows = body.contacts;
  const payloads = rows
    .map((row: any) => {
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
    .filter(Boolean) as any[];

  if (payloads.length === 0) {
    return NextResponse.json({ error: "Aucune ligne importable." }, { status: 400 });
  }

  const { error } = await supabase.from("crm_contacts").insert(payloads);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("crm_contacts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PUT(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

const body = await req.json().catch(() => ({}));

// ✅ Bulk import: PUT { contacts: [...] }
if (Array.isArray(body?.contacts)) {
  const rows = body.contacts;
  const payloads = rows
    .map((row: any) => {
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
        city: cleanString(row.city),
        postal_code: cleanString(row.postal_code),
        category: isCategory(row.category) ? row.category : ("particulier" as Category),
        contact_type: isContactType(row.contact_type) ? row.contact_type : ("prospect" as ContactType),
      };

      // Minimum validation
      if (!p.last_name && !p.first_name && !p.company_name && !p.email && !p.phone) return null;
      return p;
    })
    .filter(Boolean) as any[];

  if (payloads.length === 0) {
    return NextResponse.json({ error: "Aucune ligne importable." }, { status: 400 });
  }

  const { error } = await supabase.from("crm_contacts").insert(payloads);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: payloads.length });
}
  const id = cleanString(body.id);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const fromDisplay = parseDisplayName(body.display_name);

  const patch = {
    last_name: fromDisplay.last_name || cleanString(body.last_name),
    first_name: fromDisplay.first_name || cleanString(body.first_name),
    company_name: fromDisplay.company_name || cleanString(body.company_name),
    siret: cleanString(body.siret),
    email: cleanString(body.email),
    phone: cleanString(body.phone),
    address: cleanString(body.address),
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServer();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("crm_contacts")
    .delete()
    .eq("id", id)
    // double sécurité si RLS pas en place
    .eq("user_id", userData.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
