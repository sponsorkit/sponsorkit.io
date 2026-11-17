//! Generates the Markdown API reference of the `sponsorkit` crate for sponsorkit.io.
//!
//! It walks the crate's source with `syn` (no nightly rustdoc JSON, no macro
//! expansion), follows the public re-exports in `lib.rs` and the public
//! modules, and writes one page per public type plus one page per module
//! listing its functions and constants, in the layout described by
//! `web/content/docs/REFERENCE-CONTRACT.md`.
//!
//! Usage: `sponsorkit-docgen <crate-dir> <out-dir> <repo-relative-crate-dir>`
//!
//! The output is deterministic: items are ordered by source order or name,
//! never by hash-map iteration, and no timestamps are written.

// Nested `if let`s stay: collapsing them needs let-chains (Rust 1.88), above the crate's 1.85 MSRV.
#![allow(clippy::collapsible_if)]

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};

use proc_macro2::{TokenStream, TokenTree};
use quote::ToTokens;
use syn::parse::{Parse, ParseStream};
use syn::punctuated::Punctuated;
use syn::{
    Attribute, Expr, Fields, FnArg, ImplItem, Item, ItemConst, ItemEnum, ItemFn, ItemImpl, ItemStruct, ItemType, Lit,
    Pat, ReturnType, Type, UseTree, Visibility, parse_quote,
};

type Res<T> = Result<T, String>;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        eprintln!("usage: sponsorkit-docgen <crate-dir> <out-dir> <repo-relative-crate-dir>");
        std::process::exit(2);
    }
    if let Err(e) = run(Path::new(&args[1]), Path::new(&args[2]), &args[3]) {
        eprintln!("sponsorkit-docgen: {e}");
        std::process::exit(1);
    }
}

// ---------------------------------------------------------------------------
// Source model
// ---------------------------------------------------------------------------

/// One source file of the crate (a module).
struct ModFile {
    /// Module name (`""` for the crate root).
    name: String,
    /// Repo-relative path, e.g. `sdks/rust/src/client.rs`.
    rel: String,
    /// Whether the module itself is `pub`.
    public: bool,
    file: syn::File,
}

/// An enum defined through the crate's `open_enum!` macro (in `types.rs`).
#[derive(Clone)]
struct OpenEnum {
    attrs: Vec<Attribute>,
    ident: syn::Ident,
    variants: Vec<(Vec<Attribute>, syn::Ident, syn::LitStr)>,
}

impl Parse for OpenEnum {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let attrs = input.call(Attribute::parse_outer)?;
        input.parse::<syn::Token![pub]>()?;
        input.parse::<syn::Token![enum]>()?;
        let ident: syn::Ident = input.parse()?;
        let content;
        syn::braced!(content in input);
        let mut variants = Vec::new();
        while !content.is_empty() {
            let vattrs = content.call(Attribute::parse_outer)?;
            let vident: syn::Ident = content.parse()?;
            content.parse::<syn::Token![=>]>()?;
            let wire: syn::LitStr = content.parse()?;
            variants.push((vattrs, vident, wire));
            if content.is_empty() {
                break;
            }
            content.parse::<syn::Token![,]>()?;
        }
        Ok(OpenEnum { attrs, ident, variants })
    }
}

impl OpenEnum {
    /// The enum the macro expands to (minus the impls), for the signature block.
    fn as_item(&self) -> ItemEnum {
        let ident = &self.ident;
        let variants = self.variants.iter().map(|(attrs, v, _)| {
            let attrs = attrs.iter().filter(|a| a.path().is_ident("doc"));
            quote::quote!(#(#attrs)* #v)
        });
        let attrs = &self.attrs;
        parse_quote! {
            #(#attrs)*
            #[derive(Debug, Clone, PartialEq, Eq, Hash)]
            #[non_exhaustive]
            pub enum #ident {
                #(#variants,)*
                /// A value this version of the SDK does not know yet (kept verbatim).
                Other(String),
            }
        }
    }
}

#[derive(Clone)]
enum Def {
    Struct(ItemStruct),
    Enum(ItemEnum),
    OpenEnum(OpenEnum),
    Type(ItemType),
    Fn(ItemFn),
    Const(ItemConst),
}

impl Def {
    fn ident(&self) -> String {
        match self {
            Def::Struct(i) => i.ident.to_string(),
            Def::Enum(i) => i.ident.to_string(),
            Def::OpenEnum(i) => i.ident.to_string(),
            Def::Type(i) => i.ident.to_string(),
            Def::Fn(i) => i.sig.ident.to_string(),
            Def::Const(i) => i.ident.to_string(),
        }
    }
    fn attrs(&self) -> &[Attribute] {
        match self {
            Def::Struct(i) => &i.attrs,
            Def::Enum(i) => &i.attrs,
            Def::OpenEnum(i) => &i.attrs,
            Def::Type(i) => &i.attrs,
            Def::Fn(i) => &i.attrs,
            Def::Const(i) => &i.attrs,
        }
    }
    fn line(&self) -> usize {
        match self {
            Def::Struct(i) => i.ident.span().start().line,
            Def::Enum(i) => i.ident.span().start().line,
            Def::OpenEnum(i) => i.ident.span().start().line,
            Def::Type(i) => i.ident.span().start().line,
            Def::Fn(i) => i.sig.ident.span().start().line,
            Def::Const(i) => i.ident.span().start().line,
        }
    }
    fn is_type(&self) -> bool {
        matches!(self, Def::Struct(_) | Def::Enum(_) | Def::OpenEnum(_) | Def::Type(_))
    }
}

/// A public item of the crate, at its public path.
#[derive(Clone)]
struct ApiItem {
    name: String,
    /// Public module path: `[]` for the crate root, `["server"]`, ...
    module: Vec<String>,
    def: Def,
    /// Repo-relative source file.
    rel: String,
    /// Index into `Crate::mods` of the defining module.
    mod_idx: usize,
    /// Output page, e.g. `options.md`, `server/index.md`.
    page: String,
    /// Anchor on `page` for functions and constants.
    anchor: Option<String>,
}

impl ApiItem {
    fn path(&self) -> String {
        let mut p = self.module.clone();
        p.push(self.name.clone());
        p.join("::")
    }
}

/// A member rendered on a type page.
struct Member {
    name: String,
    anchor: String,
    sig: String,
    docs: String,
    /// Wire value (enum variants) or JSON key (fields).
    wire: Option<String>,
    params: Vec<(String, Type)>,
    ret: Option<Type>,
}

#[derive(Default)]
struct Members {
    fields: Vec<Member>,
    variants: Vec<Member>,
    consts: Vec<Member>,
    methods: Vec<Member>,
    traits: Vec<String>,
}

struct Crate {
    name: String,
    version: String,
    mods: Vec<ModFile>,
    items: Vec<ApiItem>,
    /// External re-exports: (name, full path, docs URL).
    external: Vec<(String, String, String)>,
    /// Names of types that are not part of the public API.
    private_types: BTreeSet<String>,
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

fn is_hidden(attrs: &[Attribute]) -> bool {
    attrs.iter().any(|a| {
        let toks = a.meta.to_token_stream().to_string();
        (a.path().is_ident("cfg") && (toks.contains("test") || toks.contains("doctest")))
            || (a.path().is_ident("doc") && toks.contains("hidden"))
    })
}

fn has_attr(attrs: &[Attribute], name: &str) -> bool {
    attrs.iter().any(|a| a.path().is_ident(name))
}

/// The doc comment, with the common indentation removed (as rustdoc does).
fn docs(attrs: &[Attribute]) -> String {
    let mut lines = Vec::new();
    for a in attrs {
        if !a.path().is_ident("doc") {
            continue;
        }
        if let syn::Meta::NameValue(nv) = &a.meta {
            if let Expr::Lit(syn::ExprLit { lit: Lit::Str(s), .. }) = &nv.value {
                for l in s.value().split('\n') {
                    lines.push(l.to_string());
                }
            }
        }
    }
    let indent =
        lines.iter().filter(|l| !l.trim().is_empty()).map(|l| l.len() - l.trim_start().len()).min().unwrap_or(0);
    let out: Vec<String> = lines
        .iter()
        .map(|l| if l.len() >= indent { l[indent..].trim_end().to_string() } else { String::new() })
        .collect();
    strip_spec_refs(out.join("\n").trim())
}

/// Removes citations of internal spec sections such as "(SPEC §5.1)" or "(SPEC §7.3, PROTOCOL §4.6)" from doc
/// comments. They mean something to SDK maintainers reading the source, but on the website they are noise in
/// ledes, meta descriptions and search results. In a mixed group only the citations go:
/// "(PROTOCOL §2, RFC 7636 S256)" becomes "(RFC 7636 S256)".
fn strip_spec_refs(text: &str) -> String {
    fn is_ref(part: &str) -> bool {
        let p = part.trim();
        ["SPEC §", "PROTOCOL §"].iter().any(|pre| {
            p.strip_prefix(pre)
                .is_some_and(|rest| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit() || c == '.'))
        })
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('(') {
        let Some(close) = rest[open..].find(')').map(|i| open + i) else { break };
        let inner = &rest[open + 1..close];
        if inner.contains('(') || inner.contains('\n') || !inner.contains('§') {
            out.push_str(&rest[..=open]);
            rest = &rest[open + 1..];
            continue;
        }
        let kept: Vec<&str> = inner.split([',', ';']).filter(|p| !is_ref(p)).map(str::trim).collect();
        let mut before = &rest[..open];
        if kept.is_empty() {
            // Drop the whole group and the space in front of it.
            before = before.trim_end_matches(' ');
            out.push_str(before);
        } else {
            out.push_str(before);
            out.push('(');
            out.push_str(&kept.join(", "));
            out.push(')');
        }
        rest = &rest[close + 1..];
    }
    out.push_str(rest);
    out
}

fn derives(attrs: &[Attribute]) -> Vec<String> {
    let mut out = Vec::new();
    for a in attrs {
        if a.path().is_ident("derive") {
            if let Ok(list) = a.parse_args_with(Punctuated::<syn::Path, syn::Token![,]>::parse_terminated) {
                for p in list {
                    if let Some(seg) = p.segments.last() {
                        out.push(seg.ident.to_string());
                    }
                }
            }
        }
    }
    out
}

/// `#[serde(key = "value")]` on an item, field or variant.
fn serde_str(attrs: &[Attribute], key: &str) -> Option<String> {
    let mut found = None;
    for a in attrs {
        if !a.path().is_ident("serde") {
            continue;
        }
        let _ = a.parse_nested_meta(|meta| {
            if meta.path.is_ident(key) {
                if let Ok(v) = meta.value() {
                    if let Ok(s) = v.parse::<syn::LitStr>() {
                        found = Some(s.value());
                    }
                }
            } else if meta.input.peek(syn::Token![=]) {
                let v = meta.value()?;
                let _: Expr = v.parse()?;
            } else if meta.input.peek(syn::token::Paren) {
                let content;
                syn::parenthesized!(content in meta.input);
                let _: TokenStream = content.parse()?;
            }
            Ok(())
        });
    }
    found
}

fn rename(name: &str, rule: &str) -> String {
    match rule {
        "lowercase" => name.to_lowercase(),
        "snake_case" => {
            let mut s = String::new();
            for (i, c) in name.chars().enumerate() {
                if c.is_uppercase() && i > 0 {
                    s.push('_');
                }
                s.extend(c.to_lowercase());
            }
            s
        }
        "camelCase" => {
            let mut s = String::new();
            let mut up = false;
            for c in name.chars() {
                if c == '_' {
                    up = true;
                } else if up {
                    s.extend(c.to_uppercase());
                    up = false;
                } else {
                    s.push(c);
                }
            }
            s
        }
        _ => name.to_string(),
    }
}

fn is_pub(vis: &Visibility) -> bool {
    matches!(vis, Visibility::Public(_))
}

// ---------------------------------------------------------------------------
// Pretty-printing
// ---------------------------------------------------------------------------

fn unparse(item: Item) -> String {
    prettyplease::unparse(&syn::File { shebang: None, attrs: Vec::new(), items: vec![item] }).trim_end().to_string()
}

fn fmt_ty(ty: &Type) -> String {
    let s = unparse(parse_quote!(type __T = #ty;));
    s.trim_start_matches("type __T = ").trim_end_matches(';').to_string()
}

fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").replace("( ", "(").replace(" )", ")").replace(", )", ")")
}

fn strip_attrs_keep(attrs: &[Attribute], keep: &[&str]) -> Vec<Attribute> {
    attrs.iter().filter(|a| keep.iter().any(|k| a.path().is_ident(k))).cloned().collect()
}

fn fn_sig(vis: Visibility, sig: &syn::Signature) -> String {
    // Like rustdoc, hide `mut` bindings: they are not part of the API.
    let mut sig = sig.clone();
    for a in sig.inputs.iter_mut() {
        match a {
            FnArg::Receiver(r) if r.reference.is_none() => r.mutability = None,
            FnArg::Typed(pt) => {
                if let Pat::Ident(pi) = &mut *pt.pat {
                    pi.mutability = None;
                }
            }
            _ => {}
        }
    }
    let f = ItemFn { attrs: Vec::new(), vis, sig, block: Box::new(parse_quote!({})) };
    let s = unparse(Item::Fn(f));
    s.strip_suffix(" {}").unwrap_or(&s).to_string()
}

fn struct_sig(s: &ItemStruct) -> String {
    let mut s = s.clone();
    s.attrs = strip_attrs_keep(&s.attrs, &["non_exhaustive"]);
    let mut had_private = false;
    if let Fields::Named(named) = &mut s.fields {
        let kept: Punctuated<syn::Field, syn::Token![,]> = named
            .named
            .iter()
            .filter(|f| {
                let p = is_pub(&f.vis);
                had_private |= !p;
                p
            })
            .cloned()
            .map(|mut f| {
                f.attrs.clear();
                f
            })
            .collect();
        named.named = kept;
    }
    let out = unparse(Item::Struct(s));
    if !had_private {
        out
    } else if out.ends_with("{}") {
        format!("{}{{ /* private fields */ }}", out.trim_end_matches("{}"))
    } else {
        format!("{}    /* private fields */\n}}", out.trim_end_matches('}'))
    }
}

fn enum_sig(e: &ItemEnum) -> String {
    let mut e = e.clone();
    e.attrs = strip_attrs_keep(&e.attrs, &["non_exhaustive"]);
    for v in e.variants.iter_mut() {
        v.attrs.clear();
        for f in v.fields.iter_mut() {
            f.attrs.clear();
        }
    }
    unparse(Item::Enum(e))
}

fn variant_sig(v: &syn::Variant) -> String {
    let mut v = v.clone();
    v.attrs.clear();
    for f in v.fields.iter_mut() {
        f.attrs.clear();
    }
    // Render inside a throwaway enum and take the variant line(s).
    let e: ItemEnum = parse_quote!(enum __E { #v });
    let s = unparse(Item::Enum(e));
    let body: Vec<&str> = s.lines().skip(1).collect();
    let body = &body[..body.len().saturating_sub(1)];
    let text = body.iter().map(|l| l.strip_prefix("    ").unwrap_or(l)).collect::<Vec<_>>().join("\n");
    text.trim_end_matches(',').to_string()
}

/// Identifiers mentioned in a token stream (recursively).
fn idents(ts: TokenStream, out: &mut Vec<String>) {
    for t in ts {
        match t {
            TokenTree::Ident(i) => out.push(i.to_string()),
            TokenTree::Group(g) => idents(g.stream(), out),
            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------
// Names and links
// ---------------------------------------------------------------------------

/// File/folder names: lowercase, runs of other characters become `-`.
fn slug_file(name: &str) -> String {
    let mut s = String::new();
    let mut dash = false;
    for c in name.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if dash && !s.is_empty() {
                s.push('-');
            }
            dash = false;
            s.push(c);
        } else {
            dash = true;
        }
    }
    s
}

/// Heading ids: lowercase, `_` kept, runs of other characters become `-`.
fn slug_id(name: &str) -> String {
    let mut s = String::new();
    let mut sep: Option<char> = None;
    for c in name.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if let Some(x) = sep.take() {
                if !s.is_empty() {
                    s.push(x);
                }
            }
            s.push(c);
        } else if c == '_' {
            if sep.is_none() {
                sep = Some('_');
            }
        } else {
            sep = Some('-');
        }
    }
    s
}

/// A relative link from page `from` to `to` (both relative to the output root).
fn rel_link(from: &str, to: &str) -> String {
    let from_dirs: Vec<&str> = from.split('/').collect::<Vec<_>>();
    let from_dirs = &from_dirs[..from_dirs.len() - 1];
    let to_parts: Vec<&str> = to.split('/').collect();
    let mut common = 0;
    while common < from_dirs.len() && common < to_parts.len() - 1 && from_dirs[common] == to_parts[common] {
        common += 1;
    }
    let mut s = "../".repeat(from_dirs.len() - common);
    s.push_str(&to_parts[common..].join("/"));
    s
}

/// Where a Rust path points: a page (+ anchor) of this reference, or an external URL.
#[derive(Clone)]
enum Dest {
    Page(String, Option<String>),
    Url(String),
}

struct Resolver {
    map: BTreeMap<String, Dest>,
}

impl Resolver {
    fn resolve(&self, path: &str, scope: &[String], self_ty: Option<&str>) -> Option<Dest> {
        let mut p = path.trim().trim_end_matches("()").trim_end_matches('!').to_string();
        let mut scope: Vec<String> = scope.to_vec();
        if let Some(rest) = p.strip_prefix("crate::") {
            p = rest.to_string();
            scope.clear();
        }
        if let (Some(rest), Some(t)) = (p.strip_prefix("Self::"), self_ty) {
            p = format!("{t}::{rest}");
        }
        while let Some(rest) = p.strip_prefix("super::") {
            p = rest.to_string();
            scope.pop();
        }
        if let Some(rest) = p.strip_prefix("self::") {
            p = rest.to_string();
        }
        let mut candidates = Vec::new();
        if !scope.is_empty() {
            candidates.push(format!("{}::{}", scope.join("::"), p));
        }
        candidates.push(p.clone());
        candidates.into_iter().find_map(|c| self.map.get(&c).cloned())
    }

    fn href(&self, dest: &Dest, from: &str) -> String {
        match dest {
            Dest::Url(u) => u.clone(),
            Dest::Page(page, anchor) => {
                let mut s = rel_link(from, page);
                if let Some(a) = anchor {
                    s.push('#');
                    s.push_str(a);
                }
                s
            }
        }
    }
}

fn is_rust_path(s: &str) -> bool {
    let s = s.trim_end_matches("()").trim_end_matches('!');
    let mut chars = s.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == ':')
        && !s.contains(":::")
}

/// Context for rendering one doc comment.
struct Ctx<'a> {
    res: &'a Resolver,
    scope: &'a [String],
    self_ty: Option<&'a str>,
    page: &'a str,
}

impl Ctx<'_> {
    fn link(&self, path: &str) -> Option<String> {
        self.res.resolve(path, self.scope, self.self_ty).map(|d| self.res.href(&d, self.page))
    }

    /// Rewrites intra-doc links (`[`Foo::bar`]`, `[text](crate::Foo)`) on one line.
    fn inline(&self, line: &str) -> String {
        let chars: Vec<char> = line.chars().collect();
        let mut out = String::new();
        let mut i = 0;
        while i < chars.len() {
            let c = chars[i];
            if c == '`' {
                let mut n = 0;
                while i + n < chars.len() && chars[i + n] == '`' {
                    n += 1;
                }
                // Find the closing run of exactly n backticks.
                let mut j = i + n;
                let mut end = None;
                while j < chars.len() {
                    if chars[j] == '`' {
                        let mut m = 0;
                        while j + m < chars.len() && chars[j + m] == '`' {
                            m += 1;
                        }
                        if m == n {
                            end = Some(j + m);
                            break;
                        }
                        j += m;
                    } else {
                        j += 1;
                    }
                }
                let end = end.unwrap_or(i + n);
                out.extend(&chars[i..end]);
                i = end;
                continue;
            }
            if c == '[' {
                let Some(close) = (i + 1..chars.len()).find(|&j| chars[j] == ']') else {
                    out.push(c);
                    i += 1;
                    continue;
                };
                let inner: String = chars[i + 1..close].iter().collect();
                let next = chars.get(close + 1).copied();
                if next == Some('(') {
                    if let Some(end) = (close + 2..chars.len()).find(|&j| chars[j] == ')') {
                        let target: String = chars[close + 2..end].iter().collect();
                        if is_rust_path(&target) && !target.starts_with("http") {
                            match self.link(&target) {
                                Some(h) => write!(out, "[{inner}]({h})").unwrap(),
                                None => out.push_str(&inner),
                            }
                        } else {
                            out.extend(&chars[i..=end]);
                        }
                        i = end + 1;
                        continue;
                    }
                }
                if next == Some('[') || next == Some(':') {
                    out.extend(&chars[i..=close]);
                    i = close + 1;
                    continue;
                }
                let path = inner.trim_matches('`');
                if is_rust_path(path) {
                    match self.link(path) {
                        Some(h) => write!(out, "[{inner}]({h})").unwrap(),
                        None => out.push_str(&inner),
                    }
                } else {
                    out.push('[');
                    out.push_str(&self.inline(&inner));
                    out.push(']');
                }
                i = close + 1;
                continue;
            }
            out.push(c);
            i += 1;
        }
        out
    }

    /// Converts a rustdoc comment to site Markdown: resolves intra-doc links,
    /// hides `# ` lines in Rust code blocks, tags them `rust`, and shifts
    /// headings so the shallowest one is at `level`.
    fn markdown(&self, md: &str, level: usize) -> String {
        let lines: Vec<&str> = md.lines().collect();
        let mut min_level = usize::MAX;
        {
            let mut fence: Option<String> = None;
            for l in &lines {
                let t = l.trim_start();
                if let Some(f) = &fence {
                    if t.starts_with(f.as_str()) {
                        fence = None;
                    }
                } else if t.starts_with("```") || t.starts_with("~~~") {
                    fence = Some(t.chars().take_while(|&c| c == '`' || c == '~').collect());
                } else if l.starts_with('#') {
                    let n = l.chars().take_while(|&c| c == '#').count();
                    if l[n..].starts_with(' ') {
                        min_level = min_level.min(n);
                    }
                }
            }
        }
        let shift = if min_level == usize::MAX || min_level >= level { 0 } else { level - min_level };
        let mut out = Vec::new();
        let mut fence: Option<(String, bool)> = None;
        for l in lines {
            let t = l.trim_start();
            if let Some((f, rust)) = &fence {
                if t.starts_with(f.as_str()) && t.trim_end().chars().all(|c| c == '`' || c == '~') {
                    out.push(l.to_string());
                    fence = None;
                } else if *rust && (t == "#" || t.starts_with("# ")) {
                    // Hidden doctest line.
                } else if *rust && t.starts_with("##") {
                    out.push(l.replacen("##", "#", 1));
                } else {
                    out.push(l.to_string());
                }
                continue;
            }
            if t.starts_with("```") || t.starts_with("~~~") {
                let f: String = t.chars().take_while(|&c| c == '`' || c == '~').collect();
                let info = t[f.len()..].trim();
                let rust = info.is_empty()
                    || info.split(',').all(|tok| {
                        let tok = tok.trim();
                        tok == "rust"
                            || tok == "no_run"
                            || tok == "ignore"
                            || tok == "should_panic"
                            || tok == "compile_fail"
                            || tok.starts_with("edition")
                    });
                out.push(if rust { format!("{f}rust") } else { l.to_string() });
                fence = Some((f, rust));
                continue;
            }
            if l.starts_with('#') {
                let n = l.chars().take_while(|&c| c == '#').count();
                if l[n..].starts_with(' ') {
                    let level = (n + shift).min(6);
                    out.push(format!("{} {}", "#".repeat(level), self.inline(l[n..].trim())));
                    continue;
                }
            }
            out.push(self.inline(l));
        }
        out.join("\n")
    }
}

/// A one-sentence, plain-text summary for frontmatter and tables.
fn summary(md: &str) -> String {
    summary_impl(md, false)
}

/// Like [`summary`], but keeps code spans (for Markdown table cells).
fn summary_md(md: &str) -> String {
    summary_impl(md, true).replace('|', "\\|")
}

fn summary_impl(md: &str, keep_code: bool) -> String {
    let para: Vec<&str> = md.lines().take_while(|l| !l.trim().is_empty()).collect();
    let text = para.join(" ");
    // Strip intra-doc link brackets and code ticks.
    let mut plain = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '[' => {
                let inner: String = chars.by_ref().take_while(|&c| c != ']').collect();
                plain.push_str(&if keep_code { inner } else { inner.replace('`', "") });
                if chars.peek() == Some(&'(') {
                    for c in chars.by_ref() {
                        if c == ')' {
                            break;
                        }
                    }
                }
            }
            '`' if !keep_code => {}
            c => plain.push(c),
        }
    }
    let plain = one_line(&plain);
    // First sentence.
    let mut end = plain.len();
    for (i, _) in plain.match_indices(". ") {
        // Skip abbreviations such as "e.g. " and "i.e. ".
        let before = &plain[..i];
        if before.ends_with("e.g") || before.ends_with("i.e") || before.ends_with("etc") {
            continue;
        }
        end = i + 1;
        break;
    }
    plain[..end].trim().to_string()
}

fn yaml(s: &str) -> String {
    serde_json::to_string(s).expect("string serializes")
}

// ---------------------------------------------------------------------------
// Loading the crate
// ---------------------------------------------------------------------------

fn parse_file(path: &Path) -> Res<syn::File> {
    let src = std::fs::read_to_string(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    syn::parse_file(&src).map_err(|e| format!("cannot parse {}: {e}", path.display()))
}

fn package_field(manifest: &str, key: &str) -> Option<String> {
    let mut in_package = false;
    for line in manifest.lines() {
        let t = line.trim();
        if t.starts_with('[') {
            in_package = t == "[package]";
            continue;
        }
        if in_package {
            if let Some(rest) = t.strip_prefix(key) {
                let rest = rest.trim_start();
                if let Some(v) = rest.strip_prefix('=') {
                    return Some(v.trim().trim_matches('"').to_string());
                }
            }
        }
    }
    None
}

fn collect_uses(tree: &UseTree, prefix: &mut Vec<String>, out: &mut Vec<(Vec<String>, String)>) {
    match tree {
        UseTree::Path(p) => {
            prefix.push(p.ident.to_string());
            collect_uses(&p.tree, prefix, out);
            prefix.pop();
        }
        UseTree::Name(n) => out.push((prefix.clone(), n.ident.to_string())),
        UseTree::Group(g) => {
            for t in &g.items {
                collect_uses(t, prefix, out);
            }
        }
        UseTree::Rename(_) | UseTree::Glob(_) => {}
    }
}

fn top_defs(file: &syn::File) -> Vec<Def> {
    let mut out = Vec::new();
    for item in &file.items {
        match item {
            Item::Struct(i) if is_pub(&i.vis) && !is_hidden(&i.attrs) => out.push(Def::Struct(i.clone())),
            Item::Enum(i) if is_pub(&i.vis) && !is_hidden(&i.attrs) => out.push(Def::Enum(i.clone())),
            Item::Type(i) if is_pub(&i.vis) && !is_hidden(&i.attrs) => out.push(Def::Type(i.clone())),
            Item::Fn(i) if is_pub(&i.vis) && !is_hidden(&i.attrs) => out.push(Def::Fn(i.clone())),
            Item::Const(i) if is_pub(&i.vis) && !is_hidden(&i.attrs) => out.push(Def::Const(i.clone())),
            Item::Macro(m) if m.mac.path.is_ident("open_enum") => {
                if let Ok(e) = m.mac.parse_body::<OpenEnum>() {
                    out.push(Def::OpenEnum(e));
                }
            }
            _ => {}
        }
    }
    out
}

fn private_type_names(file: &syn::File, out: &mut BTreeSet<String>) {
    for item in &file.items {
        match item {
            Item::Struct(i) if !is_pub(&i.vis) => {
                out.insert(i.ident.to_string());
            }
            Item::Enum(i) if !is_pub(&i.vis) => {
                out.insert(i.ident.to_string());
            }
            _ => {}
        }
    }
}

fn load(crate_dir: &Path, rel_prefix: &str) -> Res<Crate> {
    let manifest = std::fs::read_to_string(crate_dir.join("Cargo.toml")).map_err(|e| format!("Cargo.toml: {e}"))?;
    let name = package_field(&manifest, "name").ok_or("no package name in Cargo.toml")?;
    let version = package_field(&manifest, "version").ok_or("no package version in Cargo.toml")?;

    let src = crate_dir.join("src");
    let lib = parse_file(&src.join("lib.rs"))?;
    let mut mods =
        vec![ModFile { name: String::new(), rel: format!("{rel_prefix}/src/lib.rs"), public: true, file: lib }];
    let root_items = mods[0].file.items.clone();
    for item in &root_items {
        if let Item::Mod(m) = item {
            if m.content.is_some() || is_hidden(&m.attrs) {
                continue;
            }
            let n = m.ident.to_string();
            let path: PathBuf = src.join(format!("{n}.rs"));
            let file = parse_file(&path)?;
            mods.push(ModFile {
                name: n.clone(),
                rel: format!("{rel_prefix}/src/{n}.rs"),
                public: is_pub(&m.vis),
                file,
            });
        }
    }

    let mut items: Vec<ApiItem> = Vec::new();
    let mut external = Vec::new();
    let mod_index = |name: &str| mods.iter().position(|m| m.name == name);

    // Items defined at the crate root.
    for d in top_defs(&mods[0].file) {
        items.push(ApiItem {
            name: d.ident(),
            module: Vec::new(),
            def: d,
            rel: mods[0].rel.clone(),
            mod_idx: 0,
            page: String::new(),
            anchor: None,
        });
    }
    // Root re-exports.
    for item in &root_items {
        let Item::Use(u) = item else { continue };
        if !is_pub(&u.vis) {
            continue;
        }
        let mut uses = Vec::new();
        collect_uses(&u.tree, &mut Vec::new(), &mut uses);
        for (prefix, name) in uses {
            let first = prefix.first().cloned().unwrap_or_default();
            let first = if first == "crate" { prefix.get(1).cloned().unwrap_or_default() } else { first };
            if let Some(mi) = mod_index(&first) {
                let def = top_defs(&mods[mi].file)
                    .into_iter()
                    .find(|d| d.ident() == name)
                    .ok_or_else(|| format!("re-export {first}::{name} not found"))?;
                items.push(ApiItem {
                    name: name.clone(),
                    module: Vec::new(),
                    def,
                    rel: mods[mi].rel.clone(),
                    mod_idx: mi,
                    page: String::new(),
                    anchor: None,
                });
            } else {
                let full = format!("{}::{}", prefix.join("::"), name);
                let krate = prefix.first().cloned().unwrap_or_default();
                let url = format!(
                    "https://docs.rs/{}/latest/{}/{}/struct.{}.html",
                    krate.replace('_', "-"),
                    krate,
                    prefix[1..].join("/"),
                    name
                );
                external.push((name, full, url));
            }
        }
    }
    // Public modules.
    for (mi, m) in mods.iter().enumerate().skip(1) {
        if !m.public {
            continue;
        }
        for d in top_defs(&m.file) {
            items.push(ApiItem {
                name: d.ident(),
                module: vec![m.name.clone()],
                def: d,
                rel: m.rel.clone(),
                mod_idx: mi,
                page: String::new(),
                anchor: None,
            });
        }
    }

    // Pages.
    let mut used: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for it in items.iter_mut() {
        let dir = if it.module.is_empty() { String::new() } else { format!("{}/", slug_file(&it.module.join("-"))) };
        if it.def.is_type() {
            let base = slug_file(&it.name);
            let set = used.entry(dir.clone()).or_default();
            let mut name = base.clone();
            let mut n = 2;
            while name == "index" || set.contains(&name) {
                name = format!("{base}-{n}");
                n += 1;
            }
            set.insert(name.clone());
            it.page = format!("{dir}{name}.md");
        } else {
            it.page = format!("{dir}index.md");
            it.anchor = Some(slug_id(&it.name));
        }
    }

    let mut private_types = BTreeSet::new();
    for m in &mods {
        private_type_names(&m.file, &mut private_types);
        for d in top_defs(&m.file) {
            if d.is_type() && !items.iter().any(|i| i.name == d.ident()) {
                private_types.insert(d.ident());
            }
        }
    }

    Ok(Crate { name, version, mods, items, external, private_types })
}

// ---------------------------------------------------------------------------
// Members of a type
// ---------------------------------------------------------------------------

fn impl_self_name(i: &ItemImpl) -> Option<String> {
    match &*i.self_ty {
        Type::Path(p) => p.path.segments.last().map(|s| s.ident.to_string()),
        _ => None,
    }
}

/// `impl Trait for Type` as one line, with std paths shortened.
fn trait_impl_line(i: &ItemImpl, public_names: &BTreeSet<String>) -> String {
    let mut i = i.clone();
    i.attrs.clear();
    i.items.clear();
    if let Some((_, path, _)) = &mut i.trait_ {
        let last = path.segments.last().map(|s| s.ident.to_string()).unwrap_or_default();
        if path.segments.len() > 1 && !public_names.contains(&last) {
            let seg = path.segments.last().cloned().unwrap();
            path.segments = std::iter::once(seg).collect();
            path.leading_colon = None;
        }
    }
    let s = unparse(Item::Impl(i));
    one_line(s.strip_suffix(" {}").unwrap_or(&s))
}

fn derive_line(d: &str, ty: &str) -> String {
    match d {
        "Deserialize" => format!("impl<'de> Deserialize<'de> for {ty}"),
        _ => format!("impl {d} for {ty}"),
    }
}

/// Wire spellings from an inherent `as_str` method: `Variant => "wire"` arms.
fn as_str_map(impls: &[&ItemImpl]) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for i in impls {
        for it in &i.items {
            let ImplItem::Fn(f) = it else { continue };
            if f.sig.ident != "as_str" {
                continue;
            }
            for stmt in &f.block.stmts {
                let syn::Stmt::Expr(Expr::Match(m), _) = stmt else { continue };
                for arm in &m.arms {
                    let name = match &arm.pat {
                        Pat::Path(p) => p.path.segments.last().map(|s| s.ident.to_string()),
                        Pat::TupleStruct(p) => p.path.segments.last().map(|s| s.ident.to_string()),
                        _ => None,
                    };
                    if let (Some(n), Expr::Lit(syn::ExprLit { lit: Lit::Str(s), .. })) = (name, &*arm.body) {
                        out.insert(n, s.value());
                    }
                }
            }
        }
    }
    out
}

fn params_of(sig: &syn::Signature) -> (Vec<(String, Type)>, Option<Type>) {
    let mut params = Vec::new();
    for a in &sig.inputs {
        if let FnArg::Typed(pt) = a {
            let name = match &*pt.pat {
                Pat::Ident(i) => i.ident.to_string(),
                other => one_line(&other.to_token_stream().to_string()),
            };
            params.push((name, (*pt.ty).clone()));
        }
    }
    let ret = match &sig.output {
        ReturnType::Default => None,
        ReturnType::Type(_, t) => Some((**t).clone()),
    };
    (params, ret)
}

fn members(krate: &Crate, item: &ApiItem) -> Members {
    let mut m = Members::default();
    let name = &item.name;
    let public_names: BTreeSet<String> = krate.items.iter().map(|i| i.name.clone()).collect();

    // Impl blocks: the defining module first, then the others in module order.
    let mut order: Vec<usize> = vec![item.mod_idx];
    order.extend((0..krate.mods.len()).filter(|&i| i != item.mod_idx));
    let mut inherent: Vec<&ItemImpl> = Vec::new();
    let mut trait_impls: Vec<&ItemImpl> = Vec::new();
    for mi in order {
        for it in &krate.mods[mi].file.items {
            let Item::Impl(imp) = it else { continue };
            if is_hidden(&imp.attrs) || impl_self_name(imp).as_deref() != Some(name.as_str()) {
                continue;
            }
            if imp.trait_.is_some() {
                trait_impls.push(imp);
            } else {
                inherent.push(imp);
            }
        }
    }
    let wire_map = as_str_map(&inherent);

    let mut traits: BTreeSet<String> = BTreeSet::new();
    for d in derives(item.def.attrs()) {
        traits.insert(derive_line(&d, name));
    }
    for imp in &trait_impls {
        let mut ids = Vec::new();
        idents(imp.to_token_stream(), &mut ids);
        if ids.iter().any(|i| krate.private_types.contains(i)) {
            continue;
        }
        traits.insert(trait_impl_line(imp, &public_names));
    }

    match &item.def {
        Def::Struct(s) => {
            let rename_all = serde_str(&s.attrs, "rename_all");
            let serializes = derives(&s.attrs).iter().any(|d| d == "Serialize");
            if let Fields::Named(named) = &s.fields {
                for f in &named.named {
                    if !is_pub(&f.vis) {
                        continue;
                    }
                    let fname = f.ident.as_ref().unwrap().to_string();
                    let json = serializes.then(|| {
                        serde_str(&f.attrs, "rename")
                            .unwrap_or_else(|| rename(&fname, rename_all.as_deref().unwrap_or("")))
                    });
                    m.fields.push(Member {
                        anchor: slug_id(&fname),
                        sig: format!("pub {}: {}", fname, fmt_ty(&f.ty)),
                        docs: docs(&f.attrs),
                        wire: json,
                        name: fname,
                        params: Vec::new(),
                        ret: None,
                    });
                }
            }
        }
        Def::Enum(e) => {
            let rename_all = serde_str(&e.attrs, "rename_all");
            let serde = derives(&e.attrs).iter().any(|d| d == "Serialize" || d == "Deserialize");
            for v in &e.variants {
                let vname = v.ident.to_string();
                let wire = wire_map.get(&vname).cloned().or_else(|| {
                    serde.then(|| {
                        serde_str(&v.attrs, "rename")
                            .unwrap_or_else(|| rename(&vname, rename_all.as_deref().unwrap_or("")))
                    })
                });
                let mut d = docs(&v.attrs);
                // Fields of struct-like variants.
                if let Fields::Named(named) = &v.fields {
                    for f in &named.named {
                        let fd = docs(&f.attrs);
                        if !fd.is_empty() {
                            write!(d, "\n\n- `{}`: {}", f.ident.as_ref().unwrap(), one_line(&fd)).unwrap();
                        }
                    }
                }
                m.variants.push(Member {
                    anchor: slug_id(&vname),
                    sig: variant_sig(v),
                    docs: d,
                    wire,
                    name: vname,
                    params: Vec::new(),
                    ret: None,
                });
            }
        }
        Def::OpenEnum(e) => {
            for (attrs, v, wire) in &e.variants {
                m.variants.push(Member {
                    name: v.to_string(),
                    anchor: slug_id(&v.to_string()),
                    sig: v.to_string(),
                    docs: docs(attrs),
                    wire: Some(wire.value()),
                    params: Vec::new(),
                    ret: None,
                });
            }
            m.variants.push(Member {
                name: "Other".into(),
                anchor: "other".into(),
                sig: "Other(String)".into(),
                docs: "A value this version of the SDK does not know yet (kept verbatim).".into(),
                wire: Some("any other string".into()),
                params: Vec::new(),
                ret: None,
            });
            let sig: syn::Signature = parse_quote!(fn as_str(&self) -> &str);
            m.methods.push(Member {
                name: "as_str".into(),
                anchor: "as_str".into(),
                sig: fn_sig(parse_quote!(pub), &sig),
                docs: "The wire spelling.".into(),
                wire: None,
                params: Vec::new(),
                ret: Some(parse_quote!(&str)),
            });
            for t in ["From<&str>", "Display", "Serialize"] {
                traits.insert(format!("impl {t} for {name}"));
            }
            traits.insert(format!("impl<'de> Deserialize<'de> for {name}"));
        }
        _ => {}
    }

    for imp in &inherent {
        for it in &imp.items {
            match it {
                ImplItem::Fn(f) if is_pub(&f.vis) && !is_hidden(&f.attrs) => {
                    let (params, ret) = params_of(&f.sig);
                    m.methods.push(Member {
                        name: f.sig.ident.to_string(),
                        anchor: slug_id(&f.sig.ident.to_string()),
                        sig: fn_sig(f.vis.clone(), &f.sig),
                        docs: docs(&f.attrs),
                        wire: None,
                        params,
                        ret,
                    });
                }
                ImplItem::Const(c) if is_pub(&c.vis) && !is_hidden(&c.attrs) => {
                    let ic = ItemConst {
                        attrs: Vec::new(),
                        vis: c.vis.clone(),
                        const_token: c.const_token,
                        ident: c.ident.clone(),
                        generics: c.generics.clone(),
                        colon_token: c.colon_token,
                        ty: Box::new(c.ty.clone()),
                        eq_token: c.eq_token,
                        expr: Box::new(c.expr.clone()),
                        semi_token: c.semi_token,
                    };
                    m.consts.push(Member {
                        name: c.ident.to_string(),
                        anchor: slug_id(&c.ident.to_string()),
                        sig: unparse(Item::Const(ic)),
                        docs: docs(&c.attrs),
                        wire: None,
                        params: Vec::new(),
                        ret: None,
                    });
                }
                _ => {}
            }
        }
    }

    // Unique anchors per page (fields, variants, consts, then methods).
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for list in [&mut m.fields, &mut m.variants, &mut m.consts, &mut m.methods] {
        for mem in list.iter_mut() {
            let base = mem.anchor.clone();
            let mut a = base.clone();
            let mut n = 2;
            while seen.contains(&a) {
                a = format!("{base}-{n}");
                n += 1;
            }
            seen.insert(a.clone());
            mem.anchor = a;
        }
    }
    m.traits = traits.into_iter().collect();
    m
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

fn build_resolver(krate: &Crate) -> Resolver {
    let mut map = BTreeMap::new();
    for it in &krate.items {
        map.insert(it.path(), Dest::Page(it.page.clone(), it.anchor.clone()));
        if it.def.is_type() {
            for mem in member_anchors(krate, it) {
                map.insert(format!("{}::{}", it.path(), mem.0), Dest::Page(it.page.clone(), Some(mem.1)));
            }
        }
    }
    for m in &krate.mods[1..] {
        if m.public {
            map.insert(m.name.clone(), Dest::Page(format!("{}/index.md", slug_file(&m.name)), None));
        }
    }
    for (name, _, url) in &krate.external {
        map.insert(name.clone(), Dest::Url(url.clone()));
    }
    Resolver { map }
}

fn member_anchors(krate: &Crate, it: &ApiItem) -> Vec<(String, String)> {
    let m = members(krate, it);
    let mut out = Vec::new();
    // Methods last so that a field and a method with the same name resolve to the field.
    for list in [&m.methods, &m.consts, &m.variants, &m.fields] {
        for mem in list {
            out.push((mem.name.clone(), mem.anchor.clone()));
        }
    }
    out
}

fn kind_of(it: &ApiItem) -> &'static str {
    match &it.def {
        Def::Struct(_) if it.name == "Error" => "error",
        Def::Struct(_) => "struct",
        Def::Enum(_) | Def::OpenEnum(_) => "enum",
        Def::Type(_) => "type",
        Def::Fn(_) => "function",
        Def::Const(_) => "constant",
    }
}

fn kind_label(it: &ApiItem) -> &'static str {
    match &it.def {
        Def::Struct(_) => "struct",
        Def::Enum(_) | Def::OpenEnum(_) => "enum",
        Def::Type(_) => "type alias",
        Def::Fn(_) => "function",
        Def::Const(_) => "constant",
    }
}

/// A type in a table cell: linked when it is (a reference to) one known item,
/// otherwise as code followed by links to the known items it mentions.
fn type_cell(ctx: &Ctx, ty: &Type) -> String {
    let code = one_line(&fmt_ty(ty));
    let mut ids = Vec::new();
    idents(ty.to_token_stream(), &mut ids);
    let mut links = Vec::new();
    let mut seen = BTreeSet::new();
    for id in &ids {
        if !seen.insert(id.clone()) {
            continue;
        }
        if let Some(h) = ctx.link(id) {
            links.push((id.clone(), h));
        }
    }
    let code_md = format!("`{}`", code.replace('|', "\\|"));
    let bare = code.trim_start_matches('&').trim_start_matches("mut ").trim_start_matches("'static ");
    if links.len() == 1 && bare == links[0].0 {
        return format!("[{}]({})", code_md, links[0].1);
    }
    if links.is_empty() {
        code_md
    } else {
        let l: Vec<String> = links.iter().map(|(n, h)| format!("[`{n}`]({h})")).collect();
        format!("{code_md} (see {})", l.join(", "))
    }
}

fn render_member(out: &mut String, ctx: &Ctx, mem: &Member, wire_label: &str) {
    writeln!(out, "### {} {{#{}}}\n", mem.name, mem.anchor).unwrap();
    if mem.sig != mem.name {
        writeln!(out, "```rust\n{}\n```\n", mem.sig).unwrap();
    }
    if let Some(w) = &mem.wire {
        if w == "any other string" {
            writeln!(out, "{wire_label}: any value not listed above.\n").unwrap();
        } else {
            writeln!(out, "{wire_label}: `{w}`\n").unwrap();
        }
    }
    if !mem.docs.is_empty() {
        writeln!(out, "{}\n", ctx.markdown(&mem.docs, 4)).unwrap();
    }
    if !mem.params.is_empty() {
        writeln!(out, "| Parameter | Type |\n|---|---|").unwrap();
        for (n, t) in &mem.params {
            writeln!(out, "| `{n}` | {} |", type_cell(ctx, t)).unwrap();
        }
        out.push('\n');
    }
    if let Some(r) = &mem.ret {
        writeln!(out, "**Returns:** {}\n", type_cell(ctx, r)).unwrap();
    }
}

fn frontmatter(
    title: &str,
    description: &str,
    kind: &str,
    symbol: Option<&str>,
    source: Option<&str>,
    order: Option<u32>,
) -> String {
    let mut s = String::from("---\n");
    writeln!(s, "title: {}", yaml(title)).unwrap();
    writeln!(s, "description: {}", yaml(description)).unwrap();
    writeln!(s, "kind: {kind}").unwrap();
    if let Some(sym) = symbol {
        writeln!(s, "symbol: {}", yaml(sym)).unwrap();
    }
    if let Some(src) = source {
        writeln!(s, "source: {}", yaml(src)).unwrap();
    }
    if let Some(o) = order {
        writeln!(s, "order: {o}").unwrap();
    }
    s.push_str("---\n\n");
    s
}

fn type_page(krate: &Crate, res: &Resolver, it: &ApiItem) -> String {
    let scope: Vec<String> = it.module.clone();
    let ctx = Ctx { res, scope: &scope, self_ty: Some(&it.name), page: &it.page };
    let d = docs(it.def.attrs());
    let mut desc = summary(&d);
    if desc.is_empty() {
        desc = format!("The {} {}.", it.name, kind_label(it));
    }
    let order = match it.name.as_str() {
        "Sponsorkit" => Some(10),
        "Options" => Some(11),
        "Error" => Some(12),
        "ErrorCode" => Some(13),
        _ => None,
    };
    let symbol = format!("{}::{}", krate.name, it.path());
    let source = format!("{}#L{}", it.rel, it.def.line());
    let mut out = frontmatter(&it.name, &desc, kind_of(it), Some(&symbol), Some(&source), order);

    let sig = match &it.def {
        Def::Struct(s) => struct_sig(s),
        Def::Enum(e) => enum_sig(e),
        Def::OpenEnum(e) => enum_sig(&e.as_item()),
        Def::Type(t) => {
            let mut t = t.clone();
            t.attrs.clear();
            unparse(Item::Type(t))
        }
        _ => unreachable!(),
    };
    if !d.is_empty() {
        writeln!(out, "{}\n", ctx.markdown(&d, 2)).unwrap();
    }
    writeln!(out, "```rust\nuse {};\n\n{}\n```\n", symbol, sig).unwrap();

    let non_exhaustive = has_attr(it.def.attrs(), "non_exhaustive") || matches!(it.def, Def::OpenEnum(_));
    if non_exhaustive {
        writeln!(
            out,
            ":::note[Non-exhaustive]\nThis enum is `#[non_exhaustive]`: new variants may be added in a minor release, \
             so a `match` on it needs a wildcard (`_`) arm.\n:::\n"
        )
        .unwrap();
    }

    let m = members(krate, it);
    if !m.fields.is_empty() {
        writeln!(out, "## Fields\n").unwrap();
        for f in &m.fields {
            render_member(&mut out, &ctx, f, "JSON key");
        }
    }
    if !m.variants.is_empty() {
        writeln!(out, "## Variants\n").unwrap();
        let has_wire = m.variants.iter().any(|v| v.wire.is_some());
        if has_wire {
            writeln!(out, "| Variant | Wire value | Meaning |\n|---|---|---|").unwrap();
        } else {
            writeln!(out, "| Variant | Meaning |\n|---|---|").unwrap();
        }
        for v in &m.variants {
            let link = format!("[`{}`]({}#{})", v.name, rel_link(&it.page, &it.page), v.anchor);
            let meaning = summary_md(&v.docs);
            if has_wire {
                let w = match v.wire.as_deref() {
                    Some("any other string") => "any other value".to_string(),
                    Some(w) => format!("`{w}`"),
                    None => String::new(),
                };
                writeln!(out, "| {link} | {w} | {meaning} |").unwrap();
            } else {
                writeln!(out, "| {link} | {meaning} |").unwrap();
            }
        }
        out.push('\n');
        for v in &m.variants {
            render_member(&mut out, &ctx, v, "Wire value");
        }
    }
    if !m.consts.is_empty() {
        writeln!(out, "## Associated constants\n").unwrap();
        for c in &m.consts {
            render_member(&mut out, &ctx, c, "");
        }
    }
    if !m.methods.is_empty() {
        writeln!(out, "## Methods\n").unwrap();
        for f in &m.methods {
            render_member(&mut out, &ctx, f, "");
        }
    }
    if !m.traits.is_empty() {
        writeln!(out, "## Trait implementations\n").unwrap();
        for t in &m.traits {
            writeln!(out, "- `{t}`").unwrap();
        }
        out.push('\n');
    }
    out.trim_end().to_string() + "\n"
}

/// The functions and constants of a module, as `##` sections with `###` members.
fn module_members(out: &mut String, ctx: &Ctx, items: &[&ApiItem]) {
    let mut fns: Vec<&&ApiItem> = items.iter().filter(|i| matches!(i.def, Def::Fn(_))).collect();
    let mut consts: Vec<&&ApiItem> = items.iter().filter(|i| matches!(i.def, Def::Const(_))).collect();
    fns.sort_by(|a, b| a.name.cmp(&b.name));
    consts.sort_by(|a, b| a.name.cmp(&b.name));
    if !fns.is_empty() {
        writeln!(out, "## Functions\n").unwrap();
        for it in fns {
            let Def::Fn(f) = &it.def else { unreachable!() };
            let (params, ret) = params_of(&f.sig);
            let mem = Member {
                name: it.name.clone(),
                anchor: it.anchor.clone().unwrap(),
                sig: fn_sig(f.vis.clone(), &f.sig),
                docs: docs(&f.attrs),
                wire: None,
                params,
                ret,
            };
            render_member(out, ctx, &mem, "");
        }
    }
    if !consts.is_empty() {
        writeln!(out, "## Constants\n").unwrap();
        for it in consts {
            let Def::Const(c) = &it.def else { unreachable!() };
            let mut c = c.clone();
            c.attrs.clear();
            let mem = Member {
                name: it.name.clone(),
                anchor: it.anchor.clone().unwrap(),
                sig: unparse(Item::Const(c)),
                docs: docs(it.def.attrs()),
                wire: None,
                params: Vec::new(),
                ret: None,
            };
            render_member(out, ctx, &mem, "");
        }
    }
}

fn item_tables(out: &mut String, ctx: &Ctx, items: &[&ApiItem]) {
    type Group = (&'static str, fn(&Def) -> bool);
    let groups: [Group; 3] = [
        ("Structs", |d| matches!(d, Def::Struct(_))),
        ("Enums", |d| matches!(d, Def::Enum(_) | Def::OpenEnum(_))),
        ("Type aliases", |d| matches!(d, Def::Type(_))),
    ];
    for (title, pred) in groups {
        let mut list: Vec<&&ApiItem> = items.iter().filter(|i| pred(&i.def)).collect();
        if list.is_empty() {
            continue;
        }
        list.sort_by(|a, b| a.name.cmp(&b.name));
        writeln!(out, "## {title}\n\n| Name | Description |\n|---|---|").unwrap();
        for it in list {
            let s = summary_md(&docs(it.def.attrs()));
            writeln!(out, "| [`{}`]({}) | {} |", it.name, rel_link(ctx.page, &it.page), s).unwrap();
        }
        out.push('\n');
    }
    let mut members: Vec<&&ApiItem> = items.iter().filter(|i| matches!(i.def, Def::Fn(_) | Def::Const(_))).collect();
    if !members.is_empty() {
        members.sort_by(|a, b| a.name.cmp(&b.name));
        writeln!(out, "## Functions and constants\n\n| Name | Kind | Description |\n|---|---|---|").unwrap();
        for it in members {
            let s = summary_md(&docs(it.def.attrs()));
            writeln!(
                out,
                "| [`{}`]({}#{}) | {} | {} |",
                it.name,
                rel_link(ctx.page, &it.page),
                it.anchor.as_deref().unwrap(),
                kind_label(it),
                s
            )
            .unwrap();
        }
        out.push('\n');
    }
}

fn index_page(krate: &Crate, res: &Resolver) -> String {
    let page = "index.md";
    let scope: Vec<String> = Vec::new();
    let ctx = Ctx { res, scope: &scope, self_ty: None, page };
    let mut d = docs(&krate.mods[0].file.attrs);
    // The crate docs open with `# <Crate>`, which is the page title here.
    if d.starts_with("# ") {
        d = d.lines().skip(1).collect::<Vec<_>>().join("\n").trim().to_string();
    }
    let mut out = frontmatter(
        "Rust API reference",
        &format!(
            "Every public type, function and constant of the {} crate {}, generated from its source and doc comments.",
            krate.name, krate.version
        ),
        "index",
        Some(&krate.name),
        Some(&krate.mods[0].rel),
        None,
    );
    writeln!(
        out,
        "API reference for the `{0}` crate, version {1}. It's generated from the crate's source and doc comments; \
         for a guided tour, start with [Sponsorkit for Rust](/docs/languages/rust).\n",
        krate.name, krate.version
    )
    .unwrap();
    // The crate isn't on crates.io yet, so don't show a registry dependency as if it worked.
    writeln!(
        out,
        ":::note[Pre-release]\nThe crate hasn't been published to crates.io yet. Until it is, depend on the \
         repository:\n\n```toml title=\"Cargo.toml\"\n[dependencies]\n{} = {{ git = \"https://github.com/sponsorkit/sponsorkit.io\", \
         branch = \"main\" }}\n```\n\nSee [installing the Rust SDK](/docs/languages/rust#install) for a local path and the \
         `Cargo.toml` line to use once the crate is released.\n:::\n",
        krate.name
    )
    .unwrap();
    writeln!(out, "{}\n", ctx.markdown(&d, 2)).unwrap();

    let root: Vec<&ApiItem> = krate.items.iter().filter(|i| i.module.is_empty()).collect();
    let public_mods: Vec<&ModFile> = krate.mods[1..].iter().filter(|m| m.public).collect();
    if !public_mods.is_empty() {
        writeln!(out, "## Modules\n\n| Name | Description |\n|---|---|").unwrap();
        for m in public_mods {
            writeln!(out, "| [`{}`]({}/index.md) | {} |", m.name, slug_file(&m.name), summary_md(&docs(&m.file.attrs)))
                .unwrap();
        }
        out.push('\n');
    }
    item_tables(&mut out, &ctx, &root);
    if !krate.external.is_empty() {
        writeln!(out, "## Re-exports\n\n| Name | Re-exported from |\n|---|---|").unwrap();
        for (name, full, url) in &krate.external {
            writeln!(out, "| `{name}` | [`{full}`]({url}) |").unwrap();
        }
        out.push('\n');
    }
    module_members(&mut out, &ctx, &root);
    out.trim_end().to_string() + "\n"
}

fn module_page(krate: &Crate, res: &Resolver, mi: usize) -> (String, String) {
    let m = &krate.mods[mi];
    let dir = slug_file(&m.name);
    let page = format!("{dir}/index.md");
    let scope = vec![m.name.clone()];
    let ctx = Ctx { res, scope: &scope, self_ty: None, page: &page };
    let d = docs(&m.file.attrs);
    let mut desc = summary(&d);
    if desc.is_empty() {
        desc = format!("The {} module.", m.name);
    }
    let symbol = format!("{}::{}", krate.name, m.name);
    let mut out = frontmatter(&format!("{} module", m.name), &desc, "module", Some(&symbol), Some(&m.rel), None);
    if !d.is_empty() {
        writeln!(out, "{}\n", ctx.markdown(&d, 2)).unwrap();
    }
    writeln!(out, "```rust\nuse {symbol};\n```\n").unwrap();
    let items: Vec<&ApiItem> = krate.items.iter().filter(|i| i.module == scope).collect();
    item_tables(&mut out, &ctx, &items);
    module_members(&mut out, &ctx, &items);
    (page, out.trim_end().to_string() + "\n")
}

fn write(out: &Path, rel: &str, content: &str) -> Res<()> {
    let path = out.join(rel);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("{}: {e}", path.display()))
}

fn run(crate_dir: &Path, out: &Path, rel_prefix: &str) -> Res<()> {
    let krate = load(crate_dir, rel_prefix)?;
    let res = build_resolver(&krate);

    write(
        out,
        "_meta.json",
        &(serde_json::to_string_pretty(&serde_json::json!({
            "lang": "rust",
            "package": krate.name,
            "version": krate.version,
            "generator": format!("{rel_prefix}/scripts/gen-docs.sh (syn-based source walker in {rel_prefix}/scripts/docgen)"),
            "stub": false,
        }))
        .unwrap()
            + "\n"),
    )?;
    write(out, "index.md", &index_page(&krate, &res))?;
    for it in &krate.items {
        if it.def.is_type() {
            write(out, &it.page, &type_page(&krate, &res, it))?;
        }
    }
    for (mi, m) in krate.mods.iter().enumerate().skip(1) {
        if m.public {
            let (page, content) = module_page(&krate, &res, mi);
            write(out, &page, &content)?;
            write(
                out,
                &format!("{}/_section.md", slug_file(&m.name)),
                &format!(
                    "---\ntitle: {}\norder: 900\n---\n\n<!-- Generated by {rel_prefix}/scripts/gen-docs.sh -->\n",
                    yaml(&format!("{}::{}", krate.name, m.name))
                ),
            )?;
        }
    }
    Ok(())
}
