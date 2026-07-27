import { createPublicationChannelHandlers } from "@/lib/inrsend/publicationChannelActions";

export const runtime = "nodejs";
export const maxDuration = 180;

export const { PATCH, DELETE } = createPublicationChannelHandlers("pinterest");
