# Polish-log (Færten)

Regler: se `POLISH.md` i projektmappen. Kort om afvigelser, besluttet med Søren 2026-10-27:
- Lyd: de 177 optagelser i `public/sfx` beholdes (Søren hentede dem bevidst). Syntese bruges kun til huller
  (rådyr, fasan) og som reserve, hvis en fil ikke kan indlæses. Loudness-tjek og lytteside laves stadig.
- Branch: arbejdet ligger på `claude/sharp-cray-vl9g49` (sessionens branch), ikke på en branch kaldet `polish`.
- FPS: containeren renderer i software (SwiftShader), så rigtige FPS kan ikke måles her. Vi måler draw calls,
  trekanter, CPU-tid pr. frame og hukommelse, og spillet får selv en FPS-måler og automatisk kvalitetsvalg.

## Iteration 0 – Fase 0 (audit)
- Startet: perf-auditor, qa-tester, graphics-artist/arkitektur-reviewer (rapporter i `polish/baseline/<rolle>/`).

## Iteration 1 – Lyd: loudness, huller, mute og lytteside
- Måling (OfflineAudioContext, alle 177 filer, `polish/latest/loudness-before.json`): 0 fejl ved indlæsning,
  19 filer med peak over -1 dBFS, RMS spændte fra -32,5 til -16,2 dBFS (16 dB forskel mellem varianter af samme slags lyd).
  Afspillet loudness (med manifestets volumen) gik fra -39,7 dBFS (tree_creak) til -16,4 dBFS (boss_wolf_howl).
- Løsning: `Audio.measure()` normaliserer hver fil ved indlæsning til -20 dBFS RMS, begrænset så peak < -1 dBFS
  (justering mellem -3,8 og +6,6 dB). Manifestets `volume` er nu et rent mix-niveau. Master-limiter beholdt.
- Huller: genererede lyde (`src/audio/synth.ts`) for rådyrets bjæf (`deer_bark`) og fasanens skrig (`pheasant_call`),
  plus et blødt "blip" som reserve, hvis en effektfil ikke kan indlæses.
- Mute: tasten M og afkrydsning i indstillinger, huskes i gemmefilen.
- Lytteside: Indstillinger → "Lyt til alle lyde", eller `?lyd` i adressen. Hver variant kan afspilles, og "Afspil alle"
  spiller hele listen med navn. Skærmbillede: `polish/latest/soundboard.png`.
- Verificeret i headless Chromium: 180 buffere (177 filer + 3 genererede), 85 hændelser, ingen konsolfejl.
