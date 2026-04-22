import FacebookPanel from "./FacebookPanel";

type FacebookPanelBlockProps = {
  panel: string | null;
  panelProps: React.ComponentProps<typeof FacebookPanel>;
};

export default function FacebookPanelBlock({ panel, panelProps }: FacebookPanelBlockProps) {
  if (panel !== "facebook") return null;
  return <FacebookPanel {...panelProps} />;
}
