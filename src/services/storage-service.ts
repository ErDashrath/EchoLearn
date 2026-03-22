/**
 * F002: Storage Service - Encrypted local storage
 *
 * Features:
 * - Tauri device-local persistence for app data
 * - LocalForage fallback outside Tauri
 * - AES-GCM encryption for sensitive data
 * - Per-user encryption keys derived from password
 *
 * @module services/storage-service
 */

import localforage from 'localforage';
import { deviceStoreService } from './device-store-service';

type LocalForageInstance = ReturnType<typeof localforage.createInstance>;

interface EncryptedPayload {
  iv: number[];
  data: number[];
}

// =============================================================================
// CRYPTO UTILITIES
// =============================================================================

export class CryptoUtils {
  /**
   * Generate random salt for password hashing
   */
  static generateSalt(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
  }

  /**
   * Derive encryption key from password using PBKDF2
   * @param password - User password
   * @param salt - User-specific salt
   */
  static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey'],
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * Encrypt data with AES-GCM
   * @param data - Data to encrypt
   * @param key - Encryption key
   */
  static async encrypt(data: unknown, key: CryptoKey): Promise<EncryptedPayload> {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(JSON.stringify(data)),
    );

    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    };
  }

  /**
   * Decrypt data with AES-GCM
   * @param encryptedData - Encrypted data object
   * @param key - Encryption key
   */
  static async decrypt<T = unknown>(
    encryptedData: EncryptedPayload,
    key: CryptoKey,
  ): Promise<T> {
    const decoder = new TextDecoder();

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
      key,
      new Uint8Array(encryptedData.data),
    );

    return JSON.parse(decoder.decode(decrypted)) as T;
  }
}

// =============================================================================
// STORAGE STORE CLASS
// =============================================================================

class StorageStore {
  private fallbackStore: LocalForageInstance;
  private storeName: string;
  private encryptionKey: CryptoKey | null = null;
  private useEncryption: boolean;

  constructor(storeName: string, useEncryption = false) {
    this.storeName = storeName;
    this.fallbackStore = localforage.createInstance({
      name: 'mindscribe',
      storeName,
    });
    this.useEncryption = useEncryption;
  }

  setEncryptionKey(key: CryptoKey | null): void {
    this.encryptionKey = key;
  }

  clearEncryptionKey(): void {
    this.encryptionKey = null;
  }

  /**
   * Save data to store
   * @param key - Storage key
   * @param value - Data to save
   */
  async save(key: string, value: unknown): Promise<boolean> {
    try {
      let dataToSave = value;

      if (this.useEncryption) {
        if (!this.encryptionKey) {
          throw new Error(`Encrypted store "${this.storeName}" is not initialized`);
        }

        dataToSave = await CryptoUtils.encrypt(value, this.encryptionKey);
      }

      if (deviceStoreService.isTauriAvailable()) {
        const saved = await deviceStoreService.set(this.storeName, key, dataToSave);
        if (saved) {
          await this.fallbackStore.removeItem(key);
        }
        return saved;
      }

      await this.fallbackStore.setItem(key, dataToSave);
      return true;
    } catch (error) {
      console.error(`Storage save error [${key}]:`, error);
      return false;
    }
  }

  /**
   * Get data from store
   * @param key - Storage key
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      if (deviceStoreService.isTauriAvailable()) {
        const deviceValue = await deviceStoreService.get<unknown>(this.storeName, key);
        if (deviceValue !== null) {
          return this.resolveStoredValue<T>(deviceValue);
        }

        const fallbackValue = await this.fallbackStore.getItem<unknown>(key);
        if (fallbackValue !== null) {
          await deviceStoreService.set(this.storeName, key, fallbackValue);
          await this.fallbackStore.removeItem(key);
        }

        return this.resolveStoredValue<T>(fallbackValue);
      }

      const fallbackValue = await this.fallbackStore.getItem<unknown>(key);
      return this.resolveStoredValue<T>(fallbackValue);
    } catch (error) {
      console.error(`Storage get error [${key}]:`, error);
      return null;
    }
  }

  /**
   * Remove data from store
   * @param key - Storage key
   */
  async remove(key: string): Promise<boolean> {
    try {
      if (deviceStoreService.isTauriAvailable()) {
        const fallbackValue = await this.fallbackStore.getItem<unknown>(key);
        const deleted = await deviceStoreService.delete(this.storeName, key);
        await this.fallbackStore.removeItem(key);
        return deleted || fallbackValue !== null;
      }

      await this.fallbackStore.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Storage remove error [${key}]:`, error);
      return false;
    }
  }

  /**
   * Clear all data in store
   */
  async clear(): Promise<boolean> {
    try {
      if (deviceStoreService.isTauriAvailable()) {
        const cleared = await deviceStoreService.clear(this.storeName);
        await this.fallbackStore.clear();
        return cleared;
      }

      await this.fallbackStore.clear();
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }

  /**
   * Get all keys in store
   */
  async keys(): Promise<string[]> {
    try {
      if (deviceStoreService.isTauriAvailable()) {
        const deviceKeys = await deviceStoreService.keys(this.storeName);
        const fallbackKeys = await this.fallbackStore.keys();

        for (const key of fallbackKeys) {
          if (!deviceKeys.includes(key)) {
            const value = await this.fallbackStore.getItem<unknown>(key);
            if (value !== null) {
              await deviceStoreService.set(this.storeName, key, value);
              await this.fallbackStore.removeItem(key);
            }
          }
        }

        return Array.from(new Set([...deviceKeys, ...fallbackKeys])).sort();
      }

      return await this.fallbackStore.keys();
    } catch (error) {
      console.error('Storage keys error:', error);
      return [];
    }
  }

  /**
   * Get all items in store
   */
  async getAll<T = unknown>(): Promise<Array<{ key: string; value: T }>> {
    try {
      let resolvedEntries: Array<{ key: string; value: unknown }> = [];

      if (deviceStoreService.isTauriAvailable()) {
        const deviceEntries = await deviceStoreService.entries<unknown>(this.storeName);
        const mergedEntries = new Map(deviceEntries.map((item) => [item.key, item.value]));
        const fallbackKeys = await this.fallbackStore.keys();

        for (const key of fallbackKeys) {
          if (mergedEntries.has(key)) {
            continue;
          }

          const fallbackValue = await this.fallbackStore.getItem<unknown>(key);
          if (fallbackValue !== null) {
            mergedEntries.set(key, fallbackValue);
            await deviceStoreService.set(this.storeName, key, fallbackValue);
            await this.fallbackStore.removeItem(key);
          }
        }

        resolvedEntries = Array.from(mergedEntries.entries()).map(([entryKey, value]) => ({
          key: entryKey,
          value,
        }));
      } else {
        const keys = await this.fallbackStore.keys();
        resolvedEntries = await Promise.all(
          keys.map(async (key) => ({
            key,
            value: await this.fallbackStore.getItem<unknown>(key),
          })),
        );
      }

      const resolvedItems: Array<{ key: string; value: T }> = [];
      for (const item of resolvedEntries) {
        const value = await this.resolveStoredValue<T>(item.value);
        if (value !== null) {
          resolvedItems.push({ key: item.key, value });
        }
      }

      return resolvedItems;
    } catch (error) {
      console.error('Storage getAll error:', error);
      return [];
    }
  }

  private async resolveStoredValue<T = unknown>(data: unknown): Promise<T | null> {
    if (data === null || data === undefined) {
      return null;
    }

    if (this.useEncryption && this.isEncryptedPayload(data)) {
      if (!this.encryptionKey) {
        return null;
      }

      return CryptoUtils.decrypt<T>(data, this.encryptionKey);
    }

    return data as T;
  }

  private isEncryptedPayload(value: unknown): value is EncryptedPayload {
    if (!value || typeof value !== 'object') {
      return false;
    }

    return 'iv' in value && 'data' in value;
  }
}

// =============================================================================
// STORAGE SERVICE
// =============================================================================

class StorageService {
  users = new StorageStore('users', false);
  settings = new StorageStore('settings', false);
  journals = new StorageStore('journals', true);
  chats = new StorageStore('chats', true);
  analysis = new StorageStore('analysis', true);
  assessments = new StorageStore('assessments', true);

  /**
   * Initialize encryption for all user data stores
   * @param password - User password
   * @param salt - User-specific salt
   */
  async initializeForUser(password: string, salt: Uint8Array): Promise<void> {
    const key = await CryptoUtils.deriveKey(password, salt);
    this.applyEncryptionKey(key);
    console.log('Storage encryption initialized');
  }

  /**
   * Clear all encryption keys
   */
  clearEncryptionKeys(): void {
    this.applyEncryptionKey(null);
    console.log('Storage encryption keys cleared');
  }

  private applyEncryptionKey(key: CryptoKey | null): void {
    this.journals.setEncryptionKey(key);
    this.chats.setEncryptionKey(key);
    this.analysis.setEncryptionKey(key);
    this.assessments.setEncryptionKey(key);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const storageService = new StorageService();
export default storageService;
