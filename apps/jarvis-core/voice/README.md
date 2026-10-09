# JARVIS voice

Jarvis speaks with a **local zero-shot clone of the film JARVIS** (Paul Bettany)
served by [VoiceStudio](https://github.com/debpalash/VoiceStudio)'s OmniVoice
engine on this machine's GPU. $0 per line, no network, no cloud key, and it is the
voice in every mode — the free/pro toggle only picks the reasoning tier now.
Windows SAPI is the fail-closed fallback while the backend is down or loading.

Only `README.md` and `sources.txt` are committed. `raw/` (downloaded film audio)
and `work/` (stems, clips, auditions, report) are gitignored — this repo is
public and ships no copyrighted audio. Personal, non-commercial use only; keep
it that way.

## Build it

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-voicestudio.ps1   # once
powershell -ExecutionPolicy Bypass -File scripts\build-jarvis-voice.ps1    # ~15-30 min on a 4070
```

`sources.txt` lists the YouTube sources (one id per line; `anchor` marks
pure-JARVIS audio that defines the target speaker). The build separates vocals
from the score with demucs, cuts 2.5–12 s utterances with faster-whisper,
keeps only clips whose ECAPA speaker embedding matches the anchor (so Tony
Stark and Ultron are dropped), turns the top candidates into VoiceStudio
profiles, auditions each one on a fixed line (intelligibility by WER,
likeness by embedding), and names the winner `JARVIS` with runners-up as
`JARVIS alt 2..N`. `work\report.md` has the table; `work\audition\*.wav` are
the takes — listen and switch by setting `voice.voicestudio.profile` in
`jarvis.config.json` if your ear disagrees with the numbers.

Re-running is cheap: stems, clips and embeddings are cached in `work\`. Add
sources to `sources.txt` and re-run to widen the library.

## Tuning

- `voice.voicestudio.speed` (default 1.0) — OmniVoice speed multiplier.
- Swap the reference clip in VoiceStudio's own UI (profile → replace audio)
  if you want to hand-pick a line from `work\clips\` — the profile id stays.
- `build.py --no-profiles` ranks clips without touching VoiceStudio.
