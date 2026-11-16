"use client";

import { useState } from "react";
import type { Target, TargetInfo } from "@sponsorkit/shared";
import { PROVIDER_LABEL } from "@/lib/checkout";
import { ProviderIcon } from "../icons";

export function findInfo(t: Target, infos: TargetInfo[] | null): TargetInfo | null {
  if (!infos) return null;
  return infos.find((i) => i.provider === t.provider && i.account === t.account) ?? null;
}

/** Only images from known provider CDNs are shown; anything else falls back to initials. */
export function safeAvatarUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const ok =
      u.hostname === "avatars.githubusercontent.com" ||
      u.hostname.endsWith(".githubusercontent.com") ||
      u.hostname === "github.com" ||
      u.hostname === "opencollective.com" ||
      u.hostname.endsWith(".opencollective.com") ||
      u.hostname === "opencollective-production.s3.us-west-1.amazonaws.com";
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}

export function displayName(t: Target, info: TargetInfo | null): string {
  if (info?.displayName) return info.displayName;
  return t.provider === "github" ? `@${t.account}` : t.account;
}

export function Avatar({ target, info, size = 44 }: { target: Target; info: TargetInfo | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = safeAvatarUrl(info?.avatarUrl ?? null);
  const round = target.provider === "github";
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export, external provider avatar
      <img
        className={`avatar${round ? " round" : ""}`}
        src={src}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="avatar" aria-hidden="true" style={{ width: size, height: size }}>
      {(displayName(target, info).replace(/^@/, "")[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function TargetRow({ target, info, loading }: { target: Target; info: TargetInfo | null; loading: boolean }) {
  const label = PROVIDER_LABEL[target.provider];
  const handle = target.provider === "github" ? `@${target.account}` : `opencollective.com/${target.account}`;
  return (
    <li className="target" data-testid={`target-${target.provider}`}>
      <Avatar target={target} info={info} />
      <span className="target-text">
        <span className="target-name">
          {loading ? <span className="skeleton" style={{ width: "8rem" }} /> : displayName(target, info)}
          {info && !info.exists ? <span className="badge">Not found</span> : null}
        </span>
        <span className="target-sub">
          <ProviderIcon provider={target.provider} size={13} style={{ verticalAlign: "-0.1em", marginRight: "0.3rem" }} />
          {label} · {handle}
        </span>
      </span>
    </li>
  );
}
