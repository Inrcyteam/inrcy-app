import type { ComponentProps } from "react";

import LinkedinPanel from "./LinkedinPanel";

type LinkedinPanelProps = ComponentProps<typeof LinkedinPanel>;

type LinkedinPanelBlockProps = {
  panel: string | null;
  panelProps: LinkedinPanelProps;
};

export default function LinkedinPanelBlock({ panel, panelProps }: LinkedinPanelBlockProps) {
  if (panel !== "linkedin") return null;
  return <LinkedinPanel {...panelProps} />;
}
