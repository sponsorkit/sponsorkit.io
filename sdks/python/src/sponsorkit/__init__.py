"""Sponsorkit: build GitHub Sponsors and Open Collective contributions directly into your software.

Quickstart::

    from sponsorkit import Sponsorkit

    sk = Sponsorkit(github="octocat", app_name="my-cli")
    fc = sk.get_financial_contribution()
    if not fc.active():
        print(f"Support my-cli: {sk.checkout_url(frequency='monthly')}")

See https://sponsorkit.io/docs for the full documentation.
"""

from ._state import reset_process_state
from ._version import __version__
from .client import CancelEvent, SignInMethod, Sponsorkit
from .errors import ErrorCode, SponsorkitError
from .mock import MOCK_PRESET_NAMES, MockData, MockPreset
from .models import (
    CheckoutResult,
    Contribution,
    ContributionResult,
    Frequency,
    Identity,
    Kind,
    Money,
    SponsorEntity,
    Status,
    Supporter,
    Tier,
)
from .nag import Nag, parse_duration
from .server import averify_session, verify_session
from .storage import FileStorage, MemoryStorage, Storage, default_storage_dir
from .targets import Provider, Target, targets_hash, targets_param

__all__ = [
    "MOCK_PRESET_NAMES",
    "CancelEvent",
    "CheckoutResult",
    "Contribution",
    "ContributionResult",
    "ErrorCode",
    "FileStorage",
    "Frequency",
    "Identity",
    "Kind",
    "MemoryStorage",
    "MockData",
    "MockPreset",
    "Money",
    "Nag",
    "Provider",
    "SignInMethod",
    "SponsorEntity",
    "Sponsorkit",
    "SponsorkitError",
    "Status",
    "Storage",
    "Supporter",
    "Target",
    "Tier",
    "__version__",
    "averify_session",
    "default_storage_dir",
    "parse_duration",
    "reset_process_state",
    "targets_hash",
    "targets_param",
    "verify_session",
]
