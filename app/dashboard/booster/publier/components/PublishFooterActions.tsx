import type { MutableRefObject } from "react";
import HelpButton from "../../../_components/HelpButton";
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
  onOpenHelp: () => void;
  onPublish: () => void;
};

export default function PublishFooterActions({styles,publishAreaRef,saving,draftSaving,publishProgress,publishProgressLabel,publishError,onOpenHelp,onPublish,}: PublishFooterActionsProps) {
  return (
    <div ref={publishAreaRef} style={{display:"grid",gap:8,justifyItems:"end",scrollMarginBottom:24}}>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap",alignItems:"center",width:"100%"}}>
        <HelpButton onClick={onOpenHelp} title="Aide publication et iNr'Send" size={32} />

        {saving ? (
          <div style={{display:'flex',alignItems:'center',gap:12,minHeight:52,padding:'0 16px',borderRadius:999,border:'1px solid rgba(76,195,255,0.22)',background:'rgba(76,195,255,0.08)',minWidth:420,maxWidth:700}}>
            <strong style={{whiteSpace:'nowrap'}}>Publication en cours</strong>
            <span style={{fontSize:12,opacity:.9,flex:1}}>{publishProgressLabel || 'Publication en cours...'}</span>
            <strong>{publishProgress}%</strong>
            <div style={{width:140,height:8,borderRadius:999,background:'rgba(255,255,255,0.10)',overflow:'hidden'}}>
              <div style={{height:'100%',width:`${publishProgress}%`,borderRadius:999,background:'linear-gradient(90deg, rgba(76,195,255,0.92), rgba(99,102,241,0.95))',transition:'width 180ms ease'}} />
            </div>
          </div>
        ) : (
          <button type="button" className={styles.primaryBtn} onClick={onPublish} disabled={draftSaving} style={{minHeight:52,padding:'0 24px',fontSize:16,fontWeight:800,opacity:draftSaving?0.64:1,cursor:draftSaving?'wait':'pointer'}}>
            Vérifier et publier
          </button>
        )}
      </div>
      {publishError ? <StatusMessage variant="error" style={{marginTop:0,textAlign:'right',maxWidth:440,justifySelf:'end'}}>{publishError}</StatusMessage> : null}
    </div>
  );
}
