/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_OLLAMA_BASE_URL: string;
  readonly VITE_OLLAMA_FALLBACK_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}