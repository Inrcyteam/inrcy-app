import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { confirmInrcy } from "@/lib/inrcyDialog";
import {
  areBoosterImageTransformsEquivalent,
  getBoosterImageDisplayPlan,
  getBoosterImageRenderDimensions,
  getBoosterImageSequenceTargetRatio,
} from "@/lib/boosterImageDecision";
import {
  BOOSTER_MAX_IMAGE_BYTES,
  BOOSTER_MAX_IMAGE_COUNT,
  BOOSTER_MAX_IMAGE_MB_LABEL,
  BOOSTER_MAX_MEDIA_BYTES,
  BOOSTER_MAX_MEDIA_MB_LABEL,
  CHANNEL_LABELS,
  CHANNEL_PRESETS,
  buildBoosterUploadPath,
  channelSupportsImages,
  clamp,
  computePreviewLayout,
  convertHeicOrHeifImageFile,
  getBackgroundFill,
  getBackgroundMode,
  getEffectiveTransformZoom,
  getOptimizedTransform,
  isBoosterImageFile,
  makeImageKey,
  offsetFromDrawPosition,
  readImageMeta,
  renderChannelImage,
  syncChannelImageEditors,
  uploadPreparedImages,
  type ChannelImageEditorState,
  type ChannelImagePayload,
  type ChannelImageSettingsPayload,
  type ChannelKey,
  type ChannelMediaMode,
  type DisplayKey,
  type ImageMeta,
  type ImagePayload,
  type ImageTransform,
  type PublicationMediaType,
} from "./publishModal.shared";

type UsePublishImageControllerParams = {
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  previewStageRef: MutableRefObject<HTMLDivElement | null>;
  selectedChannels: ChannelKey[];
  images: File[];
  setImages: Dispatch<SetStateAction<File[]>>;
  imagePreviews: string[];
  setImagePreviews: Dispatch<SetStateAction<string[]>>;
  useImagesForAI: boolean;
  setUseImagesForAI: Dispatch<SetStateAction<boolean>>;
  imageMetaByKey: Record<string, ImageMeta>;
  setImageMetaByKey: Dispatch<SetStateAction<Record<string, ImageMeta>>>;
  channelImageEditors: Partial<Record<ChannelKey, ChannelImageEditorState>>;
  setChannelImageEditors: Dispatch<
    SetStateAction<Partial<Record<ChannelKey, ChannelImageEditorState>>>
  >;
  activeImageChannel: ChannelKey;
  setActiveImageChannel: Dispatch<SetStateAction<ChannelKey>>;
  activeImageKeyByChannel: Partial<Record<ChannelKey, string>>;
  setActiveImageKeyByChannel: Dispatch<
    SetStateAction<Partial<Record<ChannelKey, string>>>
  >;
  isImageEditorOpen: boolean;
  setIsImageEditorOpen: Dispatch<SetStateAction<boolean>>;
  isDraggingImage: boolean;
  setIsDraggingImage: Dispatch<SetStateAction<boolean>>;
  hasVideoMedia: boolean;
  setImgError: Dispatch<SetStateAction<string>>;
  setActiveCard: Dispatch<SetStateAction<DisplayKey>>;
  setPublicationMediaType: Dispatch<SetStateAction<PublicationMediaType>>;
  setChannelMediaModes: Dispatch<
    SetStateAction<Partial<Record<ChannelKey, ChannelMediaMode>>>
  >;
  preservePublishScroll: () => void;
  restorePublishScroll: () => void;
};

export default function usePublishImageController({
  fileInputRef,
  previewStageRef,
  selectedChannels,
  images,
  setImages,
  imagePreviews,
  setImagePreviews,
  useImagesForAI,
  setUseImagesForAI,
  imageMetaByKey,
  setImageMetaByKey,
  channelImageEditors,
  setChannelImageEditors,
  activeImageChannel,
  setActiveImageChannel,
  activeImageKeyByChannel,
  setActiveImageKeyByChannel,
  isImageEditorOpen,
  setIsImageEditorOpen,
  isDraggingImage,
  setIsDraggingImage,
  hasVideoMedia,
  setImgError,
  setActiveCard,
  setPublicationMediaType,
  setChannelMediaModes,
  preservePublishScroll,
  restorePublishScroll,
}: UsePublishImageControllerParams) {
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const [previewStageSize, setPreviewStageSize] = useState({
    width: 0,
    height: 0,
  });

  const imageAdapterChannels = useMemo<ChannelKey[]>(() => {
    const adapterChannels: ChannelKey[] = [];
    if (selectedChannels.includes("inrcy_site"))
      adapterChannels.push("inrcy_site");
    if (selectedChannels.includes("site_web")) adapterChannels.push("site_web");
    if (selectedChannels.includes("gmb")) adapterChannels.push("gmb");
    if (selectedChannels.includes("facebook")) adapterChannels.push("facebook");
    if (selectedChannels.includes("instagram"))
      adapterChannels.push("instagram");
    if (selectedChannels.includes("linkedin")) adapterChannels.push("linkedin");
    if (selectedChannels.includes("tiktok")) adapterChannels.push("tiktok");
    if (selectedChannels.includes("youtube_shorts")) adapterChannels.push("youtube_shorts");
    if (selectedChannels.includes("pinterest")) adapterChannels.push("pinterest");
    return adapterChannels;
  }, [selectedChannels]);

  const getImageAdapterLabel = (channel: ChannelKey) => CHANNEL_LABELS[channel];
  const getImpactedImageChannels = (channel: ChannelKey): ChannelKey[] => [
    channel,
  ];

  const setSynchronizedActiveChannel = (channel: ChannelKey) => {
    setActiveCard(channel);
    setActiveImageChannel(channel);
  };

  const imageKeys = useMemo(
    () => images.map((file) => makeImageKey(file)),
    [images],
  );
  const imageFileByKey = useMemo(
    () => Object.fromEntries(images.map((file) => [makeImageKey(file), file])),
    [images],
  );
  const previewByKey = useMemo(
    () =>
      Object.fromEntries(
        imageKeys.map((key, index) => [key, imagePreviews[index]]),
      ),
    [imageKeys, imagePreviews],
  );

  useEffect(() => {
    setChannelImageEditors((prev) =>
      syncChannelImageEditors({
        previous: prev,
        imageKeys,
        selectedChannels,
        imageMetaByKey,
      }),
    );
  }, [
    imageKeys.join("|"),
    selectedChannels.join("|"),
    Object.keys(imageMetaByKey)
      .sort()
      .map(
        (key) =>
          `${key}:${imageMetaByKey[key]?.width || 0}x${imageMetaByKey[key]?.height || 0}`,
      )
      .join("|"),
    setChannelImageEditors,
  ]);

  useEffect(() => {
    if (!imageAdapterChannels.length) {
      setActiveImageChannel("inrcy_site");
      setActiveCard("inrcy_site");
      return;
    }
    if (!imageAdapterChannels.includes(activeImageChannel)) {
      const fallback = imageAdapterChannels[0];
      setActiveImageChannel(fallback);
      setActiveCard(fallback);
    }
  }, [
    imageAdapterChannels,
    activeImageChannel,
    setActiveCard,
    setActiveImageChannel,
  ]);

  useEffect(() => {
    setActiveImageKeyByChannel((prev) => {
      const next = { ...prev };
      for (const channel of selectedChannels) {
        const available = channelImageEditors[channel]?.imageKeys || [];
        if (!available.length) {
          delete next[channel];
          continue;
        }
        if (!next[channel] || !available.includes(next[channel] as string)) {
          next[channel] = available[0];
        }
      }
      for (const key of Object.keys(next) as ChannelKey[]) {
        if (!selectedChannels.includes(key)) delete next[key];
      }
      return next;
    });
  }, [
    selectedChannels.join("|"),
    channelImageEditors,
    imageKeys.join("|"),
    setActiveImageKeyByChannel,
  ]);

  useEffect(() => {
    if (!images.length && !useImagesForAI) {
      setUseImagesForAI(true);
    }
  }, [images.length, useImagesForAI, setUseImagesForAI]);

  useEffect(() => {
    const node = previewStageRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const update = () => {
      setPreviewStageSize({
        width: node.clientWidth || 0,
        height: node.clientHeight || 0,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    activeImageChannel,
    activeImageKeyByChannel[activeImageChannel],
    isImageEditorOpen,
    images.length,
    previewStageRef,
  ]);

  const activeEditor = channelImageEditors[activeImageChannel];
  const activeEditorImageKey =
    activeImageKeyByChannel[activeImageChannel] ||
    activeEditor?.imageKeys?.[0] ||
    "";
  const activeEditorMeta = imageMetaByKey[activeEditorImageKey];
  const activeEditorAutomaticTransform = getOptimizedTransform(
    activeImageChannel,
    activeEditorMeta,
  );
  const activeEditorTransform =
    activeEditor?.transforms?.[activeEditorImageKey] ||
    activeEditorAutomaticTransform;
  const activeEditorFirstImageKey = activeEditor?.imageKeys?.[0] || "";
  const activeEditorSequenceTargetRatio = getBoosterImageSequenceTargetRatio({
    channel: activeImageChannel,
    metas: (activeEditor?.imageKeys || []).map((key) => imageMetaByKey[key]),
    firstImageCustomizedTargetRatio:
      activeImageChannel === "instagram" &&
      activeEditorFirstImageKey &&
      (activeEditor?.customizedImageKeys || []).includes(activeEditorFirstImageKey)
        ? CHANNEL_PRESETS.instagram.width / CHANNEL_PRESETS.instagram.height
        : null,
  });
  const activeEditorExplicitlyCustomized = (
    activeEditor?.customizedImageKeys || []
  ).includes(activeEditorImageKey);
  const activeEditorDisplayPlan = getBoosterImageDisplayPlan({
    channel: activeImageChannel,
    meta: activeEditorMeta,
    customized: activeEditorExplicitlyCustomized,
    currentTransform: activeEditorTransform,
    automaticTransform: activeEditorAutomaticTransform,
    requiredTargetRatio: activeEditorSequenceTargetRatio,
  });
  const activeEffectiveZoom = getEffectiveTransformZoom(activeEditorTransform);
  const activeBackgroundMode = getBackgroundMode(activeEditorTransform);
  const activeBackgroundColor = getBackgroundFill(
    activeEditorTransform.backgroundMode || activeBackgroundMode,
    activeEditorTransform.backgroundColor,
  );
  const activePreset = CHANNEL_PRESETS[activeImageChannel];
  const activeEditorPreviewDimensions = (() => {
    if (
      activeEditorDisplayPlan.decision.mode === "original" &&
      activeEditorMeta?.width &&
      activeEditorMeta?.height
    ) {
      return {
        width: activeEditorMeta.width,
        height: activeEditorMeta.height,
      };
    }

    if (activeEditorDisplayPlan.decision.mode === "adapted") {
      return getBoosterImageRenderDimensions({
        baseWidth: activePreset.width,
        baseHeight: activePreset.height,
        targetRatio: activeEditorDisplayPlan.decision.targetRatio,
      });
    }

    if (
      activeEditorDisplayPlan.decision.mode === "customized" &&
      activeImageChannel === "instagram" &&
      activeEditorSequenceTargetRatio
    ) {
      return getBoosterImageRenderDimensions({
        baseWidth: activePreset.width,
        baseHeight: activePreset.height,
        targetRatio: activeEditorSequenceTargetRatio,
      });
    }

    return { width: activePreset.width, height: activePreset.height };
  })();
  const previewAspectRatio = `${activeEditorPreviewDimensions.width} / ${activeEditorPreviewDimensions.height}`;
  const activeEditorDecisionLabel = activeEditorDisplayPlan.decision.label;
  const previewLayout = computePreviewLayout({
    containerWidth: previewStageSize.width,
    containerHeight: previewStageSize.height,
    imageWidth: activeEditorMeta?.width || 0,
    imageHeight: activeEditorMeta?.height || 0,
    transform: activeEditorTransform,
  });

  const clearImagesMedia = () => {
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
    setImageMetaByKey({});
    setChannelImageEditors({});
    setActiveImageKeyByChannel({});
  };

  const onPickImagesClick = () => {
    setImgError("");
    if (images.length >= BOOSTER_MAX_IMAGE_COUNT) return;
    fileInputRef.current?.click();
  };

  const addImageFiles = async (
    pickedFiles: File[],
    targetChannel?: ChannelKey,
  ) => {
    if (!pickedFiles.length) return;
    setImgError("");

    const incoming = pickedFiles.filter(isBoosterImageFile);
    if (!incoming.length) {
      setImgError("Ajoutez des fichiers image valides.");
      return;
    }

    let browserReadyImages: File[];
    try {
      browserReadyImages = await Promise.all(
        incoming.map((file) => convertHeicOrHeifImageFile(file)),
      );
    } catch (error) {
      setImgError(
        error instanceof Error
          ? error.message
          : "Impossible de convertir cette image HEIC. Utilisez une image JPG, PNG ou WebP.",
      );
      return;
    }

    if (!hasVideoMedia) {
      setPublicationMediaType("images");
    }

    const existingKeys = new Set(images.map((file) => makeImageKey(file)));
    const deduped = browserReadyImages.filter(
      (file) => !existingKeys.has(makeImageKey(file)),
    );
    const allowed = deduped.slice(
      0,
      Math.max(0, BOOSTER_MAX_IMAGE_COUNT - images.length),
    );

    if (!allowed.length) {
      setImgError(
        images.length >= BOOSTER_MAX_IMAGE_COUNT
          ? `Maximum ${BOOSTER_MAX_IMAGE_COUNT} images.`
          : "Ces images sont déjà ajoutées.",
      );
      return;
    }

    if (browserReadyImages.length > allowed.length) {
      setImgError(
        images.length + allowed.length >= BOOSTER_MAX_IMAGE_COUNT
          ? `Maximum ${BOOSTER_MAX_IMAGE_COUNT} images.`
          : "Certaines images étaient déjà présentes.",
      );
    }

    const tooBig = allowed.find((file) => file.size > BOOSTER_MAX_IMAGE_BYTES);
    if (tooBig) {
      setImgError(
        `L'image ${tooBig.name} dépasse ${BOOSTER_MAX_IMAGE_MB_LABEL}.`,
      );
      return;
    }

    const totalImageBytes = [...images, ...allowed].reduce(
      (sum, file) => sum + (file?.size || 0),
      0,
    );
    if (totalImageBytes > BOOSTER_MAX_MEDIA_BYTES) {
      setImgError(
        `Vos images dépassent ${BOOSTER_MAX_MEDIA_MB_LABEL} au total. Réduisez le nombre ou le poids des photos.`,
      );
      return;
    }

    const nextFiles = [...images, ...allowed].slice(0, BOOSTER_MAX_IMAGE_COUNT);
    let nextMetaEntries: Array<readonly [string, ImageMeta]>;
    try {
      nextMetaEntries = await Promise.all(
        allowed.map(
          async (file) =>
            [makeImageKey(file), await readImageMeta(file)] as const,
        ),
      );
    } catch {
      setImgError("Une image n'est pas lisible. Utilisez une image JPG, PNG ou WebP.");
      return;
    }
    const nextPreviews = [
      ...imagePreviews,
      ...allowed.map((file) => URL.createObjectURL(file)),
    ].slice(0, BOOSTER_MAX_IMAGE_COUNT);
    const nextMetaMap = Object.fromEntries(nextMetaEntries) as Record<
      string,
      ImageMeta
    >;
    const newKeys = allowed.map((file) => makeImageKey(file));

    setImages(nextFiles);
    setImagePreviews(nextPreviews);
    setImageMetaByKey((prev) => ({ ...prev, ...nextMetaMap }));

    if (!hasVideoMedia) {
      setChannelMediaModes((prev) => {
        const next: Partial<Record<ChannelKey, ChannelMediaMode>> = { ...prev };
        if (targetChannel) {
          if (channelSupportsImages(targetChannel)) next[targetChannel] = "images";
        } else {
          for (const channel of selectedChannels) {
            next[channel] = channelSupportsImages(channel) ? "images" : "none";
          }
        }
        return next;
      });
    }

    if (targetChannel) {
      setChannelImageEditors((prev) => {
        const next = syncChannelImageEditors({
          previous: prev,
          imageKeys: nextFiles.map((file) => makeImageKey(file)),
          selectedChannels,
          imageMetaByKey: { ...imageMetaByKey, ...nextMetaMap },
        });
        if (!channelSupportsImages(targetChannel)) return next;
        const current = next[targetChannel] || {
          imageKeys: [],
          transforms: {},
        };
        next[targetChannel] = {
          ...current,
          imageKeys:
            targetChannel === "gmb"
              ? [newKeys[0]].filter(Boolean)
              : Array.from(new Set([...current.imageKeys, ...newKeys])),
          transforms: current.transforms,
          customizedImageKeys: current.customizedImageKeys || [],
        };
        return next;
      });
    } else {
      setChannelImageEditors((prev) =>
        syncChannelImageEditors({
          previous: prev,
          imageKeys: nextFiles.map((file) => makeImageKey(file)),
          selectedChannels,
          imageMetaByKey: { ...imageMetaByKey, ...nextMetaMap },
        }),
      );
    }
  };

  const onImagesChange = async (
    files: FileList | null,
    targetChannel?: ChannelKey,
  ) => {
    if (!files?.length) return;
    await addImageFiles(Array.from(files), targetChannel);
  };

  const removeImage = (index: number) => {
    setImgError("");
    const removedFile = images[index];
    const removedPreview = imagePreviews[index];
    if (!removedFile) return;

    if (removedPreview) {
      try {
        URL.revokeObjectURL(removedPreview);
      } catch {}
    }

    const removedKey = makeImageKey(removedFile);
    const nextFiles = images.filter((_, idx) => idx !== index);
    const nextPreviews = imagePreviews.filter((_, idx) => idx !== index);
    const remainingKeys = nextFiles.map((file) => makeImageKey(file));

    setImages(nextFiles);
    setImagePreviews(nextPreviews);
    setImageMetaByKey((prev) => {
      const next = { ...prev };
      delete next[removedKey];
      return next;
    });
    setChannelImageEditors((prev) =>
      syncChannelImageEditors({
        previous: prev,
        imageKeys: remainingKeys,
        selectedChannels,
        imageMetaByKey,
      }),
    );
    setActiveImageKeyByChannel((prev) => {
      const next = { ...prev };
      for (const channel of Object.keys(next) as ChannelKey[]) {
        if (next[channel] === removedKey) {
          next[channel] = remainingKeys[0] || "";
        }
      }
      return next;
    });
    if (nextFiles.length === 0) {
      setChannelMediaModes((prev) => {
        const next: Partial<Record<ChannelKey, ChannelMediaMode>> = { ...prev };
        for (const channel of selectedChannels) {
          if (next[channel] === "images") {
            next[channel] = hasVideoMedia ? "video" : "none";
          }
        }
        return next;
      });
    }
  };

  function getSafeDraftImagePath(file: File, index: number) {
    return buildBoosterUploadPath(
      file.name || `image-${index + 1}.jpg`,
      "booster-drafts",
    );
  }

  function getDraftImageSettingsByChannel() {
    return selectedChannels.reduce(
      (acc, channel) => {
        const editor = channelImageEditors[channel] || {
          imageKeys: [],
          transforms: {},
        };
        const imageKeysForChannel = (editor.imageKeys || []).filter((key) =>
          imageKeys.includes(key),
        );
        acc[channel] = {
          imageKeys: !channelSupportsImages(channel)
            ? []
            : channel === "gmb"
              ? imageKeysForChannel.slice(0, 1)
              : imageKeysForChannel,
          transforms: Object.fromEntries(
            Object.entries(editor.transforms || {})
              .filter(([key]) => imageKeysForChannel.includes(key))
              .map(([key, value]) => [key, { ...(value as ImageTransform) }]),
          ),
          customizedImageKeys: (editor.customizedImageKeys || []).filter((key) =>
            imageKeysForChannel.includes(key),
          ),
        };
        return acc;
      },
      {} as Partial<Record<ChannelKey, ChannelImageEditorState>>,
    );
  }

  async function uploadPublicationDraftImages() {
    const uploaded: Array<{
      name: string;
      type?: string;
      size?: number;
      lastModified?: number;
      storagePath?: string;
      publicUrl?: string;
    }> = [];
    for (let index = 0; index < images.length; index += 1) {
      const file = images[index];
      if (!file) continue;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", getSafeDraftImagePath(file, index));
      const response = await fetch("/api/booster/upload-prepared", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          String(
            json?.error || "Impossible d’enregistrer les images du brouillon.",
          ),
        );
      }
      uploaded.push({
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        storagePath: String(json?.storagePath || ""),
        publicUrl: String(json?.publicUrl || ""),
      });
    }
    return uploaded;
  }

  async function restorePublicationDraftImages(imageDrafts: any[]) {
    const restoredFiles: File[] = [];
    const restoredPreviews: string[] = [];
    const restoredMeta: Record<string, ImageMeta> = {};

    for (const image of imageDrafts) {
      const publicUrl = String(image?.publicUrl || image?.url || "").trim();
      const dataUrl = String(image?.dataUrl || "").trim();
      const source = publicUrl || dataUrl;
      if (!source) continue;
      try {
        const response = await fetch(source);
        if (!response.ok) continue;
        const blob = await response.blob();
        const name = String(image?.name || "image.jpg");
        const type = String(image?.type || blob.type || "image/jpeg");
        const lastModified = Number(image?.lastModified || Date.now());
        const file = new File([blob], name, { type, lastModified });
        const key = makeImageKey(file);
        restoredFiles.push(file);
        restoredPreviews.push(URL.createObjectURL(file));
        restoredMeta[key] = await readImageMeta(file);
      } catch {
        // Une ancienne image de brouillon peut ne plus être disponible : on recharge le reste du brouillon.
      }
    }

    return { restoredFiles, restoredPreviews, restoredMeta };
  }

  const updateChannelTransform = (
    channel: ChannelKey,
    imageKey: string,
    patch: Partial<ImageTransform>,
  ) => {
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      for (const targetChannel of getImpactedImageChannels(channel)) {
        const current = next[targetChannel] || {
          imageKeys: imageKeys.slice(),
          transforms: {},
          customizedImageKeys: [],
        };
        const automaticTransform = getOptimizedTransform(
          targetChannel,
          imageMetaByKey[imageKey],
        );
        const nextTransform = {
          ...(current.transforms[imageKey] || automaticTransform),
          ...patch,
        };
        const customizedImageKeys = new Set(current.customizedImageKeys || []);
        if (
          areBoosterImageTransformsEquivalent(
            nextTransform,
            automaticTransform,
          )
        ) {
          customizedImageKeys.delete(imageKey);
        } else {
          customizedImageKeys.add(imageKey);
        }
        next[targetChannel] = {
          ...current,
          imageKeys: current.imageKeys,
          transforms: {
            ...current.transforms,
            [imageKey]: nextTransform,
          },
          customizedImageKeys: Array.from(customizedImageKeys),
        };
      }
      return next;
    });
  };

  const setContainMode = (channel: ChannelKey, imageKey: string) => {
    const current =
      channelImageEditors[channel]?.transforms?.[imageKey] ||
      getOptimizedTransform(channel, imageMetaByKey[imageKey]);
    const backgroundMode =
      current.fit === "contain"
        ? getBackgroundMode(current)
        : channel === "inrcy_site" ||
            channel === "site_web" ||
            channel === "gmb"
          ? "color"
          : "white";
    const backgroundColor =
      current.backgroundColor ||
      (channel === "inrcy_site" || channel === "site_web" || channel === "gmb"
        ? "#ffffff"
        : "#ffffff");
    updateChannelTransform(channel, imageKey, {
      fit: "contain",
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      backgroundMode:
        backgroundMode === "transparent" ? "transparent" : "color",
      backgroundColor,
      blurBackground: false,
    });
  };

  const setCoverMode = (channel: ChannelKey, imageKey: string) => {
    updateChannelTransform(channel, imageKey, {
      fit: "cover",
      backgroundMode: "black",
      blurBackground: false,
    });
  };

  const nudgeZoom = (delta: number) => {
    if (!activeEditorImageKey) return;
    const maxZoom = activeEditorTransform.fit === "cover" ? 3 : 1;
    const currentZoom = getEffectiveTransformZoom(activeEditorTransform);
    const nextZoom = clamp(currentZoom + delta, 0.4, maxZoom);
    updateChannelTransform(activeImageChannel, activeEditorImageKey, {
      zoom: nextZoom,
    });
  };

  const handlePreviewWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (
      !activeEditorImageKey ||
      !activeEditorMeta?.width ||
      !activeEditorMeta?.height ||
      !previewStageRef.current
    )
      return;
    if (event.cancelable) event.preventDefault();

    const rect = previewStageRef.current.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const maxZoom = activeEditorTransform.fit === "cover" ? 3 : 1;
    const currentZoom = getEffectiveTransformZoom(activeEditorTransform);
    const nextZoom = clamp(
      currentZoom + (event.deltaY < 0 ? 0.08 : -0.08),
      0.4,
      maxZoom,
    );

    const nextLayout = computePreviewLayout({
      containerWidth: rect.width,
      containerHeight: rect.height,
      imageWidth: activeEditorMeta.width,
      imageHeight: activeEditorMeta.height,
      transform: { ...activeEditorTransform, zoom: nextZoom },
    });

    const currentDrawW = previewLayout.drawW || nextLayout.drawW;
    const currentDrawH = previewLayout.drawH || nextLayout.drawH;
    const ux = currentDrawW
      ? (pointerX - previewLayout.dx) / currentDrawW
      : 0.5;
    const uy = currentDrawH
      ? (pointerY - previewLayout.dy) / currentDrawH
      : 0.5;
    const nextDx = pointerX - ux * nextLayout.drawW;
    const nextDy = pointerY - uy * nextLayout.drawH;
    const offsets = offsetFromDrawPosition({
      containerWidth: rect.width,
      containerHeight: rect.height,
      drawW: nextLayout.drawW,
      drawH: nextLayout.drawH,
      dx: nextDx,
      dy: nextDy,
    });

    updateChannelTransform(activeImageChannel, activeEditorImageKey, {
      zoom: nextZoom,
      ...offsets,
    });
  };

  const handlePreviewPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!activeEditorImageKey) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: activeEditorTransform.offsetX,
      startOffsetY: activeEditorTransform.offsetY,
    };
    setIsDraggingImage(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePreviewPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !activeEditorImageKey)
      return;
    const nextOffsetX = previewLayout.maxX
      ? clamp(
          drag.startOffsetX -
            ((event.clientX - drag.startX) / previewLayout.maxX) * 100,
          -100,
          100,
        )
      : 0;
    const nextOffsetY = previewLayout.maxY
      ? clamp(
          drag.startOffsetY -
            ((event.clientY - drag.startY) / previewLayout.maxY) * 100,
          -100,
          100,
        )
      : 0;
    updateChannelTransform(activeImageChannel, activeEditorImageKey, {
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
    });
  };

  const endPreviewDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDraggingImage(false);
  };

  const toggleChannelImage = (channel: ChannelKey, imageKey: string) => {
    const impactedChannels = getImpactedImageChannels(channel);
    setChannelImageEditors((prev) => {
      const current = prev[channel] || {
        imageKeys: imageKeys.slice(),
        transforms: {},
      };
      const exists = current.imageKeys.includes(imageKey);
      const nextKeys =
        channel === "gmb"
          ? exists
            ? []
            : [imageKey]
          : exists
            ? current.imageKeys.filter((key) => key !== imageKey)
            : [...current.imageKeys, imageKey];
      const next = { ...prev };
      for (const targetChannel of impactedChannels) {
        const currentTarget = next[targetChannel] || {
          imageKeys: imageKeys.slice(),
          transforms: {},
        };
        next[targetChannel] = {
          ...currentTarget,
          imageKeys: nextKeys,
          transforms: {
            ...currentTarget.transforms,
            [imageKey]:
              currentTarget.transforms[imageKey] ||
              getOptimizedTransform(targetChannel, imageMetaByKey[imageKey]),
          },
        };
      }
      return next;
    });
    setActiveImageKeyByChannel((prev) => {
      const currentKeys = channelImageEditors[channel]?.imageKeys || [];
      const exists = currentKeys.includes(imageKey);
      if (channel === "gmb") {
        return { ...prev, [channel]: exists ? "" : imageKey };
      }
      if (prev[channel] !== imageKey) return prev;
      const nextKeys = currentKeys.filter((key) => key !== imageKey);
      return {
        ...prev,
        ...Object.fromEntries(
          impactedChannels.map((targetChannel) => [
            targetChannel,
            nextKeys[0] || "",
          ]),
        ),
      };
    });
  };

  const resetChannelImage = async (channel: ChannelKey, imageKey: string) => {
    const ok = await confirmInrcy({
      eyebrow: "Retouche image",
      title: "Réinitialiser le cadrage ?",
      message:
        "Le cadrage actuel de cette image sera remplacé par le cadrage automatique.",
      cancelLabel: "Annuler",
      confirmLabel: "Réinitialiser",
      variant: "warning",
    });
    if (!ok) return;
    updateChannelTransform(
      channel,
      imageKey,
      getOptimizedTransform(channel, imageMetaByKey[imageKey]),
    );
  };

  const resetActiveChannelImages = async () => {
    const imageKeysForChannel =
      channelImageEditors[activeImageChannel]?.imageKeys || [];
    if (!imageKeysForChannel.length) return;
    const ok = await confirmInrcy({
      eyebrow: "Retouche image",
      title: "Réinitialiser tous les cadrages du canal ?",
      message:
        "Tous les cadrages de ce canal seront remplacés par le cadrage automatique.",
      cancelLabel: "Annuler",
      confirmLabel: "Réinitialiser",
      variant: "warning",
    });
    if (!ok) return;
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      const current = next[activeImageChannel] || {
        imageKeys: imageKeysForChannel,
        transforms: {},
      };
      const transforms = { ...current.transforms };
      for (const imageKey of imageKeysForChannel) {
        transforms[imageKey] = getOptimizedTransform(
          activeImageChannel,
          imageMetaByKey[imageKey],
        );
      }
      next[activeImageChannel] = {
        ...current,
        imageKeys: imageKeysForChannel,
        transforms,
        customizedImageKeys: (current.customizedImageKeys || []).filter(
          (key) => !imageKeysForChannel.includes(key),
        ),
      };
      return next;
    });
  };

  const applyCurrentCadrageToActiveChannelImages = () => {
    if (!activeEditorImageKey) return;
    const imageKeysForChannel =
      channelImageEditors[activeImageChannel]?.imageKeys || [];
    if (imageKeysForChannel.length <= 1) return;
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      const current = next[activeImageChannel] || {
        imageKeys: imageKeysForChannel,
        transforms: {},
      };
      const transforms = { ...current.transforms };
      for (const imageKey of imageKeysForChannel) {
        transforms[imageKey] = { ...activeEditorTransform };
      }
      const customizedImageKeys = new Set(current.customizedImageKeys || []);
      for (const imageKey of imageKeysForChannel) {
        const automaticTransform = getOptimizedTransform(
          activeImageChannel,
          imageMetaByKey[imageKey],
        );
        if (
          areBoosterImageTransformsEquivalent(
            transforms[imageKey],
            automaticTransform,
          )
        ) {
          customizedImageKeys.delete(imageKey);
        } else {
          customizedImageKeys.add(imageKey);
        }
      }
      next[activeImageChannel] = {
        ...current,
        imageKeys: imageKeysForChannel,
        transforms,
        customizedImageKeys: Array.from(customizedImageKeys),
      };
      return next;
    });
  };

  const moveChannelImage = (
    channel: ChannelKey,
    imageKey: string,
    direction: -1 | 1,
  ) => {
    setChannelImageEditors((prev) => {
      const current = prev[channel] || {
        imageKeys: imageKeys.slice(),
        transforms: {},
      };
      const index = current.imageKeys.indexOf(imageKey);
      const targetIndex = index + direction;
      if (
        index < 0 ||
        targetIndex < 0 ||
        targetIndex >= current.imageKeys.length
      )
        return prev;
      const nextKeys = current.imageKeys.slice();
      const [moved] = nextKeys.splice(index, 1);
      nextKeys.splice(targetIndex, 0, moved);
      return {
        ...prev,
        [channel]: { ...current, imageKeys: nextKeys },
      };
    });
  };

  const applyCurrentImageToSelectedChannels = () => {
    if (!activeEditorImageKey) return;
    setChannelImageEditors((prev) => {
      const next = { ...prev };
      for (const channel of selectedChannels) {
        const current = next[channel] || {
          imageKeys: imageKeys.slice(),
          transforms: {},
        };
        const automaticTransform = getOptimizedTransform(
          channel,
          imageMetaByKey[activeEditorImageKey],
        );
        const customizedImageKeys = new Set(current.customizedImageKeys || []);
        if (
          areBoosterImageTransformsEquivalent(
            activeEditorTransform,
            automaticTransform,
          )
        ) {
          customizedImageKeys.delete(activeEditorImageKey);
        } else {
          customizedImageKeys.add(activeEditorImageKey);
        }
        next[channel] = {
          ...current,
          imageKeys:
            channel === "gmb"
              ? [activeEditorImageKey]
              : current.imageKeys.includes(activeEditorImageKey)
                ? current.imageKeys
                : [...current.imageKeys, activeEditorImageKey],
          transforms: {
            ...current.transforms,
            [activeEditorImageKey]: { ...activeEditorTransform },
          },
          customizedImageKeys: Array.from(customizedImageKeys),
        };
      }
      return next;
    });
  };

  const openImageEditor = (channel: ChannelKey, imageKey: string) => {
    preservePublishScroll();
    setSynchronizedActiveChannel(channel);
    setActiveImageKeyByChannel((prev) => ({ ...prev, [channel]: imageKey }));
    setIsImageEditorOpen(true);
  };

  const closeImageEditor = () => {
    dragStateRef.current = null;
    setIsDraggingImage(false);
    setIsImageEditorOpen(false);
    restorePublishScroll();
  };

  const fileToImagePayload = (file: File): Promise<ImagePayload> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({
          name: file.name || "image.jpg",
          type: file.type || "image/jpeg",
          dataUrl: String(reader.result || ""),
        });
      reader.onerror = () =>
        reject(
          reader.error ??
            new Error("Impossible de préparer l'image originale."),
        );
      reader.readAsDataURL(file);
    });

  const buildAutomaticRenderPreset = (
    channel: ChannelKey,
    targetRatio: number | null,
  ) => {
    const base = CHANNEL_PRESETS[channel];
    const dimensions = getBoosterImageRenderDimensions({
      baseWidth: base.width,
      baseHeight: base.height,
      targetRatio,
    });
    return { ...base, ...dimensions };
  };

  const uploadOriginalImagesForPublication = async (
    onProgress?: (current: number, total: number) => void,
  ): Promise<Record<string, ImagePayload>> => {
    if (!images.length) return {};
    const originalPayloads = await Promise.all(
      images.map((file) => fileToImagePayload(file)),
    );
    const uploadedOriginals = await uploadPreparedImages(
      originalPayloads,
      onProgress,
    );
    return Object.fromEntries(
      images.map((file, index) => [
        makeImageKey(file),
        uploadedOriginals[index],
      ]),
    );
  };

  const buildChannelImagesPayload = async (
    onProgress?: (current: number, total: number) => void,
  ): Promise<{
    channelImages: ChannelImagePayload;
    channelSettings: ChannelImageSettingsPayload;
  }> => {
    const channelImages = {} as ChannelImagePayload;
    const channelSettings = {} as ChannelImageSettingsPayload;
    const getEditorForPublish = (channel: ChannelKey) => {
      return channelImageEditors[channel] || { imageKeys: [], transforms: {} };
    };

    const totalRenders = selectedChannels.reduce((sum, channel) => {
      if (!channelSupportsImages(channel)) return sum;
      const editor = getEditorForPublish(channel);
      const keys =
        channel === "gmb" ? editor.imageKeys.slice(0, 1) : editor.imageKeys;
      return sum + keys.length;
    }, 0);
    let doneRenders = 0;

    for (const channel of selectedChannels) {
      if (!channelSupportsImages(channel)) {
        channelImages[channel] = [];
        channelSettings[channel] = {
          imageKeys: [],
          transforms: {},
          customizedImageKeys: [],
        };
        continue;
      }

      const editor = getEditorForPublish(channel);
      const renderList: ImagePayload[] = [];
      const actualTransforms: Record<string, ImageTransform> = {};
      const actualCustomizedImageKeys: string[] = [];
      const imageKeysToRender =
        channel === "gmb" ? editor.imageKeys.slice(0, 1) : editor.imageKeys;
      const firstImageKey = imageKeysToRender[0] || "";
      const sequenceTargetRatio = getBoosterImageSequenceTargetRatio({
        channel,
        metas: imageKeysToRender.map((key) => imageMetaByKey[key]),
        firstImageCustomizedTargetRatio:
          channel === "instagram" &&
          firstImageKey &&
          (editor.customizedImageKeys || []).includes(firstImageKey)
            ? CHANNEL_PRESETS.instagram.width / CHANNEL_PRESETS.instagram.height
            : null,
      });

      for (const imageKey of imageKeysToRender) {
        const file = imageFileByKey[imageKey];
        if (!file) continue;

        const imageMeta = imageMetaByKey[imageKey];
        const automaticTransform = getOptimizedTransform(channel, imageMeta);
        const currentTransform =
          editor.transforms[imageKey] || automaticTransform;
        const explicitlyCustomized = (editor.customizedImageKeys || []).includes(
          imageKey,
        );
        const displayPlan = getBoosterImageDisplayPlan({
          channel,
          meta: imageMeta,
          customized: explicitlyCustomized,
          currentTransform,
          automaticTransform,
          requiredTargetRatio: sequenceTargetRatio,
        });

        let payload: ImagePayload;
        let outputTransform: ImageTransform;

        if (displayPlan.decision.mode === "original") {
          payload = await fileToImagePayload(file);
          outputTransform = automaticTransform;
        } else if (displayPlan.decision.mode === "adapted") {
          outputTransform = {
            ...automaticTransform,
            fit: displayPlan.automaticFit,
            zoom: 1,
            offsetX: 0,
            offsetY: 0,
            blurBackground: false,
            backgroundMode:
              displayPlan.automaticFit === "contain" ? "color" : "black",
            backgroundColor: "#ffffff",
          };
          payload = await renderChannelImage({
            file,
            transform: outputTransform,
            preset: buildAutomaticRenderPreset(
              channel,
              displayPlan.decision.targetRatio,
            ),
            channel,
          });
        } else {
          outputTransform = currentTransform;
          const customizedPreset =
            channel === "instagram" && sequenceTargetRatio
              ? buildAutomaticRenderPreset(channel, sequenceTargetRatio)
              : CHANNEL_PRESETS[channel];
          payload = await renderChannelImage({
            file,
            transform: currentTransform,
            preset: customizedPreset,
            channel,
          });
          actualCustomizedImageKeys.push(imageKey);
        }

        actualTransforms[imageKey] = { ...outputTransform };
        renderList.push({
          ...payload,
          imageKey,
          transform: { ...outputTransform },
          imageMeta,
          imageDecisionMode: displayPlan.decision.mode,
          imageDecisionLabel: displayPlan.decision.label,
          isCustomized: displayPlan.decision.mode === "customized",
        });
        doneRenders += 1;
        onProgress?.(doneRenders, totalRenders);
      }

      channelImages[channel] = renderList;
      channelSettings[channel] = {
        imageKeys: [...imageKeysToRender],
        transforms: actualTransforms,
        customizedImageKeys: actualCustomizedImageKeys,
      };
    }

    if (!totalRenders) onProgress?.(0, 0);

    return { channelImages, channelSettings };
  };

  const getPublishImageKeysForChannel = (channel: ChannelKey) => {
    if (!channelSupportsImages(channel)) return [];
    const keys = channelImageEditors[channel]?.imageKeys || [];
    return channel === "gmb" ? keys.slice(0, 1) : keys;
  };

  return {
    imageAdapterChannels,
    getImageAdapterLabel,
    imageKeys,
    previewByKey,
    activeEditorImageKey,
    activeEditorTransform,
    activeEditorDecisionLabel,
    activeEditorMeta,
    activeEffectiveZoom,
    activeBackgroundMode,
    activeBackgroundColor,
    previewAspectRatio,
    previewLayout,
    clearImagesMedia,
    onPickImagesClick,
    addImageFiles,
    onImagesChange,
    removeImage,
    getDraftImageSettingsByChannel,
    uploadPublicationDraftImages,
    restorePublicationDraftImages,
    updateChannelTransform,
    setContainMode,
    setCoverMode,
    nudgeZoom,
    handlePreviewWheel,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    endPreviewDrag,
    toggleChannelImage,
    resetChannelImage,
    resetActiveChannelImages,
    applyCurrentCadrageToActiveChannelImages,
    moveChannelImage,
    applyCurrentImageToSelectedChannels,
    openImageEditor,
    closeImageEditor,
    uploadOriginalImagesForPublication,
    buildChannelImagesPayload,
    getPublishImageKeysForChannel,
  };
}
