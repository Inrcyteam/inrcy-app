import { Suspense } from "react";
import FinishEmailLinkClient from "@/app/auth/_components/FinishEmailLinkClient";

export default function FinishInvitePage() {
  return (
    <Suspense fallback={null}>
      <FinishEmailLinkClient mode="invite" />
    </Suspense>
  );
}
