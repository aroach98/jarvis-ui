# One-time setup for the wake-word sidecar. Run from this folder:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path .venv)) {
  py -3.11 -m venv .venv
}
& .\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt --quiet

# Fetch the pretrained "hey jarvis" wake model (cached in the package dir).
& .\.venv\Scripts\python.exe -c "import openwakeword.utils; openwakeword.utils.download_models(['hey_jarvis_v0.1'])"

Write-Host 'sidecar ready — jarvis-core autostarts it (config voice.sidecar)'
