import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // Copy Piper WASM files to public directory
    viteStaticCopy({
      targets: [
        // Piper phonemize WASM files
        {
          src: 'node_modules/piper-wasm/build/piper_phonemize.wasm',
          dest: 'piper'
        },
        {
          src: 'node_modules/piper-wasm/build/piper_phonemize.data',
          dest: 'piper'
        },
        {
          src: 'node_modules/piper-wasm/build/piper_phonemize.js',
          dest: 'piper'
        },
        // Piper worker
        {
          src: 'node_modules/piper-wasm/build/worker/piper_worker.js',
          dest: 'piper'
        },
        // ONNX Runtime files
        {
          src: 'node_modules/piper-wasm/build/worker/dist/*',
          dest: 'piper/dist'
        },
        // espeak-ng data
        {
          src: 'node_modules/piper-wasm/espeak-ng/espeak-ng-data/voices',
          dest: 'piper/espeak-ng-data'
        },
        {
          src: 'node_modules/piper-wasm/espeak-ng/espeak-ng-data/lang',
          dest: 'piper/espeak-ng-data'
        }
      ]
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Required headers for WASM (SharedArrayBuffer support)
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['framer-motion', 'lucide-react'],
        },
      },
    },
  },
  optimizeDeps: {
    // Exclude packages that use WASM/SharedArrayBuffer
    exclude: ['@mlc-ai/web-llm', 'onnxruntime-web', 'piper-wasm'],
    include: ['react', 'react-dom', 'framer-motion'],
  },
  assetsInclude: ['**/*.wasm', '**/*.data']
});
