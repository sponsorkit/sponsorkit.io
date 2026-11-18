/**
 * `@sponsorkit/sdk/elements`: custom elements (SPEC §7.7). Importing this
 * module registers `<sponsorkit-button>` and `<sponsorkit-badge>`.
 *
 * ```html
 * <script type="module">import "@sponsorkit/sdk/elements";</script>
 * <sponsorkit-button github="octocat" amount="500" frequency="monthly">Sponsor</sponsorkit-button>
 * <sponsorkit-badge github="octocat"></sponsorkit-badge>
 * ```
 */
import { Sponsorkit, type SponsorkitOptions } from "./index";
import type { Frequency, Provider } from "./types";

const HTMLElementBase: typeof HTMLElement = typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/** Options applied to every element-created client (e.g. `apiBaseUrl`, `siteBaseUrl`, `returnTo`). */
export const elementDefaults: Partial<SponsorkitOptions> = {};

const TARGET_ATTRS = ["github", "opencollective", "api-base-url", "site-base-url"] as const;

abstract class SponsorkitElementBase extends HTMLElementBase {
  private clientInstance: Sponsorkit | null = null;
  private clientKey = "";

  /** Use a pre-configured client instead of one built from attributes. */
  set client(client: Sponsorkit | null) {
    this.clientInstance = client;
    this.clientKey = client ? "custom" : "";
  }

  /** The client for this element (built from the `github`, `opencollective`, `api-base-url` and `site-base-url` attributes). */
  get client(): Sponsorkit | null {
    if (this.clientKey === "custom") return this.clientInstance;
    const key = TARGET_ATTRS.map((a) => this.getAttribute(a) ?? "").join("|");
    if (key !== this.clientKey) {
      this.clientKey = key;
      try {
        this.clientInstance = new Sponsorkit({
          ...elementDefaults,
          github: this.getAttribute("github") ?? undefined,
          opencollective: this.getAttribute("opencollective") ?? undefined,
          ...(this.getAttribute("api-base-url") ? { apiBaseUrl: this.getAttribute("api-base-url") as string } : {}),
          ...(this.getAttribute("site-base-url") ? { siteBaseUrl: this.getAttribute("site-base-url") as string } : {}),
        });
      } catch (error) {
        this.clientInstance = null;
        this.dispatchEvent(new CustomEvent("sponsorkit:error", { detail: { error }, bubbles: true, composed: true }));
      }
    }
    return this.clientInstance;
  }
}

/**
 * `<sponsorkit-button github opencollective amount currency frequency provider>`:
 * opens checkout (synchronously, in a popup) when clicked.
 *
 * Events: `sponsorkit:checkout` (`detail` = `CheckoutResult`), `sponsorkit:error` (`detail.error`).
 */
export class SponsorkitButtonElement extends SponsorkitElementBase {
  static readonly observedAttributes = ["label"];
  private button: HTMLButtonElement | null = null;

  connectedCallback(): void {
    if (this.button) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>:host{display:inline-block}button{font:inherit;cursor:pointer;padding:.5em 1em;border-radius:6px;border:1px solid #d0d7de;background:#f6f8fa;color:#24292f}button:hover{background:#eef1f4}</style>" +
      '<button type="button" part="button"><slot>Sponsor ♥</slot></button>';
    this.button = root.querySelector("button");
    this.button?.addEventListener("click", () => this.checkout());
    this.syncLabel();
  }

  attributeChangedCallback(): void {
    this.syncLabel();
  }

  private syncLabel(): void {
    const label = this.getAttribute("label");
    if (this.button && label) this.button.setAttribute("aria-label", label);
  }

  /** Opens checkout with the element's attributes. Must run in a user gesture (it opens a popup synchronously). */
  checkout(): void {
    const client = this.client;
    if (!client) return;
    const amount = this.getAttribute("amount");
    const promise = client.openCheckout({
      ...(amount ? { amount: Number(amount) } : {}),
      ...(this.getAttribute("currency") ? { currency: this.getAttribute("currency") as string } : {}),
      ...(this.getAttribute("frequency") ? { frequency: this.getAttribute("frequency") as Frequency } : {}),
      ...(this.getAttribute("provider") ? { provider: this.getAttribute("provider") as Provider } : {}),
    });
    promise.then(
      (detail) => this.dispatchEvent(new CustomEvent("sponsorkit:checkout", { detail, bubbles: true, composed: true })),
      (error) => this.dispatchEvent(new CustomEvent("sponsorkit:error", { detail: { error }, bubbles: true, composed: true })),
    );
  }
}

/**
 * `<sponsorkit-badge github opencollective>`: shows "Supporter ♥" when the
 * signed-in user has an active contribution, and nothing otherwise.
 * Call `refresh()` after signing in or checking out.
 */
export class SponsorkitBadgeElement extends SponsorkitElementBase {
  static readonly observedAttributes = ["github", "opencollective", "api-base-url", "site-base-url"];
  private seq = 0;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML =
        "<style>:host{display:inline-block}:host([hidden]){display:none}span{font:inherit;font-size:.85em;padding:.15em .6em;border-radius:999px;background:#ffeef3;color:#bf3989;border:1px solid #f4c2d7}</style>" +
        '<span part="badge"><slot>Supporter ♥</slot></span>';
    }
    this.hidden = true;
    void this.refresh();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.refresh();
  }

  /** Re-reads the contribution (served from cache when fresh) and updates visibility. Resolves whether the badge is shown. */
  async refresh(): Promise<boolean> {
    const seq = ++this.seq;
    const client = this.client;
    if (!client) {
      this.hidden = true;
      return false;
    }
    const fc = await client.getFinancialContribution();
    if (seq !== this.seq) return !this.hidden;
    const show = fc.active().length > 0;
    this.hidden = !show;
    this.toggleAttribute("supporter", show);
    return show;
  }
}

/** Registers the elements (idempotent). Called automatically on import in browsers. */
export function defineElements(registry: CustomElementRegistry | undefined = globalThis.customElements): void {
  if (!registry) return;
  if (!registry.get("sponsorkit-button")) registry.define("sponsorkit-button", SponsorkitButtonElement);
  if (!registry.get("sponsorkit-badge")) registry.define("sponsorkit-badge", SponsorkitBadgeElement);
}

defineElements();

export { Sponsorkit };
