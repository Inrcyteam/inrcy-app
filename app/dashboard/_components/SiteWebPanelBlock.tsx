import type { ComponentProps } from "react";

import SiteWebPanel from "./SiteWebPanel";

type SiteWebPanelProps = ComponentProps<typeof SiteWebPanel>;

type SiteWebPanelBlockProps = {
  panel: string | null;
  panelProps: SiteWebPanelProps;
};

export default function SiteWebPanelBlock({ panel, panelProps }: SiteWebPanelBlockProps) {
  if (panel !== "site_web") return null;
  return <SiteWebPanel {...panelProps} />;
}
