"use client";

import styles from "./NotificationMenu.module.css";
import type { NotificationItem } from "../dashboard.types";

export default function NotificationMenu(props: {
  notificationMenuOpen: boolean;
  setNotificationMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  unreadNotificationsCount: number;
  refreshNotifications: () => void | Promise<void>;
  notificationsLoading: boolean;
  notifications: NotificationItem[];
  notificationsError: string | null;
  openPanel: (panel?: "notifications") => void;
  markAllNotificationsRead: () => void | Promise<void>;
  markNotificationRead: (id: string) => void | Promise<void>;
  deleteNotification: (id: string) => void | Promise<void>;
  onNavigate: (ctaUrl: string) => void;
  mobile?: boolean;
}) {
  const {
    notificationMenuOpen,
    setNotificationMenuOpen,
    unreadNotificationsCount,
    refreshNotifications,
    notificationsLoading,
    notifications,
    notificationsError,
    openPanel,
    markAllNotificationsRead,
    markNotificationRead,
    deleteNotification,
    onNavigate,
    mobile = false,
  } = props;

  return (
    <>
      <button
        type="button"
        className={`${styles.notificationBellBtn} ${mobile ? styles.notificationBellBtnMobile : ""}`.trim()}
        aria-label="Ouvrir les notifications"
        aria-expanded={notificationMenuOpen}
        onClick={() => {
          setNotificationMenuOpen((v) => !v);
          if (!notificationMenuOpen) {
            void refreshNotifications();
          }
        }}
      >
        <span className={styles.notificationBellIcon} aria-hidden>🔔</span>
        {unreadNotificationsCount > 0 && (
          <span className={styles.notificationBellCount} aria-hidden>
            {Math.min(99, unreadNotificationsCount)}
          </span>
        )}
      </button>

      {notificationMenuOpen && (
        <div className={`${styles.notificationPanel} ${mobile ? styles.notificationPanelMobile : ""}`.trim()} role="dialog" aria-label="Notifications">
          <div className={styles.notificationPanelHeader}>
            <div>
              <div className={styles.notificationPanelTitle}>Actions à mener</div>
              <div className={styles.notificationPanelSub}>Votre cockpit vous relance au bon moment.</div>
            </div>
            <div className={styles.notificationPanelHeaderActions}>
              <button type="button" className={styles.notificationGhostBtn} onClick={() => { setNotificationMenuOpen(false); openPanel(); }}>
                Réglages
              </button>
              <button type="button" className={styles.notificationGhostBtn} onClick={() => { void markAllNotificationsRead(); }}>
                Tout lire
              </button>
            </div>
          </div>

          <div className={styles.notificationList}>
            {notificationsLoading && notifications.length === 0 ? (
              <div className={styles.notificationEmpty}>Chargement des notifications…</div>
            ) : notificationsError ? (
              <div className={styles.notificationEmpty}>{notificationsError}</div>
            ) : notifications.length === 0 ? (
              <div className={styles.notificationEmpty}>Votre cloche est vide pour l’instant. Les prochaines relances business arriveront ici.</div>
            ) : (
              notifications.slice(0, 6).map((item) => (
                <div key={item.id} className={styles.notificationCard}>
                  <div className={styles.notificationMetaRow}>
                    <span className={`${styles.notificationCategory} ${styles[`notificationCategory_${item.category}`]}`}>{item.categoryLabel}</span>
                    <span className={styles.notificationDate}>{item.relativeDate}</span>
                  </div>
                  <div className={styles.notificationTitleRow}>
                    <div className={styles.notificationTitle}>{item.title}</div>
                    <div className={styles.notificationTitleActions}>
                      {item.unread && <span className={styles.notificationUnreadDot} aria-hidden />}
                      <button
                        type="button"
                        className={styles.notificationDeleteBtn}
                        aria-label="Supprimer la notification"
                        title="Supprimer la notification"
                        onClick={() => { void deleteNotification(item.id); }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div className={styles.notificationBody}>{item.body}</div>
                  <div className={styles.notificationActions}>
                    {item.cta_url && item.cta_label ? (
                      <button
                        type="button"
                        className={styles.notificationActionBtn}
                        onClick={() => {
                          void markNotificationRead(item.id);
                          setNotificationMenuOpen(false);
                          if (!item.cta_url) return;
                          onNavigate(item.cta_url);
                        }}
                      >
                        {item.cta_label}
                      </button>
                    ) : null}
                    {item.unread && (
                      <button
                        type="button"
                        className={styles.notificationGhostBtn}
                        onClick={() => { void markNotificationRead(item.id); }}
                      >
                        Marquer comme lu
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
