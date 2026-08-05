export type VideoChannelAssignmentMode = "video" | "images" | "none";

export type VideoChannelAction = Readonly<{
  kind: "selected" | "reuse" | "pick";
  label: "Vidéo" | "Utiliser la même vidéo ici" | "Ajouter une vidéo";
}>;

export function getVideoChannelAction(params: {
  hasVideoSource: boolean;
  mode: VideoChannelAssignmentMode;
}): VideoChannelAction {
  if (!params.hasVideoSource) {
    return { kind: "pick", label: "Ajouter une vidéo" };
  }
  if (params.mode === "video") {
    return { kind: "selected", label: "Vidéo" };
  }
  return { kind: "reuse", label: "Utiliser la même vidéo ici" };
}

export function assignVideoSourceToChannel<TChannel extends string>(
  current: Readonly<
    Partial<Record<TChannel, VideoChannelAssignmentMode>>
  >,
  channel: TChannel,
): Partial<Record<TChannel, VideoChannelAssignmentMode>> {
  return { ...current, [channel]: "video" };
}
