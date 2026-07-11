import type { MetadataRoute } from "next";
import { getInrSearchPublicOrigin } from "@/lib/inrSearchPublic";
import { INR_SEARCH_INDEXNOW_KEY } from "@/lib/inrSearchSeo";

export default function robots(): MetadataRoute.Robots {
  const origin = getInrSearchPublicOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/entreprises",
          "/entreprises/",
          "/metiers",
          "/metiers/",
          "/secteurs",
          "/secteurs/",
          `/${INR_SEARCH_INDEXNOW_KEY}.txt`,
        ],
        disallow: ["/dashboard/", "/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
