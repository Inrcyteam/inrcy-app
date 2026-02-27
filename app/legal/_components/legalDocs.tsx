"use client";

import type React from "react";

import ConfidentialiteContent from "./ConfidentialiteContent";
import MentionsLegalesContent from "./MentionsLegalesContent";
import CgaContent from "./CgaContent";

export type LegalDocKey = "confidentialite" | "mentions-legales" | "cga";

export const legalDocs: Record<
  LegalDocKey,
  {
    key: LegalDocKey;
    title: string;
    subtitle?: string;
    Content: React.ComponentType;
  }
> = {
  confidentialite: {
    key: "confidentialite",
    title: "Politique de confidentialité",
    subtitle: "Informations RGPD sur les traitements de données effectués via iNrCy.",
    Content: ConfidentialiteContent,
  },
  "mentions-legales": {
    key: "mentions-legales",
    title: "Mentions légales",
    subtitle: "Éditeur, hébergement, responsabilité, propriété intellectuelle.",
    Content: MentionsLegalesContent,
  },
  cga: {
    key: "cga",
    title: "CGA",
    subtitle: "Version du 11/02/2026",
    Content: CgaContent,
  },
};
