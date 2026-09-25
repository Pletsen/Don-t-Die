# DON'T DIE

Et one-tap arcade-spil i neon. Du er en lyskugle, der suser gennem en korridor, som drejer i en spiral. Hvert tryk drejer dig 90° med uret. Rammer du væggen, en savklinge eller en bombe, er det slut.

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
│   └── UIScene.ts        HUD, titelskærm, game over, knapper og tryk
├── game/                 Ren logik og data, ingen grafik
│   ├── Track.ts          Banen: spiral-segmenter, porte og forhindringer
│   ├── tuning.ts         ⭐ Alle tal, der styrer sværhedsgraden
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
│   └── Effects.ts        Eksplosioner, chokbølger og svævende tekst
└── audio/
    └── Sfx.ts            Lydeffekter, der syntetiseres live (ingen lydfiler)
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

- **Gør spillet nemmere eller sværere:** Åbn `src/game/tuning.ts`. `speedAt` styrer farten, `corridorHalfWidthAt` bredden og `hazardChanceAt` hvor mange forhindringer der kommer.
- **Skift farver:** `src/game/palette.ts`. Sektor-farverne (cyan, orange, magenta, rød) ligger i `tuning.ts`.
- **Mere eller mindre glød:** I `GameScene.setupCamera()` styrer `threshold` hvor lyst noget skal være for at gløde, og `blendAmount` hvor kraftigt det gløder.
- **Ny lyd:** `src/audio/Sfx.ts`. Prøv fx at ændre `freq` i `turn()`.

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
- **Udgivelse via GitHub Pages**, så spillet har en fast adresse
