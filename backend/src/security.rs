use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::Utc;
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

const GCM_PREFIX: &str = "gcm:";
const SESSION_TTL_SECS: i64 = 60 * 60 * 24 * 7;

fn derive_aes_key(encryption_key: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(encryption_key.as_bytes());
    hasher.finalize().into()
}

pub fn encrypt_secret(encryption_key: &str, plaintext: &str) -> Result<String, String> {
    let key = derive_aes_key(encryption_key);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("failed to initialize cipher: {e}"))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("encryption error: {e}"))?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);

    Ok(format!("{GCM_PREFIX}{}", URL_SAFE_NO_PAD.encode(combined)))
}

pub fn decrypt_secret(encryption_key: &str, encoded: &str) -> Result<String, String> {
    let payload = encoded.strip_prefix(GCM_PREFIX).ok_or_else(|| {
        "Cannot decrypt stored secret (unsupported format or legacy Fernet token).".to_string()
    })?;

    let bytes = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| "Cannot decode stored secret.".to_string())?;
    if bytes.len() < 13 {
        return Err("Corrupted encrypted secret.".to_string());
    }

    let (nonce_bytes, ciphertext) = bytes.split_at(12);
    let key = derive_aes_key(encryption_key);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("failed to initialize cipher: {e}"))?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Cannot decrypt stored secret. Check ENCRYPTION_KEY.".to_string())?;

    String::from_utf8(plaintext).map_err(|_| "Decrypted secret is not valid UTF-8.".to_string())
}

pub fn make_user_token() -> String {
    let mut raw = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut raw);
    format!("ntk_{}", URL_SAFE_NO_PAD.encode(raw))
}

pub fn token_hash(app_secret: &str, token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(app_secret.as_bytes());
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn token_prefix(token: &str) -> String {
    token.chars().take(12).collect()
}

pub fn ct_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.as_bytes().ct_eq(b.as_bytes()).into()
}

pub fn verify_admin_token(expected: &str, provided: Option<&str>) -> bool {
    match provided {
        Some(v) if !expected.is_empty() => ct_eq(expected, v),
        _ => false,
    }
}

pub fn sign_admin_session(app_secret: &str) -> Result<String, String> {
    let exp = Utc::now().timestamp() + SESSION_TTL_SECS;
    let payload = exp.to_string();
    let mut mac = <HmacSha256 as Mac>::new_from_slice(app_secret.as_bytes())
        .map_err(|e| format!("hmac init failed: {e}"))?;
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    Ok(format!("{payload}.{sig}"))
}

pub fn verify_admin_session(app_secret: &str, cookie_val: &str) -> bool {
    let Some((exp_str, sig_hex)) = cookie_val.split_once('.') else {
        return false;
    };
    let Ok(exp) = exp_str.parse::<i64>() else {
        return false;
    };
    if exp < Utc::now().timestamp() {
        return false;
    }
    let Ok(mut mac) = <HmacSha256 as Mac>::new_from_slice(app_secret.as_bytes()) else {
        return false;
    };
    mac.update(exp_str.as_bytes());
    let expected_sig = hex::encode(mac.finalize().into_bytes());
    ct_eq(&expected_sig, sig_hex)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aes_gcm_roundtrip_and_wrong_key() {
        let key = "super-secret-encryption-key";
        let secret = "rw_test_api_token_123456";
        let enc = encrypt_secret(key, secret).expect("encrypt");
        assert!(enc.starts_with("gcm:"));
        assert_ne!(enc, secret);

        let dec = decrypt_secret(key, &enc).expect("decrypt");
        assert_eq!(dec, secret);

        assert!(decrypt_secret("wrong-key", &enc).is_err());
    }

    #[test]
    fn token_and_session_signing() {
        let tok = make_user_token();
        assert!(tok.starts_with("ntk_"));
        assert_eq!(token_prefix(&tok).len(), 12);
        assert_eq!(
            token_hash("pepper", &tok),
            token_hash("pepper", &tok)
        );
        assert_ne!(
            token_hash("pepper", &tok),
            token_hash("other", &tok)
        );

        let cookie = sign_admin_session("my-app-secret").expect("sign");
        assert!(verify_admin_session("my-app-secret", &cookie));
        assert!(!verify_admin_session("wrong-secret", &cookie));
        assert!(!verify_admin_session("my-app-secret", "0.deadbeef"));

        assert!(verify_admin_token("admin123", Some("admin123")));
        assert!(!verify_admin_token("admin123", Some("admin124")));
        assert!(!verify_admin_token("admin123", None));
    }
}
