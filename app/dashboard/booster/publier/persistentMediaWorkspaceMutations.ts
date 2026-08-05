export type WorkspaceMediaFamily = "image" | "video";

export type WorkspaceMediaMutationClock = {
  revision: number;
  resetVersion: number;
  familyVersions: Record<WorkspaceMediaFamily, number>;
};

export type WorkspaceFamilyMutationToken = {
  kind: "family";
  family: WorkspaceMediaFamily;
  revision: number;
  resetVersion: number;
  familyVersion: number;
};

export type WorkspaceGlobalMutationToken = {
  kind: "global";
  revision: number;
  resetVersion: number;
};

export type WorkspaceMediaMutationToken =
  | WorkspaceFamilyMutationToken
  | WorkspaceGlobalMutationToken;

export function createWorkspaceMediaMutationClock(): WorkspaceMediaMutationClock {
  return {
    revision: 0,
    resetVersion: 0,
    familyVersions: { image: 0, video: 0 },
  };
}

export function beginWorkspaceFamilyMutation(
  current: WorkspaceMediaMutationClock,
  family: WorkspaceMediaFamily,
) {
  const familyVersion = current.familyVersions[family] + 1;
  const clock: WorkspaceMediaMutationClock = {
    ...current,
    revision: current.revision + 1,
    familyVersions: {
      ...current.familyVersions,
      [family]: familyVersion,
    },
  };
  const token: WorkspaceFamilyMutationToken = {
    kind: "family",
    family,
    revision: clock.revision,
    resetVersion: clock.resetVersion,
    familyVersion,
  };
  return { clock, token };
}

export function beginWorkspaceGlobalClear(
  current: WorkspaceMediaMutationClock,
) {
  const clock: WorkspaceMediaMutationClock = {
    revision: current.revision + 1,
    resetVersion: current.resetVersion + 1,
    familyVersions: {
      image: current.familyVersions.image + 1,
      video: current.familyVersions.video + 1,
    },
  };
  const token: WorkspaceGlobalMutationToken = {
    kind: "global",
    revision: clock.revision,
    resetVersion: clock.resetVersion,
  };
  return { clock, token };
}

export function isWorkspaceMediaMutationCurrent(
  current: WorkspaceMediaMutationClock,
  token: WorkspaceMediaMutationToken,
) {
  if (token.resetVersion !== current.resetVersion) return false;
  if (token.kind === "global") return true;
  return current.familyVersions[token.family] === token.familyVersion;
}

export function replaceWorkspaceMediaFamilyStates<
  T extends { mediaType: WorkspaceMediaFamily },
>(
  current: Readonly<Record<string, T>>,
  family: WorkspaceMediaFamily,
  replacement: Readonly<Record<string, T>>,
): Record<string, T> {
  return {
    ...Object.fromEntries(
      Object.entries(current).filter(([, state]) => state.mediaType !== family),
    ),
    ...replacement,
  };
}

export function getWorkspaceSourcePosition(
  family: WorkspaceMediaFamily,
  familyIndex: number,
) {
  return family === "video" ? 5 : familyIndex;
}

export function getWorkspaceMediaFamilyFailure(
  failures: Readonly<Partial<Record<WorkspaceMediaFamily, string>>>,
  mediaTypes: readonly WorkspaceMediaFamily[] = ["image", "video"],
) {
  for (const family of mediaTypes) {
    if (failures[family]) return failures[family] || "";
  }
  return "";
}
