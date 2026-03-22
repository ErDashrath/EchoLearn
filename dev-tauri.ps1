# EchoLearn Tauri Development Script
# Runs the app in development mode with proper environment setup

Write-Host "🚀 EchoLearn Development Mode" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

# Set environment variables for LLVM/Clang
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
$env:RUST_MIN_STACK = "8388608"
$env:RUST_BACKTRACE = "1"

# Verify LLVM installation
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow
if (Test-Path "$env:LIBCLANG_PATH\clang.exe") {
    Write-Host "✅ LLVM/Clang found" -ForegroundColor Green
} else {
    Write-Host "❌ LLVM/Clang not found! Install from: https://github.com/llvm/llvm-project/releases" -ForegroundColor Red
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    & npm install
}

Write-Host "🔧 Starting EchoLearn in development mode..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the development server" -ForegroundColor Gray

# Start Tauri development server
& npm run tauri:dev

Write-Host "Development server stopped." -ForegroundColor Gray