use keyring::Entry;
use rand::RngCore;
use std::fs;
use std::io::Write;
use std::path::Path;

const SERVICE: &str = "com.serverui.desktop";
const ACCOUNT: &str = "credential-encryption-key";
/// Fallback key file inside the app data directory, next to `serverui.db`.
const KEY_FILE: &str = "credential.key";

/// Resolve the AES credential encryption key for the Go child process.
///
/// Order: OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret
/// Service), then a workspace `.env` key, then a key file in `data_dir`. The key is
/// created once and reused on every launch. Without that stable key the saved SSH
/// passwords could not be decrypted after a restart and would have to be typed again.
/// Never returns the key to the WebView.
pub fn resolve_encryption_key(
    env_fallback: Option<&str>,
    data_dir: &Path,
) -> Result<String, String> {
    let entry = Entry::new(SERVICE, ACCOUNT).ok();
    let env_key = env_fallback.map(str::trim).filter(|v| !v.is_empty());

    if let Some(entry) = entry.as_ref() {
        if let Ok(existing) = entry.get_password() {
            if !existing.trim().is_empty() {
                return Ok(existing.trim().to_string());
            }
        }
    }

    // A key file written by an earlier launch (keychain unavailable then) keeps being used.
    if let Some(existing) = read_key_file(data_dir) {
        return Ok(existing);
    }

    let key = match env_key {
        Some(from_env) => from_env.to_string(),
        None => random_hex_key(),
    };

    if let Some(entry) = entry.as_ref() {
        // Some Linux setups accept the write but lose it, so read it back before trusting it.
        if entry.set_password(&key).is_ok()
            && entry
                .get_password()
                .map(|stored| stored.trim() == key)
                .unwrap_or(false)
        {
            return Ok(key);
        }
    }

    write_key_file(data_dir, &key)?;
    Ok(key)
}

fn read_key_file(data_dir: &Path) -> Option<String> {
    let path = data_dir.join(KEY_FILE);
    let raw = fs::read_to_string(&path).ok()?;
    tighten_key_file_permissions(&path);
    let key = raw.trim();
    (!key.is_empty()).then(|| key.to_string())
}

/// The 0600 mode is only applied when the file is created, so an older or copied key file can
/// be readable by other local users. Close that on every read (best effort, Unix only).
#[cfg(unix)]
fn tighten_key_file_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = fs::metadata(path) {
        if meta.permissions().mode() & 0o077 != 0 {
            let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
        }
    }
}

#[cfg(not(unix))]
fn tighten_key_file_permissions(_path: &Path) {}

fn write_key_file(data_dir: &Path, key: &str) -> Result<(), String> {
    fs::create_dir_all(data_dir)
        .map_err(|err| format!("Unable to create the ServerUI data directory: {err}"))?;
    let path = data_dir.join(KEY_FILE);
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // Owner read/write only. On Windows the file lives in the user's profile.
        options.mode(0o600);
    }
    let mut file = options
        .open(&path)
        .map_err(|err| format!("Unable to save the credential key: {err}"))?;
    file.write_all(key.as_bytes())
        .map_err(|err| format!("Unable to save the credential key: {err}"))?;
    Ok(())
}

fn random_hex_key() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("serverui-keyvault-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn generates_hex_64() {
        let key = random_hex_key();
        assert_eq!(key.len(), 64);
    }

    #[test]
    fn key_file_round_trips_and_is_reused() {
        let dir = temp_dir("roundtrip");
        let key = random_hex_key();
        write_key_file(&dir, &key).unwrap();
        assert_eq!(read_key_file(&dir), Some(key.clone()));
        // A second write with another key must not be needed: the first one is read back.
        assert_eq!(read_key_file(&dir), Some(key));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ignores_an_empty_key_file() {
        let dir = temp_dir("corrupt");
        fs::write(dir.join(KEY_FILE), "  \n").unwrap();
        assert_eq!(read_key_file(&dir), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn reading_a_loose_key_file_tightens_it() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("loose");
        let path = dir.join(KEY_FILE);
        fs::write(&path, random_hex_key()).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(read_key_file(&dir).is_some());
        let mode = fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o077, 0);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn key_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("perms");
        write_key_file(&dir, &random_hex_key()).unwrap();
        let mode = fs::metadata(dir.join(KEY_FILE))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o077, 0);
        let _ = fs::remove_dir_all(&dir);
    }
}
