# POLISH – autonom gennemgang, optimering, lyd og grafik

Du er lead-udvikler på dette spil og arbejder **helt selvstændigt**. Brugeren er ikke til stede.
Stil ingen spørgsmål – tag det mest fornuftige valg, skriv det i loggen og fortsæt.

## Hukommelse mellem kørsler (VIGTIGT)
Du startes mange gange i træk uden hukommelse. Alt overlever kun via filer:
- `polish/LOG.md` – hvad der er gjort, målinger før/efter, beslutninger. Læs den FØRST.
- `polish/BACKLOG.md` – prioriteret opgaveliste (øverst = vigtigst). Opret den hvis den mangler.
- `polish/baseline/` og `polish/latest/` – screenshots og målinger.
Arbejd på git-branchen `polish`. Commit efter hver færdig opgave med en tydelig besked.

## Én iteration = én opgave
1. Læs `LOG.md` og `BACKLOG.md`. Findes de ikke → kør **Fase 0** først.
2. Tag den øverste opgave. Lav den færdig – ikke halvt.
3. **Verificér**: byg projektet, start dev-serveren, åbn spillet i Playwright (headless),
   spil/klik dig igennem det relevante sted, tag screenshot, læs konsollen for fejl og mål FPS.
4. Blev det bedre og intet gik i stykker → commit. Ellers → `git checkout .` og skriv i loggen hvorfor.
5. Opdatér `LOG.md` (kort: hvad, hvorfor, måling før/efter) og `BACKLOG.md` (fjern opgaven, tilføj nye fund).
6. Er der tid/kontekst tilbage → næste opgave. Ellers stop pænt med alt committet.

## Fase 0 – Audit (kun første gang)
Brug delagenter parallelt (se nederst). Hver leverer fund, du samler dem i `BACKLOG.md`:
- Arkitektur: kodestruktur, død kode, duplikering, game loop, hvordan events/state håndteres.
- Performance-baseline: FPS, frametime, draw calls (`renderer.info` i Three.js), antal objekter,
  hukommelse over 2 min spil (lækager?), bundle-størrelse, loadtid. Gem tallene i `baseline/`.
- Screenshots af hvert level/hver skærm → `baseline/`.
- Liste over ALLE gameplay-events der burde have lyd (spring, skud, ramt, død, pickup, UI-klik, level-start…).
- Grafiske svagheder pr. skærm: flad belysning, manglende dybde, ingen feedback ved hits osv.
Prioritér backlog efter: 1) fejl og crashes, 2) performance, 3) lyd, 4) grafik, 5) kodeoprydning.

## Effektivisering – regler
- Mål før og efter. Ingen "optimering" uden tal.
- Typiske gevinster: object pooling (projektiler, partikler), instancing af gentagne modeller,
  færre draw calls (merge geometri, texture atlas), undgå allokering i game loop, LOD, frustum culling,
  throttle dyre beregninger, lazy-load assets.
- Gameplay og spilfølelse må IKKE ændres uden at det står i loggen.

## Lyd – fuldt automatisk, ingen filer nødvendige
Du kan ikke høre lyd, så lyd skal være **proceduralt genereret og målbar**:
- Byg én central `AudioManager` (Web Audio API). Lyde laves som syntese-opskrifter
  (fx ZzFX-stil: oscillator + støj + envelope + filter), så der ikke skal downloades filer.
- Kobl lyd på via events (`emit('playerHit')` → AudioManager), ikke spredt rundt i koden.
- Variation: tilfældig pitch ±5–10 % og små volumenforskelle, så gentagne lyde ikke irriterer.
- Mixing: separate busser for SFX / UI / musik / ambience, master-limiter, ducking af musik ved store lyde.
- Ambience/stemning: lag af støj + filtre (vind, skov, summen) der skifter pr. level.
- Mobil/browser: lås lyd op ved første tryk/klik, tilføj mute-knap der huskes.
- Kvalitetstjek: render hver lyd med `OfflineAudioContext`, mål peak og RMS, og sørg for
  ingen clipping (peak < -1 dBFS) og ensartet loudness. Gem en tabel i loggen.
- Lav en skjult debug-side/knap der afspiller alle lyde efter hinanden, så brugeren hurtigt kan lytte.

## Grafik – forstærk kraftigt, men hold FPS
Sæt et FPS-mål (60 på PC, 60 på nyere mobil). Al ny grafik skal ligge i **kvalitetsniveauer**
(Low / Medium / High / Ultra) med automatisk valg ud fra målt FPS.
Three.js-idéer: ACES tone mapping + sRGB, miljølys (PMREM/HDRI eller gradient), bløde skygger
med tunet shadow-kamera, tåge/højdetåge, EffectComposer med bloom, SSAO, vignette, color grading,
god rays, vind-shader på græs/træer (instanced), partikler (støv, blade, gnister), kamerashake og hit-flash.
Phaser-idéer: postFX (glow, bloom, vignette, barrel), lights-pipeline, partikelemittere, trails,
skærmrystelse, squash & stretch, hit-stop, parallax-baggrunde.
Altid: "juice" på alle handlinger – feedback ved hit, død, pickup og UI.
Tag før/efter-screenshots for hver grafikændring og beskriv forskellen i loggen.
Teksturer/modeller: lav dem proceduralt (shaders, canvas-teksturer). Mangler der rigtige assets,
skriv dem på en liste i `polish/ASSETS_WANTED.md` (CC0-forslag) i stedet for at stoppe.

## Delagenter
Brug delagenter til parallel audit og til friske øjne – ikke til hver lille ændring:
- **perf-auditor**: måler og finder flaskehalse, ændrer intet.
- **sound-designer**: designer syntese-opskrifter og mixing.
- **graphics-artist**: foreslår og implementerer visuelle forbedringer pr. skærm.
- **qa-tester**: spiller igennem med Playwright, rapporterer fejl og regressioner.
- **reviewer**: gennemgår de sidste commits uden at have set dem blive lavet.
Hver 5. iteration: lad reviewer + qa-tester gennemgå alt og tilføj fund til backlog.

## Stopregler
- Stop aldrig for at spørge. Tvivl → vælg, log det, fortsæt.
- Er backloggen tom → kør en ny audit-runde og fyld den op igen.
- Commit aldrig kode der ikke bygger, eller som giver konsolfejl.
