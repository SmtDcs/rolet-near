import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

const NearKeyLab: ComponentType | null =
  process.env.NODE_ENV !== "production"
    ? dynamic(() => import("@/components/dev/NearKeyLab").then((mod) => mod.NearKeyLab))
    : null;

export default function DevNearKeyPage() {
  if (!NearKeyLab) {
    notFound();
  }

  return <NearKeyLab />;
}
