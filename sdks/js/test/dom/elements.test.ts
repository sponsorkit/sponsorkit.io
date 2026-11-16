/** <sponsorkit-button> and <sponsorkit-badge> (SPEC §7.7), in happy-dom. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

beforeAll(() => GlobalRegistrator.register({ url: "https://app.example/" }));
afterAll(() => GlobalRegistrator.unregister());

const load = () => import("../../src/elements");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe("custom elements", () => {
  test("are registered on import", async () => {
    const { SponsorkitButtonElement, SponsorkitBadgeElement } = await load();
    expect(customElements.get("sponsorkit-button")).toBe(SponsorkitButtonElement);
    expect(customElements.get("sponsorkit-badge")).toBe(SponsorkitBadgeElement);
  });

  test("<sponsorkit-button> opens the checkout popup synchronously on click", async () => {
    const { elementDefaults } = await load();
    const opened: { location: { href: string }; closed: boolean; close(): void }[] = [];
    Object.assign(elementDefaults, {
      env: {},
      fetch: async () => new Response("{}", { status: 500 }),
      openWindow: () => {
        const p = { location: { href: "about:blank" }, closed: false, close() {} };
        opened.push(p);
        return p as unknown as Window;
      },
    });
    document.body.innerHTML = '<sponsorkit-button github="octocat" amount="500" frequency="monthly" currency="USD">Sponsor me</sponsorkit-button>';
    const el = document.querySelector("sponsorkit-button") as HTMLElement;
    const button = el.shadowRoot?.querySelector("button") as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.click();
    expect(opened).toHaveLength(1);
    await tick(20);
    const url = new URL(opened[0]!.location.href);
    expect(url.pathname).toBe("/checkout");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      targets: "github:octocat",
      amount: "500",
      frequency: "monthly",
      currency: "USD",
      delivery: "web_message",
    });
    opened[0]!.closed = true;
    for (const k of Object.keys(elementDefaults)) delete (elementDefaults as Record<string, unknown>)[k];
  });

  test("<sponsorkit-button> reports invalid attributes as sponsorkit:error", async () => {
    const { elementDefaults } = await load();
    Object.assign(elementDefaults, { env: {}, openWindow: () => null });
    document.body.innerHTML = '<sponsorkit-button github="-bad-"></sponsorkit-button>';
    const el = document.querySelector("sponsorkit-button") as HTMLElement & { checkout(): void };
    const errors: unknown[] = [];
    el.addEventListener("sponsorkit:error", (e) => errors.push((e as CustomEvent).detail.error));
    el.checkout();
    await tick();
    expect(errors).toHaveLength(1);
    expect((errors[0] as { code: string }).code).toBe("invalid_config");
    for (const k of Object.keys(elementDefaults)) delete (elementDefaults as Record<string, unknown>)[k];
  });

  test("<sponsorkit-badge> shows only for supporters with an active contribution", async () => {
    const { elementDefaults } = await load();
    Object.assign(elementDefaults, { env: {}, mock: "active-monthly" });
    document.body.innerHTML = '<sponsorkit-badge github="octocat"></sponsorkit-badge>';
    const badge = document.querySelector("sponsorkit-badge") as HTMLElement & { refresh(): Promise<boolean> };
    expect(await badge.refresh()).toBe(true);
    expect(badge.hidden).toBe(false);
    expect(badge.shadowRoot?.textContent).toContain("Supporter");

    Object.assign(elementDefaults, { mock: "cancelled" });
    badge.setAttribute("github", "someone-else");
    expect(await badge.refresh()).toBe(false);
    expect(badge.hidden).toBe(true);
    for (const k of Object.keys(elementDefaults)) delete (elementDefaults as Record<string, unknown>)[k];
  });
});
