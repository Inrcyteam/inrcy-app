export type PublicationMediaDecision =
  | { action: "reuse_ready"; reason: "ready_variant" }
  | { action: "wait"; reason: "preparation_in_progress" }
  | { action: "use_original"; reason: "source_compatible" }
  | { action: "prepare_minimal"; reason: "source_incompatible" }
  | { action: "block_channel"; reason: "terminal_failure" | "impossible" };

/**
 * Single idempotent decision table shared by IA and manual publication paths.
 * It never forces a derivative merely because the destination is external.
 */
export function decidePublicationMedia(input: {
  readyVariant?: boolean;
  preparationInProgress?: boolean;
  sourceCompatible?: boolean;
  terminalFailure?: boolean;
  preparationPossible?: boolean;
}): PublicationMediaDecision {
  if (input.readyVariant) return { action: "reuse_ready", reason: "ready_variant" };
  if (input.preparationInProgress) {
    return { action: "wait", reason: "preparation_in_progress" };
  }
  if (input.sourceCompatible) {
    return { action: "use_original", reason: "source_compatible" };
  }
  if (input.terminalFailure) {
    return { action: "block_channel", reason: "terminal_failure" };
  }
  if (input.preparationPossible !== false) {
    return { action: "prepare_minimal", reason: "source_incompatible" };
  }
  return { action: "block_channel", reason: "impossible" };
}
