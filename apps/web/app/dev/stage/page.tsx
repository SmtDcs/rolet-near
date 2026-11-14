import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

const StageLab: ComponentType | null =
  process.env.NODE_ENV !== "production"
    ? dynamic(() => import("@/components/dev/StageLab").then((mod) => mod.StageLab))
    : null;

export default function DevStagePage() {
  if (!StageLab) {
    notFound();
  }

  return <StageLab />;
}
