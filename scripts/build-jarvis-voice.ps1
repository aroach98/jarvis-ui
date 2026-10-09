# Build (or rebuild) the JARVIS voice profile in VoiceStudio.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-jarvis-voice.ps1 [-SkipDownload] [-Top 6]
#
# 1. Downloads the source audio listed in apps\jarvis-core\voice\sources.txt
#    (YouTube ids, one per line, "#" comments; "anchor" after the id marks
#    pure-JARVIS audio) into apps\jarvis-core\voice\raw with yt-dlp.
# 2. Starts the VoiceStudio backend if nothing answers on :3900.
# 3. Runs scripts\jarvis_voice\build.py inside VoiceStudio's uv environment:
#    stems -> utterances -> speaker-filtered clips -> profiles -> audition.
# Everything under apps\jarvis-core\voice\ except README/sources is gitignored.
param(
  [string]$VoiceStudioDir = (Join-Path $env:USERPROFILE 'VoiceStudio'),
  [string]$Url = 'http://127.0.0.1:3900',
  [string]$Profile = 'JARVIS',
  [int]$Top = 6,
  [switch]$SkipDownload,
  [switch]$NoProfiles
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$voiceDir = Join-Path $repo 'apps\jarvis-core\voice'
$raw = Join-Path $voiceDir 'raw'
$work = Join-Path $voiceDir 'work'
$sources = Join-Path $voiceDir 'sources.txt'
New-Item -ItemType Directory -Force $raw, $work | Out-Null
$env:Path = "$env:USERPROFILE\.local\bin;$env:APPDATA\Python\Python310\Scripts;$env:Path"

$ids = @(); $anchors = @()
foreach ($line in Get-Content $sources) {
  $t = ($line -split '#')[0].Trim()
  if (-not $t) { continue }
  $parts = $t -split '\s+'
  $ids += $parts[0]
  if ($parts.Length -gt 1 -and $parts[1] -eq 'anchor') { $anchors += $parts[0] }
}
if (-not $ids) { throw "no sources in $sources" }

if (-not $SkipDownload) {
  if (-not (Get-Command yt-dlp -ErrorAction SilentlyContinue)) {
    python -m pip install --user --quiet --upgrade yt-dlp
  }
  foreach ($id in $ids) {
    if (Test-Path (Join-Path $raw "$id.wav")) { continue }
    Write-Host "downloading $id"
    yt-dlp -f 'bestaudio/best' -x --audio-format wav --audio-quality 0 --no-playlist -o "$raw\%(id)s.%(ext)s" "https://www.youtube.com/watch?v=$id"
  }
}

# Backend: attach if up, else start it detached (jarvis-core will attach later).
$up = $false
try { $up = (Invoke-WebRequest "$Url/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch {}
if (-not $up) {
  Write-Host 'starting VoiceStudio backend'
  $port = ([uri]$Url).Port
  $env:OMNIVOICE_ANALYTICS_DISABLED = '1'
  Start-Process -FilePath 'uv' -WorkingDirectory $VoiceStudioDir -WindowStyle Hidden `
    -ArgumentList @('run','--no-sync','uvicorn','main:app','--app-dir','backend','--host','127.0.0.1','--port',"$port") `
    -RedirectStandardOutput (Join-Path $work 'backend.out.log') -RedirectStandardError (Join-Path $work 'backend.err.log')
  for ($i = 0; $i -lt 120 -and -not $up; $i++) {
    Start-Sleep 2
    try { $up = (Invoke-WebRequest "$Url/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch {}
  }
  if (-not $up) { throw "VoiceStudio did not come up on $Url (see $work\backend.err.log)" }
}

$py = Join-Path $PSScriptRoot 'jarvis_voice\build.py'
$argv = @('run','--no-sync','python','-I',$py,'--raw',$raw,'--out',$work,'--vs-url',$Url,'--profile',$Profile,'--top',"$Top")
foreach ($a in $anchors) { $argv += @('--anchor',$a) }
if ($NoProfiles) { $argv += '--no-profiles' }
Push-Location $VoiceStudioDir
try { & uv @argv; if ($LASTEXITCODE -ne 0) { throw "build.py failed ($LASTEXITCODE)" } }
finally { Pop-Location }
Write-Host ''
Get-Content (Join-Path $work 'report.md') -ErrorAction SilentlyContinue
