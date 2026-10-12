# Hjem fra skoven (arbejdstitel)

Third person-overlevelsesspil i browseren. Du er en jæger på vej hjem til din hule gennem 30 skovstrækninger. Dyrene får færten af dig, og de bliver vildere for hver bane. Rammer og regler står i [CLAUDE.md](CLAUDE.md).

```
npm install
npm run dev      # starter spillet på http://localhost:5173
npm run build    # typecheck + produktionsbuild
```

## Det der er med i denne version

- **Bane 1-30**, hver en strækning fra skovkanten til hulen. Lyset går fra eftermiddag til nat og tåge. Banerne er beskrevet som data (`src/data/levels.ts`), og skoven gror ud fra et frø, så en bane er ens hver gang.
- **Vind og lugt**: vinden drejer langsomt (kompas oppe til højre, løv og støv driver med vinden). Et dyr får færten, hvis vinden blæser fra dig mod det. Sprint, rulning og skud kan høres.
- **Dyr**: bytte (hare, fasan, rådyr), forsvarere (vildsvin, elg, kronhjort), rovdyr (ræv, ulv, bjørn) og den sjældne **hvide hjort** (flygter, giver trofæ, i hver 4. bane). Over hovedet vises ? (mistænksom) og ! (har dig). Angreb varsles med et ryk, før de rammer.
- **16 våben i fire familier** (alle tal i `src/data/weapons.ts`):
  - *Bue og pil*: Jagtbue (start), Langbue, Hurtigbue, Giftbue.
  - *Kasteøkser og knive*: Jagtkniv (nærkamp), Kastekniv, Kasteøkse, Dobbeltøkse.
  - *Fælder og snareværk*: Snare, Bjørnefælde, Lokkemad (lokker dyr til), Giftåd.
  - *Spyd og sling*: Jagtspyd, Langspyd (nærkamp), Kastespyd, Slynge (næsten lydløs).
  Kastede knive, økser og spyd kan samles op igen (også efter et hit), pile kun når de misser. Fælder holder dyr fast, og lokkemad kan kombineres med dem.
- **Opgradér hvert våben i hulen**: tre spor på 5 trin: mere skade, hurtigere ladning/slag/udlægning, og et særligt spor for hvert våben (flere pile, bedre sigte, længere skaft, stærkere gift, kraftigere duft ...).
- **Styring**: WASD, mus, venstre museknap bruger våbnet, højre sigter, Shift sprinter, mellemrum ruller (kort uskadt), E samler op eller spiser kød, 1-4 vælger våbenfamilie (tryk igen for næste våben), musehjulet skifter mellem alle dine våben.
- **Hulen**: mellem banerne køber du opgraderinger for kød, skærv og trofæer. Død genstarter banen. Opgraderinger og det du har bragt hjem, beholdes. Det du bar på, er tabt.
- Fremskridt gemmes i localStorage.

## Ikke med endnu

Jagtmærker, bossdyr og andet lyd end de enkle effekter.

## Struktur

`src/data` (alle tal), `src/world`, `src/player`, `src/weapons`, `src/animals`, `src/ui`, `src/audio`, `src/game`.
