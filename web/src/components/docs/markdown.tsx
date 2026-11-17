import type { Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { CopyButton } from "./copy-button";
import { Tabs, type TabSpec } from "./tabs";

function DocLink({ href = "", children, ...rest }: ComponentProps<"a">) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

function TabsAdapter(props: { "data-group"?: string; "data-tabs"?: string; children?: ReactNode }) {
  const tabs = JSON.parse(props["data-tabs"] ?? "[]") as TabSpec[];
  return (
    <Tabs group={props["data-group"] ?? "lang"} tabs={tabs}>
      {props.children}
    </Tabs>
  );
}

function TabPanel(props: { "data-key"?: string; children?: ReactNode }) {
  return <div data-tab-key={props["data-key"]}>{props.children}</div>;
}

/** Renders compiled Markdown (hast from src/lib/docs/markdown.ts) as React server output. */
export function Markdown({ hast }: { hast: Root }) {
  return toJsxRuntime(hast, {
    Fragment,
    jsx,
    jsxs,
    components: {
      a: DocLink,
      "sk-tabs": TabsAdapter,
      "sk-tab": TabPanel,
      "sk-copy": CopyButton,
    } as never,
  });
}
