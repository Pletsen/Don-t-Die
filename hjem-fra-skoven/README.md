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
- **Bue og pil** med hip-skud og sigte. Pile der misser, kan samles op. Pile der rammer, er tabt.
- **Styring**: WASD, mus, venstre museknap skyder, højre sigter, Shift sprinter, mellemrum ruller (kort uskadt), E samler op eller spiser kød, 1-4 er våbenfamilierne (kun buen er klar).
- **Hulen**: mellem banerne køber du opgraderinger for kød, skærv og trofæer. Død genstarter banen. Opgraderinger og det du har bragt hjem, beholdes. Det du bar på, er tabt.
- Fremskridt gemmes i localStorage.

## Ikke med endnu

Kasteøkser/knive, fælder, spyd/sling, jagtmærker, bossdyr og andet lyd end de enkle effekter.

## Struktur

`src/data` (alle tal), `src/world`, `src/player`, `src/weapons`, `src/animals`, `src/ui`, `src/audio`, `src/game`.
