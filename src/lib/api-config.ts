// API Configuration for client-side
export const API_CONFIG = {
  // Base URL for your backend API
  BASE_URL: import.meta.env.VITE_API_BASE_URL || '',
  
  // Ollama configuration (if you want to make direct calls from frontend)
  OLLAMA_BASE_URL: import.meta.env.VITE_OLLAMA_BASE_URL || 'https://husband-criminal-differential-vitamin.trycloudflare.com',
  OLLAMA_FALLBACK_URL: import.meta.env.VITE_OLLAMA_FALLBACK_URL || 'http://localhost:11434',
  
  // Default timeout for API requests
  TIMEOUT: 30000,
} as const;

// Helper function to get the full API URL
export function getApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  
  // If running in development and no BASE_URL is set, use relative URLs
  if (import.meta.env.DEV && !API_CONFIG.BASE_URL) {
    return endpoint;
  }
  
  return `${API_CONFIG.BASE_URL}${endpoint}`;
}

// Helper function for making CORS-enabled requests to external APIs
export async function makeCorsRequest(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}
