// Command gendocs writes the Markdown API reference of the Go SDK (package sponsorkit) in the layout
// described by web/content/docs/REFERENCE-CONTRACT.md.
//
//	go run . -src <sdks/go> -out <dir> [-source-prefix sdks/go]
//
// It reads the package with go/parser and go/doc (exported API only, test-file examples included),
// renders doc comments with go/doc/comment, and writes:
//
//	_meta.json      lang, package, version, generator
//	index.md        package overview, examples and a full index of the API
//	<type>.md       one page per exported type: fields, constants, functions, methods, examples
//	functions.md    package-level functions not associated with a type
//	constants.md    package-level constants and variables not associated with a type
//
// Output is deterministic: no timestamps, and everything is emitted in go/doc's sorted order.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/doc"
	"go/doc/comment"
	"go/format"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

func main() {
	src := flag.String("src", "", "directory of the package (sdks/go)")
	out := flag.String("out", "", "empty output directory")
	prefix := flag.String("source-prefix", "sdks/go", "repo-relative path of -src, for source links")
	flag.Parse()
	if *src == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "usage: gendocs -src <dir> -out <dir> [-source-prefix sdks/go]")
		os.Exit(2)
	}
	if err := run(*src, *out, *prefix); err != nil {
		fmt.Fprintln(os.Stderr, "gendocs:", err)
		os.Exit(1)
	}
}

// ref is a link target inside the generated reference.
type ref struct{ file, anchor string }

func (r ref) href(from string) string {
	h := r.file
	if r.anchor != "" {
		h += "#" + r.anchor
	}
	_ = from // all pages live in one folder, so relative links are bare file names
	return h
}

type typeInfo struct {
	t       *doc.Type
	file    string
	anchors map[string]bool
	members map[string]ref
	// fields and interface methods, in declaration order
	fields  []*ast.Field
	imeths  []*ast.Field
	isIface bool
}

type gen struct {
	fset       *token.FileSet
	pkg        *doc.Package
	importPath string
	prefix     string
	version    string

	top        map[string]ref
	types      map[string]*typeInfo
	typeOrder  []string
	pageFiles  map[string]bool
	pageAnchor map[string]map[string]bool
	// methodOwners maps a method or field name to the types that have it (for unqualified mentions).
	memberOwners map[string][]string
}

const importPath = "github.com/sponsorkit/sponsorkit.io/sdks/go"

func run(src, out, prefix string) error {
	fset := token.NewFileSet()
	matches, err := filepath.Glob(filepath.Join(src, "*.go"))
	if err != nil {
		return err
	}
	sort.Strings(matches)
	var files []*ast.File
	for _, m := range matches {
		f, err := parser.ParseFile(fset, m, nil, parser.ParseComments)
		if err != nil {
			return err
		}
		name := f.Name.Name
		// The package itself and its external test package (for examples). Internal _test.go
		// files only contribute examples too; go/doc ignores their declarations.
		if name != "sponsorkit" && name != "sponsorkit_test" {
			continue
		}
		files = append(files, f)
	}
	pkg, err := doc.NewFromFiles(fset, files, importPath)
	if err != nil {
		return err
	}
	if pkg.Name != "sponsorkit" {
		return fmt.Errorf("unexpected package %q", pkg.Name)
	}
	g := &gen{
		fset: fset, pkg: pkg, importPath: importPath, prefix: strings.TrimSuffix(prefix, "/"),
		top: map[string]ref{}, types: map[string]*typeInfo{}, pageFiles: map[string]bool{},
		pageAnchor: map[string]map[string]bool{}, memberOwners: map[string][]string{},
	}
	g.version = g.constValue("Version")
	g.index()

	if err := os.MkdirAll(out, 0o755); err != nil {
		return err
	}
	write := func(name, content string) error {
		return os.WriteFile(filepath.Join(out, name), []byte(content), 0o644)
	}
	meta := map[string]any{
		"lang":      "go",
		"package":   importPath,
		"generator": "sdks/go/scripts/gen-docs.sh (go/doc + go/doc/comment, standard library)",
		"stub":      false,
	}
	if g.version != "" {
		meta["version"] = g.version
	}
	mb, _ := json.MarshalIndent(meta, "", "  ")
	if err := write("_meta.json", string(mb)+"\n"); err != nil {
		return err
	}
	if err := write("index.md", g.renderIndex()); err != nil {
		return err
	}
	for _, name := range g.typeOrder {
		ti := g.types[name]
		if err := write(ti.file, g.renderType(ti)); err != nil {
			return err
		}
	}
	if len(g.pkg.Funcs) > 0 {
		if err := write("functions.md", g.renderFunctions()); err != nil {
			return err
		}
	}
	if len(g.pkg.Consts)+len(g.pkg.Vars) > 0 {
		if err := write("constants.md", g.renderConstants()); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------- naming

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// slug implements the contract's naming rule: lowercase, runs of other characters become "-".
func slug(s string) string {
	return strings.Trim(nonAlnum.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

func (g *gen) claimFile(base string) string {
	name := base
	for i := 2; g.pageFiles[name] || name == "index" || name == "functions" || name == "constants"; i++ {
		name = fmt.Sprintf("%s-%d", base, i)
	}
	g.pageFiles[name] = true
	return name + ".md"
}

func (g *gen) claimAnchor(file, name string) string {
	used := g.pageAnchor[file]
	if used == nil {
		used = map[string]bool{}
		g.pageAnchor[file] = used
	}
	base := slug(name)
	a := base
	for i := 2; used[a]; i++ {
		a = fmt.Sprintf("%s-%d", base, i)
	}
	used[a] = true
	return a
}

// index assigns pages and anchors to every exported symbol, in rendering order.
func (g *gen) index() {
	for _, t := range g.pkg.Types {
		g.typeOrder = append(g.typeOrder, t.Name)
	}
	for _, name := range g.typeOrder {
		var t *doc.Type
		for _, x := range g.pkg.Types {
			if x.Name == name {
				t = x
			}
		}
		ti := &typeInfo{t: t, file: g.claimFile(slug(t.Name)), members: map[string]ref{}}
		g.types[name] = ti
		g.top[t.Name] = ref{file: ti.file}
		// Rendering order: constants, variables, fields, interface methods, functions, methods.
		for _, v := range t.Consts {
			for _, n := range v.Names {
				r := ref{ti.file, g.claimAnchor(ti.file, n)}
				g.top[n] = r
				ti.members[n] = r
			}
		}
		for _, v := range t.Vars {
			for _, n := range v.Names {
				r := ref{ti.file, g.claimAnchor(ti.file, n)}
				g.top[n] = r
				ti.members[n] = r
			}
		}
		spec := typeSpec(t)
		switch st := spec.Type.(type) {
		case *ast.StructType:
			for _, f := range st.Fields.List {
				ti.fields = append(ti.fields, f)
				for _, n := range fieldNames(f) {
					ti.members[n] = ref{ti.file, g.claimAnchor(ti.file, n)}
					g.memberOwners[n] = append(g.memberOwners[n], t.Name)
				}
			}
		case *ast.InterfaceType:
			ti.isIface = true
			for _, f := range st.Methods.List {
				ti.imeths = append(ti.imeths, f)
				for _, n := range fieldNames(f) {
					ti.members[n] = ref{ti.file, g.claimAnchor(ti.file, n)}
					g.memberOwners[n] = append(g.memberOwners[n], t.Name)
				}
			}
		}
		for _, f := range t.Funcs {
			r := ref{ti.file, g.claimAnchor(ti.file, f.Name)}
			g.top[f.Name] = r
			ti.members[f.Name] = r
		}
		for _, m := range t.Methods {
			ti.members[m.Name] = ref{ti.file, g.claimAnchor(ti.file, m.Name)}
			g.memberOwners[m.Name] = append(g.memberOwners[m.Name], t.Name)
		}
	}
	for _, f := range g.pkg.Funcs {
		g.top[f.Name] = ref{"functions.md", g.claimAnchor("functions.md", f.Name)}
	}
	for _, vs := range [][]*doc.Value{g.pkg.Consts, g.pkg.Vars} {
		for _, v := range vs {
			for _, n := range v.Names {
				g.top[n] = ref{"constants.md", g.claimAnchor("constants.md", n)}
			}
		}
	}
}

func typeSpec(t *doc.Type) *ast.TypeSpec {
	for _, s := range t.Decl.Specs {
		if ts, ok := s.(*ast.TypeSpec); ok && ts.Name.Name == t.Name {
			return ts
		}
	}
	return t.Decl.Specs[0].(*ast.TypeSpec)
}

func fieldNames(f *ast.Field) []string {
	if len(f.Names) == 0 {
		// Embedded field: the type name is the field name.
		e := f.Type
		if s, ok := e.(*ast.StarExpr); ok {
			e = s.X
		}
		switch x := e.(type) {
		case *ast.Ident:
			return []string{x.Name}
		case *ast.SelectorExpr:
			return []string{x.Sel.Name}
		}
		return nil
	}
	var out []string
	for _, n := range f.Names {
		out = append(out, n.Name)
	}
	return out
}

func (g *gen) constValue(name string) string {
	for _, v := range g.pkg.Consts {
		for _, s := range v.Decl.Specs {
			vs := s.(*ast.ValueSpec)
			for i, n := range vs.Names {
				if n.Name == name && i < len(vs.Values) {
					if bl, ok := vs.Values[i].(*ast.BasicLit); ok && bl.Kind == token.STRING {
						if s, err := strconv.Unquote(bl.Value); err == nil {
							return s
						}
					}
				}
			}
		}
	}
	return ""
}

// ---------------------------------------------------------------- formatting helpers

func (g *gen) node(n any) string {
	var b bytes.Buffer
	if err := format.Node(&b, g.fset, n); err != nil {
		return fmt.Sprintf("/* %v */", err)
	}
	return b.String()
}

func (g *gen) source(pos token.Pos) string {
	p := g.fset.Position(pos)
	return fmt.Sprintf("%s/%s#L%d", g.prefix, filepath.Base(p.Filename), p.Line)
}

func funcSig(g *gen, d *ast.FuncDecl) string {
	cp := *d
	cp.Body = nil
	cp.Doc = nil
	return g.node(&cp)
}

func goBlock(code string) string {
	code = strings.TrimRight(code, "\n")
	fence := "```"
	for strings.Contains(code, fence) {
		fence += "`"
	}
	return fence + "go\n" + code + "\n" + fence + "\n"
}

func textBlock(code string) string {
	code = strings.TrimRight(code, "\n")
	return "```text\n" + code + "\n```\n"
}

func yamlString(s string) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	return strings.TrimSpace(b.String())
}

type frontmatter struct {
	title, description, kind, symbol, source, sidebarLabel string
	order                                                  int
}

func (f frontmatter) String() string {
	var b strings.Builder
	b.WriteString("---\n")
	fmt.Fprintf(&b, "title: %s\n", yamlString(f.title))
	fmt.Fprintf(&b, "description: %s\n", yamlString(f.description))
	if f.kind != "" {
		fmt.Fprintf(&b, "kind: %s\n", f.kind)
	}
	if f.symbol != "" {
		fmt.Fprintf(&b, "symbol: %s\n", yamlString(f.symbol))
	}
	if f.source != "" {
		fmt.Fprintf(&b, "source: %s\n", yamlString(f.source))
	}
	if f.order != 0 {
		fmt.Fprintf(&b, "order: %d\n", f.order)
	}
	if f.sidebarLabel != "" {
		fmt.Fprintf(&b, "sidebar_label: %s\n", yamlString(f.sidebarLabel))
	}
	b.WriteString("---\n\n")
	return b.String()
}

// synopsis returns the first sentence of a doc comment as plain text, for descriptions.
func (g *gen) synopsis(text, fallback string) string {
	s := strings.TrimSpace(g.pkg.Synopsis(text))
	if s == "" {
		return fallback
	}
	return s
}

// ---------------------------------------------------------------- doc comment rendering

// ctx says where a doc comment is rendered: on which page, for which type and member. Unqualified
// identifiers resolve to members of typ first, then to package-level symbols.
type ctx struct {
	file string
	typ  string
	self string // the symbol being documented: never linked to itself
}

// English words that are also exported names; they are linked only when written *Name or Type.Member.
var ambiguous = map[string]bool{
	"Status": true, "Kind": true, "Via": true, "Provider": true, "Frequency": true, "Error": true,
	"Tier": true, "Money": true, "Identity": true, "Version": true, "New": true, "Force": true,
	"GitHub": true, // the brand, as in "GitHub Sponsors"
}

var (
	// snake_case words in prose are error codes, enum values or protocol names: format them as code.
	snakeWord = regexp.MustCompile(`^[a-z][a-z0-9]*(?:_[a-z0-9]+)+`)
	specCite  = regexp.MustCompile(` ?\(SPEC §[0-9.]+\)`)
	envVar    = regexp.MustCompile(`^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+`)
	ident     = regexp.MustCompile(`^(\*?)(?:sponsorkit\.)?([A-Z][A-Za-z0-9]*)(?:\.([A-Z][A-Za-z0-9]*))?(\(\))?`)
)

func countUpper(s string) int {
	n := 0
	for _, r := range s {
		if r >= 'A' && r <= 'Z' {
			n++
		}
	}
	return n
}

// resolve finds the link target of an identifier mention, or ok=false.
func (g *gen) resolve(c ctx, star bool, name, member string) (ref, string, bool) {
	if member != "" {
		if ti, ok := g.types[name]; ok {
			if r, ok := ti.members[member]; ok {
				return r, name + "." + member, true
			}
		}
		return ref{}, "", false
	}
	if ti, ok := g.types[name]; ok && (star || name == c.typ) {
		// *T, sponsorkit.T and the documented type itself name the type, not a same-named member.
		return ref{file: ti.file}, name, true
	}
	if c.typ != "" {
		// An ambiguous word (e.g. the brand "GitHub") names a member of the documented type only
		// when it is the member being documented; elsewhere it stays prose unless qualified.
		if r, ok := g.types[c.typ].members[name]; ok && (!ambiguous[name] || star || c.typ+"."+name == c.self) {
			return r, c.typ + "." + name, true
		}
	}
	if r, ok := g.top[name]; ok {
		if ambiguous[name] && !star {
			return ref{}, "", false
		}
		return r, name, true
	}
	if owners := g.memberOwners[name]; len(owners) == 1 && countUpper(name) >= 2 {
		return g.types[owners[0]].members[name], owners[0] + "." + name, true
	}
	return ref{}, "", false
}

func escape(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '\\', '`', '*', '_', '[', ']', '<', '>', '|', '~', '{', '}':
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func isWordByte(c byte) bool {
	return c == '_' || c == '.' || c == '/' || c == '-' || c == ':' ||
		(c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

// plain renders plain comment text: escapes Markdown, formats identifiers and environment
// variables as code and links exported identifiers.
func (g *gen) plain(c ctx, s string, linked map[string]bool) string {
	s = strings.ReplaceAll(s, "\n", " ")
	var b strings.Builder
	for i := 0; i < len(s); {
		if i > 0 && isWordByte(s[i-1]) && s[i] != '*' {
			_, n := utf8.DecodeRuneInString(s[i:])
			b.WriteString(escape(s[i : i+n]))
			i += n
			continue
		}
		rest := s[i:]
		if m := snakeWord.FindString(rest); m != "" && (len(rest) == len(m) || !isIdentByte(rest[len(m)])) {
			b.WriteString("`" + m + "`")
			i += len(m)
			continue
		}
		if m := envVar.FindString(rest); m != "" && (len(rest) == len(m) || !isIdentByte(rest[len(m)])) {
			b.WriteString("`" + m + "`")
			i += len(m)
			continue
		}
		if m := ident.FindStringSubmatchIndex(rest); m != nil {
			whole := rest[:m[1]]
			end := m[1]
			if end == len(rest) || !isIdentByte(rest[end]) {
				star := m[3] > m[2] || strings.HasPrefix(rest[m[2]:], "*sponsorkit.") || strings.HasPrefix(rest, "sponsorkit.")
				name := rest[m[4]:m[5]]
				member := ""
				if m[6] >= 0 {
					member = rest[m[6]:m[7]]
				}
				r, sym, ok := g.resolve(c, star, name, member)
				if ok && ambiguous[name] && member == "" && !star && sym == c.self {
					// Only the leading mention of an ambiguous self name ("GitHub is the GitHub
					// login ...") is code; later ones are the ordinary word.
					ok = !linked["\x00self"]
					linked["\x00self"] = true
				}
				if ok {
					code := "`" + whole + "`"
					if sym == c.self || linked[sym] {
						b.WriteString(code)
					} else {
						linked[sym] = true
						b.WriteString("[" + code + "](" + r.href(c.file) + ")")
					}
					i += end
					continue
				}
			}
		}
		_, n := utf8.DecodeRuneInString(s[i:])
		b.WriteString(escape(s[i : i+n]))
		i += n
	}
	return b.String()
}

func isIdentByte(c byte) bool {
	return c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

func (g *gen) texts(c ctx, ts []comment.Text, linked map[string]bool, links bool) string {
	var b strings.Builder
	for _, t := range ts {
		switch t := t.(type) {
		case comment.Plain:
			if links {
				b.WriteString(g.plain(c, string(t), linked))
			} else {
				b.WriteString(escape(strings.ReplaceAll(string(t), "\n", " ")))
			}
		case comment.Italic:
			b.WriteString("*" + escape(string(t)) + "*")
		case *comment.Link:
			b.WriteString("[" + g.texts(c, t.Text, linked, false) + "](" + t.URL + ")")
		case *comment.DocLink:
			label := g.texts(c, t.Text, linked, false)
			if t.ImportPath == "" || t.ImportPath == g.importPath {
				name, member := t.Name, ""
				if t.Recv != "" {
					name, member = t.Recv, t.Name
				}
				if r, _, ok := g.resolve(ctx{file: c.file}, true, name, member); ok {
					b.WriteString("[`" + strings.ReplaceAll(label, "\\", "") + "`](" + r.href(c.file) + ")")
					continue
				}
				b.WriteString("`" + strings.ReplaceAll(label, "\\", "") + "`")
				continue
			}
			u := "https://pkg.go.dev/" + t.ImportPath
			if t.Name != "" {
				u += "#" + strings.TrimPrefix(t.Recv+"."+t.Name, ".")
			}
			b.WriteString("[`" + strings.ReplaceAll(label, "\\", "") + "`](" + u + ")")
		}
	}
	return b.String()
}

// markdown renders a doc comment. Headings in the comment become level `level` headings.
func (g *gen) markdown(c ctx, text string, level int) string {
	// Citations of the internal SPEC ("(SPEC §7.2)") mean nothing to readers of the reference.
	text = strings.TrimSpace(specCite.ReplaceAllString(text, ""))
	if text == "" {
		return ""
	}
	d := g.pkg.Parser().Parse(text)
	linked := map[string]bool{}
	var parts []string
	for _, blk := range d.Content {
		switch blk := blk.(type) {
		case *comment.Paragraph:
			parts = append(parts, g.texts(c, blk.Text, linked, true)+"\n")
		case *comment.Heading:
			parts = append(parts, strings.Repeat("#", level)+" "+g.texts(c, blk.Text, linked, false)+"\n")
		case *comment.Code:
			parts = append(parts, goBlock(blk.Text))
		case *comment.List:
			var lb strings.Builder
			for i, it := range blk.Items {
				marker := "- "
				if it.Number != "" {
					marker = strconv.Itoa(i+1) + ". "
				}
				var item []string
				for _, ib := range it.Content {
					if p, ok := ib.(*comment.Paragraph); ok {
						item = append(item, g.texts(c, p.Text, linked, true))
					}
				}
				lb.WriteString(marker + strings.Join(item, " ") + "\n")
			}
			parts = append(parts, lb.String())
		}
	}
	return strings.Join(parts, "\n")
}

// ---------------------------------------------------------------- examples

var outputLine = regexp.MustCompile(`(?m)^\s*// (Unordered output|Output):`)

func (g *gen) examples(file string, exs []*doc.Example, baseAnchor string, level int) string {
	var b strings.Builder
	for _, ex := range exs {
		title := "Example"
		if ex.Suffix != "" {
			title += " (" + ex.Suffix + ")"
		}
		anchorBase := "example"
		if baseAnchor != "" {
			anchorBase = baseAnchor + "-example"
		}
		if ex.Suffix != "" {
			anchorBase += "-" + ex.Suffix
		}
		a := g.claimAnchor(file, anchorBase)
		fmt.Fprintf(&b, "%s %s {#%s}\n\n", strings.Repeat("#", level), title, a)
		if ex.Doc != "" {
			b.WriteString(g.markdown(ctx{file: file}, ex.Doc, level+1) + "\n")
		}
		var code string
		if ex.Play != nil {
			code = g.node(ex.Play)
		} else {
			code = g.exampleBody(ex)
		}
		if loc := outputLine.FindStringIndex(code); loc != nil {
			code = code[:loc[0]]
		}
		b.WriteString(goBlock(code) + "\n")
		if ex.Output != "" {
			b.WriteString("Output:\n\n" + textBlock(ex.Output) + "\n")
		}
	}
	return b.String()
}

func (g *gen) exampleBody(ex *doc.Example) string {
	var b bytes.Buffer
	if err := format.Node(&b, g.fset, &printer.CommentedNode{Node: ex.Code, Comments: ex.Comments}); err != nil {
		return g.node(ex.Code)
	}
	s := strings.TrimSpace(b.String())
	s = strings.TrimPrefix(s, "{")
	s = strings.TrimSuffix(s, "}")
	lines := strings.Split(strings.Trim(s, "\n"), "\n")
	for i, l := range lines {
		lines[i] = strings.TrimPrefix(l, "\t")
	}
	return strings.Join(lines, "\n")
}

// ---------------------------------------------------------------- pages

func (g *gen) typeKind(ti *typeInfo) string {
	switch typeSpec(ti.t).Type.(type) {
	case *ast.StructType:
		if g.implementsError(ti) {
			return "error"
		}
		return "struct"
	case *ast.InterfaceType:
		return "interface"
	}
	if len(ti.t.Consts) > 0 {
		return "enum"
	}
	return "type"
}

func (g *gen) implementsError(ti *typeInfo) bool {
	for _, m := range ti.t.Methods {
		if m.Name == "Error" && m.Decl.Type.Params.NumFields() == 0 && m.Decl.Type.Results.NumFields() == 1 {
			if id, ok := m.Decl.Type.Results.List[0].Type.(*ast.Ident); ok && id.Name == "string" {
				return true
			}
		}
	}
	return false
}

var typeOrder = map[string]int{
	"Client": 10, "Options": 20, "Result": 30, "Contribution": 40, "Error": 50, "ErrorCode": 60,
}

func (g *gen) renderType(ti *typeInfo) string {
	t := ti.t
	file := ti.file
	spec := typeSpec(t)
	order := typeOrder[t.Name]
	fm := frontmatter{
		title:       t.Name,
		description: g.synopsis(t.Doc, fmt.Sprintf("The %s type of package sponsorkit.", t.Name)),
		kind:        g.typeKind(ti),
		symbol:      "sponsorkit." + t.Name,
		source:      g.source(spec.Pos()),
		order:       order,
	}
	var b strings.Builder
	b.WriteString(fm.String())
	if md := g.markdown(ctx{file: file, typ: t.Name, self: t.Name}, t.Doc, 3); md != "" {
		b.WriteString(md + "\n")
	}
	decl := *t.Decl
	decl.Doc = nil
	decl.Specs = []ast.Spec{stripSpecDoc(spec)}
	decl.Lparen, decl.Rparen = 0, 0
	b.WriteString(goBlock(reformat(dropBlankLines(g.node(&decl)))) + "\n")
	b.WriteString(g.examples(file, t.Examples, "", 3))

	if len(t.Consts) > 0 {
		b.WriteString("## Constants\n\n")
		b.WriteString(g.values(file, t.Name, t.Consts, "const"))
	}
	if len(t.Vars) > 0 {
		b.WriteString("## Variables\n\n")
		b.WriteString(g.values(file, t.Name, t.Vars, "var"))
	}
	if len(ti.fields) > 0 {
		b.WriteString("## Fields\n\n")
		for _, f := range ti.fields {
			for _, n := range fieldNames(f) {
				fmt.Fprintf(&b, "### %s {#%s}\n\n", n, ti.members[n].anchor)
				sig := n + " " + g.node(f.Type)
				if len(f.Names) == 0 {
					sig = g.node(f.Type)
				}
				if f.Tag != nil {
					sig += " " + f.Tag.Value
				}
				b.WriteString(goBlock(sig) + "\n")
				b.WriteString(g.fieldDoc(ctx{file: file, typ: t.Name, self: t.Name + "." + n}, f))
			}
		}
	}
	if ti.isIface && len(ti.imeths) > 0 {
		b.WriteString("## Methods\n\n")
		for _, f := range ti.imeths {
			for _, n := range fieldNames(f) {
				fmt.Fprintf(&b, "### %s {#%s}\n\n", n, ti.members[n].anchor)
				sig := g.node(f.Type)
				if len(f.Names) > 0 {
					sig = n + strings.TrimPrefix(sig, "func")
				}
				b.WriteString(goBlock(sig) + "\n")
				b.WriteString(g.fieldDoc(ctx{file: file, typ: t.Name, self: t.Name + "." + n}, f))
			}
		}
	}
	if len(t.Funcs) > 0 {
		b.WriteString("## Functions\n\n")
		for _, f := range t.Funcs {
			b.WriteString(g.function(file, t.Name, f, ti.members[f.Name].anchor, t.Name+"."+f.Name))
		}
	}
	if len(t.Methods) > 0 {
		if ti.isIface {
			b.WriteString("## Implementations\n\n")
		} else {
			b.WriteString("## Methods\n\n")
		}
		for _, m := range t.Methods {
			b.WriteString(g.function(file, t.Name, m, ti.members[m.Name].anchor, t.Name+"."+m.Name))
		}
	}
	return strings.TrimRight(b.String(), "\n") + "\n"
}

// stripSpecDoc copies a type spec without comments: fields and interface methods are documented
// one by one below the declaration.
func stripSpecDoc(s *ast.TypeSpec) *ast.TypeSpec {
	cp := *s
	cp.Doc = nil
	cp.Comment = nil
	strip := func(fl *ast.FieldList) *ast.FieldList {
		if fl == nil {
			return nil
		}
		out := *fl
		out.List = nil
		for _, f := range fl.List {
			fc := *f
			fc.Doc, fc.Comment = nil, nil
			out.List = append(out.List, &fc)
		}
		return &out
	}
	switch t := s.Type.(type) {
	case *ast.StructType:
		st := *t
		st.Fields = strip(t.Fields)
		cp.Type = &st
	case *ast.InterfaceType:
		it := *t
		it.Methods = strip(t.Methods)
		cp.Type = &it
	}
	return &cp
}

func (g *gen) fieldDoc(c ctx, f *ast.Field) string {
	text := ""
	if f.Doc != nil {
		text = f.Doc.Text()
	} else if f.Comment != nil {
		text = f.Comment.Text()
	}
	if md := g.markdown(c, text, 4); md != "" {
		return md + "\n"
	}
	return ""
}

// values renders constant or variable groups: the group comment, then one heading per name.
func (g *gen) values(file, typ string, vals []*doc.Value, keyword string) string {
	var b strings.Builder
	for _, v := range vals {
		single := len(v.Names) == 1
		if md := g.markdown(ctx{file: file, typ: typ}, v.Doc, 3); md != "" && !single {
			b.WriteString(md + "\n")
		}
		for _, s := range v.Decl.Specs {
			vs := s.(*ast.ValueSpec)
			cp := *vs
			cp.Doc, cp.Comment = nil, nil
			sig := keyword + " " + g.node(&cp)
			text := ""
			if vs.Doc != nil {
				text = vs.Doc.Text()
			} else if vs.Comment != nil {
				text = vs.Comment.Text()
			} else if single {
				text = v.Doc
			}
			for i, id := range vs.Names {
				n := id.Name
				var r ref
				if typ != "" {
					r = g.types[typ].members[n]
				} else {
					r = g.top[n]
				}
				fmt.Fprintf(&b, "### %s {#%s}\n\n", n, r.anchor)
				if i == 0 {
					b.WriteString(goBlock(sig) + "\n")
					self := n
					if typ != "" {
						self = typ + "." + n
					}
					if md := g.markdown(ctx{file: file, typ: typ, self: self}, text, 4); md != "" {
						b.WriteString(md + "\n")
					}
				} else {
					fmt.Fprintf(&b, "Declared with [`%s`](#%s).\n\n", vs.Names[0].Name, g.anchorOf(typ, vs.Names[0].Name))
				}
			}
		}
	}
	return b.String()
}

func (g *gen) anchorOf(typ, name string) string {
	if typ != "" {
		return g.types[typ].members[name].anchor
	}
	return g.top[name].anchor
}

func (g *gen) function(file, typ string, f *doc.Func, anchor, self string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "### %s {#%s}\n\n", f.Name, anchor)
	b.WriteString(goBlock(funcSig(g, f.Decl)) + "\n")
	if md := g.markdown(ctx{file: file, typ: typ, self: self}, f.Doc, 4); md != "" {
		b.WriteString(md + "\n")
	}
	src := g.source(f.Decl.Pos())
	fmt.Fprintf(&b, "[View source](https://github.com/sponsorkit/sponsorkit.io/blob/main/%s)\n\n", src)
	b.WriteString(g.examples(file, f.Examples, anchor, 4))
	return b.String()
}

func (g *gen) renderFunctions() string {
	file := "functions.md"
	var b strings.Builder
	b.WriteString(frontmatter{
		title:       "Functions",
		description: "Package-level functions of package sponsorkit that are not constructors of a type.",
		kind:        "function",
		order:       70,
	}.String())
	b.WriteString("Functions that return one of the package's types are documented on that type's page " +
		"(for example [`New`](client.md#new) on [`Client`](client.md) and " +
		"[`VerifySession`](result.md#verifysession) on [`Result`](result.md)); the [overview](index.md#index) lists them all.\n\n")
	for _, f := range g.pkg.Funcs {
		b.WriteString(g.function(file, "", f, g.top[f.Name].anchor, f.Name))
	}
	return strings.TrimRight(b.String(), "\n") + "\n"
}

func (g *gen) renderConstants() string {
	file := "constants.md"
	var b strings.Builder
	b.WriteString(frontmatter{
		title:       "Constants and variables",
		description: "Package-level constants and variables of package sponsorkit.",
		kind:        "constant",
		order:       80,
	}.String())
	b.WriteString("Typed constants such as the [error codes](errorcode.md#constants) and [statuses](status.md#constants) " +
		"are listed on the page of their type.\n\n")
	if len(g.pkg.Consts) > 0 {
		b.WriteString("## Constants\n\n")
		b.WriteString(g.values(file, "", g.pkg.Consts, "const"))
	}
	if len(g.pkg.Vars) > 0 {
		b.WriteString("## Variables\n\n")
		b.WriteString(g.values(file, "", g.pkg.Vars, "var"))
	}
	return strings.TrimRight(b.String(), "\n") + "\n"
}

// reformat runs gofmt over a declaration again, so that struct fields realign once their comments
// are gone.
func reformat(decl string) string {
	const head = "package p\n\n"
	out, err := format.Source([]byte(head + decl))
	if err != nil {
		return decl
	}
	return strings.TrimSpace(strings.TrimPrefix(string(out), head))
}

func dropBlankLines(s string) string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		if strings.TrimSpace(l) != "" {
			out = append(out, l)
		}
	}
	return strings.Join(out, "\n")
}

func oneLine(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func (g *gen) renderIndex() string {
	file := "index.md"
	g.claimAnchor(file, "index")
	var b strings.Builder
	b.WriteString(frontmatter{
		title:       "Go API reference",
		description: "Every exported type, function, method, field and constant of package sponsorkit (" + importPath + "), generated from the source.",
		kind:        "index",
		symbol:      importPath,
		source:      g.prefix + "/doc.go",
	}.String())
	fmt.Fprintf(&b, "```go\nimport sponsorkit \"%s\"\n```\n\n", importPath)
	ver := ""
	if g.version != "" {
		ver = " Version " + g.version + "."
	}
	fmt.Fprintf(&b, "Package `sponsorkit` is the Go SDK, Go 1.23 or later with no dependencies outside the standard library.%s "+
		"This reference is generated from the doc comments in `sdks/go` with `go/doc`; for guides see "+
		"[Sponsorkit for Go](/docs/languages/go).\n\n", ver)
	b.WriteString("## Overview\n\n")
	b.WriteString(g.markdown(ctx{file: file}, g.pkg.Doc, 3) + "\n")
	b.WriteString(g.examples(file, g.pkg.Examples, "", 2))

	b.WriteString("## Index {#index}\n\n")
	b.WriteString("### Types\n\n")
	for _, name := range g.typeOrder {
		ti := g.types[name]
		fmt.Fprintf(&b, "- [`%s`](%s): %s\n", name, ti.file, escape(g.synopsis(ti.t.Doc, "")))
		for _, f := range ti.t.Funcs {
			fmt.Fprintf(&b, "  - [`%s`](%s)\n", oneLine(funcSig(g, f.Decl)), ti.members[f.Name].href(file))
		}
		for _, m := range ti.t.Methods {
			fmt.Fprintf(&b, "  - [`%s`](%s)\n", oneLine(funcSig(g, m.Decl)), ti.members[m.Name].href(file))
		}
	}
	b.WriteString("\n")
	if len(g.pkg.Funcs) > 0 {
		b.WriteString("### Functions\n\n")
		for _, f := range g.pkg.Funcs {
			fmt.Fprintf(&b, "- [`%s`](%s)\n", oneLine(funcSig(g, f.Decl)), g.top[f.Name].href(file))
		}
		b.WriteString("\n")
	}
	if len(g.pkg.Consts)+len(g.pkg.Vars) > 0 {
		b.WriteString("### Constants and variables\n\n")
		for _, vs := range [][]*doc.Value{g.pkg.Consts, g.pkg.Vars} {
			for _, v := range vs {
				for _, n := range v.Names {
					fmt.Fprintf(&b, "- [`%s`](%s)\n", n, g.top[n].href(file))
				}
			}
		}
		b.WriteString("\n")
	}
	b.WriteString("Typed constants (error codes, statuses, providers, frequencies, sign-in methods) are listed on the page of their type.\n")
	return b.String()
}
