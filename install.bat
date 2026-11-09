@echo off
setlocal DisableDelayedExpansion
if not exist "%~dp0runtime\node.exe" (
  echo Download and extract the complete Windows Tanuki Server release first.
  echo This installer requires the bundled runtime, not a source checkout.
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0scripts\release\verify.mjs" "%~dp0."
if errorlevel 1 exit /b 1
if "%~1"=="--check" exit /b 0
"%~dp0runtime\node.exe" "%~dp0installer\setup.mjs" %*
exit /b %errorlevel%
