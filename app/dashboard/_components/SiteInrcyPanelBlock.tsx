import type { ComponentProps } from "react";

import SiteInrcyPanel from "./SiteInrcyPanel";

type SiteInrcyPanelProps = ComponentProps<typeof SiteInrcyPanel>;

type SiteInrcyPanelBlockProps = {
  panel: string | null;
  panelProps: SiteInrcyPanelProps;
};

export default function SiteInrcyPanelBlock({ panel, panelProps }: SiteInrcyPanelBlockProps) {
  if (panel !== "site_inrcy") return null;
  return <SiteInrcyPanel {...panelProps} />;
}
