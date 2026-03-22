# EchoLearn Tauri Build Script
# Sets up proper environment for Windows Tauri build

Write-Host "🚀 EchoLearn Tauri Build Setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Set environment variables for LLVM/Clang
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
$env:RUST_MIN_STACK = "8388608"
$env:RUST_BACKTRACE = "1"

# Verify LLVM installation
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow
if (Test-Path "$env:LIBCLANG_PATH\clang.exe") {
    Write-Host "✅ LLVM/Clang found at: $env:LIBCLANG_PATH" -ForegroundColor Green
} else {
    Write-Host "❌ LLVM/Clang not found! Please install LLVM." -ForegroundColor Red
    Write-Host "Download from: https://github.com/llvm/llvm-project/releases" -ForegroundColor Red
    exit 1
}

# Check Rust installation
$rustVersion = & rustc --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Rust: $rustVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Rust not found! Please install Rust." -ForegroundColor Red
    exit 1
}

# Check Node.js
$nodeVersion = & node --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js not found! Please install Node.js." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔧 Building EchoLearn Desktop App..." -ForegroundColor Cyan

# Clean previous builds
Write-Host "🧹 Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "src-tauri\target") { Remove-Item -Recurse -Force "src-tauri\target" }

# Install frontend dependencies
Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Yellow
& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend dependency installation failed!" -ForegroundColor Red
    exit 1
}

# Build frontend
Write-Host "🏗️ Building frontend..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed!" -ForegroundColor Red
    exit 1
}

# Build Tauri app
Write-Host "🦀 Building Rust backend and packaging..." -ForegroundColor Yellow
& npm run tauri:build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Tauri build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Build completed successfully!" -ForegroundColor Green
Write-Host "📁 Check src-tauri/target/release/bundle/ for the installer" -ForegroundColor Green
Write-Host "🚀 EchoLearn is ready for distribution!" -ForegroundColor Cyan