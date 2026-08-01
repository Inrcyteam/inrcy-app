export type TouchRefreshCapabilities = {
  maxTouchPoints: number;
  primaryPointerCoarse: boolean;
  anyPointerCoarse: boolean;
  hoverNone: boolean;
};

/**
 * Enables the custom gesture only when the device exposes a genuine touch
 * pointer. This covers phones, tablets and foldables without relying on a
 * brand, browser or viewport-width check.
 */
export function supportsCustomPullToRefresh({
  maxTouchPoints,
  primaryPointerCoarse,
  anyPointerCoarse,
  hoverNone,
}: TouchRefreshCapabilities) {
  return maxTouchPoints > 0 &&
    (primaryPointerCoarse || anyPointerCoarse || hoverNone);
}

export function isMostlyHorizontalPull(diffX: number, diffY: number) {
  return diffX > Math.abs(diffY) + 12;
}
