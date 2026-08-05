export type ImageChannelAssignmentMode = "video" | "images" | "none";

export type ImageChannelAction = Readonly<{
  kind: "selected" | "activate" | "reuse" | "pick";
  label:
    | "Photos"
    | "Utiliser les images existantes ici"
    | "Ajouter des images";
}>;

export function getImageChannelAction(params: {
  hasImagePool: boolean;
  assignedImageCount: number;
  mode: ImageChannelAssignmentMode;
}): ImageChannelAction {
  if (!params.hasImagePool) {
    return { kind: "pick", label: "Ajouter des images" };
  }
  if (params.mode === "images" && params.assignedImageCount > 0) {
    return { kind: "selected", label: "Photos" };
  }
  if (params.assignedImageCount > 0) {
    return {
      kind: "activate",
      label: "Utiliser les images existantes ici",
    };
  }
  return {
    kind: "reuse",
    label: "Utiliser les images existantes ici",
  };
}

function uniqueImageKeys(keys: readonly string[]) {
  return keys
    .filter((key, index, entries) => Boolean(key) && entries.indexOf(key) === index)
    .slice(0, 5);
}

export function setImageKeysForChannel<
  TChannel extends string,
  TEditor extends { imageKeys: string[] },
>(
  current: Readonly<Partial<Record<TChannel, TEditor>>>,
  channel: TChannel,
  imageKeys: readonly string[],
  options: {
    fallback: TEditor;
    patch?: Partial<TEditor>;
  },
): Partial<Record<TChannel, TEditor>> {
  const editor = current[channel] || options.fallback;
  return {
    ...current,
    [channel]: {
      ...editor,
      ...options.patch,
      imageKeys: uniqueImageKeys(imageKeys),
    } as TEditor,
  };
}
