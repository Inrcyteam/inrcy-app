import type { MutableRefObject } from "react";
import StatusMessage from "../../../_components/StatusMessage";

type PublishModalStyles = Readonly<Record<string, string>>;

type PublishFooterActionsProps = {
  styles: PublishModalStyles;
  publishAreaRef: MutableRefObject<HTMLDivElement | null>;
  saving: boolean;
  draftSaving: boolean;
  publishProgress: number;
  publishProgressLabel: string;
  publishError: string;
  onPublish: () => void;
};

export default function PublishFooterActions({styles,publishAreaRef,saving,draftSaving,publishProgress,publishProgressLabel,publishError,onPublish,}: PublishFooterActionsProps) {
  return (
    <div ref={publishAreaRef} className={styles.publishFooterRoot}>
      <div className={styles.publishFooterRow}>
        {saving ? (
          <div className={styles.publishProgressBox}>
            <div className={styles.publishProgressHeader}>
              <strong className={styles.publishProgressTitle}>Publication en cours</strong>
              <strong className={styles.publishProgressPercent}>{publishProgress}%</strong>
            </div>
            <span className={styles.publishProgressLabel}>{publishProgressLabel || 'Publication en cours...'}</span>
            <div className={styles.publishProgressTrack}>
              <div style={{height:'100%',width:`${publishProgress}%`,borderRadius:999,background:'linear-gradient(90deg, rgba(76,195,255,0.92), rgba(99,102,241,0.95))',transition:'width 180ms ease'}} />
            </div>
          </div>
        ) : (
          <button type="button" className={styles.primaryBtn} onClick={onPublish} disabled={draftSaving} style={{minHeight:52,padding:'0 24px',fontSize:16,fontWeight:800,opacity:draftSaving?0.64:1,cursor:draftSaving?'wait':'pointer',marginLeft:'auto'}}>
            Vérifier et publier
          </button>
        )}
      </div>
      {publishError ? <StatusMessage variant="error" style={{marginTop:0,textAlign:'right',maxWidth:440,justifySelf:'end'}}>{publishError}</StatusMessage> : null}
    </div>
  );
}
