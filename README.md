# DON'T DIE

Et one-tap arcade-spil i neon. Du er en lyskugle, der suser gennem en korridor, som drejer i en spiral. Hvert tryk drejer dig 90° med uret. Rammer du væggen, en savklinge eller en bombe, er det slut.

## Sådan er spillet bygget op

**Hovedmenuen** viser en demo: spillet spiller sig selv bag logoet, mens knapperne sidder på en mørk "dock" nederst:

- **PLAY · LEVEL n** starter direkte det næste level, du ikke har klaret.
- **LEVELS** åbner level-kortet, **SURVIVAL** er den uendelige bane, **SKINS** er spillemaskinen DUCK-O-MATIC, og **DAILY** er dagens udfordringer (en guldprik betyder, at noget venter).
- Ikoner øverst: **?** (HOW TO PLAY), **pokal** (RECORDS) og til højre **musik**, **lyd** og **effekter**. Musik og lydeffekter slås fra hver for sig og huskes (`dontdie_music` og `dontdie_sound`). Havde man slået al lyd fra i en ældre version, starter begge slukket.

Første gang man spiller, lærer level 1 én at styre: de første tre sving går i slowmotion med en pulserende "TAP!"-ring, og et tryk der kommer for tidligt bliver ignoreret ("WAIT…") i stedet for at slå én ihjel. Korte tip-kort dukker op én gang, lige før det bliver relevant (PERFECT før level 2, super power før level 3, ænder før level 4, forhindringer før level 6). HOW TO PLAY med 7 animerede kort ligger altid bag ?-knappen (`src/ui/HowToPlay.ts`).

Under en tur er der en **pause-knap** øverst. Pausen har RESUME, RETRY, MENU, musik, lyd og effekter, og man kommer tilbage via en 3-2-1-nedtælling. Forlader man appen, sættes spillet automatisk på pause.

### Levels

Der er **20 levels i 4 verdener**, og hver verden introducerer én ny ting:

| Verden | Farve | Nyt |
|---|---|---|
| 1 · Basics | Cyan | Kun sving |
| 2 · Saws | Orange | Savklinger |
| 3 · Bombs | Violet | Bomber, der lader op og eksploderer, og en smallere korridor |
| 4 · Chaos | Karmin | Alt, hurtigt og i bevægelse |

Hvert level har en fast bane, så man kan lære den. Et level giver 1–3 stjerner: 1 for at nå målet, 2 hvis 60 % af svingene var PERFECT, og 3 ved 80 %. Levels låses op ét ad gangen.

**HARD MODE** åbner, når level 20 er klaret: alle 20 levels i en ny udgave (egen bane, cirka 14 % hurtigere, 10 % smallere og 10 % længere, flere og mere bevægelige forhindringer, og save allerede i verden 1). Faneblade NORMAL/HARD øverst i LEVELS. Indtil level 20 er klaret, står HARD-fanen gråt med en lås som en smagsprøve: et tryk får den til at ryste, og en besked siger CLEAR LEVEL 20 TO UNLOCK HARD MODE. Stjernerne tæller for sig ("HARD 3" i HUD'en), første gennemførsel og nye stjerner giver dobbelt så mange ænder, og der er 25 % flere ænder på banerne. Med bot-tests klarer en gennemsnitlig spiller 57 % → 0 % hen over HARD 11–20, en ekspert 43–100 %.

Sværhedsgraden er justeret med bot-playtests (en bot med en "nybegynder", en "gennemsnitlig" og en "ekspert"-profil har spillet flere tusind ture). En gennemsnitlig spiller klarer cirka 97 % af forsøgene på level 6 og 40–60 % i verden 3–4, med lidt luft i starten af hver ny verden:

- Forhindringer kommer først efter 60 m i et level og bliver gradvist tættere.
- Afstanden fra et sving til første forhindring vokser med farten, så der altid er tid til at reagere.
- En bevægelig forhindring får aldrig en makker på samme stræk, så banen aldrig lukker helt.
- **Fairness-regel:** efter et sving kan man ikke styre, så der er altid et stykke af sporet, som ingen forhindring kan nå, uanset hvor de bevægelige save er. Det er mindst 0,24/0,20/0,17/0,15 sekunders tryk-vindue i verden 1/2/3/4. Ellers fjernes den anden forhindring, de bevægelige svinger mindre, eller forhindringen rykkes ind mod væggen.
- Saws og bomber rammer lidt inden for deres tegnede kant.

**Bomber** lader op (de svulmer, gløder og ringen strammer sig) og eksploderer så kort til næsten den dobbelte radius hvert 2,6 sekund. Man skal time sit sving, ikke bare undgå dem.

Dør du, fortæller resultatkortet hvor langt du nåede (i procent), om du drejede **for tidligt** eller **for sent**, og hvad din bedste tur på levelet var. De første dødsfald har et lille tip.

### Survival

En uendelig bane, der bliver hurtigere og hurtigere. Forhindringerne starter ved 80 m. Fra 200 m og derefter hver 400 m kommer en **zone** på 200 m i tilfældig rækkefølge:

| Zone | Hvad sker der |
|---|---|
| SAW ALLEY | savklinger, savklinger, savklinger |
| BOMB FIELD | bomber overalt |
| NARROWS | væggene kommer tættere på |
| SPEEDWAY | lange stræk, fuld fart |
| DUCK POND | ænder i Survival: dem beholder du |
| CALM | et pusterum |

Slår du din rekord midt i en tur, siger spillet det med det samme (**NEW RECORD!**). Survival giver også 1 and pr. 200 m.

### Dagligt: DAILY

- **Daily Run:** samme bane for alle i dag, med et twist efter ugedagen (CLASSIC, SAW STORM, TIGHTROPE, DUCK HUNT, FAST LANE, BOMB PARTY, UNIVERSE 2). Når du når 250/600/1000 m, får du +5/+10/+15 ænder, én gang om dagen.
- **Dagens gæst (TODAY'S GUEST):** hver dag låner du ét skin, du ikke har endnu. Det vælges ud fra datoen blandt dem, du mangler (har du dem alle, kan det være hvilket som helst), og ligger så fast resten af dagen. DAILY-skærmen viser det med navn og super power, og Daily Run spilles med det, evnen inklusive. Dit eget skin bliver ikke skiftet. Efter turen har resultatkortet et lille link, "LIKE FROGGY? SPIN THE DUCK-O-MATIC", der går direkte til spillemaskinen (`src/game/guest.ts`).
- **3 daglige missioner** (let/medium/svær, +5/+10/+15, +10 for alle tre) fra en pulje på 26. Én kan skiftes ud om dagen.
- **Streak:** kom igen hver dag for 5, 5, 10, 10, 15, 15 ænder og et gratis spin på dag 7. Ét "skjold" redder en glemt dag.

Det hele ligger i `src/game/progress.ts`, `missions.ts`, `daily.ts` og `achievements.ts` og gemmes i ét versioneret save (`dontdie_progress_v1`).

### Rekorder og achievements: RECORDS

Livstidsstatistik, top 5 i Survival, bedste % pr. level og **35 achievements** (inklusive HARD BOILED og UNBREAKABLE for HARD MODE) med små ænde-belønninger. Bannere glider ned fra toppen, når du klarer en mission, låser en achievement op eller får et gratis spin. Under en tur vises kun en ny rekord og daglige milepæle (små, og et tryk drejer stadig kuglen); resten venter, til turen er slut, og flere belønninger på én gang samles i ét banner ("3 REWARDS").

### Warp-stjernen og Universe 2

Fra level 3 er der gemt en lillebitte regnbuestjerne sent på banen (65–80 % af vejen), ude ved den ene væg, så den er en belønning for at nå langt og ikke en genvej forbi det svære. Rammer du den, bliver du sendt til **Universe 2** resten af turen: festen varer en halv bane mere, baggrunden en psykedelisk regnbue-spiral med discokugle, en lille discokugle-måne kredser om din kugle (selve skinnet er urørt), forhindringerne bliver til gummiænder, og musikken skifter toneart. Fra verden 2 er der dog en enkelt sav hist og her (10/22/32 % af strækkene i verden 2/3/4).

### Tre slags ænder (med rigtige "rap"-lyde)

| And | Chance | Værdi | Hvad sker der |
|---|---|---|---|
| Gul | resten | 1 | Vipper på vandet |
| Rød (med svedbånd) | 10 % | 5 | Løber frem og tilbage. Misser du den, stikker den af (TOO SLOW!) og venter længere fremme |
| Gylden med krone | 0,5 %, højst én pr. tur | op til 70 | **DUCK FRENZY**: verden fryser, og hvert tryk i 8 sekunder er én and |

Fra level 4 ligger der også ænder på de almindelige baner, flere jo sværere verdenen er (cirka 6 på level 8, 15–20 på level 18–20). På stræk uden forhindringer ligger de ude i siden, så en and koster dig PERFECT-linjen. På stræk med forhindringer ligger de i det sikre spor. Dør du i et level, beholder du halvdelen af ænderne.

Lydene er rigtige optagelser af ænder (CC0, se `public/sfx/CREDITS.md`).

### Skins og DUCK-O-MATIC

Ænder er valuta, og de fleste samler du selv på banen; første gennemførsel og nye stjerner giver lidt ekstra (2–6 og 2 pr. stjerne). Ét træk i DUCK-O-MATIC koster 100 ænder (eller et gratis spin fra streaks og "Star Road": 20/40/60 stjerner). Spillemaskinen er fair:

- Du får ikke det samme skin igen, før du har alle af den sjældenhed. Derefter giver dubletter 10/20/40/70 ænder tilbage.
- Pity: mindst epic inden for 15 spin, legendary inden for 60. Tælleren står på maskinen.

| Sjældenhed | Chance | Skins |
|---|---|---|
| Common | 65 % | Classic, Mint Chip, Bubblegum, Lemon, Grape, Tangerine, Frosty, Blush, Moon, Potato, Watermelon, Cookie |
| Rare | 25 % | Kitty, Froggy, Panda, Beach Ball, Donut, Soccer, Eyeball, Busy Bee, Disco Ball, Boo |
| Epic | 8 % | Lava, Galaxy, Cyber Eye, Pizza Pal, Plasma, Fishbowl |
| Legendary | 2 % | Golden Crown, Black Hole, Duck King, Phoenix |

Skins er data i `src/game/skins.ts`, og hvert skin tegnes i `src/fx/skinTextures.ts`. Spillemaskinen ligger i `src/ui/SkinShop.ts` og reglerne i `src/game/gacha.ts`.

### Super power (skin-evner)

**Tryk 4 gange hurtigt.** Hvert tryk drejer 90°, så du laver et lille loop, og så tænder skinnets evne i 10 sekunder: et skråt bånd med skinnets ansigt og evnens navn fejer over skærmen. Du kommer altid ud af loopet med retning langs banen, også hvis det startede i et sving. Den kan bruges én gang pr. level og låses op fra level 3 (level 1–2 lærer det basale). I Survival lades den op 500 m og 30 sekunder efter, at den sluttede.

- **Common:** FOCUS, COOL HEAD, BUBBLE, SQUEEZE, GRAPEVINE, ZEST RUSH, DEEP FREEZE, SO SHY, ORBIT, COUCH POTATO, THICK RIND, CRUMBS
- **Rare:** NINE LIVES, TONGUE, BAMBOO BITE, BOUNCY, SUGAR RUSH, KICKOFF, THIRD EYE, HONEY RUSH, DANCE FLOOR, SPOOKY
- **Epic:** MELTDOWN, HYPERDRIVE, TARGET LOCK, PIZZA PARTY, TESLA STORM, TIDAL WAVE
- **Legendary:** ROYAL DECREE, EVENT HORIZON, QUACK ARMY, REBIRTH

Evnerne er opskrifter af små byggeklodser i `src/game/abilities.ts`.

### Hemmeligheder (spoiler)

- Konami-koden på tastaturet (↑ ↑ ↓ ↓ ← → ← → B A) giver et regnbue-spor. På mobilen: tryk 10 gange hurtigt på "LEVELS"-overskriften.
- SURVIVAL har et par beskeder gemt ved særlige distancer.

### Ydelse og skarphed

Spillet tegner i skærmens fulde pixeltæthed (op til 3x). Kan en telefon ikke følge med, går den ned ad en "kvalitetsstige": først lettere bloom, så ingen glød og baggrundsprikker, og først til sidst lavere opløsning (aldrig under 2x). Efter en glat tur prøver den et trin op igen (`src/game/display.ts`). Glød er "bagt" ind i billeder én gang ved opstart i stedet for at køre som dyre GPU-filtre (`src/fx/glow.ts`), og tal, der ændrer sig hele tiden (HUD, frenzy, score), bruger en glødende bitmap-font, så de er gratis at opdatere (`src/ui/glowFont.ts`).

Spillet er bygget med spil-enginen **[Phaser 4](https://phaser.io)**, skrevet i **TypeScript** og samlet med **Vite**.

## Kom i gang

Du skal have [Node.js](https://nodejs.org) installeret (version 20 eller nyere).

```bash
npm install      # henter Phaser, Vite og TypeScript (kun første gang)
npm run dev      # starter spillet på http://localhost:5173 og genindlæser ved hver ændring
npm run build    # tjekker typerne og bygger en færdig version i mappen dist/
npm run preview  # kører den færdige version lokalt
```

`npm run dev` viser også en netværksadresse, fx `http://192.168.1.20:5173`. Åbn den på din telefon (på samme wifi), så kan du spille, mens du retter i koden.

## Hvad er en spil-engine, og hvorfor Phaser?

Den første version (`legacy/dont-die-v0.html`) tegnede alt selv med browserens Canvas-API. Det virker, men man skal selv skrive alt: tegning, animation, partikler, kamera, input og lyd.

En spil-engine giver dig byggeklodserne færdige, så du kan bruge tiden på selve spillet:

| Byggeklods | Hvad vi bruger den til |
|---|---|
| **WebGL-renderer** | Tegner på grafikkortet i stedet for processoren. Det er det, der gør effekter som glød og bloom mulige i 60 fps. |
| **Scener** | Deler spillet op i lag: selve verdenen og HUD/menuer ovenpå. |
| **Kamera** | Følger spilleren, zoomer, ryster ved død og blinker. |
| **Filtre** (post-processing) | *Bloom* får lyse ting til at gløde som neon. *Color matrix* dræner farven ud af verden, når du dør. |
| **Partikler** | Sporet efter kuglen, gnister og eksplosioner. |
| **Tweens** | Bløde animationer: tal, der tæller op, tekst, der popper ind, og ringe, der udvider sig. |
| **Shaders** | Små programmer, der kører direkte på grafikkortet. Baggrundens tåge, stjerner og gitter er én shader. |

Phaser er valgt, fordi det er den mest udbredte 2D-engine til browserspil. Det er gratis og open source, og spillet kører i enhver browser: på mobilen, på computeren og som app.

## Sådan hænger koden sammen

```
src/
├── main.ts               Starter Phaser og gør grafikken skarp på retina/mobil
├── scenes/
│   ├── BootScene.ts      Laver teksturer og glødende bitmap-fonte og starter de andre scener
│   ├── GameScene.ts      Verdenen: regler, bevægelse, kollisioner, kamera, demo, pause
│   └── UIScene.ts        Menuen, HUD, pause, resultatkort og skift mellem skærmene
├── ui/
│   ├── LevelSelect.ts    Level-kortet
│   ├── SkinShop.ts       SKINS: spillemaskinen DUCK-O-MATIC og samlingen (+ shopTextures, shopSfx)
│   ├── ClearScreen.ts    "LEVEL CLEAR" med guldstjerner og ænder der flyver ind
│   ├── DailyScreen.ts    DAILY: dagens tur, streak og missioner
│   ├── RecordsScreen.ts  RECORDS: statistik og achievements
│   ├── NotifyBanner.ts   Bannere, der glider ned fra toppen
│   ├── HowToPlay.ts      HOW TO PLAY: kort med små animationer (også som enkelte tip-kort)
│   ├── icons.ts          Linje-ikoner tegnet i kode (pause, retry, hjem, lås …)
│   ├── glowFont.ts       Glødende bitmap-fonte til tal, der ændrer sig hele tiden
│   └── widgets.ts        Knapper, tekst og stjerner, der genbruges
├── game/                 Ren logik og data, ingen grafik
│   ├── levels.ts         ⭐ Alle 20 levels som data: mål, fart, bredde, forhindringer
│   ├── course.ts         Reglerne for én runde (level, SURVIVAL med zoner, Daily Run)
│   ├── Track.ts          Banen: spiral-segmenter, porte, forhindringer og mållinje
│   ├── rng.ts            Tilfældige tal med fast frø, så et level altid er ens
│   ├── skins.ts          ⭐ Alle 32 skins og chancerne for hver sjældenhed
│   ├── gacha.ts          Fair spillemaskine: ingen dubletter for tidligt, pity
│   ├── abilities.ts      ⭐ Hvert skins særlige evne
│   ├── progress.ts       Statistik, rekorder, belønninger og bannere
│   ├── missions.ts       ⭐ De daglige missioner
│   ├── achievements.ts   ⭐ De 33 achievements
│   ├── daily.ts          ⭐ Daily Run (ugedags-twists) og streak
│   ├── guest.ts          Dagens gæste-skin til Daily Run
│   ├── tuning.ts         ⭐ Tallene for SURVIVAL og zonerne
│   ├── palette.ts        ⭐ Farver og skrifttyper
│   ├── storage.ts        Rekord, ænder og indstillinger (gemmes i browseren)
│   ├── persist.ts        Små hjælpere til at gemme i browseren
│   ├── shared.ts         Beskeder og data, der sendes mellem scenerne
│   └── display.ts        Skærmstørrelse, pixeltæthed og kvalitetsstigen
├── fx/                   Alt det visuelle
│   ├── textures.ts       Tegner alle billeder i kode ved opstart (ingen billedfiler)
│   ├── glow.ts           "Bagt" glød rundt om figurer (billig i stedet for GPU-filtre)
│   ├── backgroundShader.ts  GLSL-shaderen til baggrunden (en himmel pr. verden)
│   ├── Backdrop.ts       Lægger shaderen bag verdenen
│   ├── CorridorView.ts   Tegner korridoren med neon-kanter
│   ├── PlayerView.ts     Kuglen: glød, ring og partikel-spor
│   ├── HazardView.ts     Savklinger, bomber og ænder (gule, røde og gyldne)
│   ├── BackgroundEvents.ts  Stjerneskud, planet, UFO, astronaut, hval (og festen i Universe 2)
│   ├── Ambient.ts        Svage lysprikker, der driver i baggrunden
│   ├── WarpStarView.ts   Den gemte warp-stjerne
│   ├── skinTextures.ts   Tegner alle 32 skins
│   └── Effects.ts        Eksplosioner, chokbølger og svævende tekst
└── audio/
    ├── Sfx.ts            Lydeffekter, syntetiseret live + rigtige andelyde
    ├── samples.ts        Indlæser og afspiller lydfilerne i public/sfx
    └── Music.ts          Baggrundsmusik genereret live: én sang pr. verden (rolig i menuer, med trommer når man spiller)
```

**Grundidé:** Logik og grafik er holdt adskilt. `Track.ts` ved kun, hvor banen er (rektangler og tal). `CorridorView.ts` ved kun, hvordan den skal se ud. Derfor kan du ændre udseendet uden at ødelægge reglerne, og omvendt.

### Spil-løkken

Phaser kalder `update()` i hver scene cirka 60 gange i sekundet. I `GameScene.update()` sker det her:

1. **Flyt** spilleren frem ud fra hastighed × tid (`step()`).
2. **Tjek** om spilleren stadig er inde i korridoren og ikke rører en forhindring.
3. **Tegn** korridoren, spilleren og forhindringerne de nye steder.
4. **Flyt kameraet** blødt efter spilleren, med lidt forspring i kørselsretningen.

Et tryk sendes fra `UIScene` til `GameScene` som en besked (`EV.tap`), som `GameScene` så reagerer på.

## Ting, du selv kan prøve at ændre

- **Lav eller ret et level:** Åbn `src/game/levels.ts`. Hvert level er én linje. Du kan fx ændre `goal` (meter til målet), `speed` (fart ved start og slut), `width` (korridorens halve bredde) og `hazards` (hvor mange forhindringer og hvilke). `placement: 'center'` sætter forhindringerne midt på vejen, så man ikke kan klare dem med perfekte sving alene.
- **Gør SURVIVAL nemmere eller sværere:** Åbn `src/game/tuning.ts`. `speedAt` styrer farten, `corridorHalfWidthAt` bredden og `hazardChanceAt` hvor mange forhindringer der kommer.
- **Skift farver:** `src/game/palette.ts`. Sektor-farverne (cyan, orange, magenta, rød) ligger i `tuning.ts`.
- **Mere eller mindre glød:** I `GameScene.setupCamera()` styrer `threshold` hvor lyst noget skal være for at gløde, og `blendAmount` hvor kraftigt det gløder.
- **Ny lyd:** `src/audio/Sfx.ts`. Alle lydeffekter (også de optagede ænder) går gennem `sfx.master`, som LYD-knappen skruer ned til 0; musikken har sin egen kanal i `Music.ts`, som MUSIK-knappen slukker. Hvert sving spiller en tone fra en skala, der passer til musikken, så en række sving bliver til en lille melodi.
- **Musikken:** `src/audio/Music.ts`. `SONGS` har én sang pr. verden (A-mol 108 BPM, D-mol 114, E-mol 118, F#-mol 124) med akkorder og to arpeggio-mønstre. Hver sang kører en form på 32 takter (A, A med løftet arpeggio, B med åben hi-hat, breakdown uden trommer), med et clap-fill hver 8. takt. `VOLUME` er lydstyrken; trommer og bas ligger i `playStep`.

Mens `npm run dev` kører, opdateres spillet i browseren, hver gang du gemmer en fil.

## Test i browseren

Spillet lægger sig på `window.game`, så du kan kigge ind i det fra browserens konsol:

```js
game.scene.getScene('Game').debugState()   // spillerens position, meter, combo …
```

## Idéer til næste skridt

- **iPhone-app:** Capacitor-projektet og en cloud-build (uden Mac) er forberedt på en sidebranch, men venter, til spillet er helt færdigt.
- **Game Center:** leaderboards (også for Daily Run) og achievements.
- **"Din linje":** når turen slutter, zoomer kameraet ud og viser hele turen som en neon-spiral, som man kan dele.
- **Level-kortet som en spiral**, hvor kuglen kører hen til det næste level.
- **Et spøgelse af din bedste tur** i levels og Daily Run.
- **Flere forhindrings-typer**, fx laserbarrierer der tænder og slukker, og en verden 5 (spejlvendt).
- **Indtjening senere:** valgfrie reklamer ("se en reklame for dobbelt ænder") eller et "Supporter"-køb. Krogene findes allerede i `progress.ts`.
