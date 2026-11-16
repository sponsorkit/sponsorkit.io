import type { Metadata } from "next";
import { ConnectClient } from "@/components/flow/connect-client";

export const metadata: Metadata = { title: "Sign in" };

export default function ConnectPage() {
  return <ConnectClient />;
}
