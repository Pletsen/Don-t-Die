# Færten

Third person-overlevelsesspil i browseren. Du er en jæger på vej hjem til din hule gennem 30 skovstrækninger, fra eftermiddag til nat. Dyrene får færten af dig, og de bliver vildere, jo mørkere det bliver. Rammer og beslutninger står i [CLAUDE.md](CLAUDE.md).

```
npm install
npm run dev      # starter spillet på http://localhost:5173
npm run build    # typecheck + produktionsbuild
```

## Indhold

- **30 baner** med fem lysstemninger (eftermiddag, gylden time, skumring, blå time, nat), vind der er sat bevidst pr. bane, og en **boss hver 10. bane**: Alfaulven (10), Kæmpe-elgen (20) og Den arrede bjørn, der vogter hulen (30).
- **Vind, lugt og larm**: kompasset viser, hvor din fært driver hen (rødt = fremad mod dyrene). Larmmåleren viser, hvor langt dyrene kan høre dig. Dyr der ikke har opdaget dig, tager dobbelt skade (snigskud).
- **16 våben i fire familier** (bue, kast, fælder, spyd/sling) med tre opgraderingsspor hver. Bue, kast og slynge spændes ved at holde knappen og slippes; et hurtigt klik er svagt og løst.
- **Realistisk blod** (kan slås fra i indstillinger): stænk, blodspor fra sårede dyr som du kan følge, blodpøl ved døde dyr, pile der sidder fast i dyret.
- **Dyr** med inerti, gangarter, karakter (haren slår kroge, fasanen letter, vildsvinet skraber, ulven lister), fair angreb med varsel, halten, rigtige fald.
- **Hulen**: banekort med mærker (Hjemme, Uset, Hvid hjort), genspil af klarede baner, butik for jægeren og våbnene.
- **Indstillinger** (Esc/P): musefølsomhed, vend mus, synsfelt, lydstyrker, sværhedsgrad (let/normal/svær), blod, grafikkvalitet (lav/mellem/høj).
- **Lyd**: 177 rigtige optagelser med fri licens (Kenney, OpenGameArt-kunstnere, US National Park Service), 3D-lyd fra dyrene, natur der skifter med tiden, rolig musik og et spændingslag, når noget jager dig. Kilder og licenser: `public/sfx/CREDITS.md`.

## Styring

WASD og mus · venstre museknap: hold for at spænde/tage tilløb, slip for at skyde (nærkamp slår ved klik) · højre museknap: sigt · Shift: løb · Mellemrum: hop · Ctrl eller C: undvigerulle · E: saml op, spis kød, tag fælder op · 1-4 og musehjul: skift våben · Esc eller P: pause.

## Lyde: skift en lyd

Hver hændelse (fx `bow_release`, `wolf_howl`, `music_tension`) står i `public/sfx/manifest.json` med filnavne og lydstyrke. Læg en ny `.ogg` i `public/sfx/`, ret filnavnet i manifestet, og genindlæs siden.

## Struktur

`src/data` (alle tal), `src/world`, `src/player`, `src/weapons`, `src/animals` (inkl. bosser), `src/fx` (blod), `src/ui`, `src/audio`, `src/game`.
