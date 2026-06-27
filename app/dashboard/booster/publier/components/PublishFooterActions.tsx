import type { MutableRefObject } from "react";
import StatusMessage from "../../../_components/StatusMessage";
import PublishExecutionProgress from "../../../_components/PublishExecutionProgress";

type PublishModalStyles = Readonly<Record<string, string>>;

type PublishFooterActionsProps = {
  styles: PublishModalStyles;
  publishAreaRef: MutableRefObject<HTMLDivElement | null>;
  saving: boolean;
  scheduling: boolean;
  draftSaving: boolean;
  publishProgress: number;
  publishProgressLabel: string;
  publishError: string;
  onPublish: () => void;
  onSchedule: () => void;
};

export default function PublishFooterActions({
  styles,
  publishAreaRef,
  saving,
  scheduling,
  draftSaving,
  publishProgress,
  publishProgressLabel,
  publishError,
  onPublish,
  onSchedule,
}: PublishFooterActionsProps) {
  const busy = saving || scheduling;
  return (
    <div ref={publishAreaRef} className={styles.publishFooterRoot}>
      <div className={styles.publishFooterRow}>
        {busy ? (
          <PublishExecutionProgress
            styles={styles}
            scheduling={scheduling}
            publishProgress={publishProgress}
            publishProgressLabel={publishProgressLabel}
          />
        ) : (
          <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'flex-end',marginLeft:'auto'}}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onSchedule}
              disabled={draftSaving}
              style={{minHeight:52,padding:'0 18px',fontSize:15,fontWeight:800,opacity:draftSaving?0.64:1,cursor:draftSaving?'wait':'pointer'}}
            >
              🕒 Programmer
            </button>
            <button type="button" className={styles.primaryBtn} onClick={onPublish} disabled={draftSaving} style={{minHeight:52,padding:'0 24px',fontSize:16,fontWeight:800,opacity:draftSaving?0.64:1,cursor:draftSaving?'wait':'pointer'}}>
              Vérifier et publier
            </button>
          </div>
        )}
      </div>
      {publishError ? <StatusMessage variant="error" style={{marginTop:0,textAlign:'right',maxWidth:520,justifySelf:'end'}}>{publishError}</StatusMessage> : null}
    </div>
  );
}
