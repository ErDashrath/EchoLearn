/**
 * F002: Storage Service - Encrypted local storage
 * 
 * Features:
 * - LocalForage for persistent storage
 * - AES-GCM encryption for sensitive data
 * - Per-user encryption keys derived from password
 * - Separate stores for different data types
 * 
 * @module services/storage-service
 */

import localforage from 'localforage';

// Type alias for localforage instance
type LocalForageInstance = ReturnType<typeof localforage.createInstance>;

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
    
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derive AES-GCM key using ArrayBuffer (not Uint8Array directly)
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
  
  /**
   * Encrypt data with AES-GCM
   * @param data - Data to encrypt
   * @param key - Encryption key
   */
  static async encrypt(data: unknown, key: CryptoKey): Promise<{ iv: number[]; data: number[] }> {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(JSON.stringify(data))
    );
    
    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted))
    };
  }
  
  /**
   * Decrypt data with AES-GCM
   * @param encryptedData - Encrypted data object
   * @param key - Encryption key
   */
  static async decrypt<T = unknown>(
    encryptedData: { iv: number[]; data: number[] }, 
    key: CryptoKey
  ): Promise<T> {
    const decoder = new TextDecoder();
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
      key,
      new Uint8Array(encryptedData.data)
    );
    
    return JSON.parse(decoder.decode(decrypted)) as T;
  }
}

// =============================================================================
// STORAGE STORE CLASS
// =============================================================================

class StorageStore {
  private store: LocalForageInstance;
  private encryptionKey: CryptoKey | null = null;
  private useEncryption: boolean;
  
  constructor(storeName: string, useEncryption: boolean = false) {
    this.store = localforage.createInstance({
      name: 'mindscribe',
      storeName: storeName
    });
    this.useEncryption = useEncryption;
  }
  
  /**
   * Set encryption key for this store
   */
  async setEncryptionKey(password: string, salt: Uint8Array): Promise<void> {
    if (this.useEncryption) {
      this.encryptionKey = await CryptoUtils.deriveKey(password, salt);
    }
  }
  
  /**
   * Clear encryption key
   */
  clearEncryptionKey(): void {
    this.encryptionKey = null;
  }
  
  /**
   * Save data to store
   * @param key - Storage key
   * @param value - Data to save
   */
  async save(key: string, value: any): Promise<boolean> {
    try {
      let dataToSave = value;
      
      // Encrypt if enabled and key available
      if (this.useEncryption && this.encryptionKey) {
        dataToSave = await CryptoUtils.encrypt(value, this.encryptionKey);
      }
      
      await this.store.setItem(key, dataToSave);
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
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const data = await this.store.getItem<any>(key);
      
      if (!data) return null;
      
      // Decrypt if encrypted data detected
      if (this.useEncryption && this.encryptionKey && data.iv && data.data) {
        return await CryptoUtils.decrypt(data, this.encryptionKey);
      }
      
      return data;
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
      await this.store.removeItem(key);
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
      await this.store.clear();
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
      return await this.store.keys();
    } catch (error) {
      console.error('Storage keys error:', error);
      return [];
    }
  }
  
  /**
   * Get all items in store
   */
  async getAll(): Promise<Array<{ key: string; value: any }>> {
    try {
      const keys = await this.keys();
      const items: Array<{ key: string; value: any }> = [];
      
      for (const key of keys) {
        const value = await this.get(key);
        if (value !== null) {
          items.push({ key, value });
        }
      }
      
      return items;
    } catch (error) {
      console.error('Storage getAll error:', error);
      return [];
    }
  }
}

// =============================================================================
// STORAGE SERVICE
// =============================================================================

class StorageService {
  // User data (not encrypted - contains hashed passwords)
  users = new StorageStore('users', false);
  
  // Settings (not encrypted)
  settings = new StorageStore('settings', false);
  
  // Encrypted stores for sensitive data
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
    await Promise.all([
      this.journals.setEncryptionKey(password, salt),
      this.chats.setEncryptionKey(password, salt),
      this.analysis.setEncryptionKey(password, salt),
      this.assessments.setEncryptionKey(password, salt)
    ]);
    console.log('✅ Storage encryption initialized');
  }
  
  /**
   * Clear all encryption keys
   */
  clearEncryptionKeys(): void {
    this.journals.clearEncryptionKey();
    this.chats.clearEncryptionKey();
    this.analysis.clearEncryptionKey();
    this.assessments.clearEncryptionKey();
    console.log('✅ Storage encryption keys cleared');
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const storageService = new StorageService();
export default storageService;
