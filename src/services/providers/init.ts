/**
 * Provider Initialization
 * 
 * Registers all available AI providers and initializes the best one.
 * Import this once at app startup (e.g., in main.tsx or App.tsx).
 * 
 * @module services/providers/init
 */

import { aiProviderRegistry } from './ai-provider';
import { createWebLLMProvider } from './webllm-provider';
import { createTauriProvider } from './tauri-provider';

/**
 * Register all providers. Call once at app boot.
 */
export function registerProviders(): void {
  aiProviderRegistry.register('webllm', createWebLLMProvider);
  aiProviderRegistry.register('tauri', createTauriProvider);
}

/**
 * Initialize the best available provider.
 * Returns the active provider instance.
 */
export async function initializeAIProvider() {
  registerProviders();
  return aiProviderRegistry.getProvider();
}
