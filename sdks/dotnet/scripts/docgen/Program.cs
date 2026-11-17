// API reference generator for the .NET SDK. See ../gen-docs.sh and web/content/docs/REFERENCE-CONTRACT.md.
//
//   dotnet DocGen.dll <out-dir> <repo-root>
//
// Reflection over the Sponsorkit assembly gives the public API with exact signatures (including nullable
// reference annotations and default parameter values); the compiler's XML documentation file next to the
// assembly gives the doc comments. The sources are only scanned for line numbers ("View source") and for
// property initializers (defaults). Output is deterministic: no timestamps, stable ordering.

using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Sponsorkit.DocGen;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("usage: DocGen <out-dir> <repo-root>");
            return 2;
        }
        try
        {
            var gen = new Generator(Path.GetFullPath(args[0]), Path.GetFullPath(args[1]));
            gen.Run();
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("gen-docs (dotnet): " + e);
            return 1;
        }
    }
}

internal sealed class TypeDoc
{
    public required Type Type { get; init; }
    public required string Page { get; init; }
    public string? SourceFile { get; set; }
    public int SourceLine { get; set; }
    public int SourceEndLine { get; set; }
    public List<MemberDoc> Members { get; } = new();
}

internal sealed class MemberDoc
{
    public required MemberInfo Member { get; init; }
    public required string Group { get; init; }
    public required string Name { get; init; }
    public string Anchor { get; set; } = "";
    public string DocId { get; set; } = "";
    public int SourceLine { get; set; }
    public string? Initializer { get; set; }
}

internal sealed class Generator
{
    private const string RepoUrl = "https://github.com/sponsorkit/sponsorkit.io";
    private const string SrcRel = "sdks/dotnet/src/Sponsorkit";
    private static readonly string[] GroupOrder = { "Constructors", "Values", "Constants", "Properties", "Methods", "Operators", "Fields" };

    private readonly string _out;
    private readonly string _root;
    private readonly Assembly _asm;
    private readonly Dictionary<string, XElement> _xml = new(StringComparer.Ordinal);
    private readonly Dictionary<Type, TypeDoc> _types = new();
    private readonly Dictionary<string, (TypeDoc Type, MemberDoc? Member)> _byDocId = new(StringComparer.Ordinal);
    private readonly NullabilityInfoContext _nullability = new();
    private readonly SortedDictionary<string, string[]> _sources = new(StringComparer.Ordinal);

    public Generator(string outDir, string repoRoot)
    {
        _out = outDir;
        _root = repoRoot;
        _asm = typeof(SponsorkitClient).Assembly;
        var xmlPath = Path.ChangeExtension(_asm.Location, ".xml");
        if (!File.Exists(xmlPath)) throw new FileNotFoundException("The XML documentation file is missing (GenerateDocumentationFile).", xmlPath);
        foreach (var m in XDocument.Load(xmlPath, LoadOptions.PreserveWhitespace).Root!.Element("members")!.Elements("member"))
            _xml[(string)m.Attribute("name")!] = m;
        var srcDir = Path.Combine(_root, SrcRel);
        foreach (var f in Directory.GetFiles(srcDir, "*.cs", SearchOption.TopDirectoryOnly).OrderBy(f => f, StringComparer.Ordinal))
            _sources[Path.GetFileName(f)] = File.ReadAllLines(f);
    }

    public void Run()
    {
        Directory.CreateDirectory(_out);
        Collect();
        foreach (var t in _types.Values.OrderBy(t => t.Type.Name, StringComparer.Ordinal))
            Write(t.Page + ".md", TypePage(t));
        Write("index.md", IndexPage());
        var version = _asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? _asm.GetName().Version!.ToString(3);
        var plus = version.IndexOf('+');
        if (plus >= 0) version = version.Substring(0, plus);
        var meta = new SortedDictionary<string, object>(StringComparer.Ordinal)
        {
            ["lang"] = "dotnet",
            ["package"] = "Sponsorkit",
            ["version"] = version,
            ["generator"] = "sdks/dotnet/scripts/gen-docs.sh (reflection + compiler XML docs, sdks/dotnet/scripts/docgen)",
            ["stub"] = false,
        };
        Write("_meta.json", JsonSerializer.Serialize(meta, new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) + "\n");
    }

    private void Write(string name, string content) =>
        File.WriteAllText(Path.Combine(_out, name), content.Replace("\r\n", "\n"), new UTF8Encoding(false));

    // ------------------------------------------------------------------ collection

    private void Collect()
    {
        var used = new HashSet<string>(StringComparer.Ordinal);
        foreach (var type in _asm.GetExportedTypes().Where(t => t.Namespace == "Sponsorkit").OrderBy(t => t.FullName, StringComparer.Ordinal))
        {
            var page = Slug(type.Name.Split('`')[0]);
            var unique = page;
            for (var i = 2; !used.Add(unique); i++) unique = page + "-" + i;
            var td = new TypeDoc { Type = type, Page = unique };
            _types[type] = td;
            _byDocId[TypeId(type)] = (td, null);
        }

        foreach (var td in _types.Values)
        {
            LocateType(td);
            var type = td.Type;
            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
            var members = new List<MemberDoc>();
            if (type.IsEnum)
            {
                foreach (var f in type.GetFields(BindingFlags.Public | BindingFlags.Static).OrderBy(f => f.MetadataToken))
                    members.Add(new MemberDoc { Member = f, Group = "Values", Name = f.Name });
            }
            else
            {
                foreach (var c in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance).OrderBy(c => c.MetadataToken))
                    members.Add(new MemberDoc { Member = c, Group = "Constructors", Name = type.Name });
                foreach (var f in type.GetFields(flags).Where(f => !f.IsSpecialName).OrderBy(f => f.MetadataToken))
                    members.Add(new MemberDoc { Member = f, Group = f.IsLiteral ? "Constants" : "Fields", Name = f.Name });
                foreach (var p in type.GetProperties(flags).Where(p => p.GetMethod?.IsPublic == true || p.SetMethod?.IsPublic == true).OrderBy(p => p.MetadataToken))
                    members.Add(new MemberDoc { Member = p, Group = "Properties", Name = p.Name });
                foreach (var m in type.GetMethods(flags).OrderBy(m => m.MetadataToken))
                {
                    if (m.IsSpecialName && !m.Name.StartsWith("op_", StringComparison.Ordinal)) continue;
                    if (m.GetCustomAttribute<System.Runtime.CompilerServices.CompilerGeneratedAttribute>() is not null) continue;
                    members.Add(new MemberDoc { Member = m, Group = m.IsSpecialName ? "Operators" : "Methods", Name = m.Name });
                }
            }

            var anchors = new HashSet<string>(StringComparer.Ordinal);
            foreach (var md in members)
            {
                var baseId = Slug(md.Member is MethodInfo { IsSpecialName: true } op ? OperatorName(op) : md.Name, keepUnderscore: true);
                var id = baseId;
                for (var i = 2; !anchors.Add(id); i++) id = baseId + "-" + i;
                md.Anchor = id;
                md.DocId = MemberId(md.Member);
                td.Members.Add(md);
                _byDocId[md.DocId] = (td, md);
            }
            LocateMembers(td);
        }
    }

    private static string OperatorName(MethodInfo m) => m.Name switch
    {
        "op_Implicit" => "implicit operator",
        "op_Explicit" => "explicit operator",
        _ => m.Name.Substring(3) + " operator",
    };

    // ------------------------------------------------------------------ source scanning

    private static readonly Regex TypeDecl = new(@"^\s*public\s+(?:(?:sealed|static|abstract|partial|readonly)\s+)*(?:class|interface|enum|struct|record)\s+(\w+)", RegexOptions.Compiled);

    private void LocateType(TypeDoc td)
    {
        foreach (var (file, lines) in _sources)
        {
            for (var i = 0; i < lines.Length; i++)
            {
                var m = TypeDecl.Match(lines[i]);
                if (!m.Success || m.Groups[1].Value != td.Type.Name.Split('`')[0]) continue;
                td.SourceFile = file;
                td.SourceLine = i + 1;
                var end = lines.Length;
                for (var j = i + 1; j < lines.Length; j++)
                {
                    if (TypeDecl.IsMatch(lines[j]) && !lines[j].StartsWith("    ", StringComparison.Ordinal)) { end = j; break; }
                }
                td.SourceEndLine = end;
                return;
            }
        }
    }

    private void LocateMembers(TypeDoc td)
    {
        if (td.SourceFile is null) return;
        var lines = _sources[td.SourceFile];
        var seen = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var md in td.Members)
        {
            var name = Regex.Escape(md.Name);
            Regex pattern = md.Member switch
            {
                ConstructorInfo => new Regex($@"^\s*public\s+{name}\s*\("),
                FieldInfo when td.Type.IsEnum => new Regex($@"^\s*{name}\s*(,|=|$)"),
                FieldInfo => new Regex($@"^\s*public\s+.*\b{name}\s*(=|;)"),
                PropertyInfo => new Regex($@"^\s*public\s+.*\b{name}\s*(\{{|=>)"),
                MethodInfo { IsSpecialName: true } m => new Regex($@"^\s*public\s+static\s+{Regex.Escape(OperatorName(m))}\b"),
                _ => new Regex($@"^\s*public\s+.*\b{name}\s*[\(<]"),
            };
            var key = md.Group + ":" + md.Name;
            var nth = seen.TryGetValue(key, out var n) ? n + 1 : 0;
            seen[key] = nth;
            var count = 0;
            for (var i = td.SourceLine; i < td.SourceEndLine; i++)
            {
                if (!pattern.IsMatch(lines[i])) continue;
                if (count++ != nth) continue;
                md.SourceLine = i + 1;
                if (md.Member is PropertyInfo)
                {
                    var init = Regex.Match(lines[i], @"\}\s*=\s*(.+);\s*$");
                    if (init.Success) md.Initializer = init.Groups[1].Value.Trim();
                }
                break;
            }
        }
    }

    // ------------------------------------------------------------------ doc ids

    private static string TypeId(Type t) => "T:" + TypeRef(t);

    private static string TypeRef(Type t)
    {
        if (t.IsByRef) return TypeRef(t.GetElementType()!) + "@";
        if (t.IsArray) return TypeRef(t.GetElementType()!) + "[]";
        if (t.IsGenericParameter) return (t.DeclaringMethod is null ? "`" : "``") + t.GenericParameterPosition;
        if (t.IsGenericType && !t.IsGenericTypeDefinition)
        {
            var def = t.GetGenericTypeDefinition();
            var name = def.FullName!.Split('`')[0].Replace('+', '.');
            return name + "{" + string.Join(",", t.GetGenericArguments().Select(TypeRef)) + "}";
        }
        return t.FullName!.Replace('+', '.');
    }

    private static string MemberId(MemberInfo m)
    {
        var owner = TypeRef(m.DeclaringType!);
        switch (m)
        {
            case FieldInfo f: return "F:" + owner + "." + f.Name;
            case PropertyInfo p:
                var ip = p.GetIndexParameters();
                return "P:" + owner + "." + p.Name + (ip.Length > 0 ? "(" + string.Join(",", ip.Select(x => TypeRef(x.ParameterType))) + ")" : "");
            case MethodBase mb:
                var ps = mb.GetParameters();
                var id = "M:" + owner + "." + (mb is ConstructorInfo ? "#ctor" : mb.Name);
                if (mb.IsGenericMethod) id += "``" + mb.GetGenericArguments().Length;
                if (ps.Length > 0) id += "(" + string.Join(",", ps.Select(x => TypeRef(x.ParameterType))) + ")";
                if (mb is MethodInfo mi && mi.Name is "op_Implicit" or "op_Explicit") id += "~" + TypeRef(mi.ReturnType);
                return id;
            default: throw new NotSupportedException(m.ToString());
        }
    }

    // ------------------------------------------------------------------ C# formatting

    private static readonly Dictionary<Type, string> Aliases = new()
    {
        [typeof(void)] = "void", [typeof(bool)] = "bool", [typeof(byte)] = "byte", [typeof(sbyte)] = "sbyte",
        [typeof(char)] = "char", [typeof(short)] = "short", [typeof(ushort)] = "ushort", [typeof(int)] = "int",
        [typeof(uint)] = "uint", [typeof(long)] = "long", [typeof(ulong)] = "ulong", [typeof(float)] = "float",
        [typeof(double)] = "double", [typeof(decimal)] = "decimal", [typeof(string)] = "string", [typeof(object)] = "object",
    };

    private static string CsType(Type t, NullabilityInfo? n)
    {
        if (t.IsByRef) return CsType(t.GetElementType()!, n?.ElementType ?? n);
        if (Nullable.GetUnderlyingType(t) is { } u) return CsType(u, n?.GenericTypeArguments.FirstOrDefault()) + "?";
        string s;
        if (Aliases.TryGetValue(t, out var alias)) s = alias;
        else if (t.IsArray) s = CsType(t.GetElementType()!, n?.ElementType) + "[]";
        else if (t.IsGenericType)
        {
            var args = t.GetGenericArguments();
            var ns = n?.GenericTypeArguments;
            s = t.Name.Split('`')[0] + "<" + string.Join(", ", args.Select((a, i) => CsType(a, ns is not null && i < ns.Length ? ns[i] : null))) + ">";
        }
        else s = t.Name;
        if (!t.IsValueType && n is { ReadState: NullabilityState.Nullable }) s += "?";
        return s;
    }

    private string ParamList(MethodBase m) => string.Join(", ", m.GetParameters().Select(p =>
    {
        var s = "";
        if (p.IsOut) s += "out ";
        else if (p.ParameterType.IsByRef) s += "ref ";
        if (p.GetCustomAttribute<ParamArrayAttribute>() is not null) s += "params ";
        s += CsType(p.ParameterType, _nullability.Create(p)) + " " + p.Name;
        if (p.HasDefaultValue) s += " = " + Literal(p.DefaultValue, p.ParameterType);
        return s;
    }));

    private static string Literal(object? value, Type type)
    {
        if (value is null) return type.IsValueType && Nullable.GetUnderlyingType(type) is null ? "default" : "null";
        return value switch
        {
            string s => JsonSerializer.Serialize(s),
            bool b => b ? "true" : "false",
            char c => "'" + c + "'",
            Enum e => e.GetType().Name + "." + e,
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString() ?? "",
        };
    }

    private static string Accessibility(MethodBase m) => m.IsPublic ? "public" : m.IsFamily || m.IsFamilyOrAssembly ? "protected" : "internal";

    private string TypeDeclaration(Type t)
    {
        if (t.IsEnum) return $"public enum {t.Name}";
        if (t.IsInterface) return $"public interface {t.Name}";
        var kind = t.IsValueType ? "struct" : "class";
        var mods = t.IsAbstract && t.IsSealed ? "static " : t.IsSealed && !t.IsValueType ? "sealed " : t.IsAbstract ? "abstract " : "";
        var bases = new List<string>();
        if (!t.IsValueType && t.BaseType is { } b && b != typeof(object)) bases.Add(CsType(b, null));
        var inherited = t.BaseType?.GetInterfaces() ?? Type.EmptyTypes;
        bases.AddRange(t.GetInterfaces().Where(i => !inherited.Contains(i)).Select(i => CsType(i, null)).OrderBy(s => s, StringComparer.Ordinal));
        return $"public {mods}{kind} {t.Name}" + (bases.Count > 0 ? " : " + string.Join(", ", bases) : "");
    }

    private string Signature(TypeDoc td, MemberDoc md)
    {
        switch (md.Member)
        {
            case ConstructorInfo c:
                return $"{Accessibility(c)} {td.Type.Name}({ParamList(c)})";
            case FieldInfo f when td.Type.IsEnum:
                return $"{f.Name} = {Convert.ToInt64(f.GetRawConstantValue(), CultureInfo.InvariantCulture)}";
            case FieldInfo f:
                {
                    var mods = f.IsLiteral ? "const " : (f.IsStatic ? "static " : "") + (f.IsInitOnly ? "readonly " : "");
                    var s = $"public {mods}{CsType(f.FieldType, _nullability.Create(f))} {f.Name}";
                    if (f.IsLiteral) s += " = " + Literal(f.GetRawConstantValue(), f.FieldType);
                    return s + ";";
                }
            case PropertyInfo p:
                {
                    var getter = p.GetMethod;
                    var setter = p.SetMethod;
                    var isStatic = (getter ?? setter)!.IsStatic;
                    var accessors = "";
                    if (getter is { IsPublic: true }) accessors += "get; ";
                    if (setter is { IsPublic: true })
                        accessors += setter.ReturnParameter.GetRequiredCustomModifiers().Any(m => m.FullName == "System.Runtime.CompilerServices.IsExternalInit") ? "init; " : "set; ";
                    var s = $"public {(isStatic ? "static " : "")}{CsType(p.PropertyType, _nullability.Create(p))} {p.Name} {{ {accessors}}}";
                    if (md.Initializer is not null) s += " = " + md.Initializer + ";";
                    return s;
                }
            case MethodInfo m when m.IsSpecialName:
                return $"public static {OperatorName(m)} {CsType(m.ReturnType, null)}({ParamList(m)})";
            case MethodInfo m:
                {
                    var mods = td.Type.IsInterface ? "" : "public " + (m.IsStatic ? "static " : "") + (m.IsAbstract ? "abstract " : m.IsVirtual && !m.IsFinal && m.GetBaseDefinition() == m ? "virtual " : m.GetBaseDefinition() != m ? "override " : "");
                    var generic = m.IsGenericMethod ? "<" + string.Join(", ", m.GetGenericArguments().Select(a => a.Name)) + ">" : "";
                    return $"{mods}{CsType(m.ReturnType, _nullability.Create(m.ReturnParameter))} {m.Name}{generic}({ParamList(m)})" + (td.Type.IsInterface ? ";" : "");
                }
            default:
                throw new NotSupportedException(md.Member.ToString());
        }
    }

    private string HeadingText(TypeDoc td, MemberDoc md) => md.Member switch
    {
        ConstructorInfo c => $"{td.Type.Name}({string.Join(", ", c.GetParameters().Select(p => CsType(p.ParameterType, null)))})",
        MethodInfo { IsSpecialName: true } m => $"{OperatorName(m)} {CsType(m.ReturnType, null)}({string.Join(", ", m.GetParameters().Select(p => CsType(p.ParameterType, null)))})",
        MethodInfo m => $"{m.Name}({string.Join(", ", m.GetParameters().Select(p => CsType(p.ParameterType, null)))})",
        _ => md.Name,
    };

    // ------------------------------------------------------------------ XML doc -> Markdown

    private XElement? Doc(string id) => _xml.TryGetValue(id, out var e) ? e : null;

    /// <summary>Converts a doc element's content to Markdown blocks. Inline text is reflowed onto one line per paragraph.</summary>
    private string Blocks(XElement? e, TypeDoc from)
    {
        if (e is null) return "";
        var blocks = new List<string>();
        var para = new StringBuilder();
        void Flush()
        {
            var text = Regex.Replace(para.ToString(), @"[ \t\r\n]+", " ").Trim();
            if (text.Length > 0) blocks.Add(text);
            para.Clear();
        }
        foreach (var node in e.Nodes())
        {
            if (node is XElement { Name.LocalName: "para" } p)
            {
                Flush();
                var inner = Blocks(p, from);
                if (inner.Length > 0) blocks.Add(inner);
            }
            else if (node is XElement { Name.LocalName: "code" } code)
            {
                Flush();
                blocks.Add(CodeBlock(code.Value));
            }
            else if (node is XElement { Name.LocalName: "list" } list)
            {
                Flush();
                var items = list.Elements("item").Select(it =>
                {
                    var term = it.Element("term");
                    var desc = it.Element("description");
                    var text = term is not null && desc is not null ? $"**{Inline(term, from)}**: {Inline(desc, from)}" : Inline(desc ?? it, from);
                    return (list.Attribute("type")?.Value == "number" ? "1. " : "- ") + text;
                });
                blocks.Add(string.Join("\n", items));
            }
            else
            {
                para.Append(InlineNode(node, from));
            }
        }
        Flush();
        return string.Join("\n\n", blocks);
    }

    private string Inline(XElement e, TypeDoc from) => Regex.Replace(string.Concat(e.Nodes().Select(n => InlineNode(n, from))), @"[ \t\r\n]+", " ").Trim();

    private string InlineNode(XNode node, TypeDoc from)
    {
        switch (node)
        {
            case XText t:
                return Escape(StripSpecRefs(t.Value));
            case XElement e:
                switch (e.Name.LocalName)
                {
                    case "c": return CodeSpan(e.Value);
                    case "paramref":
                    case "typeparamref": return CodeSpan((string?)e.Attribute("name") ?? "");
                    case "see":
                    case "seealso":
                        if (e.Attribute("langword") is { } lw) return CodeSpan(lw.Value);
                        if (e.Attribute("href") is { } href) return $"[{(e.Value.Length > 0 ? Escape(e.Value) : href.Value)}]({href.Value})";
                        return CrefLink((string?)e.Attribute("cref") ?? "", e.Value, from);
                    case "em":
                    case "i": return "*" + Inline(e, from) + "*";
                    case "strong":
                    case "b": return "**" + Inline(e, from) + "**";
                    case "br": return " ";
                    default: return Inline(e, from);
                }
            default:
                return "";
        }
    }

    /// <summary>The doc comments cite internal spec sections (SPEC §7.4, PROTOCOL §7); readers of the site don't have those.</summary>
    private static string StripSpecRefs(string s)
    {
        s = Regex.Replace(s, @"\s*\((?:SPEC|PROTOCOL) §[\d.]+(?:, ""[^""]*"")?\)", "");
        s = Regex.Replace(s, @", (?:SPEC|PROTOCOL) §[\d.]+", "");
        return Regex.Replace(s, @"(?:SPEC|PROTOCOL) §[\d.]+ ", "");
    }

    private static string Escape(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            if (ch is '\\' or '`' or '*' or '_' or '[' or ']' or '<' or '>' or '|' or '{' or '}') sb.Append('\\');
            sb.Append(ch);
        }
        return sb.ToString();
    }

    private static string CodeSpan(string s)
    {
        s = Regex.Replace(s, @"\s+", " ");
        var fence = s.Contains('`') ? "``" : "`";
        var pad = s.StartsWith('`') || s.EndsWith('`') ? " " : "";
        return fence + pad + s.Replace("|", "\\|") + pad + fence;
    }

    private static string CodeBlock(string code)
    {
        var lines = code.Replace("\r\n", "\n").Split('\n').ToList();
        while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[0])) lines.RemoveAt(0);
        while (lines.Count > 0 && string.IsNullOrWhiteSpace(lines[^1])) lines.RemoveAt(lines.Count - 1);
        var indent = lines.Where(l => l.Trim().Length > 0).Select(l => l.Length - l.TrimStart().Length).DefaultIfEmpty(0).Min();
        return "```csharp\n" + string.Join("\n", lines.Select(l => l.Length >= indent ? l.Substring(indent).TrimEnd() : l.Trim())) + "\n```";
    }

    private string CrefLink(string cref, string text, TypeDoc from)
    {
        if (_byDocId.TryGetValue(cref, out var target))
        {
            var label = text.Length > 0
                ? text
                : target.Member is null
                    ? target.Type.Type.Name
                    : target.Type == from ? target.Member.Name : target.Type.Type.Name + "." + target.Member.Name;
            if (target.Member is { Member: ConstructorInfo }) label = text.Length > 0 ? text : "new " + target.Type.Type.Name + "()";
            var href = target.Type.Page + ".md" + (target.Member is null ? "" : "#" + target.Member.Anchor);
            return $"[{CodeSpan(label)}]({href})";
        }
        // A BCL symbol: link to Microsoft Learn.
        if (cref.Length > 2 && cref[1] == ':' && cref.Substring(2).StartsWith("System.", StringComparison.Ordinal))
        {
            var name = cref.Substring(2);
            var paren = name.IndexOf('(');
            if (paren >= 0) name = name.Substring(0, paren);
            var url = "https://learn.microsoft.com/dotnet/api/" + Regex.Replace(name, @"\{.*\}|`+\d+", "").ToLowerInvariant();
            var parts = name.Split('.');
            var label = text.Length > 0 ? text : cref[0] == 'T' ? parts[^1] : parts[^2] + "." + parts[^1];
            return $"[{CodeSpan(label)}]({url})";
        }
        var fallback = cref.Length > 2 && cref[1] == ':' ? cref.Substring(2) : cref;
        return CodeSpan(text.Length > 0 ? text : fallback.Split('(')[0].Split('.').Last());
    }

    /// <summary>The first sentence of a Markdown paragraph, keeping inline code and links intact (for table cells).</summary>
    private static string FirstSentenceMarkdown(string markdown)
    {
        var para = markdown.Split("\n\n")[0];
        if (para.StartsWith("```", StringComparison.Ordinal)) return "";
        var inCode = false;
        var depth = 0;
        for (var i = 0; i < para.Length; i++)
        {
            var c = para[i];
            if (c == '\\') { i++; continue; }
            if (c == '`') inCode = !inCode;
            else if (!inCode && (c == '[' || c == '(')) depth++;
            else if (!inCode && (c == ']' || c == ')') && depth > 0) depth--;
            else if (!inCode && depth == 0 && c is '.' or '!' or '?' && (i + 1 == para.Length || para[i + 1] == ' '))
                return para.Substring(0, i + 1).Replace("\n", " ");
        }
        return para.Replace("\n", " ");
    }

    private static string Cell(string markdown) => markdown.Replace("\n", " ");

    private string FirstSentence(string markdown)
    {
        var plain = Regex.Replace(markdown, @"\[([^\]]*)\]\([^)]*\)", "$1");
        plain = plain.Replace("`", "").Replace("\\", "").Split("\n\n")[0];
        var m = Regex.Match(plain, @"^(.+?[.!?])(\s|$)");
        var s = (m.Success ? m.Groups[1].Value : plain).Trim();
        return s;
    }

    /// <summary>Links Sponsorkit types mentioned in a signature, for the "Type" line of parameters and properties.</summary>
    private string TypeMarkdown(Type t, NullabilityInfo? n)
    {
        var text = CsType(t, n);
        var related = new List<Type>();
        void Walk(Type x)
        {
            if (x.IsByRef || x.IsArray) { Walk(x.GetElementType()!); return; }
            if (x.IsGenericType) foreach (var a in x.GetGenericArguments()) Walk(a);
            var def = x.IsGenericType ? x.GetGenericTypeDefinition() : x;
            if (_types.ContainsKey(def) && !related.Contains(def)) related.Add(def);
        }
        Walk(t);
        if (related.Count == 1 && CsType(related[0], null).TrimEnd('?') == text.TrimEnd('?'))
            return $"[{CodeSpan(text)}]({_types[related[0]].Page}.md)";
        if (related.Count == 0 && !t.IsGenericType && !t.IsArray && !Aliases.ContainsKey(Nullable.GetUnderlyingType(t) ?? t)
            && (Nullable.GetUnderlyingType(t) ?? t).FullName is { } full && full.StartsWith("System.", StringComparison.Ordinal))
            return $"[{CodeSpan(text)}](https://learn.microsoft.com/dotnet/api/{full.ToLowerInvariant()})";
        var s = CodeSpan(text);
        if (related.Count > 0) s += " (" + string.Join(", ", related.Select(r => $"[{CodeSpan(r.Name)}]({_types[r].Page}.md)")) + ")";
        return s;
    }

    // ------------------------------------------------------------------ pages

    private static string Yaml(string s) => JsonSerializer.Serialize(s, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });

    private string Kind(Type t)
    {
        if (t.IsEnum) return "enum";
        if (t.IsInterface) return "interface";
        if (typeof(Exception).IsAssignableFrom(t)) return "error";
        if (t.IsValueType) return "struct";
        return "class";
    }

    private string Category(Type t)
    {
        if (typeof(Exception).IsAssignableFrom(t)) return "Errors";
        if (t.IsEnum) return "Enums";
        if (t.IsInterface) return "Interfaces";
        if (t.IsAbstract && t.IsSealed && t.GetFields().All(f => f.IsLiteral) && t.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly).Length == 0)
            return "Constants";
        if (t.Name.EndsWith("Options", StringComparison.Ordinal) || t.Name == "SponsorkitMock") return "Options";
        if (t.Name is "SponsorkitClient" or "SponsorkitServer" or "SponsorkitNag") return "Entry points";
        return "Results and data";
    }

    private static readonly string[] CategoryOrder = { "Entry points", "Options", "Results and data", "Enums", "Constants", "Errors", "Interfaces" };

    private string Summary(string docId, TypeDoc from) => Blocks(Doc(docId)?.Element("summary"), from);

    private string MemberSummary(TypeDoc td, MemberDoc md)
    {
        var s = Summary(md.DocId, td);
        if (s.Length > 0) return s;
        if (md.Member is ConstructorInfo c && c.GetParameters().Length == 0)
            return $"Creates {(td.Type.Name.EndsWith("Options", StringComparison.Ordinal) ? "options" : "an instance")} with every property at its default; set the properties with an object initializer.";
        return "No description.";
    }

    private string TypePage(TypeDoc td)
    {
        var t = td.Type;
        var tid = TypeId(t);
        var summary = Summary(tid, td);
        var description = FirstSentence(summary);
        if (description.Length == 0) description = $"The {t.Name} {Kind(t)}.";
        var sb = new StringBuilder();
        sb.Append("---\n");
        sb.Append("title: ").Append(Yaml(t.Name)).Append('\n');
        sb.Append("description: ").Append(Yaml(description)).Append('\n');
        sb.Append("kind: ").Append(Kind(t)).Append('\n');
        sb.Append("symbol: ").Append(Yaml(t.FullName!)).Append('\n');
        if (td.SourceFile is not null) sb.Append("source: ").Append(Yaml($"{SrcRel}/{td.SourceFile}#L{td.SourceLine}")).Append('\n');
        sb.Append("---\n\n");

        if (summary.Length > 0) sb.Append(summary).Append("\n\n");
        sb.Append("```csharp\n").Append("namespace Sponsorkit;\n\n").Append(TypeDeclaration(t)).Append("\n```\n\n");
        if (t.BaseType is { } bt && bt != typeof(object) && !t.IsValueType && !t.IsEnum)
        {
            var baseLink = _types.TryGetValue(bt, out var btd) ? $"[{CodeSpan(bt.Name)}]({btd.Page}.md)" : CrefLink(TypeId(bt), "", td);
            sb.Append("Inherits from ").Append(baseLink).Append(".\n\n");
        }
        var remarks = Blocks(Doc(tid)?.Element("remarks"), td);
        if (remarks.Length > 0) sb.Append(remarks).Append("\n\n");
        foreach (var ex in Doc(tid)?.Elements("example") ?? Enumerable.Empty<XElement>())
        {
            sb.Append("## Example\n\n").Append(Blocks(ex, td)).Append("\n\n");
        }

        foreach (var group in GroupOrder)
        {
            var members = td.Members.Where(m => m.Group == group).ToList();
            if (members.Count == 0) continue;
            sb.Append("## ").Append(group).Append("\n\n");
            sb.Append("| ").Append(group is "Values" ? "Value" : "Member").Append(" | Description |\n|---|---|\n");
            foreach (var md in members)
            {
                var first = FirstSentenceMarkdown(MemberSummary(td, md));
                sb.Append($"| [{CodeSpan(HeadingText(td, md))}]({td.Page}.md#{md.Anchor}) | {Cell(first)} |\n");
            }
            sb.Append('\n');
            foreach (var md in members) sb.Append(MemberSection(td, md));
        }

        // Inherited members from documented base types (for example CheckoutOptions : CheckoutUrlOptions).
        for (var b = t.BaseType; b is not null && _types.TryGetValue(b, out var btd2); b = b.BaseType)
        {
            var inherited = btd2.Members.Where(m => m.Group is "Properties" or "Methods").ToList();
            if (inherited.Count == 0) continue;
            sb.Append($"## Inherited from {b.Name}\n\n| Member | Description |\n|---|---|\n");
            foreach (var md in inherited)
                sb.Append($"| [{CodeSpan(HeadingText(btd2, md))}]({btd2.Page}.md#{md.Anchor}) | {Cell(FirstSentenceMarkdown(MemberSummary(btd2, md)))} |\n");
            sb.Append('\n');
        }
        return sb.ToString().TrimEnd() + "\n";
    }

    private string MemberSection(TypeDoc td, MemberDoc md)
    {
        var sb = new StringBuilder();
        var doc = Doc(md.DocId);
        sb.Append("### ").Append(Escape(HeadingText(td, md))).Append(" {#").Append(md.Anchor).Append("}\n\n");
        sb.Append("```csharp\n").Append(Signature(td, md)).Append("\n```\n\n");
        sb.Append(MemberSummary(td, md)).Append("\n\n");

        switch (md.Member)
        {
            case PropertyInfo p:
                {
                    var facts = new List<string> { "Type: " + TypeMarkdown(p.PropertyType, _nullability.Create(p)) };
                    if (md.Initializer is not null) facts.Add("Default: " + CodeSpan(md.Initializer));
                    if (p.GetCustomAttribute<JsonPropertyNameAttribute>() is { } jn) facts.Add("JSON: " + CodeSpan(jn.Name));
                    else if (p.GetCustomAttribute<JsonIgnoreAttribute>() is { Condition: JsonIgnoreCondition.Always }) facts.Add("Not serialized");
                    sb.Append(string.Join(" · ", facts)).Append("\n\n");
                    break;
                }
            case FieldInfo f when f.IsLiteral && !td.Type.IsEnum:
                sb.Append("Value: ").Append(CodeSpan(Literal(f.GetRawConstantValue(), f.FieldType))).Append("\n\n");
                break;
        }

        if (md.Member is MethodBase mb)
        {
            var ps = mb.GetParameters();
            if (ps.Length > 0)
            {
                sb.Append("**Parameters**\n\n");
                foreach (var p in ps)
                {
                    var pdoc = doc?.Elements("param").FirstOrDefault(x => (string?)x.Attribute("name") == p.Name);
                    var text = pdoc is null ? "" : Inline(pdoc, td);
                    var dflt = p.HasDefaultValue ? " Optional (default " + CodeSpan(Literal(p.DefaultValue, p.ParameterType)) + ")." : "";
                    sb.Append("- ").Append(CodeSpan(p.Name!)).Append(" ").Append(TypeMarkdown(p.ParameterType, _nullability.Create(p)))
                      .Append(text.Length > 0 ? ": " + text : "").Append(dflt).Append('\n');
                }
                sb.Append('\n');
            }
            if (mb is MethodInfo mi && mi.ReturnType != typeof(void))
            {
                var ret = doc?.Element("returns");
                sb.Append("**Returns** ").Append(TypeMarkdown(mi.ReturnType, _nullability.Create(mi.ReturnParameter)));
                var rtext = ret is null ? "" : Blocks(ret, td);
                sb.Append(rtext.Length > 0 ? ": " + rtext : "").Append("\n\n");
            }
        }

        var exceptions = doc?.Elements("exception").ToList() ?? new List<XElement>();
        if (exceptions.Count > 0)
        {
            sb.Append("**Exceptions**\n\n");
            foreach (var ex in exceptions)
                sb.Append("- ").Append(CrefLink((string?)ex.Attribute("cref") ?? "", "", td)).Append(": ").Append(Inline(ex, td)).Append('\n');
            sb.Append('\n');
        }
        var remarks = Blocks(doc?.Element("remarks"), td);
        if (remarks.Length > 0) sb.Append(remarks).Append("\n\n");
        foreach (var ex in doc?.Elements("example") ?? Enumerable.Empty<XElement>())
            sb.Append("**Example**\n\n").Append(Blocks(ex, td)).Append("\n\n");
        return sb.ToString();
    }

    private string IndexPage()
    {
        var sb = new StringBuilder();
        sb.Append("---\n");
        sb.Append("title: \".NET API reference\"\n");
        sb.Append("description: \"Every public type and member of the Sponsorkit .NET package, generated from the source and its XML doc comments.\"\n");
        sb.Append("kind: index\n");
        sb.Append("symbol: \"Sponsorkit\"\n");
        sb.Append("---\n\n");
        sb.Append("The `Sponsorkit` NuGet package targets `netstandard2.0` and `net8.0`. Everything public lives in the `Sponsorkit` namespace:\n\n");
        sb.Append("```csharp\nusing Sponsorkit;\n```\n\n");
        sb.Append("```bash title=\"Terminal\"\ndotnet add package Sponsorkit\n```\n\n");
        sb.Append("Start with [`SponsorkitClient`](sponsorkitclient.md) in your app and [`SponsorkitServer`](sponsorkitserver.md) on your backend. ");
        sb.Append("For a guided tour, read the [.NET guide](/docs/languages/dotnet); for the rules every SDK follows, see the [error contract](/docs/concepts/error-contract).\n\n");
        sb.Append("This reference is generated from the compiled assembly and its XML documentation comments by `sdks/dotnet/scripts/gen-docs.sh`.\n\n");

        var byCat = _types.Values.GroupBy(t => Category(t.Type)).ToDictionary(g => g.Key, g => g.OrderBy(t => t.Type.Name, StringComparer.Ordinal).ToList());
        foreach (var cat in CategoryOrder)
        {
            if (!byCat.TryGetValue(cat, out var list)) continue;
            sb.Append("## ").Append(cat).Append("\n\n| Type | Kind | Description |\n|---|---|---|\n");
            foreach (var td in list)
            {
                var first = FirstSentenceMarkdown(Summary(TypeId(td.Type), td));
                var kind = td.Type.IsAbstract && td.Type.IsSealed ? "static class" : Kind(td.Type) == "error" ? "exception" : Kind(td.Type);
                sb.Append($"| [{CodeSpan(td.Type.Name)}]({td.Page}.md) | {kind} | {Cell(first)} |\n");
            }
            sb.Append('\n');
        }
        foreach (var cat in byCat.Keys.Where(k => !CategoryOrder.Contains(k)).OrderBy(k => k, StringComparer.Ordinal))
            throw new InvalidOperationException("Unknown category " + cat);

        // Error codes at a glance, from SponsorkitErrorCodes.
        var codes = _types.Values.FirstOrDefault(t => t.Type.Name == "SponsorkitErrorCodes");
        if (codes is not null)
        {
            sb.Append("## Error codes\n\nEvery error the SDK raises on purpose is a [`SponsorkitError`](sponsorkiterror.md) whose `Code` is one of these strings. Invalid arguments throw the standard `ArgumentException` or `ArgumentNullException`, and cancelling a `CancellationToken` throws `OperationCanceledException` from `GetFinancialContributionAsync`, `SponsorkitNag.DueAsync`, `SponsorkitServer.VerifySessionAsync` and `SignOutAsync`; see [errors & cancellation](/docs/languages/dotnet/errors#cancellation).\n\n| Code | Constant | Meaning |\n|---|---|---|\n");
            foreach (var md in codes.Members.Where(m => m.Group == "Constants"))
            {
                var f = (FieldInfo)md.Member;
                sb.Append($"| {CodeSpan((string)f.GetRawConstantValue()!)} | [{CodeSpan("SponsorkitErrorCodes." + f.Name)}]({codes.Page}.md#{md.Anchor}) | {Cell(FirstSentenceMarkdown(Summary(md.DocId, codes)))} |\n");
            }
            sb.Append('\n');
        }
        return sb.ToString().TrimEnd() + "\n";
    }

    // ------------------------------------------------------------------ helpers

    private static string Slug(string s, bool keepUnderscore = false)
    {
        var pattern = keepUnderscore ? "[^a-z0-9_]+" : "[^a-z0-9]+";
        var slug = Regex.Replace(s.ToLowerInvariant(), pattern, "-").Trim('-', '_');
        if (keepUnderscore) slug = Regex.Replace(slug, "[-_]{2,}", "-");
        return slug.Length == 0 ? "x" : slug;
    }
}
