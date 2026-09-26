# DON'T DIE

Et one-tap arcade-spil i neon. Du er en lyskugle, der suser gennem en korridor, som drejer i en spiral. Hvert tryk drejer dig 90° med uret. Rammer du væggen, en savklinge eller en bombe, er det slut.

Spillet åbner i en hovedmenu med **PLAY** (level-kortet), **SURVIVAL** og **SKINS**. Der er **20 levels i 4 verdener**. Hver verden introducerer én ny ting:

| Verden | Farve | Nyt |
|---|---|---|
| 1 · Basics | Cyan | Kun sving |
| 2 · Saws | Orange | Savklinger |
| 3 · Bombs | Magenta | Bomber og smallere korridor |
| 4 · Chaos | Rød | Alt, hurtigt og i bevægelse |

Hvert level har en fast bane, som er ens hver gang, så man kan lære den. Et level giver 1–3 stjerner: 1 for at nå målet, 2 hvis halvdelen af svingene var PERFECT, og 3 ved 90 %. Levels låses op ét ad gangen.

Vil man hellere bare køre, er **SURVIVAL** altid åben: en uendelig bane, der bliver hurtigere og hurtigere, med rekord for længste distance.

### Warp-stjernen

I hvert level er der gemt en lillebitte, regnbuefarvet stjerne et stykke inde på banen. Den står ude ved den ene væg, så man skal dreje tidligt eller sent med vilje for at ramme den. Rammer du den, bliver du sendt til **Universe 2** resten af turen:

- banen bliver dobbelt så lang
- baggrunden bliver en psykedelisk regnbue-spiral, og en discokugle hænger på himlen
- kuglen får googly eyes og festhat
- saw blades og bomber bliver skiftet ud med gummiænder, som du kan vælte (QUACK)
- en pizza med solbriller flyver forbi på en regnbue, og der dukker skøre beskeder op
- musikken skifter toneart og tempo

Levels, hvor du har fundet stjernen, får en lille guldstjerne i hjørnet på level-kortet. Logikken ligger i `Track.placeWarpStar`, `course.enterWarp` og `GameScene.warp`.

### Skins og DUCK-O-MATIC

Ænderne, du vælter i Universe 2, bliver til valuta, når du **gennemfører** banen. Dør du, er de tabt. Under **SKINS** i hovedmenuen står spillemaskinen DUCK-O-MATIC: ét træk koster 50 ænder (cirka to warp-baner), og hjulene lander på et tilfældigt skin. Får du et, du allerede har, får du 5 ænder tilbage.

| Sjældenhed | Chance | Skins |
|---|---|---|
| Common | 65 % | Classic, Mint, Bubblegum, Lemon, Grape, Tangerine, Frosty, Blush, Moon, Potato |
| Rare | 25 % | Kitty, Froggy, Panda, Beach Ball, Donut, Soccer, Eyeball |
| Epic | 8 % | Lava, Galaxy, Cyber Eye, Pizza Pal |
| Legendary | 2 % | Golden Crown, Black Hole, Duck King |

Skins er data i `src/game/skins.ts` (navn, sjældenhed, glød og spor), og hvert skin tegnes i `src/fx/skinTextures.ts`. Et nyt skin kræver én linje i listen og én tegnefunktion.

### I baggrunden

Langt ude i rummet sker der ting: stjerneskud (en sjælden gang en hel regn af dem), en planet med ringe, en UFO der stopper op og lyser med sin traktorstråle, en astronaut der tumler forbi og siger hej, og en sjælden gang en neon-hval. Alt det styres af `src/fx/BackgroundEvents.ts`.

### Hemmeligheder (spoiler)

- Konami-koden på tastaturet (↑ ↑ ↓ ↓ ← → ← → B A) giver et regnbue-spor. På mobilen: tryk 10 gange hurtigt på "SELECT LEVEL".
- SURVIVAL har et par beskeder gemt ved særlige distancer.

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
│   ├── BootScene.ts      Laver teksturerne og starter de andre scener
│   ├── GameScene.ts      Verdenen: regler, bevægelse, kollisioner og kamera
│   └── UIScene.ts        Skifter mellem skærmene og styrer tryk
├── ui/
│   ├── LevelSelect.ts    Level-kortet (hovedmenuen ligger i UIScene)
│   ├── SkinShop.ts       SKINS: spillemaskinen DUCK-O-MATIC og samlingen
│   ├── ClearScreen.ts    "LEVEL CLEAR" med stjerner
│   └── widgets.ts        Knapper, tekst og stjerner, der genbruges
├── game/                 Ren logik og data, ingen grafik
│   ├── levels.ts         ⭐ Alle 20 levels som data: mål, fart, bredde, forhindringer
│   ├── course.ts         Reglerne for én runde (et level eller SURVIVAL)
│   ├── Track.ts          Banen: spiral-segmenter, porte, forhindringer og mållinje
│   ├── rng.ts            Tilfældige tal med fast frø, så et level altid er ens
│   ├── skins.ts          ⭐ Alle 24 skins og chancerne for hver sjældenhed
│   ├── tuning.ts         ⭐ Tallene for SURVIVAL
│   ├── palette.ts        ⭐ Farver og skrifttyper
│   ├── storage.ts        Rekord og indstillinger (gemmes i browseren)
│   ├── shared.ts         Beskeder og data, der sendes mellem scenerne
│   └── display.ts        Skærmstørrelse og pixeltæthed
├── fx/                   Alt det visuelle
│   ├── textures.ts       Tegner alle billeder i kode ved opstart (ingen billedfiler)
│   ├── backgroundShader.ts  GLSL-shaderen til baggrunden
│   ├── Backdrop.ts       Lægger shaderen bag verdenen
│   ├── CorridorView.ts   Tegner korridoren med neon-kanter
│   ├── PlayerView.ts     Kuglen: glød, ring og partikel-spor
│   ├── HazardView.ts     Savklinger og bomber
│   ├── BackgroundEvents.ts  Stjerneskud, planet, UFO, astronaut, hval (og festen i Universe 2)
│   ├── WarpStarView.ts   Den gemte warp-stjerne
│   ├── skinTextures.ts   Tegner alle 24 skins
│   └── Effects.ts        Eksplosioner, chokbølger og svævende tekst
└── audio/
    ├── Sfx.ts            Lydeffekter, der syntetiseres live (ingen lydfiler)
    └── Music.ts          Baggrundsmusik i A-mol, genereret live (rolig i menuer, med trommer når man spiller)
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
- **Ny lyd:** `src/audio/Sfx.ts`. Hvert sving spiller en tone fra en skala, der passer til musikken, så en række sving bliver til en lille melodi.
- **Musikken:** `src/audio/Music.ts`. `CHORDS` er akkordrækken, `BPM` tempoet og `VOLUME` lydstyrken. Trommer og bas ligger i `playStep`.

Mens `npm run dev` kører, opdateres spillet i browseren, hver gang du gemmer en fil.

## Test i browseren

Spillet lægger sig på `window.game`, så du kan kigge ind i det fra browserens konsol:

```js
game.scene.getScene('Game').debugState()   // spillerens position, meter, combo …
```

## Idéer til næste skridt

- **Musik:** et synthwave-loop, der bygger op med farten
- **Installérbar app (PWA):** så spillet kan lægges på telefonens hjemmeskærm og virke offline
- **Online-leaderboard**
- **Flere forhindrings-typer**, fx laserbarrierer der tænder og slukker
- **Håndlavede baner** til udvalgte levels i stedet for genererede
- **Udgivelse via GitHub Pages**, så spillet har en fast adresse
