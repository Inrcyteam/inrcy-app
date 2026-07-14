"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

type SentryUserContextProps = {
  userId: string;
  accountId?: string | null;
};

/** Associates dashboard errors with a pseudonymous user/account identifier. */
export default function SentryUserContext({ userId, accountId }: SentryUserContextProps) {
  useEffect(() => {
    Sentry.setUser({ id: userId });
    Sentry.setTag("app_area", "dashboard");
    if (accountId) Sentry.setTag("account_id", accountId);

    return () => {
      Sentry.setUser(null);
    };
  }, [userId, accountId]);

  return null;
}
