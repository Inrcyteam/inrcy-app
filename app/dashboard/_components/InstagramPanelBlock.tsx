import InstagramPanel from "./InstagramPanel";

type InstagramPanelBlockProps = {
  panel: string | null;
  panelProps: React.ComponentProps<typeof InstagramPanel>;
};

export default function InstagramPanelBlock({ panel, panelProps }: InstagramPanelBlockProps) {
  if (panel !== "instagram") return null;
  return <InstagramPanel {...panelProps} />;
}
