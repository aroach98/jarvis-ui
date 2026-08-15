# Briefing soundtrack

Drop audio files (`.mp3`, `.wav`, `.wma`, `.m4a`, `.aac`) into this folder and
the "Good morning" briefing plays a **shuffled rotation of them at ducked
volume** — no Spotify, no network, no active device. Spotify is only used as
a fallback when this folder is empty. "That's enough" (or the 10-minute
timer) stops playback.

The audio files themselves are **gitignored** — this repo is public and ships
no copyrighted audio. This README is the only committed file here.

## Suggested tracklist (the film's Jarvis-adjacent rotation)

AC/DC and the Iron Man soundtrack staples — source them from your own
library/purchases:

- AC/DC — Back In Black
- AC/DC — Shoot to Thrill
- AC/DC — Thunderstruck
- AC/DC — Highway to Hell
- AC/DC — War Machine
- Black Sabbath — Iron Man
- Suicidal Tendencies — Institutionalized
- Ghostface Killah — Slept On Tony (bonus deep cut)

Config: the folder location can be overridden with `voice.music.dir` in
`jarvis.config.json`.
