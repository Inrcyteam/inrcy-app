"use client";
import ListPage from "./ListPage";
export default function FacturesListPage() {
  return <ListPage kind="facture" title="Mes factures" ctaLabel="Créer une facture" ctaHref="/dashboard/factures/new" />;
}
