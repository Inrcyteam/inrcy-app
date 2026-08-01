import { DASHBOARD_BUBBLE_ICON_PRELOADS } from "../dashboard.constants";

const cacheStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
  zIndex: -1,
} as const;

/**
 * Keeps the small dashboard bubble icons mounted inside the persistent
 * dashboard layout. Their immutable static URLs stay loaded and decoded while
 * the professional navigates between dashboard tools, so returning to the
 * dashboard does not repaint empty logo circles first.
 */
export default function DashboardPersistentImageCache() {
  return (
    <div aria-hidden="true" data-dashboard-persistent-image-cache style={cacheStyle}>
      {DASHBOARD_BUBBLE_ICON_PRELOADS.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          width={96}
          height={96}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      ))}
    </div>
  );
}
