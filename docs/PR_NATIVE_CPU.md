# PR: Native CPU Inference Path for Non-WebGPU Windows Devices

## Summary
This PR adds a production-oriented native CPU inference path for Windows devices that cannot run WebGPU, while preserving the existing WebLLM/WebGPU flow.

Key outcomes:
- Adds native CPU provider wiring in Tauri backend and frontend bridge.
- Adds event-based native streaming into chat UI.
- Adds provider selection mode in UI: Auto / WebGPU / Native CPU.
- Adds integrity enforcement (SHA-256) for runtime and model artifacts.
- Adds provider diagnostics and input gating in both chat pages.
- Adds setup and implementation documentation for rollout.

## Why
Some Windows laptops (for example older Intel iGPU classes) cannot provide a valid WebGPU adapter. Previously, this blocked local LLM inference. This PR introduces a native CPU path to keep the app usable on those devices.

## What Changed
### Backend (Tauri)
- Added native inference module and commands:
  - native_inference_status
  - native_inference_generate
  - native_inference_generate_stream
  - native_inference_stop
- Added process lifecycle management for native runtime and stop support.
- Added profile-based runtime tuning (low / balanced / high).
- Added SHA-256 verification for runtime binary and GGUF model before provider availability.

### Frontend Services
- Added native CPU bridge service for status, generation, stream, and stop.
- Extended runtime capability service with:
  - nativeCpuStatus diagnostics
  - persistent inference selection mode
  - provider resolution based on selected mode

### Chat Runtime
- Routed persistent chat generation through selected provider.
- Added graceful native stream recovery messages for mid-stream failures.
- Preserved anti-repetition and retry flow.

### UI/UX
- Added inference mode switch in both chat pages:
  - Auto
  - WebGPU
  - Native CPU
- Added provider diagnostics panel in both chat pages with:
  - provider availability reason
  - runtime/model paths
  - runtime/model SHA-256
  - effective profile/threads/token cap
- Added provider-aware input gating when no selected provider is available.

### Documentation
- Added implementation roadmap:
  - docs/NATIVE_CPU_IMPLEMENTATION_PLAN.md
- Added integrity setup guide:
  - docs/NATIVE_CPU_INTEGRITY_SETUP.md

## Commits Included (native-cpu)
- feat(native-cpu): add implementation roadmap and runtime capability scaffold
- feat(native-cpu): route persistent chat through inference capability selector
- feat(native-cpu): add tauri command contracts and frontend bridge
- feat(native-cpu): execute chat generation through selected inference provider
- feat(native-cpu): execute local runtime binary for native generation
- feat(native-cpu): stream native inference chunks via tauri events
- feat(native-cpu): enforce sha256 integrity for runtime and model artifacts
- docs(native-cpu): add Windows integrity setup guide with PowerShell steps
- feat(native-cpu): add chat inference diagnostics and provider-aware input gating
- feat(native-cpu): mirror inference diagnostics and gating in legacy chat page
- feat(native-cpu): add performance profiles and resilient native stream recovery
- feat(native-cpu): add Auto/WebGPU/Native CPU inference mode switch

## Environment Setup Required (Native CPU)
Required env vars:
- MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256
- MINDSCRIBE_NATIVE_CPU_MODEL_SHA256

Optional overrides:
- MINDSCRIBE_NATIVE_CPU_RUNTIME
- MINDSCRIBE_NATIVE_CPU_MODEL
- MINDSCRIBE_NATIVE_CPU_PROFILE (low|balanced|high)
- MINDSCRIBE_NATIVE_CPU_THREADS

See full setup steps in docs/NATIVE_CPU_INTEGRITY_SETUP.md.

## Validation Performed
- Frontend build: npm run build (pass)
- Backend compile: cargo check in src-tauri (pass)
- Manual flow validation covered:
  - Mode switch UI persistence and provider resolution
  - Provider diagnostics visibility
  - Input gating on unsupported states
  - Native stream route integration and stop invocation

## Risks / Limitations
- Native provider requires runtime binary + GGUF model + matching hashes; otherwise it is intentionally unavailable.
- Runtime speed depends on CPU/model size/quantization.
- Current native generation uses external runtime process integration; packaging must include runtime/model artifacts for turnkey installs.

## Review Checklist
- [ ] Verify native mode on Windows machine without WebGPU.
- [ ] Verify WebGPU mode still works on supported hardware.
- [ ] Verify Auto mode selects the expected provider.
- [ ] Verify integrity mismatch blocks native provider with clear reason.
- [ ] Verify stop button interrupts native generation.
- [ ] Verify both chat pages behave consistently.

## Suggested Follow-up (separate PR)
- Add startup native self-test command exposed in diagnostics.
- Add release packaging automation for runtime/model artifacts and hash injection.
- Add benchmark matrix for low-end and mid-tier Windows targets.
