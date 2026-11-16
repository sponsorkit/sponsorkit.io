"""The contribution result shape (SPEC §5.1), identical in every Sponsorkit SDK.

Attributes use snake_case; :meth:`ContributionResult.to_dict` and :meth:`Contribution.to_dict`
produce the camelCase JSON used on the wire and in the local storage file.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, cast

from .targets import Provider

__all__ = [
    "CheckoutResult",
    "Contribution",
    "ContributionResult",
    "Frequency",
    "Identity",
    "Kind",
    "Money",
    "SponsorEntity",
    "Status",
    "Supporter",
    "Tier",
]

Status = Literal["active", "paused", "cancelled", "paid", "refunded", "disputed", "failed", "pending"]
Frequency = Literal["one_time", "monthly", "yearly"]
Kind = Literal["recurring", "one_time"]

STATUSES: tuple[str, ...] = (
    "active",
    "paused",
    "cancelled",
    "paid",
    "refunded",
    "disputed",
    "failed",
    "pending",
)
FREQUENCIES: tuple[str, ...] = ("one_time", "monthly", "yearly")
_PROVIDERS = ("github", "opencollective")


def _obj(d: object, what: str) -> Mapping[str, Any]:
    """``d`` itself when it is a JSON object; ``TypeError`` otherwise."""
    if not isinstance(d, Mapping):
        raise TypeError(f"{what} must be an object")
    return d


def _str(d: Mapping[str, Any], key: str) -> str:
    v = d[key]
    if not isinstance(v, str):
        raise TypeError(f"{key} must be a string")
    return v


def _opt_str(d: Mapping[str, Any], key: str) -> str | None:
    v = d.get(key)
    if v is not None and not isinstance(v, str):
        raise TypeError(f"{key} must be a string or null")
    return v


def _bool(d: Mapping[str, Any], key: str) -> bool:
    v = d[key]
    if not isinstance(v, bool):
        raise TypeError(f"{key} must be a boolean")
    return v


def _enum(d: Mapping[str, Any], key: str, allowed: tuple[str, ...]) -> Any:
    v = _str(d, key)
    if v not in allowed:
        raise ValueError(f"{key} must be one of {allowed}, got {v!r}")
    return v


@dataclass(frozen=True)
class Money:
    """An amount in minor units (cents) and an uppercase ISO 4217 currency."""

    value: int
    currency: str

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> Money:
        """Parse the JSON form."""
        d = _obj(d, "amount")
        value = d["value"]
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError("amount value must be an integer")
        return cls(value=value, currency=_str(d, "currency"))

    def to_dict(self) -> dict[str, Any]:
        """The JSON form."""
        return {"value": self.value, "currency": self.currency}


@dataclass(frozen=True)
class SponsorEntity:
    """Who pays: the signed-in user or an organization they belong to."""

    type: Literal["user", "organization"]
    provider: Provider
    id: str
    handle: str | None

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> SponsorEntity:
        """Parse the JSON form."""
        d = _obj(d, "sponsor")
        return cls(
            type=_enum(d, "type", ("user", "organization")),
            provider=_enum(d, "provider", _PROVIDERS),
            id=_str(d, "id"),
            handle=_opt_str(d, "handle"),
        )

    def to_dict(self) -> dict[str, Any]:
        """The JSON form."""
        return {"type": self.type, "provider": self.provider, "id": self.id, "handle": self.handle}


@dataclass(frozen=True)
class Tier:
    """A provider tier."""

    id: str
    name: str

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> Tier:
        """Parse the JSON form."""
        d = _obj(d, "tier")
        return cls(id=_str(d, "id"), name=_str(d, "name"))

    def to_dict(self) -> dict[str, Any]:
        """The JSON form."""
        return {"id": self.id, "name": self.name}


@dataclass(frozen=True)
class Contribution:
    """A sponsorship (GitHub) or order (Open Collective) to one of the targets (SPEC §5.1)."""

    id: str
    """Stable id, ``con_<provider>_...``."""
    provider: Provider
    target: str
    """Target string, e.g. ``github:octocat``."""
    sponsor: SponsorEntity
    via: Literal["direct", "organization"]
    kind: Kind
    frequency: Frequency
    status: Status
    amount: Money
    """Minor units. Never converted or summed across currencies."""
    tier: Tier | None
    flags: tuple[str, ...]
    private: bool
    started_at: str | None
    ended_at: str | None
    last_charged_at: str | None
    next_charge_at: str | None
    total_contributed: Money | None

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> Contribution:
        """Parse the camelCase JSON form. Raises ``TypeError``/``ValueError``/``KeyError`` when malformed."""
        d = _obj(d, "contribution")
        tier = d.get("tier")
        total = d.get("totalContributed")
        flags = d.get("flags", [])
        if not isinstance(flags, list) or not all(isinstance(f, str) for f in flags):
            raise TypeError("flags must be a list of strings")
        return cls(
            id=_str(d, "id"),
            provider=_enum(d, "provider", _PROVIDERS),
            target=_str(d, "target"),
            sponsor=SponsorEntity.from_dict(d["sponsor"]),
            via=_enum(d, "via", ("direct", "organization")),
            kind=_enum(d, "kind", ("recurring", "one_time")),
            frequency=_enum(d, "frequency", FREQUENCIES),
            # Unknown provider statuses map to "pending" (SPEC §5.2).
            status=cast(Status, d["status"] if d.get("status") in STATUSES else "pending"),
            amount=Money.from_dict(d["amount"]),
            tier=Tier.from_dict(tier) if tier is not None else None,
            flags=tuple(flags),
            private=_bool(d, "private"),
            started_at=_opt_str(d, "startedAt"),
            ended_at=_opt_str(d, "endedAt"),
            last_charged_at=_opt_str(d, "lastChargedAt"),
            next_charge_at=_opt_str(d, "nextChargeAt"),
            total_contributed=Money.from_dict(total) if total is not None else None,
        )

    def to_dict(self) -> dict[str, Any]:
        """The camelCase JSON form."""
        return {
            "id": self.id,
            "provider": self.provider,
            "target": self.target,
            "sponsor": self.sponsor.to_dict(),
            "via": self.via,
            "kind": self.kind,
            "frequency": self.frequency,
            "status": self.status,
            "amount": self.amount.to_dict(),
            "tier": self.tier.to_dict() if self.tier else None,
            "flags": list(self.flags),
            "private": self.private,
            "startedAt": self.started_at,
            "endedAt": self.ended_at,
            "lastChargedAt": self.last_charged_at,
            "nextChargeAt": self.next_charge_at,
            "totalContributed": self.total_contributed.to_dict() if self.total_contributed else None,
        }


@dataclass(frozen=True)
class Identity:
    """A provider account the supporter signed in with."""

    provider: Provider
    id: str
    handle: str | None
    needs_reconnect: bool
    """The provider token expired; ``sign_in(provider=...)`` reconnects it."""

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> Identity:
        """Parse the JSON form."""
        d = _obj(d, "identity")
        return cls(
            provider=_enum(d, "provider", _PROVIDERS),
            id=_str(d, "id"),
            handle=_opt_str(d, "handle"),
            needs_reconnect=_bool(d, "needsReconnect"),
        )

    def to_dict(self) -> dict[str, Any]:
        """The JSON form."""
        return {
            "provider": self.provider,
            "id": self.id,
            "handle": self.handle,
            "needsReconnect": self.needs_reconnect,
        }


@dataclass(frozen=True)
class Supporter:
    """The signed-in supporter. ``id`` is pairwise: stable per (target set, first identity)."""

    id: str
    identities: tuple[Identity, ...]

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> Supporter:
        """Parse the JSON form."""
        d = _obj(d, "supporter")
        ids = d["identities"]
        if not isinstance(ids, list):
            raise TypeError("identities must be a list")
        return cls(id=_str(d, "id"), identities=tuple(Identity.from_dict(i) for i in ids))

    def to_dict(self) -> dict[str, Any]:
        """The JSON form."""
        return {"id": self.id, "identities": [i.to_dict() for i in self.identities]}


@dataclass(frozen=True)
class ContributionResult:
    """What the current user has contributed to the configured targets (SPEC §5.1).

    The helper methods filter :attr:`contributions`; they never sum across providers or currencies.
    """

    signed_in: bool
    disabled: bool
    mock: bool
    targets: tuple[str, ...]
    supporter: Supporter | None
    contributions: tuple[Contribution, ...]
    fetched_at: str | None
    stale: bool
    """Some provider could not be reached; its data (if any) comes from the local cache."""
    from_cache: bool
    """The whole result was served from the local cache."""
    unavailable: tuple[Provider, ...] | None = field(default=None)
    """Providers the API could not query (API results only)."""

    def active(self) -> list[Contribution]:
        """Contributions whose status is ``active``."""
        return [c for c in self.contributions if c.status == "active"]

    def recurring(self) -> list[Contribution]:
        """Recurring contributions (any status)."""
        return [c for c in self.contributions if c.kind == "recurring"]

    def one_time(self) -> list[Contribution]:
        """One-time contributions (any status)."""
        return [c for c in self.contributions if c.kind == "one_time"]

    def by_provider(self, provider: Provider) -> list[Contribution]:
        """Contributions made through ``provider``."""
        return [c for c in self.contributions if c.provider == provider]

    def direct(self) -> list[Contribution]:
        """Contributions the user made directly (excludes organization sponsorships)."""
        return [c for c in self.contributions if c.via == "direct"]

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> ContributionResult:
        """Parse the camelCase JSON form. Raises ``TypeError``/``ValueError``/``KeyError`` when malformed."""
        d = _obj(d, "result")
        targets = d["targets"]
        contributions = d["contributions"]
        if not isinstance(targets, list) or not all(isinstance(t, str) for t in targets):
            raise TypeError("targets must be a list of strings")
        if not isinstance(contributions, list):
            raise TypeError("contributions must be a list")
        supporter = d.get("supporter")
        unavailable = d.get("unavailable")
        if unavailable is not None and (
            not isinstance(unavailable, list) or not all(p in _PROVIDERS for p in unavailable)
        ):
            raise TypeError("unavailable must be a list of providers")
        return cls(
            signed_in=_bool(d, "signedIn"),
            disabled=_bool(d, "disabled"),
            mock=_bool(d, "mock"),
            targets=tuple(targets),
            supporter=Supporter.from_dict(supporter) if supporter is not None else None,
            contributions=tuple(Contribution.from_dict(c) for c in contributions),
            fetched_at=_opt_str(d, "fetchedAt"),
            stale=_bool(d, "stale"),
            from_cache=_bool(d, "fromCache"),
            unavailable=tuple(unavailable) if unavailable is not None else None,
        )

    def to_dict(self) -> dict[str, Any]:
        """The camelCase JSON form (``unavailable`` is omitted when ``None``)."""
        out: dict[str, Any] = {
            "signedIn": self.signed_in,
            "disabled": self.disabled,
            "mock": self.mock,
            "targets": list(self.targets),
            "supporter": self.supporter.to_dict() if self.supporter else None,
            "contributions": [c.to_dict() for c in self.contributions],
            "fetchedAt": self.fetched_at,
            "stale": self.stale,
            "fromCache": self.from_cache,
        }
        if self.unavailable is not None:
            out["unavailable"] = list(self.unavailable)
        return out


@dataclass(frozen=True)
class CheckoutResult:
    """The outcome of :meth:`sponsorkit.Sponsorkit.open_checkout`.

    ``status`` is ``"contributed"`` when a new or changed contribution was detected, else ``"unknown"``
    (timeout or cancellation; the supporter may still have paid).
    """

    status: Literal["contributed", "unknown"]
    contribution: Contribution | None = None

    def to_dict(self) -> dict[str, Any]:
        """The JSON form: ``{"status": ...}`` plus ``"contribution"`` when one was detected."""
        out: dict[str, Any] = {"status": self.status}
        if self.contribution is not None:
            out["contribution"] = self.contribution.to_dict()
        return out
