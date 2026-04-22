import type { ComponentProps } from "react";

import GoogleBusinessPanel from "./GoogleBusinessPanel";

type GmbPanelProps = ComponentProps<typeof GoogleBusinessPanel>;

type GmbPanelBlockProps = {
  panel: string | null;
  panelProps: GmbPanelProps;
};

export default function GmbPanelBlock({ panel, panelProps }: GmbPanelBlockProps) {
  if (panel !== "gmb") return null;
  return <GoogleBusinessPanel {...panelProps} />;
}
