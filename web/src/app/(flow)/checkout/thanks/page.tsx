import type { Metadata } from "next";
import { HeartIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Thank you" };

/** Open Collective returns here after a contribution (PROTOCOL §6 `redirect`). Fully static. */
export default function ThanksPage() {
  return (
    <section className="panel" aria-labelledby="thanks-title">
      <div className="status-icon heart">
        <HeartIcon size={24} />
      </div>
      <h1 id="thanks-title">Thank you for your support</h1>
      <p>Your contribution helps keep this project going.</p>
      <p className="muted">
        You can close this window and go back to the app. It checks for new contributions by itself; it may take a minute or two
        for yours to show up.
      </p>
    </section>
  );
}
