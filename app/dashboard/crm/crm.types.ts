export type Category = "" | "particulier" | "professionnel" | "collectivite_publique";
export type ContactType = "" | "client" | "prospect" | "fournisseur" | "partenaire" | "autre";

export type CrmContact = {
  id: string;
  last_name: string;
  first_name: string;
  company_name?: string;
  siret?: string;
  email: string;
  phone: string;
  address: string;
  billing_address?: string;
  delivery_address?: string;
  vat_number?: string;
  city?: string;
  postal_code?: string;
  category: Category;
  notes?: string;
  important?: boolean;
  contact_type: ContactType;
  created_at: string;
};

export type CrmSummary = {
  total: number;
  prospects: number;
  clients: number;
  partenaires: number;
  fournisseurs: number;
  autres: number;
};

export type CrmDraft = {
  display_name: string;
  siret: string;
  email: string;
  phone: string;
  address: string;
  billing_address: string;
  delivery_address: string;
  vat_number: string;
  city: string;
  postal_code: string;
  category: Category;
  contact_type: ContactType;
  notes: string;
  important: boolean;
};

export type CrmActionRecipient = {
  email: string;
  contact_id: string;
  display_name: string | null;
};
