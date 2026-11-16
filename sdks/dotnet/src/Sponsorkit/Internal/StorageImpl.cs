using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading;

namespace Sponsorkit.Internal;

/// <summary>PROTOCOL §8 file storage: <c>&lt;dir&gt;/&lt;targets_hash&gt;.json</c>, directory 0700, files 0600, atomic writes.</summary>
internal sealed class FileStorage : ISponsorkitStorage
{
    public FileStorage(string directory)
    {
        Directory = Path.GetFullPath(directory);
    }

    public string Directory { get; }

    public string PathFor(string key) => Path.Combine(Directory, key + ".json");

    public string? Read(string key)
    {
        var path = PathFor(key);
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return File.Exists(path) ? File.ReadAllText(path, Encoding.UTF8) : null;
            }
            catch (FileNotFoundException)
            {
                return null;
            }
            catch (DirectoryNotFoundException)
            {
                return null;
            }
            catch (IOException) when (attempt < 10)
            {
                // Windows: the file can be briefly locked while another writer replaces it.
                Thread.Sleep(10);
            }
        }
    }

    public void Write(string key, string json)
    {
        EnsureDirectory();
        var path = PathFor(key);
        var tmp = path + "." + Pkce.RandomSuffix() + ".tmp";
        try
        {
            using (var stream = UnixPermissions.CreatePrivateFile(tmp))
            {
                var bytes = new UTF8Encoding(false).GetBytes(json);
                stream.Write(bytes, 0, bytes.Length);
                stream.Flush(true);
            }
            MoveOver(tmp, path);
        }
        catch
        {
            TryDelete(tmp);
            throw;
        }
    }

    private void EnsureDirectory()
    {
        if (System.IO.Directory.Exists(Directory)) return;
        UnixPermissions.CreatePrivateDirectory(Directory);
    }

    private static void MoveOver(string source, string destination)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
#if NET8_0_OR_GREATER
                File.Move(source, destination, overwrite: true);
#else
                if (File.Exists(destination)) File.Replace(source, destination, null, ignoreMetadataErrors: true);
                else File.Move(source, destination);
#endif
                return;
            }
            catch (IOException) when (attempt < 10)
            {
                Thread.Sleep(10);
            }
            catch (UnauthorizedAccessException) when (attempt < 10)
            {
                Thread.Sleep(10);
            }
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    /// <summary>The per-user default storage directory (SPEC §7.6).</summary>
    public static string DefaultDirectory()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "sponsorkit");
        var home = Environment.GetEnvironmentVariable("HOME");
        if (string.IsNullOrEmpty(home)) home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            return Path.Combine(home!, "Library", "Application Support", "sponsorkit");
        var xdg = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
        var config = !string.IsNullOrEmpty(xdg) && Path.IsPathRooted(xdg) ? xdg! : Path.Combine(home!, ".config");
        return Path.Combine(config, "sponsorkit");
    }
}

/// <summary>In-memory storage (mock mode).</summary>
internal sealed class MemoryStorage : ISponsorkitStorage
{
    private readonly ConcurrentDictionary<string, string> _data = new(StringComparer.Ordinal);

    public string? Read(string key) => _data.TryGetValue(key, out var v) ? v : null;

    public void Write(string key, string json) => _data[key] = json;
}

internal static class UnixPermissions
{
#if !NET8_0_OR_GREATER
    private static bool IsUnix => !RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
#endif

    public static FileStream CreatePrivateFile(string path)
    {
#if NET8_0_OR_GREATER
        if (!OperatingSystem.IsWindows())
        {
            return new FileStream(path, new FileStreamOptions
            {
                Mode = FileMode.CreateNew,
                Access = FileAccess.Write,
                Share = FileShare.None,
                UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite,
            });
        }
        return new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
#else
        var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        if (IsUnix) TryChmod(path, Convert.ToUInt32("600", 8));
        return stream;
#endif
    }

    public static void CreatePrivateDirectory(string path)
    {
#if NET8_0_OR_GREATER
        if (!OperatingSystem.IsWindows())
        {
            const UnixFileMode mode = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;
            System.IO.Directory.CreateDirectory(path, mode);
            try
            {
                File.SetUnixFileMode(path, mode);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
            return;
        }
        System.IO.Directory.CreateDirectory(path);
#else
        System.IO.Directory.CreateDirectory(path);
        if (IsUnix) TryChmod(path, Convert.ToUInt32("700", 8));
#endif
    }

#if !NET8_0_OR_GREATER
    private static void TryChmod(string path, uint mode)
    {
        try
        {
            _ = NativeMethods.chmod(path, mode);
        }
#pragma warning disable CA1031 // Best effort: permissions are hardening, not correctness.
        catch (Exception)
        {
        }
#pragma warning restore CA1031
    }

    private static class NativeMethods
    {
#pragma warning disable CA2101, CA5392, SYSLIB1054, IDE1006
        [DllImport("libc", SetLastError = true, CharSet = CharSet.Ansi)]
        internal static extern int chmod(string pathname, uint mode);
#pragma warning restore CA2101, CA5392, SYSLIB1054, IDE1006
    }
#endif
}

/// <summary>The PROTOCOL §8 storage document.</summary>
internal sealed class StorageFile
{
    [JsonPropertyName("v")]
    public int V { get; set; } = 1;

    [JsonPropertyName("sessionToken")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SessionToken { get; set; }

    [JsonPropertyName("cache")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public StorageCache? Cache { get; set; }

    [JsonPropertyName("nags")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Dictionary<string, NagState>? Nags { get; set; }
}

internal sealed class StorageCache
{
    [JsonPropertyName("result")]
    public ContributionResult? Result { get; set; }

    [JsonPropertyName("storedAt")]
    [JsonConverter(typeof(IsoDateTimeConverter))]
    public DateTimeOffset? StoredAt { get; set; }
}

internal sealed class NagState
{
    [JsonPropertyName("runs")]
    public int Runs { get; set; }

    [JsonPropertyName("lastShown")]
    [JsonConverter(typeof(IsoDateTimeConverter))]
    public DateTimeOffset? LastShown { get; set; }
}

/// <summary>Typed, lock-protected read-modify-write access to one storage key.</summary>
internal sealed class StateStore
{
    private static readonly ConcurrentDictionary<string, object> Locks = new(StringComparer.Ordinal);
    private readonly ISponsorkitStorage _storage;
    private readonly string _key;
    private readonly object _lock;

    public StateStore(ISponsorkitStorage storage, string key)
    {
        _storage = storage;
        _key = key;
        var lockKey = (storage is FileStorage fs ? fs.PathFor(key) : RuntimeHelpersId(storage) + ":" + key);
        _lock = Locks.GetOrAdd(lockKey, _ => new object());
    }

    public StorageFile Load()
    {
        string? json;
        try
        {
            json = _storage.Read(_key);
        }
        catch (IOException)
        {
            return new StorageFile();
        }
        catch (UnauthorizedAccessException)
        {
            return new StorageFile();
        }
        if (string.IsNullOrWhiteSpace(json)) return new StorageFile();
        try
        {
            var file = SponsorkitJson.Deserialize<StorageFile>(json!);
            if (file is null || file.V != 1) return new StorageFile();
            if (file.SessionToken is { } t && !t.StartsWith("sks_", StringComparison.Ordinal)) file.SessionToken = null;
            if (file.Cache is { } c && (c.Result is null || c.StoredAt is null)) file.Cache = null;
            return file;
        }
        catch (System.Text.Json.JsonException)
        {
            return new StorageFile();
        }
    }

    /// <summary>Applies <paramref name="update"/> to the current document and writes it atomically.</summary>
    public void Update(Action<StorageFile> update)
    {
        lock (_lock)
        {
            var file = Load();
            update(file);
            file.V = 1;
            _storage.Write(_key, SponsorkitJson.Serialize(file));
        }
    }

    private static string RuntimeHelpersId(object o) =>
        System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(o).ToString(System.Globalization.CultureInfo.InvariantCulture);
}
