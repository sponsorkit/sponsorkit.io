"""Generate the Markdown API reference for the Python SDK (``sponsorkit``).

Run through ``scripts/gen-docs.sh`` (see web/content/docs/REFERENCE-CONTRACT.md)::

    python3 -B scripts/gen_reference.py <out-dir>

The public API is what ``sponsorkit.__all__`` exports plus the ``__all__`` of every public submodule
(``sponsorkit.server``, ``sponsorkit.targets``, ...). Signatures come from :mod:`inspect` (with the
annotations exactly as written in the source), docstrings and attribute docstrings from :mod:`ast`.
Google-style sections (``Args:``, ``Raises:``, ``Example::``) and Sphinx roles (``:meth:`...```) are
turned into Markdown. The output is deterministic: no timestamps, everything in source order.

This file is development tooling. It is not part of the published package (the wheel only contains
``src/sponsorkit``).
"""

from __future__ import annotations

import ast
import dataclasses
import importlib
import inspect
import json
import posixpath
import re
import sys
import textwrap
import types
import typing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
SDK_DIR = HERE.parent
SRC_DIR = SDK_DIR / "src"
REPO_REL_SRC = "sdks/python/src"

# Public submodules, in the order their pages are listed. Private modules (``_state``, ``_http``...)
# are not documented as modules; anything public they define is documented on the package page.
SUBMODULES = ["client", "models", "errors", "server", "nag", "storage", "targets", "mock", "pkce"]

SIG_WIDTH = 88


# --------------------------------------------------------------------------------------------- import


def _install_httpx_shim() -> None:
    """Let ``import sponsorkit`` work without httpx installed.

    The SDK only touches httpx at call time (``httpx.Client(...)``, ``except httpx.HTTPError``); its
    annotations are strings. The generator never makes HTTP calls, so a placeholder module is enough.
    """
    shim = types.ModuleType("httpx")

    class _PlaceholderError(Exception):
        pass

    def __getattr__(name: str) -> Any:  # noqa: N807
        return type(name, (_PlaceholderError,), {"__module__": "httpx"})

    shim.__getattr__ = __getattr__  # type: ignore[attr-defined]
    sys.modules["httpx"] = shim


def load_package() -> types.ModuleType:
    sys.path.insert(0, str(SRC_DIR))
    try:
        import httpx  # noqa: F401
    except ImportError:
        _install_httpx_shim()
    pkg = importlib.import_module("sponsorkit")
    for name in SUBMODULES:
        importlib.import_module(f"sponsorkit.{name}")
    if not str(Path(pkg.__file__).resolve()).startswith(str(SRC_DIR)):
        raise SystemExit(f"gen_reference: imported sponsorkit from {pkg.__file__}, expected {SRC_DIR}")
    return pkg


# --------------------------------------------------------------------------------------------- AST


@dataclass
class AttrDoc:
    doc: str | None
    line: int
    annotation: str | None
    value: str | None


def attribute_docs(body: list[ast.stmt], source: str) -> dict[str, AttrDoc]:
    """``name -> AttrDoc`` for assignments in ``body``; the doc is the string literal after it."""
    out: dict[str, AttrDoc] = {}
    for i, node in enumerate(body):
        name: str | None = None
        annotation: str | None = None
        value: str | None = None
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            name = node.target.id
            annotation = ast.get_source_segment(source, node.annotation)
            if node.value is not None:
                value = ast.get_source_segment(source, node.value)
        elif (
            isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)
        ):
            name = node.targets[0].id
            value = ast.get_source_segment(source, node.value)
        if name is None:
            continue
        doc = None
        nxt = body[i + 1] if i + 1 < len(body) else None
        if (
            isinstance(nxt, ast.Expr)
            and isinstance(nxt.value, ast.Constant)
            and isinstance(nxt.value.value, str)
        ):
            doc = inspect.cleandoc(nxt.value.value)
        out[name] = AttrDoc(doc, node.lineno, annotation, value)
    return out


@dataclass
class ModuleInfo:
    name: str
    module: types.ModuleType
    file: Path
    source: str
    tree: ast.Module
    attrs: dict[str, AttrDoc]
    class_attrs: dict[str, dict[str, AttrDoc]]

    @property
    def rel_path(self) -> str:
        return f"{REPO_REL_SRC}/{self.file.relative_to(SRC_DIR).as_posix()}"


def module_info(module: types.ModuleType) -> ModuleInfo:
    file = Path(module.__file__).resolve()
    source = file.read_text(encoding="utf-8")
    tree = ast.parse(source)
    class_attrs = {
        n.name: attribute_docs(n.body, source) for n in ast.walk(tree) if isinstance(n, ast.ClassDef)
    }
    return ModuleInfo(
        module.__name__, module, file, source, tree, attribute_docs(tree.body, source), class_attrs
    )


# --------------------------------------------------------------------------------------------- model


@dataclass
class Symbol:
    """Something with a page or an anchor in the reference."""

    name: str  # short name, e.g. "Sponsorkit" or "sign_in"
    qualname: str  # canonical fully qualified name, e.g. "sponsorkit.Sponsorkit.sign_in"
    page: str  # page path relative to the output root, e.g. "sponsorkit.md"
    anchor: str | None = None
    kind: str = "other"


@dataclass
class Entry:
    """A top-level public name."""

    name: str
    obj: Any
    kind: str  # class | error | interface | type | function | constant
    module: ModuleInfo  # where it is defined
    exported_from: list[str] = field(default_factory=list)  # modules whose __all__ lists it


def anchor_id(name: str) -> str:
    """Contract: lowercase, runs of other characters -> "-" (underscores kept)."""
    s = re.sub(r"[^a-z0-9_]+", "-", name.lower())
    s = re.sub(r"[-_]{2,}", lambda m: m.group(0)[0], s)
    return s.strip("-_") or "item"


def page_slug(name: str) -> str:
    """Contract: lowercase, every run of characters outside [a-z0-9] -> "-"."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def is_type_alias(name: str, obj: Any, mod: ModuleInfo) -> bool:
    if typing.get_origin(obj) is not None:
        return True  # Literal[...], Union[...]
    a = mod.attrs.get(name)
    if a is not None and a.annotation is not None and "TypeAlias" in a.annotation:
        return True
    # ``CancelEvent = threading.Event``: a class defined elsewhere, re-exported under a new name.
    return inspect.isclass(obj) and (obj.__name__ != name or not obj.__module__.startswith("sponsorkit"))


def classify(name: str, obj: Any, mod: ModuleInfo) -> str:
    if is_type_alias(name, obj, mod):
        return "type"
    if inspect.isclass(obj):
        if issubclass(obj, BaseException):
            return "error"
        if getattr(obj, "_is_protocol", False):
            return "interface"
        return "class"
    if inspect.isfunction(obj):
        return "function"
    return "constant"


def defining_module(name: str, obj: Any, modules: dict[str, ModuleInfo]) -> ModuleInfo:
    if (inspect.isclass(obj) and not is_alias_like(obj, name)) or inspect.isfunction(obj):
        modname = obj.__module__
        if modname in modules:
            return modules[modname]
        return module_info(sys.modules[modname])
    # Aliases and constants: the first module whose top-level assignments define the name.
    for m in modules.values():
        if m.name != "sponsorkit" and name in m.attrs:
            return m
    for modname in sorted(sys.modules):
        if modname.startswith("sponsorkit.") and modname not in modules:
            m = module_info(sys.modules[modname])
            if name in m.attrs:
                return m
    return modules["sponsorkit"]


def is_alias_like(obj: Any, name: str) -> bool:
    return inspect.isclass(obj) and (obj.__name__ != name or not obj.__module__.startswith("sponsorkit"))


# --------------------------------------------------------------------------------------------- reference


class Reference:
    def __init__(self, pkg: types.ModuleType) -> None:
        self.pkg = pkg
        self.modules: dict[str, ModuleInfo] = {"sponsorkit": module_info(pkg)}
        for sub in SUBMODULES:
            m = sys.modules[f"sponsorkit.{sub}"]
            self.modules[m.__name__] = module_info(m)
        self.entries: dict[str, Entry] = {}
        self.symbols: dict[str, Symbol] = {}
        self.pages: dict[str, str] = {}
        self._collect()

    # -------------------------------------------------------------------- inventory

    def _collect(self) -> None:
        for modname, mod in self.modules.items():
            for name in getattr(mod.module, "__all__", []):
                obj = getattr(mod.module, name)
                if inspect.ismodule(obj):
                    continue
                entry = self.entries.get(name)
                if entry is None:
                    home = defining_module(name, obj, self.modules)
                    entry = Entry(name, obj, classify(name, obj, home), home)
                    self.entries[name] = entry
                entry.exported_from.append(modname)
        self.public_modules = {m.name: m for m in self.modules.values()}

        for e in self.entries.values():
            if e.kind in ("class", "error", "interface"):
                page = f"{page_slug(e.name)}.md"
                self._add(
                    Symbol(
                        e.name,
                        f"sponsorkit.{e.name}" if self._top(e) else f"{e.module.name}.{e.name}",
                        page,
                        None,
                        e.kind,
                    ),
                    e,
                )
                for member in self.class_members(e):
                    sym = Symbol(
                        member, f"{e.module.name}.{e.name}.{member}", page, anchor_id(member), "member"
                    )
                    for prefix in self._prefixes(e):
                        self.symbols.setdefault(f"{prefix}{e.name}.{member}", sym)
            elif e.kind == "type":
                self._add(
                    Symbol(
                        e.name, f"{e.module.name}.{e.name}", f"types/{page_slug(e.name)}.md", None, "type"
                    ),
                    e,
                )
            else:
                page = self.module_page(self.home_module(e))
                self._add(Symbol(e.name, f"{e.module.name}.{e.name}", page, anchor_id(e.name), e.kind), e)
        for m in self.modules.values():
            self.symbols.setdefault(m.name, Symbol(m.name, m.name, self.module_page(m), None, "module"))

    def _top(self, e: Entry) -> bool:
        return "sponsorkit" in e.exported_from

    def _prefixes(self, e: Entry) -> list[str]:
        prefixes = ["", f"{e.module.name}."]
        prefixes += [f"{m}." for m in e.exported_from]
        return prefixes

    def _add(self, sym: Symbol, e: Entry) -> None:
        for prefix in self._prefixes(e):
            self.symbols.setdefault(f"{prefix}{e.name}", sym)

    def home_module(self, e: Entry) -> ModuleInfo:
        """The module page a function or constant is documented on."""
        if e.module.name in self.public_modules:
            return e.module
        return self.modules["sponsorkit"]  # defined in a private module, e.g. _state

    @staticmethod
    def module_page(m: ModuleInfo) -> str:
        return f"modules/{page_slug(m.name)}.md"

    def class_members(self, e: Entry) -> list[str]:
        cls = e.obj
        names: list[str] = []
        if dataclasses.is_dataclass(cls):
            names += [f.name for f in dataclasses.fields(cls)]
        names += [n for n in self.class_attr_docs(e) if not n.startswith("_") and n not in names]
        for n, _ in self.members_in_order(cls):
            if n not in names:
                names.append(n)
        return names

    def class_attr_docs(self, e: Entry) -> dict[str, AttrDoc]:
        return e.module.class_attrs.get(e.obj.__name__, {})

    @staticmethod
    def members_in_order(cls: type) -> list[tuple[str, Any]]:
        """Public methods and properties defined on ``cls`` itself, in source order."""
        out: list[tuple[int, str, Any]] = []
        for name, raw in vars(cls).items():
            if name.startswith("_"):
                continue
            obj = raw.__func__ if isinstance(raw, (classmethod, staticmethod)) else raw
            target = obj.fget if isinstance(obj, property) else obj
            if not inspect.isfunction(target):
                continue
            try:
                line = inspect.getsourcelines(target)[1]
            except (OSError, TypeError):
                line = 0
            out.append((line, name, raw))
        return [(n, r) for _, n, r in sorted(out, key=lambda t: (t[0], t[1]))]

    # -------------------------------------------------------------------- links

    def resolve(self, target: str, context: str | None) -> Symbol | None:
        target = target.strip().lstrip("~").rstrip("()")
        candidates = [target]
        if context:
            candidates.insert(0, f"{context}.{target}")
        for c in candidates:
            if c in self.symbols:
                return self.symbols[c]
        return None

    def link(self, sym: Symbol, from_page: str) -> str:
        rel = posixpath.relpath(sym.page, posixpath.dirname(from_page) or ".")
        return f"{rel}#{sym.anchor}" if sym.anchor else rel


# ------------------------------------------------------------------------------------- markdown helpers

EXTERNAL_DOCS = {
    "httpx": "https://www.python-httpx.org/api/",
}
STDLIB = {"asyncio", "threading", "datetime", "os", "pathlib", "typing", "collections", "dataclasses"}


def external_url(target: str) -> str | None:
    target = target.lstrip("~")
    root = target.split(".")[0]
    if root == "httpx":
        anchor = target.split(".")[-1].lower()
        return f"{EXTERNAL_DOCS['httpx']}#{anchor}"
    if root in STDLIB and "." in target:
        page = target.split(".")[0]
        if root == "asyncio" and target.split(".")[-1] in ("Event", "Lock", "Semaphore", "Condition"):
            page = "asyncio-sync"
        elif root == "asyncio":
            page = "asyncio-task"
        elif root == "os" and target.startswith("os.PathLike"):
            page = "os"
        return f"https://docs.python.org/3/library/{page}.html#{target}"
    return None


ROLE = re.compile(r":(?:py:)?(meth|func|class|attr|data|mod|obj|exc|const):`([^`]+)`")
DOUBLE_TICK = re.compile(r"``(.+?)``")
INLINE_CODE = re.compile(r"(`+)(.+?)\1")


SPEC_REF = re.compile(r"\s*\((?:SPEC|PROTOCOL) §[^)]*\)")


def strip_spec_refs(text: str) -> str:
    """Drop "(SPEC §5.1)"-style references to the repository's internal design documents."""
    return SPEC_REF.sub("", text)


def escape_text(text: str) -> str:
    """Escape ``<`` outside code spans (raw HTML is not rendered)."""
    parts = INLINE_CODE.split(text)
    out: list[str] = []
    i = 0
    while i < len(parts):
        if i % 3 == 0:
            out.append(re.sub(r"(?<!\\)<", r"\\<", parts[i]))
            i += 1
        else:
            ticks, body = parts[i], parts[i + 1]
            out.append(f"{ticks}{body}{ticks}")
            i += 2
    return "".join(out)


class Renderer:
    def __init__(self, ref: Reference) -> None:
        self.ref = ref

    # -------------------------------------------------------------------- inline

    def inline(self, text: str, page: str, context: str | None) -> str:
        """Convert reST inline markup in ``text`` to Markdown."""

        def role(m: re.Match[str]) -> str:
            kind, target = m.group(1), m.group(2)
            label_match = re.match(r"^(.*?)\s*<(.+)>$", target)
            if label_match:
                label, target = label_match.group(1), label_match.group(2)
            else:
                label = target.lstrip("~").split(".")[-1] if target.startswith("~") else target
            if kind in ("meth", "func") and not label.endswith(")"):
                label += "()"
            sym = self.ref.resolve(target, context)
            if sym is not None:
                return f"[`{label}`]({self.ref.link(sym, page)})"
            url = external_url(target)
            if url:
                return f"[`{label}`]({url})"
            return f"`{label}`"

        text = strip_spec_refs(text)
        # Never link to the hosted docs by absolute URL; use site paths.
        text = re.sub(
            r"https://sponsorkit\.io(/docs[^\s)]*)", lambda m: f"[{m.group(1)}]({m.group(1)})", text
        )
        text = ROLE.sub(role, text)
        text = DOUBLE_TICK.sub(lambda m: f"`{m.group(1)}`", text)
        return escape_text(text)

    def type_md(self, annotation: str | None, page: str, table: bool = False) -> str:
        """Render an annotation as code, linking names the reference documents."""
        if not annotation:
            return ""
        annotation = annotation.strip().strip("'\"")
        tokens = re.split(r"([A-Za-z_][A-Za-z0-9_.]*)", annotation)
        pieces: list[tuple[str, str | None]] = []  # (text, link)
        for tok in tokens:
            if not tok:
                continue
            sym = self.ref.resolve(tok, None) if re.match(r"[A-Za-z_]", tok) else None
            if sym is not None and sym.kind in ("class", "error", "interface", "type"):
                pieces.append((tok, self.ref.link(sym, page)))
            elif pieces and pieces[-1][1] is None:
                pieces[-1] = (pieces[-1][0] + tok, None)
            else:
                pieces.append((tok, None))
        out = []
        for text, link in pieces:
            if table:
                text = text.replace("|", "\\|")
            if link:
                out.append(f"[`{text}`]({link})")
            elif text.strip():
                lead = " " if text.startswith(" ") and out else ""
                trail = " " if text.endswith(" ") else ""
                out.append(f"{lead}`{text.strip()}`{trail}")
            else:
                out.append(text)
        return "".join(out)

    # -------------------------------------------------------------------- docstrings

    SECTION = re.compile(
        r"^(Args|Arguments|Parameters|Raises|Returns|Yields|Attributes|Example|Examples|Note|Notes|Warning)(::?)\s*$"
    )

    def docstring(
        self,
        doc: str | None,
        page: str,
        context: str | None,
        params: dict[str, inspect.Parameter] | None = None,
        heading_level: int = 4,
        skip_args: bool = False,
        skip_raises: bool = False,
    ) -> str:
        """Convert a (cleaned) docstring to Markdown. Google sections become small sub-sections."""
        if not doc:
            return ""
        lines = inspect.cleandoc(doc).splitlines()
        out: list[str] = []
        para: list[str] = []
        i = 0

        def flush() -> None:
            if para:
                out.append(
                    self.inline(" ".join(s.strip() for s in para), page, context)
                    if not any(s.lstrip().startswith(("* ", "- ")) for s in para)
                    else self._list("\n".join(para), page, context)
                )
                out.append("")
                para.clear()

        def block(start: int) -> tuple[list[str], int]:
            """The indented block starting at ``start`` (blank lines inside are kept)."""
            body: list[str] = []
            j = start
            while j < len(lines) and (not lines[j].strip() or lines[j].startswith((" ", "\t"))):
                body.append(lines[j])
                j += 1
            while body and not body[-1].strip():
                body.pop()
            return body, j

        hashes = "#" * heading_level
        while i < len(lines):
            line = lines[i]
            m = self.SECTION.match(line.strip()) if not line.startswith(" ") else None
            if m:
                flush()
                name, colons = m.group(1), m.group(2)
                body, i = block(i + 1)
                text = textwrap.dedent("\n".join(body))
                if name in ("Example", "Examples") or colons == "::":
                    out.append(f"**{name}**")
                    out.append("")
                    out.append(self._fence(text))
                elif name in ("Args", "Arguments", "Parameters"):
                    if not skip_args:
                        out.append(self.params_table(self.parse_items(text), params or {}, page, context))
                elif name == "Raises" and skip_raises:
                    pass
                elif name == "Raises":
                    out.append(f"{hashes} Raises")
                    out.append("")
                    for exc, desc in self.parse_items(text):
                        out.append(f"- {self.type_md(exc, page)}: {self.inline(desc, page, context)}")
                    out.append("")
                elif name in ("Returns", "Yields"):
                    out.append(f"{hashes} {name}")
                    out.append("")
                    out.append(self.inline(" ".join(text.split()), page, context))
                    out.append("")
                else:
                    out.append(f":::note[{name}]")
                    out.append(self.inline(" ".join(text.split()), page, context))
                    out.append(":::")
                    out.append("")
                continue
            if not line.strip():
                flush()
                i += 1
                continue
            if line.rstrip().endswith("::") and i + 1 < len(lines):
                # "Quickstart::" followed by an indented literal block.
                para.append(line.rstrip()[:-1])
                flush()
                body, i = block(i + 1)
                out.append(self._fence(textwrap.dedent("\n".join(body))))
                out.append("")
                continue
            para.append(line)
            i += 1
        flush()
        return "\n".join(out).strip() + "\n"

    def _list(self, text: str, page: str, context: str | None) -> str:
        """A paragraph that contains bullet items (``* item`` with indented continuations)."""
        items: list[str] = []
        lead: list[str] = []
        for raw in text.splitlines():
            s = raw.strip()
            if s.startswith(("* ", "- ")):
                items.append(s[2:])
            elif items:
                items[-1] += " " + s
            else:
                lead.append(s)
        out = []
        if lead:
            out.append(self.inline(" ".join(lead), page, context))
            out.append("")
        out += [f"- {self.inline(it, page, context)}" for it in items]
        return "\n".join(out)

    @staticmethod
    def _fence(code: str) -> str:
        stripped = code.strip("\n")
        lang = "json" if stripped.lstrip().startswith("{") else "python"
        if re.match(r"^\s*(SPONSORKIT_|\$ |pip |uv )", stripped):
            lang = "bash"
        return f"```{lang}\n{stripped}\n```\n"

    @staticmethod
    def parse_items(text: str) -> list[tuple[str, str]]:
        """``name: description`` items with indented continuation lines."""
        items: list[tuple[str, str]] = []
        for raw in text.splitlines():
            if not raw.strip():
                continue
            if not raw.startswith((" ", "\t")):
                name, _, desc = raw.partition(":")
                items.append((name.strip(), desc.strip()))
            elif items:
                name, desc = items[-1]
                items[-1] = (name, f"{desc} {raw.strip()}".strip())
        return items

    def params_table(
        self,
        items: list[tuple[str, str]],
        params: dict[str, inspect.Parameter],
        page: str,
        context: str | None,
    ) -> str:
        rows = ["| Parameter | Type | Default | Description |", "|---|---|---|---|"]
        documented = {n for n, _ in items}
        all_items = list(items) + [(n, "") for n in params if n not in documented and n != "self"]
        for name, desc in all_items:
            p = params.get(name)
            typ = self.type_md(
                p.annotation if p and p.annotation is not inspect.Parameter.empty else None, page, True
            )
            default = ""
            if p is not None:
                if p.default is not inspect.Parameter.empty:
                    default = f"`{fmt_default(p.default)}`".replace("|", "\\|")
                elif p.kind not in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                    default = "required"
            text = self.inline(desc, page, context).replace("|", "\\|") if desc else ""
            rows.append(f"| `{name}` | {typ} | {default} | {text} |")
        return "\n".join(rows) + "\n"


def fmt_default(value: Any) -> str:
    if isinstance(value, float) and value.is_integer():
        return repr(value)
    return repr(value)


def fmt_annotation(ann: Any) -> str:
    if ann is inspect.Parameter.empty:
        return ""
    if isinstance(ann, str):
        return ann
    return inspect.formatannotation(ann)


def format_signature(prefix: str, sig: inspect.Signature, skip_self: bool) -> str:
    """``prefix(params) -> ret``, one parameter per line when it does not fit."""
    parts: list[str] = []
    seen_kwonly = False
    params = list(sig.parameters.values())
    if skip_self and params and params[0].name in ("self", "cls"):
        params = params[1:]
    for idx, p in enumerate(params):
        if p.kind is inspect.Parameter.KEYWORD_ONLY and not seen_kwonly:
            if not any(q.kind is inspect.Parameter.VAR_POSITIONAL for q in params):
                parts.append("*")
            seen_kwonly = True
        s = p.name
        if p.kind is inspect.Parameter.VAR_POSITIONAL:
            s = "*" + s
        elif p.kind is inspect.Parameter.VAR_KEYWORD:
            s = "**" + s
        ann = fmt_annotation(p.annotation)
        if ann:
            s += f": {ann}"
        if p.default is not inspect.Parameter.empty:
            s += f" = {fmt_default(p.default)}" if ann else f"={fmt_default(p.default)}"
        parts.append(s)
        if p.kind is inspect.Parameter.POSITIONAL_ONLY and (
            idx + 1 == len(params) or params[idx + 1].kind is not inspect.Parameter.POSITIONAL_ONLY
        ):
            parts.append("/")
    ret = fmt_annotation(sig.return_annotation)
    tail = f" -> {ret}" if ret else ""
    one_line = f"{prefix}({', '.join(parts)}){tail}"
    if len(one_line) <= SIG_WIDTH:
        return one_line
    inner = "".join(f"    {p},\n" for p in parts)
    return f"{prefix}(\n{inner}){tail}"


def _role_label(m: re.Match[str]) -> str:
    kind, target = m.group(1), m.group(2).lstrip("~")
    parts = target.split(".")
    label = ".".join(parts[-2:]) if kind in ("meth", "attr") and len(parts) > 1 else parts[-1]
    return label + "()" if kind in ("meth", "func") else label


def first_sentence(doc: str | None, fallback: str, markdown: bool = False) -> str:
    """The first sentence of ``doc``: plain text, or Markdown with code spans when ``markdown``."""
    if not doc:
        return fallback
    para = inspect.cleandoc(doc).split("\n\n")[0]
    text = strip_spec_refs(" ".join(para.split()))
    if markdown:
        text = DOUBLE_TICK.sub(lambda m: f"`{m.group(1)}`", text)
        text = ROLE.sub(lambda m: f"`{_role_label(m)}`", text)
    else:
        text = DOUBLE_TICK.sub(lambda m: m.group(1), text)
        text = ROLE.sub(_role_label, text)
    text = text.rstrip(":")
    m = re.match(r"^(.+?[.!?])(\s|$)", text)
    sentence = m.group(1) if m else text
    if not sentence.endswith((".", "!", "?")):
        sentence += "."
    return escape_text(sentence) if markdown else sentence


def frontmatter(**fields: Any) -> str:
    lines = ["---"]
    for k, v in fields.items():
        if v is None:
            continue
        if isinstance(v, bool):
            lines.append(f"{k}: {'true' if v else 'false'}")
        elif isinstance(v, int):
            lines.append(f"{k}: {v}")
        else:
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def literal_values(obj: Any) -> list[Any] | None:
    if typing.get_origin(obj) is typing.Literal:
        return list(typing.get_args(obj))
    return None


# --------------------------------------------------------------------------------------------- pages


KIND_LABEL = {
    "class": "Class",
    "error": "Exception",
    "interface": "Protocol",
    "type": "Type alias",
    "function": "Function",
    "constant": "Constant",
}

# Sidebar order for the most-used pages; everything else sorts by title at the default (100).
ORDER = {
    "Sponsorkit": 10,
    "ContributionResult": 20,
    "Contribution": 21,
    "CheckoutResult": 22,
    "SponsorkitError": 30,
    "Nag": 40,
}

GROUPS = [
    ("Client", ["Sponsorkit", "Nag", "SignInMethod", "CancelEvent"]),
    (
        "Results",
        [
            "ContributionResult",
            "Contribution",
            "CheckoutResult",
            "Money",
            "SponsorEntity",
            "Tier",
            "Supporter",
            "Identity",
            "Status",
            "Frequency",
            "Kind",
        ],
    ),
    ("Errors", ["SponsorkitError", "ErrorCode"]),
    ("Backend verification", ["verify_session", "averify_session", "TargetsArg"]),
    ("Targets", ["Target", "Provider", "targets_param", "targets_hash"]),
    ("Storage", ["Storage", "FileStorage", "MemoryStorage", "default_storage_dir"]),
    ("Testing", ["MockPreset", "MockData", "MOCK_PRESET_NAMES", "reset_process_state"]),
    ("Helpers", ["parse_duration", "__version__"]),
]


class Generator:
    def __init__(self, ref: Reference, out: Path) -> None:
        self.ref = ref
        self.r = Renderer(ref)
        self.out = out
        self.files: dict[str, str] = {}

    def write(self, rel: str, text: str) -> None:
        if rel in self.files:
            raise SystemExit(f"gen_reference: duplicate page {rel}")
        self.files[rel] = text.rstrip() + "\n"

    def source(self, mod: ModuleInfo, line: int | None) -> str:
        return f"{mod.rel_path}#L{line}" if line else mod.rel_path

    def summary(self, e: Entry, markdown: bool = False) -> str:
        """One sentence: plain for frontmatter, Markdown (code spans) for tables."""

        def plain(s: str) -> str:
            return s if markdown else s.replace("`", "")

        if e.kind == "type":
            return first_sentence(
                e.module.attrs.get(e.name, AttrDoc(None, 0, None, None)).doc,
                plain(self._alias_fallback(e)),
                markdown,
            )
        if e.kind == "constant":
            note = CONSTANT_NOTES.get(e.name, f"The constant `{e.name}`.")
            return first_sentence(
                e.module.attrs.get(e.name, AttrDoc(None, 0, None, None)).doc,
                plain(first_sentence(note, note, markdown)),
                markdown,
            )
        return first_sentence(
            inspect.getdoc(e.obj) if e.obj.__doc__ else None, plain(f"The {e.kind} `{e.name}`."), markdown
        )

    def _alias_fallback(self, e: Entry) -> str:
        values = literal_values(e.obj)
        if values:
            return "One of " + ", ".join(f"`{v}`" for v in values) + "."
        return f"Type alias `{e.name}`."

    # -------------------------------------------------------------------- run

    def run(self) -> None:
        for e in self.ref.entries.values():
            if e.kind in ("class", "error", "interface"):
                self.class_page(e)
            elif e.kind == "type":
                self.alias_page(e)
        self.write("types/_section.md", "---\ntitle: Type aliases\norder: 150\n---\n")
        self.write("modules/_section.md", "---\ntitle: Modules\norder: 160\n---\n")
        for m in self.ref.modules.values():
            self.module_page(m)
        self.index_page()
        self.out.mkdir(parents=True, exist_ok=True)
        for rel, text in sorted(self.files.items()):
            path = self.out / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
        meta = {
            "lang": "python",
            "package": "sponsorkit",
            "version": self.ref.pkg.__version__,
            "generator": "sdks/python/scripts/gen-docs.sh (inspect + ast: scripts/gen_reference.py)",
        }
        (self.out / "_meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    # -------------------------------------------------------------------- shared bits

    def import_line(self, e: Entry) -> str:
        mod = "sponsorkit" if "sponsorkit" in e.exported_from else e.exported_from[0]
        return f"from {mod} import {e.name}"

    def also_exported(self, e: Entry, page: str) -> str:
        mods = [m for m in e.exported_from if m != "sponsorkit"]
        if "sponsorkit" not in e.exported_from or not mods:
            return ""
        links = ", ".join(f"[`{m}`]({self.ref.link(self.ref.symbols[m], page)})" for m in mods)
        return f"Also importable from {links}.\n"

    def function_section(
        self, name: str, fn: Any, page: str, context: str | None, level: int, prefix: str = ""
    ) -> str:
        is_async = inspect.iscoroutinefunction(fn)
        sig = inspect.signature(fn)
        head = f"{'async ' if is_async else ''}def {name}"
        out = [f"{'#' * level} {prefix}{name}() {{#{anchor_id(name)}}}", ""]
        out.append(f"```python\n{format_signature(head, sig, skip_self=True)}\n```\n")
        doc = inspect.getdoc(fn)
        params = dict(sig.parameters)
        out.append(self.r.docstring(doc, page, context, params, heading_level=level + 1))
        notes = PARAM_NOTES.get(name, {})
        if notes and not (doc and re.search(r"^(Args|Arguments|Parameters):", doc, re.M)):
            out.append(self.r.params_table(list(notes.items()), params, page, context))
        return "\n".join(s for s in out if s is not None)

    # -------------------------------------------------------------------- class pages

    def class_page(self, e: Entry) -> None:
        cls = e.obj
        page = self.ref.symbols[e.name].page
        mod = e.module
        try:
            line = inspect.getsourcelines(cls)[1]
        except (OSError, TypeError):
            line = None
        doc = inspect.getdoc(cls) if cls.__doc__ else None
        context = f"{mod.name}.{e.name}"
        body: list[str] = []
        body.append(
            f"{KIND_LABEL[e.kind]} in [`{mod.name}`]({self.ref.link(self.ref.symbols[mod.name], page)})."
        )
        body.append("")
        body.append(f"```python\n{self.import_line(e)}\n```\n")
        body.append(self.also_exported(e, page))

        is_dc = dataclasses.is_dataclass(cls)
        init = vars(cls).get("__init__")
        init_sig = None
        if is_dc or (init is not None and inspect.isfunction(init)):
            init_sig = inspect.signature(cls)
            decorators = ""
            if is_dc:
                params = getattr(cls, "__dataclass_params__", None)
                decorators = (
                    "@dataclass(frozen=True)\n" if params is not None and params.frozen else "@dataclass\n"
                )
            bases = [b for b in cls.__bases__ if b is not object]
            base_s = f"({', '.join(b.__name__ for b in bases)})" if bases else ""
            body.append(f"```python\n{decorators}class {e.name}{base_s}:\n    ...\n```\n")
        elif getattr(cls, "_is_protocol", False):
            body.append(f"```python\n@runtime_checkable\nclass {e.name}(Protocol):\n    ...\n```\n")

        if doc:
            body.append(
                self.r.docstring(
                    doc,
                    page,
                    context,
                    dict(init_sig.parameters) if init_sig else None,
                    heading_level=2,
                    skip_args=True,
                    skip_raises=init_sig is not None,
                )
            )

        if "__enter__" in vars(cls):
            body.append(
                f"`{e.name}` is a context manager: `with {e.name}(...) as x:` calls `close()` on exit.\n"
            )

        # Constructor
        if e.name in FACTORY_ONLY:
            body.append(self.r.inline(FACTORY_ONLY[e.name], page, context) + "\n")
        elif getattr(cls, "_is_protocol", False):
            body.append(
                "Implement the methods below on any class; no subclassing is needed (it is a "
                "`runtime_checkable` `Protocol`).\n"
            )
        elif init_sig is not None and not is_dc:
            body.append("## Constructor")
            body.append("")
            body.append(f"```python\n{format_signature(e.name, init_sig, skip_self=True)}\n```\n")
            args_doc = self._section_text(doc, ("Args", "Arguments", "Parameters"))
            init_doc = inspect.getdoc(init) if init is not None and init.__doc__ else None
            items = self.r.parse_items(args_doc) if args_doc else []
            if not items and init_doc:
                items = self.r.parse_items(self._section_text(init_doc, ("Args",)) or "")
            notes = PARAM_NOTES.get(e.name, {})
            documented = {n for n, _ in items}
            items += [(n, d) for n, d in notes.items() if n not in documented]
            if init_sig.parameters:
                body.append(self.r.params_table(items, dict(init_sig.parameters), page, context))
            raises = self._section_text(doc, ("Raises",))
            if raises:
                body.append("### Raises")
                body.append("")
                for exc, desc in self.r.parse_items(raises):
                    body.append(f"- {self.r.type_md(exc, page)}: {self.r.inline(desc, page, context)}")
                body.append("")
        elif is_dc:
            body.append("## Constructor")
            body.append("")
            body.append(f"```python\n{format_signature(e.name, init_sig, skip_self=True)}\n```\n")
            body.append(
                "Instances are immutable; every field below is a constructor parameter."
                if cls.__dataclass_params__.frozen
                else "Every field below is a constructor parameter."
            )
            body.append("")

        # Fields / attributes
        attr_docs = self.ref.class_attr_docs(e)
        fields: list[tuple[str, str | None, str | None, str | None]] = []  # name, type, default, doc
        if is_dc:
            for f in dataclasses.fields(cls):
                a = attr_docs.get(f.name)
                default = None
                if f.default is not dataclasses.MISSING:
                    default = fmt_default(f.default)
                fields.append(
                    (
                        f.name,
                        f.type if isinstance(f.type, str) else fmt_annotation(f.type),
                        default,
                        a.doc if a else None,
                    )
                )
        else:
            for name, a in attr_docs.items():
                if name.startswith("_"):
                    continue
                fields.append((name, a.annotation, None, a.doc))
        members = self.ref.members_in_order(cls)
        props = [(n, r) for n, r in members if isinstance(r, property)]
        methods = [(n, r) for n, r in members if not isinstance(r, property)]
        # Instance attributes set in __init__ that are documented nowhere else (e.g. Nag.id).
        if not is_dc and init is not None and not fields:
            init_params = inspect.signature(init).parameters
            for name in self._init_attrs(init):
                p = init_params.get(name)
                typ = fmt_annotation(p.annotation) if p is not None else None
                fields.append((name, typ or None, None, None))

        if fields:
            body.append("## Fields" if is_dc else "## Attributes")
            body.append("")
            for name, typ, default, fdoc in fields:
                body.append(f"### {name} {{#{anchor_id(name)}}}")
                body.append("")
                sig = f"{name}: {typ}" if typ else name
                if default is not None:
                    sig += f" = {default}"
                body.append(f"```python\n{sig}\n```\n")
                if fdoc:
                    body.append(self.r.docstring(fdoc, page, context, heading_level=4))
                if e.name in FIELD_NOTES and name in FIELD_NOTES[e.name]:
                    body.append(self.r.inline(FIELD_NOTES[e.name][name], page, context) + "\n")
        if props:
            body.append("## Properties")
            body.append("")
            for name, prop in props:
                fget = prop.fget
                ret = fmt_annotation(inspect.signature(fget).return_annotation)
                body.append(f"### {name} {{#{anchor_id(name)}}}")
                body.append("")
                body.append(f"```python\n@property\ndef {name}(self) -> {ret}\n```\n")
                body.append(self.r.docstring(inspect.getdoc(fget), page, context, heading_level=4))
        if methods:
            body.append("## Methods")
            body.append("")
            for name, raw in methods:
                fn = raw.__func__ if isinstance(raw, (classmethod, staticmethod)) else raw
                prefix = "@classmethod\n" if isinstance(raw, classmethod) else ""
                is_async = inspect.iscoroutinefunction(fn)
                sig = inspect.signature(fn)
                head = f"{'async ' if is_async else ''}def {name}"
                body.append(f"### {name}() {{#{anchor_id(name)}}}")
                body.append("")
                body.append(f"```python\n{prefix}{format_signature(head, sig, skip_self=False)}\n```\n")
                body.append(
                    self.r.docstring(inspect.getdoc(fn), page, context, dict(sig.parameters), heading_level=4)
                )

        title = e.name
        desc = self.summary(e)
        text = frontmatter(
            title=title,
            description=desc,
            kind="error" if e.kind == "error" else ("interface" if e.kind == "interface" else "class"),
            symbol=self.ref.symbols[e.name].qualname,
            source=self.source(mod, line),
            order=ORDER.get(e.name),
        ) + "\n".join(body)
        self.write(page, text)

    @staticmethod
    def _init_attrs(init: Any) -> list[str]:
        try:
            src = textwrap.dedent(inspect.getsource(init))
        except (OSError, TypeError):
            return []
        names = []
        for node in ast.walk(ast.parse(src)):
            if isinstance(node, ast.Assign):
                for t in node.targets:
                    if (
                        isinstance(t, ast.Attribute)
                        and isinstance(t.value, ast.Name)
                        and t.value.id == "self"
                        and not t.attr.startswith("_")
                        and t.attr not in names
                    ):
                        names.append(t.attr)
        return names

    @staticmethod
    def _section_text(doc: str | None, names: tuple[str, ...]) -> str | None:
        if not doc:
            return None
        lines = inspect.cleandoc(doc).splitlines()
        for i, line in enumerate(lines):
            if line.strip().rstrip(":") in names and not line.startswith(" "):
                body = []
                for nxt in lines[i + 1 :]:
                    if nxt.strip() and not nxt.startswith((" ", "\t")):
                        break
                    body.append(nxt)
                return textwrap.dedent("\n".join(body))
        return None

    # -------------------------------------------------------------------- type aliases

    def alias_page(self, e: Entry) -> None:
        page = self.ref.symbols[e.name].page
        mod = e.module
        a = mod.attrs.get(e.name)
        value = a.value if a and a.value else repr(e.obj)
        if value and value[0] in "\"'" and a and a.annotation and "TypeAlias" in a.annotation:
            value = value.strip("\"'")
        body = [
            f"Type alias in [`{mod.name}`]({self.ref.link(self.ref.symbols[mod.name], page)}).",
            "",
            f"```python\n{self.import_line(e)}\n```\n",
            self.also_exported(e, page),
        ]
        decl = (
            f"{e.name}: TypeAlias = {value}"
            if a and a.annotation and "TypeAlias" in a.annotation
            else (f"{e.name} = {value}")
        )
        body.append(f"```python\n{self._wrap_literal(decl)}\n```\n")
        if a and a.doc:
            body.append(self.r.docstring(a.doc, page, f"{mod.name}.{e.name}", heading_level=2))
        if e.name in ALIAS_NOTES:
            body.append(self.r.inline(ALIAS_NOTES[e.name], page, None) + "\n")
        values = literal_values(e.obj)
        if values:
            body.append("## Values")
            body.append("")
            body.append("| Value |")
            body.append("|---|")
            for v in values:
                body.append(f"| `{json.dumps(v)}` |")
            body.append("")
        used = self.usages(e.name, page)
        if used:
            body.append("## Used by")
            body.append("")
            body += [f"- {u}" for u in used]
            body.append("")
        text = frontmatter(
            title=e.name,
            description=self.summary(e),
            kind="type",
            symbol=f"{mod.name}.{e.name}",
            source=self.source(mod, a.line if a else None),
        ) + "\n".join(body)
        self.write(page, text)

    @staticmethod
    def _wrap_literal(decl: str) -> str:
        if len(decl) <= SIG_WIDTH or "Literal[" not in decl:
            return decl
        head, _, rest = decl.partition("Literal[")
        inner = rest.rsplit("]", 1)[0]
        items = [s.strip() for s in inner.split(",") if s.strip()]
        return head + "Literal[\n" + "".join(f"    {s},\n" for s in items) + "]"

    def usages(self, name: str, page: str) -> list[str]:
        """Signatures and fields across the API that mention ``name`` (for alias pages)."""
        out: list[str] = []
        pattern = re.compile(rf"\b{re.escape(name)}\b")
        for e in self.ref.entries.values():
            if e.kind in ("class", "error", "interface"):
                cls = e.obj
                if dataclasses.is_dataclass(cls):
                    for f in dataclasses.fields(cls):
                        if isinstance(f.type, str) and pattern.search(f.type):
                            out.append(self._usage_link(f"{e.name}.{f.name}", page))
                for n, raw in [*self.ref.members_in_order(cls), ("__init__", vars(cls).get("__init__"))]:
                    fn = raw.fget if isinstance(raw, property) else raw
                    fn = fn.__func__ if isinstance(fn, (classmethod, staticmethod)) else fn
                    if not inspect.isfunction(fn):
                        continue
                    anns = " ".join(str(v) for v in fn.__annotations__.values())
                    if pattern.search(anns):
                        out.append(self._usage_link(e.name if n == "__init__" else f"{e.name}.{n}", page))
            elif e.kind == "function":
                anns = " ".join(str(v) for v in e.obj.__annotations__.values())
                if pattern.search(anns):
                    out.append(self._usage_link(e.name, page))
        seen: list[str] = []
        for u in out:
            if u not in seen:
                seen.append(u)
        return seen

    def _usage_link(self, qual: str, page: str) -> str:
        sym = self.ref.resolve(qual, None)
        label = (
            f"{qual}()"
            if sym is not None
            and sym.kind in ("member", "function")
            and "." in qual
            and not self._is_field(qual)
            else qual
        )
        if sym and sym.kind == "function":
            label = f"{qual}()"
        return f"[`{label}`]({self.ref.link(sym, page)})" if sym else f"`{qual}`"

    def _is_field(self, qual: str) -> bool:
        cls_name, _, member = qual.partition(".")
        e = self.ref.entries.get(cls_name)
        if e is None or not inspect.isclass(e.obj):
            return False
        if dataclasses.is_dataclass(e.obj) and member in {f.name for f in dataclasses.fields(e.obj)}:
            return True
        return isinstance(vars(e.obj).get(member), property)

    # -------------------------------------------------------------------- modules

    def module_page(self, m: ModuleInfo) -> None:
        page = self.ref.module_page(m)
        names = list(getattr(m.module, "__all__", []))
        is_pkg = m.name == "sponsorkit"
        body: list[str] = []
        mdoc = inspect.getdoc(m.module)
        if is_pkg:
            body.append("The `sponsorkit` package re-exports the whole public API, so one import is enough:")
            body.append("")
            body.append("```python\nfrom sponsorkit import Sponsorkit, SponsorkitError\n```\n")
            body.append(self.r.docstring(mdoc, page, m.name, heading_level=2))
        else:
            body.append(f"```python\nimport {m.name}\n```\n")
            body.append(self.r.docstring(mdoc, page, m.name, heading_level=2))

        # Summary table of everything the module exports.
        body.append("## Exports")
        body.append("")
        body.append("| Name | Kind | Summary |")
        body.append("|---|---|---|")
        for n in names:
            e = self.ref.entries.get(n)
            if e is None:
                continue
            sym = self.ref.symbols[n]
            label = f"{n}()" if e.kind == "function" else n
            summary = self.summary(e, markdown=True).replace("|", "\\|")
            body.append(
                f"| [`{label}`]({self.ref.link(sym, page)}) | {KIND_LABEL[e.kind].lower()} | {summary} |"
            )
        body.append("")

        # Functions and constants documented on this page.
        here = [
            self.ref.entries[n]
            for n in names
            if n in self.ref.entries
            and self.ref.entries[n].kind in ("function", "constant")
            and self.ref.symbols[n].page == page
        ]
        if is_pkg:  # names defined in private modules are documented here
            here = [e for e in here if self.ref.home_module(e) is m]
        fns = sorted((e for e in here if e.kind == "function"), key=lambda e: self._line(e))
        consts = [e for e in here if e.kind == "constant"]
        if fns:
            body.append("## Functions")
            body.append("")
            for e in fns:
                body.append(self.function_section(e.name, e.obj, page, None, 3))
                if "sponsorkit" in e.exported_from and not is_pkg:
                    body.append(f"Also exported as `sponsorkit.{e.name}`.\n")
                elif is_pkg and e.module.name != m.name:
                    body.append(f"Defined in `{e.module.name}`; import it from `sponsorkit`.\n")
        if consts:
            body.append("## Constants")
            body.append("")
            for e in consts:
                a = e.module.attrs.get(e.name)
                value = repr(e.obj)
                ann = a.annotation if a and a.annotation else None
                body.append(f"### {e.name} {{#{anchor_id(e.name)}}}")
                body.append("")
                body.append(f"```python\n{e.name}{': ' + ann if ann else ''} = {value}\n```\n")
                if a and a.doc:
                    body.append(self.r.docstring(a.doc, page, m.name, heading_level=4))
                elif e.name in CONSTANT_NOTES:
                    body.append(self.r.inline(CONSTANT_NOTES[e.name], page, m.name) + "\n")
        if is_pkg:
            body.append("## Submodules")
            body.append("")
            body.append("| Module | Summary |")
            body.append("|---|---|")
            for sub in self.ref.modules.values():
                if sub.name == "sponsorkit":
                    continue
                s = first_sentence(inspect.getdoc(sub.module), sub.name, True).replace("|", "\\|")
                body.append(f"| [`{sub.name}`]({self.ref.link(self.ref.symbols[sub.name], page)}) | {s} |")
            body.append("")
        text = frontmatter(
            title=m.name,
            description=first_sentence(mdoc, f"The {m.name} module."),
            kind="package" if is_pkg else "module",
            symbol=m.name,
            source=m.rel_path,
            order=10 if is_pkg else None,
        ) + "\n".join(body)
        self.write(page, text)

    def _line(self, e: Entry) -> tuple[str, int]:
        try:
            return (e.module.name, inspect.getsourcelines(e.obj)[1])
        except (OSError, TypeError):
            return (e.module.name, 0)

    # -------------------------------------------------------------------- index

    def index_page(self) -> None:
        page = "index.md"
        version = self.ref.pkg.__version__
        body = [
            f"Reference for the `sponsorkit` Python package, version {version}, generated from its",
            "source code and docstrings. For explanations and complete examples start with the",
            "[Python guide](/docs/languages/python); the concepts behind every SDK are in",
            "[Concepts](/docs/concepts).",
            "",
            '```bash title="Terminal"\npython -m pip install sponsorkit\n```\n',
            "Import everything from the top-level package: `from sponsorkit import Sponsorkit`. The",
            "backend helpers live in",
            f"[`sponsorkit.server`]({self.ref.link(self.ref.symbols['sponsorkit.server'], page)})",
            "and are re-exported too. Every blocking method of the client has an `a`-prefixed async",
            "variant (`sign_in()` and `asign_in()`).",
            "",
        ]
        listed: set[str] = set()
        for title, names in GROUPS:
            rows = []
            for n in names:
                e = self.ref.entries.get(n)
                if e is None:
                    continue
                listed.add(n)
                rows.append(self._index_row(e, page))
            if rows:
                body += [f"## {title}", "", "| Name | Kind | Summary |", "|---|---|---|", *rows, ""]
        rest = [e for n, e in self.ref.entries.items() if n not in listed]
        if rest:
            body += [
                "## Other public names",
                "",
                "Exported by a public submodule (not by `sponsorkit` itself).",
                "",
                "| Name | Kind | Summary |",
                "|---|---|---|",
            ]
            body += [self._index_row(e, page) for e in rest]
            body.append("")
        body += ["## Modules", "", "| Module | Summary |", "|---|---|"]
        for m in self.ref.modules.values():
            s = first_sentence(inspect.getdoc(m.module), m.name, True).replace("|", "\\|")
            body.append(f"| [`{m.name}`]({self.ref.link(self.ref.symbols[m.name], page)}) | {s} |")
        body.append("")
        text = frontmatter(
            title="Python API reference",
            description=(
                f"Every public class, function, type alias and constant of the sponsorkit package {version}."
            ),
            kind="index",
            symbol="sponsorkit",
        ) + "\n".join(body)
        self.write(page, text)

    def _index_row(self, e: Entry, page: str) -> str:
        sym = self.ref.symbols[e.name]
        where = e.exported_from[0] if "sponsorkit" not in e.exported_from else "sponsorkit"
        label = f"{e.name}()" if e.kind == "function" else e.name
        qual = f"{where}.{label}" if where != "sponsorkit" else label
        summary = self.summary(e, markdown=True).replace("|", "\\|")
        return f"| [`{qual}`]({self.ref.link(sym, page)}) | {KIND_LABEL[e.kind].lower()} | {summary} |"


# Extra notes for fields whose meaning is not in a docstring (kept short and factual).
FIELD_NOTES: dict[str, dict[str, str]] = {
    "ContributionResult": {
        "signed_in": "Whether a session is stored for this target set.",
        "disabled": "`True` when `SPONSORKIT_DISABLE` is set; the result is then signed out and empty.",
        "mock": "`True` when the result comes from mock mode.",
        "targets": 'The canonical target strings, e.g. `("github:octocat",)`.',
        "supporter": "The signed-in supporter, or `None` when signed out.",
        "contributions": (
            "Every contribution the supporter (or an organization they belong to) made to the targets."
        ),
        "fetched_at": (
            "ISO-8601 time the API produced the result; `None` for signed-out, disabled and mock results."
        ),
    },
    "Contribution": {
        "provider": "`github` or `opencollective`.",
        "sponsor": "Who pays: the supporter or one of their organizations.",
        "via": "`direct` for the supporter's own contribution, `organization` for one made by an "
        "organization "
        "they belong to.",
        "kind": "`recurring` or `one_time`.",
        "frequency": "`one_time`, `monthly` or `yearly`.",
        "status": "Normalized status. Unknown provider statuses map to `pending`.",
        "tier": "The provider tier, when there is one.",
        "flags": "Provider-specific markers.",
        "private": "Whether the supporter made the contribution private on the provider.",
        "started_at": "ISO-8601 start time, when known.",
        "ended_at": "ISO-8601 end time, when the contribution ended.",
        "last_charged_at": "ISO-8601 time of the last charge, when known.",
        "next_charge_at": "ISO-8601 time of the next charge (recurring contributions), when known.",
        "total_contributed": "Lifetime total, when the provider reports one.",
    },
    "Money": {
        "value": "Amount in minor units (cents).",
        "currency": "Uppercase ISO 4217 code, e.g. `USD`.",
    },
    "SponsorEntity": {
        "type": "`user` or `organization`.",
        "provider": "`github` or `opencollective`.",
        "id": "The provider's id for the account.",
        "handle": "The provider login or slug, when known.",
    },
    "Tier": {"id": "The provider's tier id.", "name": "The tier's display name."},
    "Identity": {
        "provider": "`github` or `opencollective`.",
        "id": "The provider's id for the account.",
        "handle": "The provider login or slug, when known.",
    },
    "Supporter": {
        "id": "Pairwise supporter id: stable for this target set and first identity.",
        "identities": "The provider accounts the supporter signed in with.",
    },
    "CheckoutResult": {
        "status": "`contributed` when a new or changed contribution was detected, else `unknown`.",
        "contribution": "The detected contribution when `status` is `contributed`.",
    },
    "Target": {
        "provider": "`github` or `opencollective`.",
        "account": "The normalized (lowercased, trimmed) login or slug.",
    },
    "MockData": {"contributions": "The contributions mock mode reports for a signed-in supporter."},
    "Nag": {
        "id": "The name of the counter, as passed to `Sponsorkit.nag()`.",
        "every": "Due once this many runs have counted since the nag was last shown.",
        "or_every": "Also due once this much time passed since it was last shown, or `None`.",
    },
    "FileStorage": {"directory": "The directory that holds the `<key>.json` files."},
}

# Constructor parameters without a docstring entry.
PARAM_NOTES: dict[str, dict[str, str]] = {
    "SponsorkitError": {
        "code": "The stable error code (see :data:`~sponsorkit.errors.ErrorCode`).",
        "message": "Human-readable message; defaults to the code.",
        "request_id": "The `Sponsorkit-Request-Id` of the failed API response, if any.",
        "retry_after": "Seconds from the API's `Retry-After` header (`network_error` only).",
    },
}

_TIMEOUT_NOTE = "Seconds for the HTTP request (`0` disables the timeout); a timeout raises `network_error`."
_VERIFY_NOTES = {
    "token": "The supporter's session token (`sks_...`), as sent by your client.",
    "targets": "Your targets; the session must be bound to exactly this set (after normalization).",
    "api_base_url": "Sponsorkit origin, for self-hosting and tests.",
    "request_timeout": _TIMEOUT_NOTE,
    "http_client": "Your own httpx client to send the request with (proxies, custom transports).",
    "timeout": "Deprecated alias of `request_timeout`.",
}
PARAM_NOTES["verify_session"] = _VERIFY_NOTES
PARAM_NOTES["averify_session"] = _VERIFY_NOTES

ALIAS_NOTES: dict[str, str] = {
    "Status": "What each status means and which ones to count: [Statuses](/docs/concepts/statuses).",
    "Frequency": "`one_time`, `monthly` or `yearly`. Used by "
    "[`Contribution.frequency`](../contribution.md#frequency) "
    "and as the `frequency` option of checkout.",
    "Kind": "`recurring` for sponsorships that renew, `one_time` for single payments.",
    "Provider": "See [Targets](/docs/concepts/targets) for the accounts each provider accepts.",
    "MockPreset": "What each preset returns is described in [Mock mode](/docs/guides/mock-mode).",
    "SignInMethod": "How the methods work: [Sessions](/docs/concepts/sessions#sign-in-methods).",
    "CancelEvent": "Async methods also accept an [`asyncio.Event`]"
    "(https://docs.python.org/3/library/asyncio-sync.html#asyncio.Event), and cancelling the "
    "awaiting task cancels the work too.",
}

# Classes that are created by a factory method instead of their constructor.
FACTORY_ONLY: dict[str, str] = {
    "Nag": "Don't construct a `Nag` yourself: call :meth:`sponsorkit.Sponsorkit.nag`, which validates the "
    "arguments and binds the nag to the client's storage.",
}

CONSTANT_NOTES: dict[str, str] = {
    "MOCK_PRESET_NAMES": "Every mock preset name, in the order of the "
    ":data:`~sponsorkit.mock.MockPreset` literal.",
    "PROVIDERS": "Every supported provider.",
    "__version__": "The installed package version.",
}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: gen_reference.py <out-dir>", file=sys.stderr)
        return 2
    out = Path(argv[1]).resolve()
    pkg = load_package()
    ref = Reference(pkg)
    Generator(ref, out).run()
    print(f"gen_reference: wrote {len(list(out.rglob('*.md')))} page(s) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
