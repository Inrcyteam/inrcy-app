"use client";

import type React from "react";
import styles from "../legal.module.css";

function isSectionTitle(line: string) {
  return /^(?:\d+\.\s|\d+\.\d+\s|Article\s+\d+\s+[–-])/.test(line);
}

function isListCandidate(line: string, hasPreviousListItem: boolean) {
  if (!line) return false;
  if (isSectionTitle(line)) return false;
  if (line.endsWith(";")) return true;
  if (hasPreviousListItem && line.endsWith(".")) return true;
  if (hasPreviousListItem && line.length <= 160 && !line.endsWith(":")) return true;
  return false;
}

export default function LegalTextContent({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const elements: React.ReactNode[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();

    if (!line) {
      continue;
    }

    if (isSectionTitle(line)) {
      elements.push(
        <h2 className={styles.h2} key={`title-${index}`}>
          {line}
        </h2>,
      );
      continue;
    }

    if (line.endsWith(":")) {
      const items: string[] = [];
      let cursor = index + 1;

      while (cursor < lines.length) {
        const candidate = lines[cursor]?.trim();
        if (!candidate) {
          cursor += 1;
          if (items.length > 0) break;
          continue;
        }
        if (!isListCandidate(candidate, items.length > 0)) break;
        items.push(candidate);
        cursor += 1;
        if (candidate.endsWith(".")) break;
      }

      elements.push(
        <p className={styles.p} key={`p-${index}`}>
          {line}
        </p>,
      );

      if (items.length >= 2) {
        elements.push(
          <ul className={styles.ul} key={`ul-${index}`}>
            {items.map((item, itemIndex) => (
              <li key={`${index}-${itemIndex}`}>{item}</li>
            ))}
          </ul>,
        );
        index = cursor - 1;
      }

      continue;
    }

    elements.push(
      <p className={styles.p} key={`p-${index}`}>
        {line}
      </p>,
    );
  }

  return <section>{elements}</section>;
}
