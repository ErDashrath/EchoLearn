# Native CPU Support Implementation Plan (Windows Compatibility)

## Goal
Enable local AI chat on Windows devices that cannot run WebGPU, while preserving privacy-first local inference and maintaining release integrity.

## Scope and Constraints
- Keep current WebLLM + WebGPU path as preferred fast path.
- Add native CPU inference as a first-class provider in Tauri runtime.
- No mandatory cloud inference dependency.
- All model/binary assets must pass integrity checks before use.

## Success Criteria
- Chat works on Windows machines with no WebGPU support.
- Provider selection is deterministic: WebGPU if healthy, otherwise native CPU.
- Corrupted model/binary is detected and blocked.
- Release pipeline enforces quality and integrity gates.

## Phase 0: Architecture and Governance
### Deliverables
- ADR for provider architecture and model format strategy.
- Threat model for model download, storage, and execution path.
- Acceptance matrix for supported Windows versions and hardware tiers.

### Tasks
- Define inference provider contract.
- Define model manifest schema: version, sha256, size, license, compatibility tags.
- Define telemetry taxonomy for provider selection and failures.

## Phase 1: Native Engine Spike (Current Start)
### Deliverables
- Tauri-native CPU provider scaffold.
- Runtime capability report contract from app side.
- Baseline benchmark script and sample report format.

### Tasks
- Add inference runtime service abstraction in frontend.
- Add capability report API shape and provider selection policy.
- Wire temporary placeholder for native CPU availability until backend inference binding lands.

## Phase 2: Provider Abstraction and Routing
### Deliverables
- Unified provider orchestration service.
- Stable routing policy with health checks.

### Tasks
- Implement provider lifecycle methods: init, generateStream, stop, health.
- Route chat generation through provider abstraction (without changing UX).
- Add fail-fast reasons for unsupported device states.

## Phase 3: Native CPU Backend Integration (Tauri)
### Deliverables
- Native CPU inference command set in Tauri backend.
- Streaming token bridge from Rust backend to frontend.

### Tasks
- Integrate selected CPU LLM runtime in Rust/Tauri side.
- Add commands: load model, generate stream, stop, unload, health.
- Implement backpressure-safe stream channel and cancellation.

## Phase 4: Model Lifecycle and Integrity
### Deliverables
- Secure model manifest and verification module.
- Atomic model install/update path.

### Tasks
- Validate model sha256 before activation.
- Quarantine invalid/incomplete artifacts.
- Add auto-repair flow for corrupted model cache.

## Phase 5: UX and Error Semantics
### Deliverables
- Capability banner and provider status UI.
- Friendly, actionable errors for unsupported hardware.

### Tasks
- Show active provider and expected performance profile.
- Disable unsupported actions with explicit explanation.
- Preserve existing conversational UX behavior across providers.

## Phase 6: Performance and Reliability Hardening
### Deliverables
- Hardware-tier presets.
- Stability results from soak testing.

### Tasks
- Tune context length, threads, and quantization profile per tier.
- Add memory guardrails and OOM-safe fallback behavior.
- Run long-session reliability tests and regressions.

## Phase 7: Security and Compliance
### Deliverables
- Security review checklist pass.
- License and dependency validation for runtime and model assets.

### Tasks
- Verify local-only data boundaries.
- Validate signed/reproducible release assets where possible.
- Ensure runtime binaries are version-pinned and auditable.

## Phase 8: Validation Matrix and Release
### Deliverables
- CI quality gates for provider matrix.
- Staged rollout and rollback runbook.

### Tasks
- Execute matrix tests across Windows versions and GPU classes.
- Add release blockers for integrity and stability thresholds.
- Roll out by feature flag and graduate to default.

## Work Breakdown (Execution Order)
1. Phase 0 sign-off.
2. Phase 1 scaffold and benchmarks.
3. Phase 2 provider routing in chat path.
4. Phase 3 native backend integration.
5. Phase 4 integrity pipeline.
6. Phase 5 UX hardening.
7. Phase 6/7 reliability and security validation.
8. Phase 8 release rollout.

## Risks and Mitigations
- Risk: Native runtime adds package size.
  - Mitigation: optional model packs, quantized defaults, separate downloadable assets.
- Risk: CPU latency on very low-end machines.
  - Mitigation: low-latency preset with smaller quantized model.
- Risk: Model corruption on interrupted downloads.
  - Mitigation: atomic temp file + checksum validation before activation.

## Current Branch Status
- Branch: native-cpu
- This document is the execution baseline.
- Phase 1 scaffold is started in code alongside this plan.

## Integrity Enforcement (Implemented)
- Native CPU provider availability now requires SHA-256 verification for:
  - Runtime binary via `MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256`
  - Model artifact via `MINDSCRIBE_NATIVE_CPU_MODEL_SHA256`
- Optional path overrides:
  - `MINDSCRIBE_NATIVE_CPU_RUNTIME`
  - `MINDSCRIBE_NATIVE_CPU_MODEL`
- If required hashes are missing or mismatched, native provider remains unavailable with explicit reason.
- Setup instructions: `docs/NATIVE_CPU_INTEGRITY_SETUP.md`

## Performance Profiles (Implemented)
- Profile env var: `MINDSCRIBE_NATIVE_CPU_PROFILE`
  - `low`: minimal CPU pressure (threads <= 2, token cap 160)
  - `balanced`: default profile (threads <= 6, token cap 320)
  - `high`: better quality/perf on stronger CPUs (threads <= 10, token cap 512)
- Optional manual override: `MINDSCRIBE_NATIVE_CPU_THREADS`
- Effective profile/threads/token cap are now exposed in runtime diagnostics for both chat pages.

### Recommended Presets
- Low-end Windows laptops (older dual/quad core):
  - `MINDSCRIBE_NATIVE_CPU_PROFILE=low`
  - `MINDSCRIBE_NATIVE_CPU_THREADS=2`
- Mid-range machines:
  - `MINDSCRIBE_NATIVE_CPU_PROFILE=balanced`
  - `MINDSCRIBE_NATIVE_CPU_THREADS=4` or `6`
- High-end desktops:
  - `MINDSCRIBE_NATIVE_CPU_PROFILE=high`
  - `MINDSCRIBE_NATIVE_CPU_THREADS=8` (or above after thermal testing)
