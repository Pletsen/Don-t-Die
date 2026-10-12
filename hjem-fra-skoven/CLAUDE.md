# Hjem fra skoven (arbejdstitel)

Third person-overlevelsesspil til PC i browseren. Du er en jæger på vej hjem til din hule gennem 30 skovstrækninger. Dyrene får færten af dig og angriber, og de bliver vildere for hver bane. Ejer og spildesigner: Søren. Han skriver på dansk, så kommuniker på dansk. Kode, filnavne og kommentarer skrives på engelsk.

## Besluttede rammer

- Teknik: Three.js + Vite, kun PC, singleplayer, fremskridt gemmes i localStorage.
- Stil: semi-realistisk (PBR-materialer, skygger, tåge, lys der ændrer sig fra eftermiddag til nat). Gratis modeller med fri licens (Quaternius, Poly Haven, ambientCG) er udgangspunktet. Noter altid licens og kilde i `ASSETS.md`.
- Tone: overlevelse med spænding.
- Kamera: over skulderen. Mus drejer figur og kamera, WASD bevæger, venstre museknap skyder/kaster, højre museknap sigter, Shift sprinter (udholdenhed), mellemrum er undvigerulle, 1-4 skifter våben, E bruger/samler op.
- Struktur: 30 levels, hver en strækning fra start til hulen. Hulen er hub mellem levels, hvor man køber våben og opgraderinger.
- Lys: tidlige levels er eftermiddag, sene levels er nat og tåge.
- Død: banen genstartes, opgraderinger og hjembragte ressourcer beholdes.
- Økonomi: kød (mad og fordele), skærv (almindelig valuta, præcis betydning ikke afgjort), trofæer (sjældne dyr, specialvåben og store opgraderinger).
- Våbenfamilier: bue og pil (start), kasteøkser og knive, fælder og snareværk, spyd og sling.
- Specialmål: hvid hjort (sjælden, flygter, giver trofæ) og jagtmærker (spor der viser, hvor et særligt dyr er).
- Dyr: bytte (rådyr, hare, fasan), forsvarere (vildsvin, elg, kronhjort), rovdyr (ræv, ulv, bjørn). Vind og lugt styrer, hvornår et dyr får færten.

## Åbne spørgsmål (spørg Søren, før du bygger på dem)

- Bossdyr (fx kæmpebjørn i level 30)?
- Håndlavede eller tilfældigt genererede baner?
- Hvad er skærv i spillets verden?
- Blodniveau og dødseffekter.
- Spillets navn.

## Arbejdsform

- Delagenterne ligger i `.claude/agents/`. Brug dem efter rolle, og lad dem ikke arbejde i hinandens filer uden aftale.
- Hold koden modulær: `src/player`, `src/weapons`, `src/animals`, `src/world`, `src/ui`, `src/audio`, `src/data` (leveldata og balancetal som data, ikke hårdkodet).
- Alle balancetal (skade, hastighed, priser, dyrs antal pr. level) ligger i `src/data/`, så de kan justeres uden at røre logik.
- Efter hver ændring: kør spillet (`npm run dev`) og tjek, at det starter uden fejl i konsollen.
- Spørg Søren, når et valg ændrer spiloplevelsen. Tag selv tekniske valg, og forklar dem kort.
