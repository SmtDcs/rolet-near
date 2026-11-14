import { notFound } from "next/navigation";
import { NearKeyLab } from "@/components/dev/NearKeyLab";

export default function DevNearKeyPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <NearKeyLab />;
}
