from __future__ import annotations

import os
import re
import shutil
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest

from sponsorkit import reset_process_state

KIT = Path(__file__).resolve().parents[2] / "conformance"


@pytest.fixture(scope="session")
def conformance_server() -> Iterator[str]:
    """Start the conformance fake server once per test session; yields its base URL."""
    bun = shutil.which("bun") or (
        str(Path.home() / ".bun/bin/bun") if (Path.home() / ".bun/bin/bun").exists() else None
    )
    if bun is None:
        pytest.fail("bun is required to run the conformance fake server (https://bun.sh)")
    proc = subprocess.Popen(
        [bun, str(KIT / "server.ts"), "--port", "0"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        env={**os.environ, "SPONSORKIT_CONFORMANCE_EXIT_ON_STDIN_EOF": "1"},
    )
    try:
        assert proc.stdout is not None
        line = proc.stdout.readline().decode()
        m = re.fullmatch(r"LISTENING (\d+)\n", line)
        if not m:
            raise RuntimeError(f"unexpected output from the conformance server: {line!r}")
        yield f"http://127.0.0.1:{m.group(1)}"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.fixture(autouse=True)
def _fresh_process_state() -> Iterator[None]:
    reset_process_state()
    yield
    reset_process_state()
