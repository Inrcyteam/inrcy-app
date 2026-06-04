const IOS_SAFARI_PRINT_ATTR = "data-inrcy-print";
const IOS_SAFARI_PRINT_VALUE = "ios-safari";

function isIosSafariPrintTarget(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIosDevice = /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(ua);

  return isIosDevice && isSafari;
}

export async function printWithIosSafariScale(waitForDomUpdate: () => Promise<void>) {
  const enableIosSafariPrintMode =
    typeof document !== "undefined" && typeof window !== "undefined" && isIosSafariPrintTarget();
  const root = enableIosSafariPrintMode ? document.documentElement : null;
  let cleanupTimer: number | null = null;

  const cleanup = () => {
    if (!root) return;
    root.removeAttribute(IOS_SAFARI_PRINT_ATTR);
    window.removeEventListener("afterprint", cleanup);
    if (cleanupTimer !== null) {
      window.clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
  };

  if (root) {
    root.setAttribute(IOS_SAFARI_PRINT_ATTR, IOS_SAFARI_PRINT_VALUE);
    window.addEventListener("afterprint", cleanup, { once: true });
  }

  await waitForDomUpdate();
  window.print();

  if (root) {
    cleanupTimer = window.setTimeout(cleanup, 60000);
  }
}
