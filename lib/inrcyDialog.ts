export type InrcyDialogVariant = "default" | "warning" | "danger";

export type InrcyConfirmOptions = {
  title?: string;
  message: string;
  eyebrow?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: InrcyDialogVariant;
};

export type InrcyPromptOptions = InrcyConfirmOptions & {
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
};

type ConfirmRequest = {
  type: "confirm";
  options: InrcyConfirmOptions;
  resolve: (value: boolean) => void;
};

type PromptRequest = {
  type: "prompt";
  options: InrcyPromptOptions;
  resolve: (value: string | null) => void;
};

type ConfirmRequestInput = Omit<ConfirmRequest, "resolve">;
type PromptRequestInput = Omit<PromptRequest, "resolve">;

type DialogRequestInput = ConfirmRequestInput | PromptRequestInput;

export type InrcyDialogRequest = ConfirmRequest | PromptRequest;

export const INRCY_DIALOG_EVENT = "inrcy:dialog-request";

function dispatchDialogRequest<T>(request: DialogRequestInput, resolveWith: (value: T) => void) {
  window.dispatchEvent(
    new CustomEvent<InrcyDialogRequest>(INRCY_DIALOG_EVENT, {
      detail: {
        ...request,
        resolve: resolveWith,
      } as unknown as InrcyDialogRequest,
    }),
  );
}

export function confirmInrcy(options: InrcyConfirmOptions | string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  const normalized: InrcyConfirmOptions =
    typeof options === "string" ? { message: options } : options;

  return new Promise<boolean>((resolve) => {
    dispatchDialogRequest<boolean>({ type: "confirm", options: normalized }, resolve);
  });
}

export function promptInrcy(options: InrcyPromptOptions | string): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const normalized: InrcyPromptOptions =
    typeof options === "string" ? { message: options } : options;

  return new Promise<string | null>((resolve) => {
    dispatchDialogRequest<string | null>({ type: "prompt", options: normalized }, resolve);
  });
}
