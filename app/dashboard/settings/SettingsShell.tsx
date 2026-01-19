// app/dashboard/settings/SettingsShell.tsx
import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export default function SettingsShell({ title, subtitle, children }: Props) {
  return (
    <main style={{ padding: "24px 0" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{title}</h1>
        {subtitle ? (
          <p style={{ margin: "8px 0 0", opacity: 0.8 }}>{subtitle}</p>
        ) : null}
      </div>

      <section>{children}</section>
    </main>
  );
}
