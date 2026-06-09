import { Suspense } from "react";

import DiagnosticClient from "./DiagnosticClient";
import styles from "./diagnostic.module.css";

export default function DiagnosticPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.pageShell}>
          <div className={styles.card}>Chargement du diagnostic…</div>
        </main>
      }
    >
      <DiagnosticClient />
    </Suspense>
  );
}
