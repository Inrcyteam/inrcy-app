type SupabaseLike = {
  from: (table: string) => any;
};

type CrmContactRow = Record<string, any>;

type UpsertCrmContactInput = {
  userId: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  category?: string;
  contactType?: string;
  important?: boolean;
  source?: string;
};

export type UpsertCrmContactResult = {
  id: string | null;
  created: boolean;
  updated: boolean;
  contact: CrmContactRow | null;
};

function cleanString(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanText(value: unknown, max = 1200) {
  return String(value ?? "").trim().replace(/\r\n/g, "\n").slice(0, max);
}

function normalizeEmail(value: unknown) {
  return cleanString(value, 254).toLowerCase();
}

function normalizePhoneKey(value: unknown) {
  const digits = cleanString(value, 80).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0033") && digits.length >= 12) return `0${digits.slice(4)}`;
  if (digits.startsWith("33") && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

function normalizeNameKey(value: unknown) {
  return cleanString(value, 240)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildDisplayName(input: { firstName?: unknown; lastName?: unknown; companyName?: unknown }) {
  const firstName = cleanString(input.firstName, 120);
  const lastName = cleanString(input.lastName, 120);
  const companyName = cleanString(input.companyName, 160);
  const person = [firstName, lastName].filter(Boolean).join(" ").trim() || lastName;
  if (person && companyName) return `${person} / ${companyName}`;
  return person || companyName;
}

function buildDisplayNameKey(input: { firstName?: unknown; lastName?: unknown; companyName?: unknown }) {
  return normalizeNameKey(buildDisplayName(input));
}

function contactDisplayNameKey(contact: CrmContactRow) {
  return buildDisplayNameKey({
    firstName: contact.first_name,
    lastName: contact.last_name,
    companyName: contact.company_name,
  });
}

function contactNameOnlyKey(contact: CrmContactRow) {
  return normalizeNameKey([contact.first_name, contact.last_name].map((v) => cleanString(v)).filter(Boolean).join(" ") || contact.last_name);
}

async function findExistingCrmContact(supabase: SupabaseLike, input: UpsertCrmContactInput) {
  const userId = cleanString(input.userId);
  const email = normalizeEmail(input.email);

  if (email) {
    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id,first_name,last_name,company_name,email,phone,notes,category,contact_type,important")
      .eq("user_id", userId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return data as CrmContactRow;
  }

  const phoneKey = normalizePhoneKey(input.phone);
  const fullNameKey = buildDisplayNameKey(input);
  const nameOnlyKey = normalizeNameKey([input.firstName, input.lastName].map((v) => cleanString(v)).filter(Boolean).join(" ") || input.lastName);
  const companyKey = normalizeNameKey(input.companyName);

  if (!phoneKey && !fullNameKey && !nameOnlyKey && !companyKey) return null;

  const { data, error } = await supabase
    .from("crm_contacts")
    .select("id,first_name,last_name,company_name,email,phone,notes,category,contact_type,important")
    .eq("user_id", userId)
    .limit(1000);

  if (error) throw error;

  const contacts = Array.isArray(data) ? data as CrmContactRow[] : [];

  if (phoneKey) {
    const byPhone = contacts.find((contact) => normalizePhoneKey(contact.phone) === phoneKey);
    if (byPhone?.id) return byPhone;
  }

  if (fullNameKey) {
    const byFullName = contacts.find((contact) => contactDisplayNameKey(contact) === fullNameKey);
    if (byFullName?.id) return byFullName;
  }

  if (nameOnlyKey) {
    const byName = contacts.find((contact) => contactNameOnlyKey(contact) === nameOnlyKey);
    if (byName?.id) return byName;
  }

  if (companyKey) {
    const byCompany = contacts.find((contact) => normalizeNameKey(contact.company_name) === companyKey);
    if (byCompany?.id) return byCompany;
  }

  return null;
}

function addIfEmpty(patch: Record<string, unknown>, contact: CrmContactRow, field: string, nextValue: unknown, max = 240) {
  const value = field === "notes" ? cleanText(nextValue, 1200) : cleanString(nextValue, max);
  if (!value) return;
  if (!cleanString(contact[field])) patch[field] = value;
}

export async function upsertCrmContactWithoutDuplicate(supabase: SupabaseLike, input: UpsertCrmContactInput): Promise<UpsertCrmContactResult> {
  const userId = cleanString(input.userId);
  if (!userId) return { id: null, created: false, updated: false, contact: null };

  const firstName = cleanString(input.firstName, 80);
  const lastName = cleanString(input.lastName, 120);
  const companyName = cleanString(input.companyName, 160);
  const email = normalizeEmail(input.email);
  const phone = cleanString(input.phone, 40).replace(/[^+0-9 .()-]/g, "");
  const notes = cleanText(input.notes, 1200);
  const category = cleanString(input.category, 40) || (companyName ? "professionnel" : "particulier");
  const contactType = cleanString(input.contactType, 40) || "prospect";

  const existing = await findExistingCrmContact(supabase, { ...input, userId, firstName, lastName, companyName, email, phone });

  if (existing?.id) {
    const patch: Record<string, unknown> = {};
    addIfEmpty(patch, existing, "first_name", firstName, 80);
    addIfEmpty(patch, existing, "last_name", lastName, 120);
    addIfEmpty(patch, existing, "company_name", companyName, 160);
    addIfEmpty(patch, existing, "email", email, 254);
    addIfEmpty(patch, existing, "phone", phone, 40);
    addIfEmpty(patch, existing, "notes", notes, 1200);
    addIfEmpty(patch, existing, "category", category, 40);
    addIfEmpty(patch, existing, "contact_type", contactType, 40);

    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase
        .from("crm_contacts")
        .update(patch)
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select("id,first_name,last_name,company_name,email,phone,notes,category,contact_type,important")
        .maybeSingle();

      if (error) throw error;
      return { id: String(existing.id), created: false, updated: true, contact: (data as CrmContactRow | null) || { ...existing, ...patch } };
    }

    return { id: String(existing.id), created: false, updated: false, contact: existing };
  }

  const payload = {
    user_id: userId,
    first_name: firstName,
    last_name: lastName,
    company_name: companyName,
    siret: "",
    email,
    phone,
    address: "",
    billing_address: "",
    delivery_address: "",
    vat_number: "",
    city: "",
    postal_code: "",
    category,
    contact_type: contactType,
    notes,
    important: Boolean(input.important),
  };

  const { data, error } = await supabase
    .from("crm_contacts")
    .insert(payload)
    .select("id,first_name,last_name,company_name,email,phone,notes,category,contact_type,important")
    .single();

  if (error) throw error;
  return { id: data?.id ? String(data.id) : null, created: true, updated: false, contact: data as CrmContactRow | null };
}
