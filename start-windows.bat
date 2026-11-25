@echo off
title Mansarf Ledger - Windows 10 Launcher
setlocal enabledelayedexpansion

echo ==================================================
echo   Mansarf Ledger (Kashofat Al-Mansarf) - Windows 10
echo ==================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed.
  echo Please install Node.js 22 LTS or newer from https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
if !NODE_MAJOR! LSS 22 (
  echo [WARNING] Detected Node.js v!NODE_MAJOR!. Node.js 22+ is required for built-in SQLite.
  echo Please upgrade from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo Building production interface...
  call npm run build
  if %errorlevel% neq 0 (
    echo [ERROR] npm run build failed.
    pause
    exit /b 1
  )
)

set PORT=3000
set NODE_ENV=production

echo.
echo Starting local database server on http://localhost:%PORT% ...
start "" "http://localhost:%PORT%"
node server.ts

if %errorlevel% neq 0 (
  echo.
  echo Server stopped unexpectedly.
  pause
)
