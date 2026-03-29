param(
  [Parameter(Mandatory = $true)]
  [string]$ModelPath,

  [string]$LaunchCommand = "cargo tauri dev",

  [int]$GpuLayers = 35,

  [int]$MainGpu = 0
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$tauriDir = Join-Path $projectRoot "src-tauri"
$runtimePath = Join-Path $tauriDir "bin/llama-cuda/llama-cli.exe"

if (-not (Test-Path $runtimePath)) {
  throw "CUDA runtime not found: $runtimePath"
}

if (-not (Test-Path $ModelPath)) {
  throw "GGUF model not found: $ModelPath"
}

$env:MINDSCRIBE_NATIVE_CPU_RUNTIME = (Resolve-Path $runtimePath).Path
$env:MINDSCRIBE_NATIVE_CPU_MODEL = (Resolve-Path $ModelPath).Path
$env:MINDSCRIBE_NATIVE_GPU_LAYERS = "$GpuLayers"
$env:MINDSCRIBE_NATIVE_MAIN_GPU = "$MainGpu"

Write-Host "Native runtime: $env:MINDSCRIBE_NATIVE_CPU_RUNTIME"
Write-Host "Native model  : $env:MINDSCRIBE_NATIVE_CPU_MODEL"
Write-Host "GPU layers    : $env:MINDSCRIBE_NATIVE_GPU_LAYERS"
Write-Host "Main GPU      : $env:MINDSCRIBE_NATIVE_MAIN_GPU"
Write-Host "Mode          : CUDA"
Write-Host "Launching     : $LaunchCommand"

Push-Location $tauriDir
try {
  Invoke-Expression $LaunchCommand
} finally {
  Pop-Location
}
