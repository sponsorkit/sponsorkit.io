import type { Metadata } from "next";
import { CheckoutClient } from "@/components/flow/checkout-client";

export const metadata: Metadata = { title: "Contribute" };

export default function CheckoutPage() {
  return <CheckoutClient />;
}
