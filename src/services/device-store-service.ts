import { invoke } from '@tauri-apps/api/core';

export interface DeviceStoreEntry<T = unknown> {
  key: string;
  value: T;
}

class DeviceStoreService {
  isTauriAvailable(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  private async invokeSafely<T>(
    command: string,
    args: Record<string, unknown>,
    fallback: T,
  ): Promise<T> {
    if (!this.isTauriAvailable()) {
      return fallback;
    }

    try {
      return await invoke<T>(command, args);
    } catch (error) {
      console.warn(`Device store command failed: ${command}`, error);
      return fallback;
    }
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    return this.invokeSafely<T | null>('device_store_get', { storeName, key }, null);
  }

  async set(storeName: string, key: string, value: unknown): Promise<boolean> {
    return this.invokeSafely<boolean>('device_store_set', { storeName, key, value }, false);
  }

  async delete(storeName: string, key: string): Promise<boolean> {
    return this.invokeSafely<boolean>('device_store_delete', { storeName, key }, false);
  }

  async clear(storeName: string): Promise<boolean> {
    return this.invokeSafely<boolean>('device_store_clear', { storeName }, false);
  }

  async keys(storeName: string): Promise<string[]> {
    return this.invokeSafely<string[]>('device_store_keys', { storeName }, []);
  }

  async entries<T>(storeName: string): Promise<Array<DeviceStoreEntry<T>>> {
    return this.invokeSafely<Array<DeviceStoreEntry<T>>>(
      'device_store_entries',
      { storeName },
      [],
    );
  }
}

export const deviceStoreService = new DeviceStoreService();
export default deviceStoreService;
