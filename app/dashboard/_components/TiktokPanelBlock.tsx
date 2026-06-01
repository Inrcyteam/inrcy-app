import type { ComponentProps } from "react";

import TiktokPanel from "./TiktokPanel";

type TiktokPanelProps = ComponentProps<typeof TiktokPanel>;

type TiktokPanelBlockProps = {
  panel: string | null;
  panelProps: TiktokPanelProps;
};

export default function TiktokPanelBlock({ panel, panelProps }: TiktokPanelBlockProps) {
  if (panel !== "tiktok") return null;
  return <TiktokPanel {...panelProps} />;
}
