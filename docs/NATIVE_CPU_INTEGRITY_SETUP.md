# Native CPU Integrity Setup (Windows)

This guide configures required SHA-256 integrity checks for native CPU inference.

## Required Variables
- `MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256`
- `MINDSCRIBE_NATIVE_CPU_MODEL_SHA256`

## Optional Overrides
- `MINDSCRIBE_NATIVE_CPU_RUNTIME`
- `MINDSCRIBE_NATIVE_CPU_MODEL`
- `MINDSCRIBE_NATIVE_CPU_THREADS`

## 1) Pick Runtime and Model Paths
Example paths (adjust for your setup):

```powershell
$RuntimePath = "C:\Path\To\llama-cli.exe"
$ModelPath = "C:\Path\To\chat.gguf"
```

## 2) Compute SHA-256 Hashes

```powershell
$RuntimeHash = (Get-FileHash -Path $RuntimePath -Algorithm SHA256).Hash.ToLower()
$ModelHash = (Get-FileHash -Path $ModelPath -Algorithm SHA256).Hash.ToLower()

$RuntimeHash
$ModelHash
```

## 3) Configure for Current Session (quick test)

```powershell
$env:MINDSCRIBE_NATIVE_CPU_RUNTIME = $RuntimePath
$env:MINDSCRIBE_NATIVE_CPU_MODEL = $ModelPath
$env:MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256 = $RuntimeHash
$env:MINDSCRIBE_NATIVE_CPU_MODEL_SHA256 = $ModelHash
$env:MINDSCRIBE_NATIVE_CPU_THREADS = "6"
```

Launch app from the same terminal session to test.

## 4) Configure Persistently (User-level)

```powershell
setx MINDSCRIBE_NATIVE_CPU_RUNTIME "$RuntimePath"
setx MINDSCRIBE_NATIVE_CPU_MODEL "$ModelPath"
setx MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256 "$RuntimeHash"
setx MINDSCRIBE_NATIVE_CPU_MODEL_SHA256 "$ModelHash"
setx MINDSCRIBE_NATIVE_CPU_THREADS "6"
```

Important:
- `setx` applies to new terminals/processes only.
- Close and reopen terminal/app after running these commands.

## 5) Verify Variables

```powershell
Get-ChildItem Env:MINDSCRIBE_NATIVE_CPU_RUNTIME,
                  Env:MINDSCRIBE_NATIVE_CPU_MODEL,
                  Env:MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256,
                  Env:MINDSCRIBE_NATIVE_CPU_MODEL_SHA256,
                  Env:MINDSCRIBE_NATIVE_CPU_THREADS
```

## 6) Re-verify Hashes After Any File Change
If runtime binary or model file changes, recompute hashes and update env vars.

```powershell
$RuntimeHash = (Get-FileHash -Path $RuntimePath -Algorithm SHA256).Hash.ToLower()
$ModelHash = (Get-FileHash -Path $ModelPath -Algorithm SHA256).Hash.ToLower()

setx MINDSCRIBE_NATIVE_CPU_RUNTIME_SHA256 "$RuntimeHash"
setx MINDSCRIBE_NATIVE_CPU_MODEL_SHA256 "$ModelHash"
```

## Troubleshooting
- Native provider unavailable with hash error:
  - Confirm file paths are correct.
  - Confirm hashes are lowercase and match current files.
  - Recompute hashes after model/runtime replacement.
- Native provider unavailable with missing runtime/model:
  - Set path overrides using `MINDSCRIBE_NATIVE_CPU_RUNTIME` and `MINDSCRIBE_NATIVE_CPU_MODEL`.
- Stop button not stopping native generation:
  - Ensure app has permission to invoke `taskkill` on Windows.
