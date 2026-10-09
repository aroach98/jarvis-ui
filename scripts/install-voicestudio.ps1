# Install the VoiceStudio backend (github.com/debpalash/VoiceStudio) from source
# so jarvis-core can spawn it headless for TTS. Re-runnable. ASCII only (PS 5.1).
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-voicestudio.ps1 [-Dir C:\path] [-Ref <sha|tag>]
#
# What it does: installs uv (user scope), clones VoiceStudio to -Dir (default
# ~\VoiceStudio, which is what jarvis.config.json's voice.voicestudio.dir
# defaults to), resolves the locked CUDA Python environment with uv, and runs
# VoiceStudio's own post-install (VC++ redist / cuDNN compat). Model weights
# (k2-fsa/OmniVoice, ~2.3 GB) download on first generation, or up front via
# scripts\build-jarvis-voice.ps1.
param(
  [string]$Dir = (Join-Path $env:USERPROFILE 'VoiceStudio'),
  [string]$Ref = '06c6e077f0fc35149efefc3561e9be5ae835d916',  # verified 2026-10-09 (v0.5.7-dev main)
  [ValidateSet('auto','cuda','cpu')][string]$Torch = 'auto'
)
$ErrorActionPreference = 'Stop'

$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Host 'installing uv (user scope)'
  Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
}
uv --version

if (-not (Test-Path (Join-Path $Dir '.git'))) {
  git clone https://github.com/debpalash/VoiceStudio $Dir
}
Set-Location $Dir
git fetch --quiet origin
git checkout --quiet $Ref
Write-Host "VoiceStudio at $(git rev-parse --short HEAD)"

if ($Torch -eq 'auto') {
  $Torch = if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { 'cuda' } else { 'cpu' }
}
Write-Host "resolving Python environment ($Torch wheels) - several GB on first run"
$env:OMNIVOICE_TORCH_VARIANT = $Torch
if ($Torch -eq 'cpu') { uv sync --locked --no-group cuda --group cpu } else { uv sync --locked }
if ($LASTEXITCODE -ne 0) { throw "uv sync failed ($LASTEXITCODE)" }
uv run --no-sync python scripts/setup.py
if ($LASTEXITCODE -ne 0) { throw "VoiceStudio setup.py failed ($LASTEXITCODE)" }

Write-Host ''
Write-Host "VoiceStudio ready in $Dir."
Write-Host 'jarvis-core spawns it on demand (voice.voicestudio in jarvis.config.json).'
Write-Host 'Next: scripts\build-jarvis-voice.ps1 to build the JARVIS profile.'
