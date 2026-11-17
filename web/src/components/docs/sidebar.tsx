import Link from "next/link";
import type { NavNode } from "@/lib/docs/site";

function contains(node: NavNode, url: string): boolean {
  return node.type === "page" ? node.url === url : node.url === url || node.children.some((c) => contains(c, url));
}

/** The docs navigation tree (server-rendered; sections are native <details>). */
export function SidebarTree({ nodes, current, depth = 0 }: { nodes: NavNode[]; current: string; depth?: number }) {
  return (
    <ul className="sidebar-list" data-depth={depth}>
      {nodes.map((n) =>
        n.type === "page" ? (
          <li key={n.url}>
            <Link href={n.url} className="sidebar-link" aria-current={n.url === current ? "page" : undefined}>
              {n.label}
            </Link>
          </li>
        ) : (
          <li key={n.id} className="sidebar-section">
            <details open={!n.collapsed || contains(n, current)}>
              <summary>{n.title}</summary>
              <SidebarTree nodes={n.children} current={current} depth={depth + 1} />
            </details>
          </li>
        ),
      )}
    </ul>
  );
}
