# Sound credits

All sound files in this folder are cut from **CC0 (public domain)** recordings.
CC0 does not require attribution, so this is a courtesy credit (the author asks for it
politely, and it keeps the source of each file on record for the App Store).

| File | Used for | Source recording | Author | Licence |
|---|---|---|---|---|
| `quack-1.mp3` | normal duck bonk (+1), variant 1 | "Ducks" (BigSoundBank #0276), call at 1.33–1.69 s | Denis Chardonnet, via BigSoundBank / LaSonothèque (Joseph Sardin) | CC0 1.0 |
| `quack-2.mp3` | normal duck bonk (+1), variant 2 | same recording, call at 0.31–0.73 s | Denis Chardonnet | CC0 1.0 |
| `quack-3.mp3` | normal duck bonk (+1), variant 3 | same recording, call at 18.45–18.67 s | Denis Chardonnet | CC0 1.0 |
| `quack-red.mp3` | red runner duck (+5), escaping red/golden duck | same recording, three calls at 18.45–19.12 s | Denis Chardonnet | CC0 1.0 |
| `quack-golden.mp3` | golden duck, DUCK FRENZY start | same recording, call at 0.75–1.15 s | Denis Chardonnet | CC0 1.0 |
| `quack-blip.mp3` | DUCK FRENZY taps | same recording, attack of the call at 18.47 s | Denis Chardonnet | CC0 1.0 |
| `squeak.mp3` | rubber-duck squeak layered on some bonks | "Squeaker toy #2" (BigSoundBank #0879), squeeze at 0.07–0.26 s | Joseph Sardin, BigSoundBank | CC0 1.0 |

Sources:

- Ducks: <https://bigsoundbank.com/ducks-s0276.html> (WAV: <https://bigsoundbank.com/UPLOAD/bwf-en/0276.wav>)
- Squeaker toy #2: <https://bigsoundbank.com/sound-s0879.html> (WAV: <https://bigsoundbank.com/UPLOAD/bwf-en/0879.wav>)
- Licence terms: <https://bigsoundbank.com/licenses.html> (each page says "CC0 (public domain): Free and royalty-free",
  commercial use, editing and redistribution allowed, no attribution required).
- CC0 1.0: <https://creativecommons.org/publicdomain/zero/1.0/>

## Changes made

Made for DON'T DIE in October 2026 with ffmpeg 7.0.2 and a small Python script:

- Stereo to mono, resampled to 44.1 kHz; single calls cut out of the longer field recording.
- 140 Hz high-pass (removes wind/handling rumble; 300 Hz on the squeak) and light FFT noise reduction (`afftdn`, 10 dB).
- Silence trimmed (kept 8 ms before the first sound and 25 ms after the last), 5 ms fade-in, 5–80 ms fade-out.
- Loudness matched: the voiced part of each file is set to about -15 dBFS RMS (-17 for the squeak), peaks kept below -1 dBFS.
- `quack-red`: pitched up about 3.4 semitones and sped up 1.37x, so it sounds quick and excited.
- `quack-golden`: pitched down 5 semitones, with an extra copy an octave lower mixed in at -7 dB,
  a +4 dB bass boost and a short echo tail, so it sounds big and deep.
- `quack-blip`: first 115 ms of one call, pitched up 1.3 semitones, with a 30 ms fade-out.
- Encoded as 96 kbps mono MP3. The game also varies pitch and volume a little each time a sound plays.

Other sources were checked and left out. Most duck recordings on Wikimedia Commons and xeno-canto are
CC BY-SA, and the duck clip on OpenGameArt ("farm animals") is also BY-SA. BBC Sound Effects is licensed
for personal, educational and research use only, so it can't be used in a commercial app.
