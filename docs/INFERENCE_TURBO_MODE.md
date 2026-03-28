# Inference Turbo Mode (TurboQuant-Equivalent)

## Why this was implemented
A direct "Google TurboQuant" integration is not available in this WebLLM runtime.
To achieve the same practical outcome (higher token throughput and lower latency), the app now uses a Turbo inference profile built on supported local techniques.

## Implemented speed techniques
- Quantized model preference (q4 variants)
- Smaller fast-model recommendation and one-click selection
- Aggressive generation budget in Turbo mode
  - lower max token caps
  - lower temperature/top-p for faster, steadier decoding
- Task-specific optimization
  - chat
  - summary
  - voice

## Where it is integrated
- src/services/webllm-service.ts
  - Inference profile persistence
  - Turbo config optimizer
  - Fast model recommendation helpers
- src/hooks/use-persistent-chat.ts
  - Uses optimized config for chat and summarization
- src/hooks/use-chat.tsx
  - Uses optimized config for chat
- src/pages/voice.tsx
  - Uses optimized config for voice turns
- src/pages/settings.tsx
  - Turbo toggle
  - "Use Fastest Cached Model" quick action

## Settings behavior
- Turbo OFF: balanced quality-speed defaults
- Turbo ON: lower generation budgets for faster responses

## References used for optimization direction
- Google LiteRT quantization and performance best-practices
- Common LLM performance guidance (quantization + profiling + hardware utilization)

## Notes
- Turbo mode improves responsiveness but may reduce long-form completeness.
- For better quality with larger models, keep Turbo OFF or selectively use larger max token settings.
