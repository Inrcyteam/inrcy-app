import { Suspense } from "react";
import FinishEmailLinkClient from "@/app/auth/_components/FinishEmailLinkClient";

export default function FinishResetPage() {
  return (
    <Suspense fallback={null}>
      <FinishEmailLinkClient mode="reset" />
    </Suspense>
  );
}
