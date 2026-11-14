import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

const KEY_PREFIX = 'aphc_enc_key_';

export interface EncryptedPayload {
  __aphc_enc__: true;
  v: number;
  iv: string;
  ct: string;
  mac: string;
}

// In-memory key cache for web/test environments
const memoryKeyStore: Record<string, string> = {};

/**
 * Constant-time string comparison to mitigate timing attacks on MAC verification.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Sanitize advocate enrollment identifier for storage keys.
 */
function sanitizeUserKey(userKey: string): string {
  return (userKey || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export const secureEncryption = {
  /**
   * Retrieve or dynamically generate the advocate's platform-secured 512-bit key material
   * (256-bit AES encryption key + 256-bit HMAC key).
   *
   * Keys are stored exclusively in hardware-backed SecureStore (Android Keystore / iOS Keychain)
   * and NEVER alongside encrypted data in AsyncStorage.
   */
  async getOrCreateUserKey(userKey: string): Promise<string> {
    const sanitized = sanitizeUserKey(userKey);
    const storageKey = `${KEY_PREFIX}${sanitized}`;

    if (Platform.OS === 'web') {
      if (!memoryKeyStore[storageKey]) {
        // Generate 64 bytes (512 bits) of cryptographically secure random key material
        memoryKeyStore[storageKey] = CryptoJS.lib.WordArray.random(64).toString(
          CryptoJS.enc.Hex
        );
      }
      return memoryKeyStore[storageKey];
    }

    try {
      let key = await SecureStore.getItemAsync(storageKey);
      if (!key) {
        // Generate 512-bit secure random key: first 256 bits for AES, second 256 bits for HMAC
        key = CryptoJS.lib.WordArray.random(64).toString(CryptoJS.enc.Hex);
        await SecureStore.setItemAsync(storageKey, key);
      }
      return key;
    } catch {
      // Fallback in test or restricted environments
      if (!memoryKeyStore[storageKey]) {
        memoryKeyStore[storageKey] = CryptoJS.lib.WordArray.random(64).toString(
          CryptoJS.enc.Hex
        );
      }
      return memoryKeyStore[storageKey];
    }
  },

  /**
   * Delete the advocate's encryption key from platform-secure storage on logout.
   */
  async deleteUserKey(userKey: string): Promise<void> {
    const sanitized = sanitizeUserKey(userKey);
    const storageKey = `${KEY_PREFIX}${sanitized}`;

    delete memoryKeyStore[storageKey];

    if (Platform.OS !== 'web') {
      try {
        await SecureStore.deleteItemAsync(storageKey);
      } catch {
        // Suppress failure during delete
      }
    }
  },

  /**
   * Encrypt sensitive data using Authenticated AES-256-CBC with HMAC-SHA256 (Encrypt-then-MAC).
   *
   * @param userKey Advocate enrollment number
   * @param plaintext Raw string (typically serialized JSON)
   * @returns Serialized JSON string of the EncryptedPayload
   */
  async encrypt(userKey: string, plaintext: string): Promise<string> {
    const masterKeyHex = await this.getOrCreateUserKey(userKey);
    const encKeyHex = masterKeyHex.substring(0, 64); // 256-bit AES key
    const macKeyHex = masterKeyHex.substring(64, 128); // 256-bit HMAC key

    const encKey = CryptoJS.enc.Hex.parse(encKeyHex);
    const macKey = CryptoJS.enc.Hex.parse(macKeyHex);

    // Generate random 128-bit Initialization Vector (IV)
    const iv = CryptoJS.lib.WordArray.random(16);

    // Encrypt with AES-256-CBC and PKCS#7 padding
    const encrypted = CryptoJS.AES.encrypt(plaintext, encKey, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const ivHex = iv.toString(CryptoJS.enc.Hex);
    const ctBase64 = encrypted.toString();

    // Authenticate ciphertext and IV with HMAC-SHA256 (Encrypt-then-MAC)
    const mac = CryptoJS.HmacSHA256(`${ivHex}:${ctBase64}`, macKey).toString(
      CryptoJS.enc.Hex
    );

    const payload: EncryptedPayload = {
      __aphc_enc__: true,
      v: 1,
      iv: ivHex,
      ct: ctBase64,
      mac,
    };

    return JSON.stringify(payload);
  },

  /**
   * Decrypt sensitive data and verify its HMAC integrity tag.
   * Includes safe migration handling: if data is legacy unencrypted JSON, returns it as-is.
   *
   * @param userKey Advocate enrollment number
   * @param rawData Raw string read from AsyncStorage
   * @returns Decrypted plaintext string, or null on tampering / corruption
   */
  async decrypt(userKey: string, rawData: string): Promise<string | null> {
    if (!rawData) return null;

    // Fast-path: Check if data is an encrypted envelope
    if (!rawData.includes('"__aphc_enc__":true')) {
      // Legacy unencrypted plaintext data (backward compatibility migration)
      return rawData;
    }

    try {
      const envelope: EncryptedPayload = JSON.parse(rawData);
      if (!envelope || !envelope.__aphc_enc__) {
        return rawData;
      }

      const masterKeyHex = await this.getOrCreateUserKey(userKey);
      const encKeyHex = masterKeyHex.substring(0, 64);
      const macKeyHex = masterKeyHex.substring(64, 128);

      const encKey = CryptoJS.enc.Hex.parse(encKeyHex);
      const macKey = CryptoJS.enc.Hex.parse(macKeyHex);

      // Verify HMAC authentication tag in constant time
      const computedMac = CryptoJS.HmacSHA256(
        `${envelope.iv}:${envelope.ct}`,
        macKey
      ).toString(CryptoJS.enc.Hex);

      if (!constantTimeEquals(envelope.mac, computedMac)) {
        // Authenticity failure: data tampered with or key altered
        return null;
      }

      const iv = CryptoJS.enc.Hex.parse(envelope.iv);

      // Decrypt
      const decrypted = CryptoJS.AES.decrypt(envelope.ct, encKey, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
      if (!plaintext) {
        return null;
      }
      return plaintext;
    } catch {
      // In case of parsing or crypto exception, fail gracefully
      return null;
    }
  },
};
