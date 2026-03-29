param(
  [Parameter(Mandatory = $true)]
  [string]$ModelPath,

  [string]$LaunchCommand = "cargo tauri dev"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$tauriDir = Join-Path $projectRoot "src-tauri"
$runtimePath = Join-Path $tauriDir "bin/llama-cpu/llama-cli.exe"

if (-not (Test-Path $runtimePath)) {
  throw "CPU runtime not found: $runtimePath"
}

if (-not (Test-Path $ModelPath)) {
  throw "GGUF model not found: $ModelPath"
}

$env:MINDSCRIBE_NATIVE_CPU_RUNTIME = (Resolve-Path $runtimePath).Path
$env:MINDSCRIBE_NATIVE_CPU_MODEL = (Resolve-Path $ModelPath).Path
$env:MINDSCRIBE_NATIVE_GPU_LAYERS = ""
$env:MINDSCRIBE_NATIVE_MAIN_GPU = ""

Write-Host "Native runtime: $env:MINDSCRIBE_NATIVE_CPU_RUNTIME"
Write-Host "Native model  : $env:MINDSCRIBE_NATIVE_CPU_MODEL"
Write-Host "Mode          : CPU"
Write-Host "Launching     : $LaunchCommand"

Push-Location $tauriDir
try {
  Invoke-Expression $LaunchCommand
} finally {
  Pop-Location
}
