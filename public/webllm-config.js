window.__MINDSCRIBE_WEBLLM_MODELS__ = [
  {
    id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.2 1B',
    size: '1.2GB',
    sizeGB: 1.2,
    description: 'Fast and efficient, great for quick responses',
    parameters: '1B',
    native: {
      hfUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true',
    },
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    name: 'Llama 3.2 3B',
    size: '2.0GB',
    sizeGB: 2.0,
    description: 'Balanced performance and quality',
    parameters: '3B',
    native: {
      hfUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true',
    },
  },
  {
    id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
    name: 'Phi-3 Mini',
    size: '2.2GB',
    sizeGB: 2.2,
    description: "Microsoft's efficient model",
    parameters: '3.8B',
    native: {
      hfUrl: 'https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf?download=true',
    },
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B',
    size: '1.6GB',
    sizeGB: 1.6,
    description: "Google's compact model",
    parameters: '2B',
    native: {
      hfUrl: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf?download=true',
    },
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 0.5B',
    size: '0.6GB',
    sizeGB: 0.6,
    description: 'Ultra-lightweight model',
    parameters: '0.5B',
    native: {
      hfUrl: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf?download=true',
    },
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 1.5B',
    size: '1.1GB',
    sizeGB: 1.1,
    description: 'Efficient Chinese-English model',
    parameters: '1.5B',
    native: {
      hfUrl: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf?download=true',
    },
  },
];

window.__MINDSCRIBE_NATIVE_CPU_RUNTIME_URL__ =
  'https://github.com/ggml-org/llama.cpp/releases/download/b8575/llama-b8575-bin-win-cpu-x64.zip';

// Optional CUDA runtime bundle URL. Downloaded only when an NVIDIA GPU is detected.
window.__MINDSCRIBE_NATIVE_CUDA_RUNTIME_URL__ =
  'https://github.com/ggml-org/llama.cpp/releases/download/b8575/llama-b8575-bin-win-cuda-12.4-x64.zip';

// Optional: set this at runtime if you want exact MLC -> GGUF path mapping from frontend.
// Example structure:
// window.__MINDSCRIBE_NATIVE_CPU_MODEL_MAP__ = {
//   'Llama-3.2-1B-Instruct-q4f32_1-MLC': 'C:/models/llama-3.2-1b-instruct-q4_k_m.gguf',
// };
