import "server-only";

import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileSeed = {
  user_id: string;
  updated_at: string;
  admin_email?: string;
  contact_email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  company_legal_name?: string;
};

function cleanString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildProfileSeed(user: User): ProfileSeed {
  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? (user.user_metadata as Record<string, unknown>)
    : {};

  const email = cleanString(user.email).toLowerCase();
  const firstName = cleanString(metadata.first_name);
  const lastName = cleanString(metadata.last_name);
  const phone = cleanString(metadata.phone);
  const companyName = cleanString(metadata.company_legal_name);

  const seed: ProfileSeed = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  if (email) {
    seed.admin_email = email;
    seed.contact_email = email;
  }
  if (firstName) seed.first_name = firstName;
  if (lastName) seed.last_name = lastName;
  if (phone) seed.phone = phone;
  if (companyName) seed.company_legal_name = companyName;

  return seed;
}

export async function ensureProfileRow(user: User | null | undefined) {
  if (!user?.id) return;

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert(buildProfileSeed(user), { onConflict: "user_id", ignoreDuplicates: true });

  if (error) {
    throw new Error(error.message);
  }
}
