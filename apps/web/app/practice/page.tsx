import { Suspense } from "react";
import { PracticeArena } from "@/components/stage/PracticeArena";

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#050505] font-mono text-xs tracking-[0.18em] text-[#c6a15b] uppercase">
          SAHNE HAZIRLANIYOR...
        </div>
      }
    >
      <PracticeArena />
    </Suspense>
  );
}
