import React from "react";
import styles from "../mails.module.css";
import { ALL_FOLDERS, folderLabel, folderTheme, type Folder, type FolderCounts } from "../_lib/mailboxPhase1";

type Props = {
  folder: Folder;
  counts: FolderCounts;
  onSelectFolder: (folder: Folder) => void;
};

export default function FolderTabs({ folder, counts, onSelectFolder }: Props) {
  return (
    <div className={styles.folderTabs}>
      {ALL_FOLDERS.map((f) => {
        const active = f === folder;
        return (
          <button
            key={f}
            className={`${styles.folderTabBtn} ${active ? styles.folderTabBtnActive : ""}`}
            style={folderTheme(f)}
            onClick={() => onSelectFolder(f)}
            type="button"
            title={folderLabel(f)}
          >
            <span className={styles.folderTabLabel}>{folderLabel(f)}</span>
            <span className={styles.badgeCount}>{counts[f] || 0}</span>
          </button>
        );
      })}
    </div>
  );
}
