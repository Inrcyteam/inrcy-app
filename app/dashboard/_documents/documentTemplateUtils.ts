import { LineItem, uid } from "./docUtils";

export function hasReusableDocumentLine(lines: LineItem[]) {
  return Array.isArray(lines) && lines.some((line) => (line.label || "").trim() && Number(line.qty) > 0 && Number(line.unitPrice) >= 0);
}

export function cloneDocumentLines(lines: LineItem[]) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({ ...line, id: uid("l") }));
}

export function prepareTemplateSnapshot<T extends Record<string, any>>(snapshot: Partial<T>, templateName: string): T {
  return {
    ...snapshot,
    number: "",
    invoiceDate: "",
    docDateISO: "",
    dueDate: "",
    clientName: "",
    clientAddress: "",
    billingAddress: "",
    billingPostalCode: "",
    billingCity: "",
    deliveryAddress: "",
    deliveryPostalCode: "",
    deliveryCity: "",
    sameAddresses: true,
    clientEmail: "",
    clientSiren: "",
    clientVatNumber: "",
    clientType: "",
    status: "brouillon",
    isFinalized: false,
    finalizedAt: null,
    lockedAt: null,
    isTemplate: true,
    templateName,
  } as unknown as T;
}
