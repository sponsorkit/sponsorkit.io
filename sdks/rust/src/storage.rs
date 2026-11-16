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
use std::sync::Mutex;

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
            obj.remove("sessionToken").and_then(|t| t.as_str().map(str::to_owned)).filter(|t| t.starts_with("sks_"));
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

/// Serializes read-modify-write cycles within this process. Writes from other
/// processes are still safe (atomic rename) but may lose an update.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// Handle to one target set's storage file.
#[derive(Debug, Clone)]
pub(crate) struct Storage {
    dir: PathBuf,
    file: PathBuf,
}

impl Storage {
    pub fn new(dir: PathBuf, targets_hash: &str) -> Storage {
        let file = dir.join(format!("{targets_hash}.json"));
        Storage { dir, file }
    }

    pub fn exists(&self) -> bool {
        self.file.exists()
    }

    /// Reads the file; a missing or corrupt file reads as empty.
    pub fn read(&self) -> StorageFile {
        match fs::read(&self.file) {
            Ok(bytes) => serde_json::from_slice::<Value>(&bytes).map(StorageFile::from_value).unwrap_or_default(),
            Err(_) => StorageFile::default(),
        }
    }

    /// Reads, applies `update` and writes the file back atomically.
    pub fn update<T>(&self, update: impl FnOnce(&mut StorageFile) -> T) -> Result<T> {
        let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut data = self.read();
        let out = update(&mut data);
        self.write(&data)?;
        Ok(out)
    }

    fn write(&self, data: &StorageFile) -> Result<()> {
        let io = |e: std::io::Error| Error::environment(format!("Cannot write {}: {e}", self.file.display()));
        create_private_dir(&self.dir).map_err(io)?;
        let suffix = base64url(&random_bytes::<6>()?);
        let name = self.file.file_name().and_then(|n| n.to_str()).unwrap_or("sponsorkit.json");
        let tmp = self.dir.join(format!("{name}.{suffix}.tmp"));
        let json = serde_json::to_vec(&data.to_value()).map_err(|e| Error::environment(e.to_string()))?;
        let result = (|| {
            let mut f = open_private_file(&tmp)?;
            f.write_all(&json)?;
            f.sync_all()?;
            drop(f);
            fs::rename(&tmp, &self.file)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        result.map_err(io)
    }
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

/// The default storage directory for this platform (SPEC §7.6).
pub(crate) fn default_storage_dir() -> Option<PathBuf> {
    let var = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from);
    if cfg!(windows) {
        return var("APPDATA").map(|p| p.join("sponsorkit"));
    }
    if cfg!(target_os = "macos") {
        return var("HOME").map(|h| h.join("Library").join("Application Support").join("sponsorkit"));
    }
    var("XDG_CONFIG_HOME")
        .filter(|p| p.is_absolute())
        .or_else(|| var("HOME").map(|h| h.join(".config")))
        .map(|p| p.join("sponsorkit"))
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
    fn wrong_version_reads_empty() {
        let f = StorageFile::from_value(serde_json::json!({ "v": 2, "sessionToken": "sks_x" }));
        assert!(f.session_token.is_none());
    }
}
