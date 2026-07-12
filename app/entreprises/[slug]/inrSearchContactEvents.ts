export const INR_SEARCH_OPEN_CONTACT_EVENT = "inrsearch:open-contact";

export type InrSearchOpenContactDetail = {
  trigger?: HTMLElement | null;
};

export function requestInrSearchContact(trigger?: HTMLElement | null) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<InrSearchOpenContactDetail>(INR_SEARCH_OPEN_CONTACT_EVENT, {
      detail: { trigger },
    }),
  );
}
