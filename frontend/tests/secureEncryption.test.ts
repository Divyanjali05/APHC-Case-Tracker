import { secureEncryption } from '../services/offline/secureEncryption';
import { offlineStorage } from '../services/offline/offlineStorage';
import { syncQueue } from '../services/offline/syncQueue';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

describe('APHC Offline Data Security — Authenticated Encryption Suite', () => {
  const USER_ALICE = 'AP/1234/2020';
  const USER_BOB = 'AP/5678/2021';

  beforeEach(async () => {
    await AsyncStorage.clear();
    await secureEncryption.deleteUserKey(USER_ALICE);
    await secureEncryption.deleteUserKey(USER_BOB);
    jest.clearAllMocks();
  });

  describe('1. Cryptographic Primitive Verification (AES-256-CBC + HMAC-SHA256)', () => {
    it('encrypts plaintext into an authenticated envelope structure', async () => {
      const sensitiveData = JSON.stringify({
        case_number: 'WP/999/2024',
        petitioner: 'Venkat Rao',
        respondent: 'Union of India',
        diary_notes: 'Urgent stay application filed before Hon’ble Bench 1',
      });

      const encryptedString = await secureEncryption.encrypt(USER_ALICE, sensitiveData);

      expect(typeof encryptedString).toBe('string');
      const payload = JSON.parse(encryptedString);

      // Verify envelope fields
      expect(payload.__aphc_enc__).toBe(true);
      expect(payload.v).toBe(1);
      // 128-bit IV is 32 hex characters
      expect(typeof payload.iv).toBe('string');
      expect(payload.iv).toHaveLength(32);
      // Ciphertext should not contain plaintext
      expect(typeof payload.ct).toBe('string');
      expect(payload.ct).not.toContain('Venkat Rao');
      expect(payload.ct).not.toContain('Union of India');
      // 256-bit HMAC tag is 64 hex characters
      expect(typeof payload.mac).toBe('string');
      expect(payload.mac).toHaveLength(64);
    });

    it('decrypts encrypted payload back to the exact original plaintext', async () => {
      const sensitiveData = JSON.stringify({
        advocate: USER_ALICE,
        cases: [{ id: 1, title: 'Confidential Client Note' }],
      });

      const encrypted = await secureEncryption.encrypt(USER_ALICE, sensitiveData);
      const decrypted = await secureEncryption.decrypt(USER_ALICE, encrypted);

      expect(decrypted).toBe(sensitiveData);
      expect(JSON.parse(decrypted!)).toEqual({
        advocate: USER_ALICE,
        cases: [{ id: 1, title: 'Confidential Client Note' }],
      });
    });

    it('uses different random IVs for consecutive encryptions of identical plaintext', async () => {
      const plaintext = 'APHC_IDENTICAL_SENSITIVE_DOCKET';

      const enc1 = JSON.parse(await secureEncryption.encrypt(USER_ALICE, plaintext));
      const enc2 = JSON.parse(await secureEncryption.encrypt(USER_ALICE, plaintext));

      // Random IV ensures semantically secure distinct ciphertexts
      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc1.ct).not.toBe(enc2.ct);
      expect(enc1.mac).not.toBe(enc2.mac);
    });
  });

  describe('2. Platform-Secure Key Storage & Android Keystore Isolation', () => {
    it('stores key material in SecureStore and never in AsyncStorage', async () => {
      await secureEncryption.getOrCreateUserKey(USER_ALICE);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        expect.stringContaining('aphc_enc_key_AP_1234_2020'),
        expect.any(String)
      );

      // Verify key is 512-bit (128 hex chars)
      const storedKey = await SecureStore.getItemAsync('aphc_enc_key_AP_1234_2020');
      expect(storedKey).toHaveLength(128);

      // Verify no key material was saved in unencrypted AsyncStorage
      const asyncKeys = await AsyncStorage.getAllKeys();
      const leakedKey = asyncKeys.find(k => k.includes('aphc_enc_key'));
      expect(leakedKey).toBeUndefined();
    });

    it('enforces advocate isolation: Bob cannot decrypt Alice’s encrypted data', async () => {
      const aliceConfidential = JSON.stringify({ client: 'Confidential to Alice' });
      const encryptedByAlice = await secureEncryption.encrypt(
        USER_ALICE,
        aliceConfidential
      );

      // Bob attempts to decrypt Alice's data with Bob's userKey
      const bobAttempt = await secureEncryption.decrypt(USER_BOB, encryptedByAlice);

      // Must fail HMAC authentication check and return null
      expect(bobAttempt).toBeNull();
    });

    it('securely invalidates and deletes encryption keys on logout', async () => {
      await secureEncryption.getOrCreateUserKey(USER_ALICE);
      expect(await SecureStore.getItemAsync('aphc_enc_key_AP_1234_2020')).not.toBeNull();

      await secureEncryption.deleteUserKey(USER_ALICE);

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        'aphc_enc_key_AP_1234_2020'
      );
      expect(await SecureStore.getItemAsync('aphc_enc_key_AP_1234_2020')).toBeNull();
    });
  });

  describe('3. Integrity & Anti-Tampering (HMAC-SHA256 Encrypt-then-MAC)', () => {
    it('rejects tampered ciphertext', async () => {
      const encrypted = await secureEncryption.encrypt(
        USER_ALICE,
        'Sensitive Hearing Details'
      );
      const payload = JSON.parse(encrypted);

      // Flip characters in the ciphertext
      payload.ct = payload.ct.substring(0, payload.ct.length - 2) + 'AA';

      const tampered = JSON.stringify(payload);
      const result = await secureEncryption.decrypt(USER_ALICE, tampered);

      expect(result).toBeNull();
    });

    it('rejects tampered initialization vector (IV)', async () => {
      const encrypted = await secureEncryption.encrypt(
        USER_ALICE,
        'Sensitive Hearing Details'
      );
      const payload = JSON.parse(encrypted);

      // Alter the IV
      payload.iv = '00000000000000000000000000000000';

      const tampered = JSON.stringify(payload);
      const result = await secureEncryption.decrypt(USER_ALICE, tampered);

      expect(result).toBeNull();
    });

    it('rejects tampered MAC authentication tag', async () => {
      const encrypted = await secureEncryption.encrypt(
        USER_ALICE,
        'Sensitive Hearing Details'
      );
      const payload = JSON.parse(encrypted);

      // Replace MAC with arbitrary bytes
      payload.mac = 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';

      const tampered = JSON.stringify(payload);
      const result = await secureEncryption.decrypt(USER_ALICE, tampered);

      expect(result).toBeNull();
    });
  });

  describe('4. Safe Backward Compatibility & Migration', () => {
    it('seamlessly reads legacy unencrypted JSON without crashing', async () => {
      const legacyPlaintext = JSON.stringify({
        data: [{ id: 42, case_number: 'WP/100/2023', petitioner: 'Old Record' }],
        timestamp: '2025-01-01T00:00:00Z',
        userKey: USER_ALICE,
      });

      // Decrypt on legacy data returns plaintext as-is
      const migrated = await secureEncryption.decrypt(USER_ALICE, legacyPlaintext);

      expect(migrated).toBe(legacyPlaintext);
      expect(JSON.parse(migrated!)).toEqual(JSON.parse(legacyPlaintext));
    });

    it('returns null safely for corrupted or empty inputs without crashing', async () => {
      expect(await secureEncryption.decrypt(USER_ALICE, '')).toBeNull();
      expect(await secureEncryption.decrypt(USER_ALICE, 'not a valid json {')).toBe(
        'not a valid json {'
      );
    });
  });

  describe('5. High-Level Storage & Queue Verification', () => {
    it('encrypts cached cases in AsyncStorage and leaves no plaintext on disk', async () => {
      const cases = [
        {
          id: 501,
          case_type: 'WP',
          case_number: '7777',
          filing_year: 2024,
          petitioner: 'G. Rama Krishna',
          respondent: 'AP State Government',
          current_stage: 'NOTICE',
          status: 'Upcoming',
          next_hearing_date: '2026-12-01',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
        },
      ];

      await offlineStorage.saveCachedCases(USER_ALICE, cases);

      // Verify raw storage in AsyncStorage is encrypted
      const rawStored = await AsyncStorage.getItem('@aphc_cache:AP_1234_2020:cases');
      expect(rawStored).not.toBeNull();
      expect(rawStored).not.toContain('G. Rama Krishna');
      expect(rawStored).not.toContain('AP State Government');

      const parsedEnvelope = JSON.parse(rawStored!);
      expect(parsedEnvelope.__aphc_enc__).toBe(true);

      // Verify high-level getCachedCases successfully decrypts
      const cached = await offlineStorage.getCachedCases(USER_ALICE);
      expect(cached).not.toBeNull();
      expect(cached?.data[0].petitioner).toBe('G. Rama Krishna');
    });

    it('encrypts offline queued mutation payloads in AsyncStorage', async () => {
      await syncQueue.enqueueAction(USER_ALICE, {
        action_type: 'CREATE_REMINDER',
        payload: {
          title: 'File Contempt Affidavit',
          due_date: '2026-11-25T10:00:00Z',
          notes: 'Strictly confidential advocate notes',
        },
      });

      // Verify raw queue in AsyncStorage is encrypted
      const rawQueue = await AsyncStorage.getItem(
        '@aphc_cache:AP_1234_2020:action_queue'
      );
      expect(rawQueue).not.toBeNull();
      expect(rawQueue).not.toContain('File Contempt Affidavit');
      expect(rawQueue).not.toContain('Strictly confidential advocate notes');

      // Verify high-level getQueue successfully decrypts
      const queue = await syncQueue.getQueue(USER_ALICE);
      expect(queue).toHaveLength(1);
      expect((queue[0].payload as { title: string }).title).toBe(
        'File Contempt Affidavit'
      );
    });

    it('leaves non-sensitive sync metadata unencrypted as planned', async () => {
      await offlineStorage.saveSyncMetadata(USER_ALICE, {
        lastSyncedAt: '2026-11-06T10:00:00Z',
        status: 'ONLINE',
        pendingCount: 0,
      });

      const rawMeta = await AsyncStorage.getItem(
        '@aphc_cache:AP_1234_2020:sync_metadata'
      );
      expect(rawMeta).not.toBeNull();
      // Should be plain JSON without encryption envelope
      const parsed = JSON.parse(rawMeta!);
      expect(parsed.__aphc_enc__).toBeUndefined();
      expect(parsed.status).toBe('ONLINE');
    });

    it('clearUserCache clears AsyncStorage entries AND deletes platform encryption key', async () => {
      await offlineStorage.saveCachedCases(USER_ALICE, []);
      await syncQueue.enqueueAction(USER_ALICE, {
        action_type: 'CREATE_REMINDER',
        payload: { title: 'Test' },
      });

      // Before clear: key exists
      expect(await SecureStore.getItemAsync('aphc_enc_key_AP_1234_2020')).not.toBeNull();

      // Clear cache on logout
      await offlineStorage.clearUserCache(USER_ALICE);

      // Verify storage keys wiped
      expect(await AsyncStorage.getItem('@aphc_cache:AP_1234_2020:cases')).toBeNull();
      expect(
        await AsyncStorage.getItem('@aphc_cache:AP_1234_2020:action_queue')
      ).toBeNull();

      // Verify encryption key wiped from SecureStore
      expect(await SecureStore.getItemAsync('aphc_enc_key_AP_1234_2020')).toBeNull();
    });
  });
});
