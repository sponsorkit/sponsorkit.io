import type { Metadata } from "next";
import { DoneClient } from "@/components/flow/done-client";

export const metadata: Metadata = { title: "Signed in" };

export default function ConnectDonePage() {
  return <DoneClient />;
}
