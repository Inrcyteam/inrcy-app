import styles from "../legal.module.css";

export default function LegalPageShell(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.h1}>{props.title}</h1>
          {props.subtitle ? <p className={styles.subtitle}>{props.subtitle}</p> : null}
          <div style={{ marginTop: 14 }}>{props.children}</div>
          <p className={styles.small} style={{ marginTop: 18 }}>
            Dernière mise à jour : 11/02/2026
          </p>
        </div>
      </div>
    </main>
  );
}
