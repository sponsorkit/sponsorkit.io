//! Local storage (PROTOCOL §8): one JSON file per target set, `<targets_hash>.json`.
//!
//! Writes are atomic (temp file + rename). The directory is created `0700`
//! and files are written `0600` on Unix. Reads are lenient: unknown keys
//! (e.g. written by a newer SDK) are preserved, and malformed sections are
//! dropped instead of failing.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::{Error, Result};
use crate::pkce::{base64url, random_bytes};
use crate::types::ContributionResult;

/// The cached result and when it was stored.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Cache {
    pub result: ContributionResult,
    pub stored_at: String,
}

/// Nag state for one nag id.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NagState {
    pub runs: u64,
    pub last_shown: Option<String>,
}

/// The storage file contents.
#[derive(Debug, Clone, Default)]
pub(crate) struct StorageFile {
    pub session_token: Option<String>,
    pub cache: Option<Cache>,
    pub nags: BTreeMap<String, NagState>,
    /// Unknown top-level keys, preserved on rewrite.
    pub extra: Map<String, Value>,
}

impl StorageFile {
    fn from_value(v: Value) -> StorageFile {
        let Value::Object(mut obj) = v else {
            return StorageFile::default();
        };
        if obj.get("v").and_then(Value::as_u64) != Some(1) {
            return StorageFile::default();
        }
        obj.remove("v");
        let session_token =
            obj.remove("sessionToken").and_then(|t| t.as_str().map(str::to_owned)).filter(|t| is_session_token(t));
        let cache = obj
            .remove("cache")
            .and_then(|c| serde_json::from_value::<Cache>(c).ok())
            .filter(|c| crate::time::parse_iso(&c.stored_at).is_some());
        let nags = match obj.remove("nags") {
            Some(Value::Object(m)) => {
                m.into_iter().filter_map(|(k, v)| serde_json::from_value::<NagState>(v).ok().map(|n| (k, n))).collect()
            }
            _ => BTreeMap::new(),
        };
        StorageFile { session_token, cache, nags, extra: obj }
    }

    fn to_value(&self) -> Value {
        let mut obj = Map::new();
        obj.insert("v".into(), Value::from(1));
        for (k, v) in &self.extra {
            obj.insert(k.clone(), v.clone());
        }
        if let Some(t) = &self.session_token {
            obj.insert("sessionToken".into(), Value::String(t.clone()));
        }
        if let Some(c) = &self.cache {
            obj.insert("cache".into(), serde_json::to_value(c).unwrap_or(Value::Null));
        }
        if !self.nags.is_empty() {
            obj.insert("nags".into(), serde_json::to_value(&self.nags).unwrap_or(Value::Null));
        }
        Value::Object(obj)
    }
}

/// Whether `t` is a well-formed session token: `sks_` followed by at least
/// one printable, non-space ASCII character (PROTOCOL §7.0).
pub(crate) fn is_session_token(t: &str) -> bool {
    t.strip_prefix("sks_").is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_graphic()))
}

/// Serializes read-modify-write cycles within this process. Writes from other
/// processes are still safe (atomic rename) but may lose an update.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// Handle to one target set's storage: a file, or process memory when no
/// per-user config directory exists (PROTOCOL §7.0).
#[derive(Debug, Clone)]
pub(crate) enum Storage {
    File { dir: PathBuf, file: PathBuf },
    Memory(Arc<Mutex<Option<StorageFile>>>),
}

impl Storage {
    pub fn new(dir: PathBuf, targets_hash: &str) -> Storage {
        let file = dir.join(format!("{targets_hash}.json"));
        Storage::File { dir, file }
    }

    /// Storage that lives only as long as the client (no config directory).
    pub fn memory() -> Storage {
        Storage::Memory(Arc::new(Mutex::new(None)))
    }

    pub fn exists(&self) -> bool {
        match self {
            Storage::File { file, .. } => file.exists(),
            Storage::Memory(m) => m.lock().unwrap_or_else(|e| e.into_inner()).is_some(),
        }
    }

    /// Reads the storage; a missing or corrupt file reads as empty. Never fails.
    pub fn read(&self) -> StorageFile {
        match self {
            Storage::File { file, .. } => match fs::read(file) {
                Ok(bytes) => serde_json::from_slice::<Value>(&bytes).map(StorageFile::from_value).unwrap_or_default(),
                Err(_) => StorageFile::default(),
            },
            Storage::Memory(m) => m.lock().unwrap_or_else(|e| e.into_inner()).clone().unwrap_or_default(),
        }
    }

    /// Reads, applies `update` and writes the result back atomically.
    pub fn update<T>(&self, update: impl FnOnce(&mut StorageFile) -> T) -> Result<T> {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut data = self.read();
        let out = update(&mut data);
        match self {
            Storage::File { dir, file } => write_file(dir, file, &data)?,
            Storage::Memory(m) => *m.lock().unwrap_or_else(|e| e.into_inner()) = Some(data),
        }
        Ok(out)
    }
}

fn write_file(dir: &Path, file: &Path, data: &StorageFile) -> Result<()> {
    let io = |e: std::io::Error| Error::environment(format!("Cannot write {}: {e}", file.display()));
    create_private_dir(dir).map_err(io)?;
    let suffix = base64url(&random_bytes::<6>()?);
    let name = file.file_name().and_then(|n| n.to_str()).unwrap_or("sponsorkit.json");
    let tmp = dir.join(format!("{name}.{suffix}.tmp"));
    let json = serde_json::to_vec(&data.to_value()).map_err(|e| Error::environment(e.to_string()))?;
    let result = (|| {
        let mut f = open_private_file(&tmp)?;
        f.write_all(&json)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, file)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(io)
}

#[cfg(unix)]
fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    if !dir.is_dir() {
        fs::DirBuilder::new().recursive(true).mode(0o700).create(dir)?;
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir)
}

#[cfg(unix)]
fn open_private_file(path: &Path) -> std::io::Result<fs::File> {
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let f = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?;
    // The umask may have removed bits we do not want anyway; make it exact.
    f.set_permissions(fs::Permissions::from_mode(0o600))?;
    Ok(f)
}

#[cfg(not(unix))]
fn open_private_file(path: &Path) -> std::io::Result<fs::File> {
    fs::OpenOptions::new().write(true).create_new(true).open(path)
}

/// The default storage directory for this platform (SPEC §7.6), or `None`
/// when it cannot be determined. Relative values are ignored so the SDK never
/// writes to the current working directory (PROTOCOL §7.0).
pub(crate) fn default_storage_dir() -> Option<PathBuf> {
    default_storage_dir_from(|k| std::env::var_os(k))
}

fn default_storage_dir_from(lookup: impl Fn(&str) -> Option<std::ffi::OsString>) -> Option<PathBuf> {
    let var = |k: &str| lookup(k).filter(|v| !v.is_empty()).map(PathBuf::from).filter(|p| p.is_absolute());
    if cfg!(windows) {
        return var("APPDATA").map(|p| p.join("sponsorkit"));
    }
    if cfg!(target_os = "macos") {
        return var("HOME").map(|h| h.join("Library").join("Application Support").join("sponsorkit"));
    }
    var("XDG_CONFIG_HOME").or_else(|| var("HOME").map(|h| h.join(".config"))).map(|p| p.join("sponsorkit"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lenient_read_keeps_unknown_keys() {
        let v = serde_json::json!({ "v": 1, "sessionToken": "sks_x", "cache": { "bad": true }, "nags": { "a": { "runs": 2, "lastShown": null }, "b": 3 }, "future": [1] });
        let f = StorageFile::from_value(v);
        assert_eq!(f.session_token.as_deref(), Some("sks_x"));
        assert!(f.cache.is_none());
        assert_eq!(f.nags.len(), 1);
        assert_eq!(f.to_value()["future"], serde_json::json!([1]));
    }

    #[test]
    fn non_ascii_stored_at_drops_cache_without_panicking() {
        let result = serde_json::to_value(ContributionResult::empty(vec!["github:x".into()])).unwrap();
        let v = serde_json::json!({ "v": 1, "sessionToken": "sks_x", "cache": { "result": result, "storedAt": "2026-11-16T18:00:00+0\u{e9}00" } });
        let f = StorageFile::from_value(v);
        assert_eq!(f.session_token.as_deref(), Some("sks_x"));
        assert!(f.cache.is_none());
    }

    #[test]
    fn malformed_tokens_read_as_absent() {
        for bad in [
            serde_json::json!("sks_"),
            serde_json::json!("sks_a b"),
            serde_json::json!("sks_\u{e9}"),
            serde_json::json!("sks_a\nb"),
            serde_json::json!("abc"),
            serde_json::json!(42),
            serde_json::json!(null),
        ] {
            let f = StorageFile::from_value(serde_json::json!({ "v": 1, "sessionToken": bad }));
            assert!(f.session_token.is_none(), "{bad}");
        }
        let f = StorageFile::from_value(serde_json::json!({ "v": 1, "sessionToken": "sks_aB3-_.~!" }));
        assert_eq!(f.session_token.as_deref(), Some("sks_aB3-_.~!"));
    }

    #[test]
    fn malformed_documents_read_as_absent() {
        let dir = std::env::temp_dir().join(format!("sponsorkit-storage-{}-{}", std::process::id(), line!()));
        let st = Storage::new(dir.clone(), "h");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("h.json");
        let valid = serde_json::to_string(&ContributionResult::empty(vec!["github:x".into()])).unwrap();
        // The well-formed control document does produce a cache.
        fs::write(
            &file,
            format!(
                r#"{{"v":1,"sessionToken":"sks_x","cache":{{"result":{valid},"storedAt":"2026-11-16T18:00:00Z"}}}}"#
            ),
        )
        .unwrap();
        assert!(st.read().cache.is_some());
        let docs: Vec<Vec<u8>> = vec![
            b"\xff\xfe{".to_vec(),
            b"not json".to_vec(),
            b"[]".to_vec(),
            b"null".to_vec(),
            br#"{"v":1,"sessionToken":"sks_x","cache":{"result":{"signedIn":true,"disabled":false,"mock":false,"targets":["github:x"],"supporter":null,"contributions":null,"fetchedAt":null,"stale":false,"fromCache":false},"storedAt":"2026-11-16T18:00:00Z"}}"#.to_vec(),
            br#"{"v":1,"sessionToken":"sks_x","cache":{"result":{"signedIn":true,"disabled":false,"mock":false,"targets":["github:x"],"supporter":null,"contributions":[1],"fetchedAt":null,"stale":false,"fromCache":false},"storedAt":"2026-11-16T18:00:00Z"}}"#.to_vec(),
            format!(r#"{{"v":1,"sessionToken":"sks_x","cache":{{"result":{},"storedAt":"yesterday"}}}}"#, valid).into_bytes(),
            br#"{"v":1,"sessionToken":"sks_x","nags":{"a":{"runs":-1},"b":{"runs":1,"lastShown":7}}}"#.to_vec(),
            br#"{"v":1,"sessionToken":"sks_x","nags":null,"cache":null}"#.to_vec(),
        ];
        for doc in docs {
            fs::write(&file, &doc).unwrap();
            let f = st.read();
            assert!(f.cache.is_none(), "{}", String::from_utf8_lossy(&doc));
            assert!(f.nags.is_empty());
        }
        // A directory where the file should be reads as absent, too.
        fs::remove_file(&file).unwrap();
        fs::create_dir(&file).unwrap();
        assert!(st.read().session_token.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn fractional_seconds_of_any_length_are_accepted() {
        let result = serde_json::to_value(ContributionResult::empty(vec!["github:x".into()])).unwrap();
        for at in [
            "2026-11-16T18:00:00Z",
            "2026-11-16T18:00:00.1Z",
            "2026-11-16T18:00:00.123456Z",
            "2026-11-16T18:00:00.123456789+02:00",
        ] {
            let v =
                serde_json::json!({ "v": 1, "sessionToken": "sks_x", "cache": { "result": result, "storedAt": at } });
            assert!(StorageFile::from_value(v).cache.is_some(), "{at}");
        }
    }

    #[test]
    fn no_config_dir_never_means_the_working_directory() {
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            move |k: &str| pairs.iter().find(|(n, _)| *n == k).map(|(_, v)| std::ffi::OsString::from(v))
        };
        assert_eq!(default_storage_dir_from(env(&[])), None);
        assert_eq!(default_storage_dir_from(env(&[("HOME", "")])), None);
        assert_eq!(default_storage_dir_from(env(&[("HOME", "relative/home"), ("APPDATA", "rel")])), None);
        assert_eq!(default_storage_dir_from(env(&[("XDG_CONFIG_HOME", "rel"), ("HOME", ".")])), None);
        if cfg!(all(unix, not(target_os = "macos"))) {
            assert_eq!(default_storage_dir_from(env(&[("HOME", "/h")])), Some(PathBuf::from("/h/.config/sponsorkit")));
            assert_eq!(
                default_storage_dir_from(env(&[("XDG_CONFIG_HOME", "rel"), ("HOME", "/h")])),
                Some(PathBuf::from("/h/.config/sponsorkit"))
            );
        }
    }

    #[test]
    fn memory_storage_round_trips() {
        let st = Storage::memory();
        assert!(!st.exists());
        st.update(|s| s.session_token = Some("sks_m".into())).unwrap();
        assert!(st.exists());
        assert_eq!(st.clone().read().session_token.as_deref(), Some("sks_m"));
    }

    #[test]
    fn wrong_version_reads_empty() {
        let f = StorageFile::from_value(serde_json::json!({ "v": 2, "sessionToken": "sks_x" }));
        assert!(f.session_token.is_none());
    }
}
