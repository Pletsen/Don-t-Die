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

## Iteration 2 – Grafik: kvalitetsniveauer, FPS-måler og automatisk valg
- Nyt niveau **Ultra** (pixel ratio op til 2, 4096 skyggekort, 25 % mere vegetation, 15 % længere sigt) ud over Lav/Mellem/Høj.
- **Automatisk**: efter 7 s spil sænkes kvaliteten ét trin, hvis gennemsnittet er under 45 fps (aldrig under Lav),
  med en besked på skærmen. Kan slås fra i indstillinger. Kører kun i en rigtig browser (ikke i test med software-rendering).
- **Vis FPS** i indstillinger: fps, frametid, værste frame, kvalitet og draw calls for hele framen
  (`renderer.info.autoReset=false`, nulstilles pr. frame, så tallet dækker skygge + scene + efterbehandling).
- Verificeret: indstillinger → Ultra + Vis FPS → bane 1 viser måleren (SwiftShader: 1 fps, som forventet i containeren).

## Iteration 3 – Fejl fra grafik-audit (1.1–1.5) + dødskamera
- 1.1 Hjælpebokse venter nu, til start-toasten er væk (ingen overlap). Toasten fik en mørk "pille" bag teksten for kontrast.
- 1.2 Første hjælp ("spænd buen") kører via `delayed` (tikker kun under spil) i stedet for `setTimeout`, så den ikke dukker op over pause/hulen.
- 1.3 Græs, bregner, buske, blomster og svampe har hver sin tilfældighedsstrøm (`Rng(seed*7+k*101)`), så kvalitetsindstillingen ikke længere flytter planterne.
- 1.4 Dødskamera: HUD skjules ved død; kameraets kran sænket fra 4 m til 2,4 m (under trækronerne).
  Det hvide skær viste sig at være **lanternen**, der blev hængende i bæltehøjde, når jægeren faldt, og blev til en stor bloom-firkant.
  Nu falder lanternen til jorden, og kernen er dæmpet fra 2,2 til 1,5. Før: `polish/latest/death-before.png`, efter: `polish/latest/death-night-after.png`.
- 1.5 Menuens "Styring" kan foldes sammen (åben for nye spillere), slidere og afkrydsninger i guld (`accent-color`).
- Verificeret: tsc ren, dødssekvens på bane 1 og 24 i headless Chromium, ingen konsolfejl.
