import type {
  ComposeAttachmentRef,
  OutboxItem,
} from "./mailboxPhase1";

export type PendingTrack = {
  kind: "booster" | "propulser" | "fideliser";
  type: string;
  payload: Record<string, any>;
};

export function serializeComposeAttachments(
  input: ComposeAttachmentRef[],
) {
  return input
    .map((att) => ({
      bucket: String(att.bucket || "").trim(),
      path: String(att.path || "").trim(),
      name: String(
        att.name || att.path?.split("/").pop() || "piece-jointe",
      ).trim(),
      type: att.type || null,
      size: att.size ?? null,
    }))
    .filter((att) => att.bucket && att.path && att.name);
}

export function sanitizeCrmDepartmentFilter(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/[^0-9AB]/g, "")
    .slice(0, 3);
}

export function contactDepartment(postalCode: string | null) {
  const cleaned = sanitizeCrmDepartmentFilter(postalCode || "");
  if (/^(97|98)\d/.test(cleaned)) return cleaned.slice(0, 3);
  return cleaned.slice(0, 2);
}

export function asScheduledRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function inferTrackFromCampaign(item: OutboxItem): PendingTrack | null {
  if (!item || item.source !== "mail_campaigns") return null;
  const raw = ((item as any).raw || {}) as Record<string, any>;
  const rawKind = String(raw.track_kind || item.module || "")
    .trim()
    .toLowerCase();
  const rawType = String(raw.track_type || "")
    .trim()
    .toLowerCase();
  const folderName = String(item.folder || raw.folder || "")
    .trim()
    .toLowerCase();

  if (
    (rawKind === "booster" ||
      rawKind === "propulser" ||
      rawKind === "fideliser") &&
    rawType
  ) {
    return {
      kind: rawKind as "booster" | "propulser" | "fideliser",
      type: rawType,
      payload: {},
    };
  }

  if (rawType === "review_mail" || folderName === "recoltes") {
    return { kind: "propulser", type: "review_mail", payload: {} };
  }
  if (rawType === "promo_mail" || folderName === "offres") {
    return { kind: "propulser", type: "promo_mail", payload: {} };
  }
  if (rawType === "newsletter_mail" || folderName === "informations") {
    return { kind: "fideliser", type: "newsletter_mail", payload: {} };
  }
  if (rawType === "thanks_mail" || folderName === "suivis") {
    return { kind: "fideliser", type: "thanks_mail", payload: {} };
  }
  if (rawType === "satisfaction_mail" || folderName === "enquetes") {
    return { kind: "fideliser", type: "satisfaction_mail", payload: {} };
  }

  return null;
}

export function normalizeCampaignAttachments(
  input: unknown,
): ComposeAttachmentRef[] {
  let values: unknown = input;
  if (typeof values === "string") {
    try {
      values = JSON.parse(values);
    } catch {
      values = [];
    }
  }
  const rows = Array.isArray(values) ? values : [];
  return rows
    .map((attachment: any) => {
      const bucket = String(attachment?.bucket || "").trim();
      const path = String(attachment?.path || "").trim();
      const name = String(
        attachment?.name ||
          attachment?.filename ||
          attachment?.fileName ||
          path.split("/").pop() ||
          "",
      ).trim();
      if (!bucket || !path || !name) return null;
      return {
        bucket,
        path,
        name,
        type:
          attachment?.type ||
          attachment?.mime_type ||
          attachment?.mimeType ||
          null,
        size:
          attachment?.size == null ? null : Number(attachment.size) || null,
      } satisfies ComposeAttachmentRef;
    })
    .filter(Boolean) as ComposeAttachmentRef[];
}

export function workflowDraftTargetFromSendItem(
  item: OutboxItem,
  raw: Record<string, any>,
) {
  const trackKind = String(raw.track_kind || item.module || "")
    .trim()
    .toLowerCase();
  const trackType = String(raw.track_type || "")
    .trim()
    .toLowerCase();
  const folderName = String(raw.folder || item.folder || "")
    .trim()
    .toLowerCase();
  const workflowAction = String((item as any).workflowAction || "")
    .trim()
    .toLowerCase();

  const byTrackType: Record<
    string,
    {
      kind: "propulser" | "fideliser";
      action: string;
      folder: string;
      trackType: string;
    }
  > = {
    valorize: {
      kind: "propulser",
      action: "valorize",
      folder: "propulsions",
      trackType: "valorize",
    },
    review_mail: {
      kind: "propulser",
      action: "reviews",
      folder: "propulsions",
      trackType: "review_mail",
    },
    promo_mail: {
      kind: "propulser",
      action: "promo",
      folder: "propulsions",
      trackType: "promo_mail",
    },
    newsletter_mail: {
      kind: "fideliser",
      action: "inform",
      folder: "fidelisations",
      trackType: "newsletter_mail",
    },
    thanks_mail: {
      kind: "fideliser",
      action: "thanks",
      folder: "fidelisations",
      trackType: "thanks_mail",
    },
    satisfaction_mail: {
      kind: "fideliser",
      action: "satisfaction",
      folder: "fidelisations",
      trackType: "satisfaction_mail",
    },
  };

  const byWorkflowAction: Record<
    string,
    {
      kind: "propulser" | "fideliser";
      action: string;
      folder: string;
      trackType: string;
    }
  > = {
    valoriser: byTrackType.valorize,
    recolter: byTrackType.review_mail,
    offrir: byTrackType.promo_mail,
    informer: byTrackType.newsletter_mail,
    suivre: byTrackType.thanks_mail,
    enqueter: byTrackType.satisfaction_mail,
  };

  const byLegacyFolder: Record<
    string,
    {
      kind: "propulser" | "fideliser";
      action: string;
      folder: string;
      trackType: string;
    }
  > = {
    recoltes: byTrackType.review_mail,
    offres: byTrackType.promo_mail,
    informations: byTrackType.newsletter_mail,
    suivis: byTrackType.thanks_mail,
    enquetes: byTrackType.satisfaction_mail,
  };

  if (byTrackType[trackType]) return byTrackType[trackType];
  if (byWorkflowAction[workflowAction])
    return byWorkflowAction[workflowAction];
  if (byLegacyFolder[folderName]) return byLegacyFolder[folderName];
  if (trackKind === "propulser" || folderName === "propulsions")
    return byTrackType.valorize;
  if (trackKind === "fideliser" || folderName === "fidelisations")
    return byTrackType.newsletter_mail;
  return null;
}
