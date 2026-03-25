import { createPublicationChannelHandlers } from "@/lib/inrsend/publicationChannelActions";

export const { PATCH, DELETE } = createPublicationChannelHandlers("inrcy_site");
