# DUCKWISE på Google Play

Alt fra "spillet er færdigt" til "udgivet på Google Play", i rækkefølge. Selve
Android-appen ligger i `android/` (Capacitor 8), pakkenavn
**`dk.vangr.duckwise`**, udgiver **VANGR**.

Ting, der står med ⚠️, har jeg skrevet efter bedste viden, men Googles regler
ændrer sig: tjek dem i Play Console, når du når dertil.

---

## 1. Konti (gøres i browseren, i VANGR's navn)

1. **E-mail til VANGR.** Helst på et eget domæne (fx `kontakt@vangr.dk`); ellers
   en Gmail som `vangr.games@gmail.com`. Den bliver både login, offentlig
   udvikler-e-mail og support-e-mail i spillet og på privatlivssiden.
2. **Google-konto** på den e-mail (accounts.google.com).
3. **D-U-N-S-nummer til VANGR** (gratis, fra Dun & Bradstreet). Google kræver det
   for en firmakonto. Det kan tage fra et par dage til et par uger, så start
   her. Play Console linker selv til, hvor man søger om det.
4. **Play Console-konto som organisation** (play.google.com/console): vælg
   "Organisation", udfyld VANGR's navn, adresse, telefon og D-U-N-S-nummer,
   betal engangsgebyret (25 USD), og bekræft din identitet som kontaktperson.
   - ⚠️ Kravet om **12 testere i 14 dage** før udgivelse gælder (så vidt jeg
     ved) kun nye **personlige** konti, ikke organisationer. Med en
     firmakonto kan du altså selv bestemme, hvor længe der testes.
   - Alternativet er en personlig konto: hurtigere (intet D-U-N-S), men dit
     eget navn står som udgiver, og 12/14-kravet gælder.
5. **Privatlivsside online.** Siden ligger færdig i `store/site/` (dansk og
   engelsk). Udfyld `[CONTACT EMAIL]` og `[DATE]`, og slå GitHub Pages til, så
   den får en offentlig adresse. Google kræver en privatlivspolitik-URL, også
   når appen ikke indsamler noget.

## 2. Selve appen

**Pakkenavn:** `dk.vangr.duckwise`. Det står i `capacitor.config.ts` og
`android/app/build.gradle`. Det kan ændres frem til første upload til Play
Console, derefter aldrig.

**Bygning uden Android Studio:** hver gang koden pushes til GitHub, bygger
workflowen *Android* (`.github/workflows/android.yml`) appen. Under kørslens
**Artifacts** ligger:

- `duckwise-debug.apk`: til at lægge direkte på din egen telefon (se nedenfor).
- `duckwise-release.aab`: filen til Google Play. Den kommer først, når
  upload-nøglen er lagt ind (næste punkt).

**Upload-nøglen** (en fil, der beviser, at opdateringer kommer fra dig):

1. Lav den én gang, på en computer med Java (eller bed Claude om at lave den og
   sende den til dig):
   `keytool -genkeypair -v -keystore duckwise-upload.jks -alias duckwise-upload -keyalg RSA -keysize 2048 -validity 10000`
2. Gem filen og adgangskoderne **to sikre steder** (fx en password manager +
   en USB-nøgle). Den må aldrig ligge i koden.
3. Læg den ind som GitHub-secrets (repo > Settings > Secrets and variables >
   Actions): `ANDROID_KEYSTORE_BASE64` (filen base64-kodet),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`duckwise-upload`),
   `ANDROID_KEY_PASSWORD`.
4. Ved første upload slår Play Console **Play App Signing** til: Google
   opbevarer den rigtige signeringsnøgle. Mister du upload-nøglen, kan den
   nulstilles via Googles support. Appen er ikke tabt.

**Spil den på din egen telefon (før Play Store):** åbn GitHub på telefonen
(eller hent filen på computeren og send den til telefonen), hent
`duckwise-debug.apk` fra seneste kørsel af *Android*, åbn den, og tillad
"Installer ukendte apps" for browseren eller Filer-appen, når telefonen
spørger. Den er signeret med en testnøgle, så Play-versionen kan ikke lægges
oven på den: afinstallér den, før du installerer fra Play (fremskridt i
test-versionen forsvinder da).

Lokalt (med Android SDK): `npm run android`, og byg derefter i `android/` med
`./gradlew assembleDebug`.

## 3. Testspor i Play Console

1. **Intern test** (op til 100 testere på en e-mailliste, ingen ventetid på
   Googles gennemgang): start her med dig selv og et par stykker.
2. **Lukket test**: til Facebook-gruppen. Testere tilmelder sig via et link fra
   Play Console (opt-in-URL), skal bruge en Google-konto, og installerer derefter
   fra Play Store som en almindelig app. Bed dem især lægge mærke til:
   føles trykket øjeblikkeligt, hakker det, hvor giver de op, og hvad forstår de
   ikke.
3. **Produktion**: når testen er god.

Hver upload skal have et højere `versionCode`. Workflowen bruger kørslens
nummer, så det klarer sig selv.

## 4. Butikssiden (Main store listing)

| Felt | Indhold |
|---|---|
| App-navn (maks 30) | `DUCKWISE` |
| Kort beskrivelse (maks 80) | EN: `Tap to turn. Don't touch the walls. A neon one-tap arcade game.` (63) · DA: `Tryk for at dreje. Rør ikke væggene. Et neon-arkadespil med ét tryk.` (69) |
| Lang beskrivelse | se nedenfor (EN og DA) |
| App-ikon 512 × 512 | `store/art/play-icon-512.png` |
| Feature graphic 1024 × 500 | `store/art/play-feature-1024x500.png` |
| Telefon-skærmbilleder | 8 stk. i 1080 × 2160: `store/screenshots/en/play/` og `.../da/play/` (lav dem med `node store/screenshots.cjs --sizes play`; mappen er git-ignored) |
| Kategori | Spil > Arkade |
| Tags | Arcade, Casual, Offline, Single player |
| Kontakt | VANGR's e-mail; hjemmeside: GitHub Pages-siden |
| Privatlivspolitik | URL'en til `privacy.html` |

Alt i den lange beskrivelse skal passe til appen. Kommer der reklamer eller køb
senere, skal "FREE AND FAIR"-afsnittet skrives om.

### Lang beskrivelse, engelsk

```
ONE TAP. ALWAYS RIGHT.

You are a ball of light racing down a neon corridor. Every tap turns you 90 degrees. Turn inside the corner, hit the middle for a PERFECT, and keep the combo alive. Touch a wall, a saw or a bomb and it's over.

Learn it in five seconds. Put it down... maybe tomorrow.

• 60 LEVELS: EASY, NORMAL AND HARD
Four worlds (Basics, Saws, Bombs and Chaos) in three difficulties. Start in EASY, unlock NORMAL at EASY 10 and HARD at NORMAL 10. Every level is the same every time, so you can learn it, beat it and go back for 3 stars.

• SURVIVAL
An endless run that never stops speeding up, with zones like SAW ALLEY, BOMB FIELD and the NARROWS. Beat your record and the game tells you mid-run.

• A NEW DAILY RUN EVERY DAY
The same track for everyone, with a twist for each day of the week. Three daily missions and a streak that pays out.

• 50 SKINS WITH SUPER POWERS
Tap 4 times fast to spin, and your skin's power kicks in for 10 seconds: slow time, smash saws, ride a shield, call a QUACK ARMY...

• DUCKS!
Collect rubber ducks, chase the red ones that run away, and catch the rare golden duck for a DUCK FRENZY where every tap is a duck.

• THE QUACK REACTOR
Feed it 100 ducks and watch it overload: out comes a glowing orb, grey, blue, purple or (screen-shaking) gold, with a new skin inside. No repeats until you own every skin of a rarity, guaranteed epics and legendaries, and the odds are shown on screen.

• SECRETS
A tiny rainbow star hides late in the levels. Find it and warp to UNIVERSE 2.

• 36 achievements and lifetime records.

FREE AND FAIR
No ads. No in-app purchases. No tracking. No account. Ducks are earned by playing. Your progress stays on your phone, and the game works offline.

Now tap. And stay right.
```

### Lang beskrivelse, dansk

```
ÉT TRYK. ALTID TIL HØJRE.

Du er en lyskugle, der suser gennem en neonkorridor. Hvert tryk drejer dig 90 grader. Drej inde i hjørnet, ram midten for et PERFECT, og hold combo'en i live. Rører du en væg, en sav eller en bombe, er det slut.

Du lærer det på fem sekunder. Du lægger det fra dig ... måske i morgen.

• 60 LEVELS: EASY, NORMAL OG HARD
Fire verdener (Basics, Saws, Bombs og Chaos) i tre sværhedsgrader. Start i EASY, lås NORMAL op ved EASY 10 og HARD ved NORMAL 10. Hvert level er det samme hver gang, så du kan lære det, klare det og komme igen efter 3 stjerner.

• SURVIVAL
En uendelig tur, der bliver ved med at gå hurtigere, med zoner som SAW ALLEY, BOMB FIELD og NARROWS. Slår du din rekord, får du det at vide med det samme.

• EN NY DAILY RUN HVER DAG
Samme bane for alle, med et nyt twist for hver ugedag. Tre daglige missioner og en streak, der giver gaver.

• 50 SKINS MED SUPERKRÆFTER
Tryk 4 gange hurtigt for at snurre rundt, så tænder dit skins kraft i 10 sekunder: sænk tiden, smadr save, kør med skjold, kald på en QUACK ARMY ...

• ÆNDER!
Saml gummiænder, jag de røde, der løber væk, og fang den sjældne gyldne and til en DUCK FRENZY, hvor hvert tryk er en and.

• QUACK REACTOR
Fodr den med 100 ænder, og se den koge over: ud kommer en glødende kugle, grå, blå, lilla eller (så hele skærmen ryster) guld, med et nyt skin indeni. Ingen gentagelser, før du har alle skins af en sjældenhed, garanterede epic- og legendary-skins, og chancerne står på skærmen.

• HEMMELIGHEDER
En lillebitte regnbuestjerne gemmer sig sent på banerne. Find den, og warp til UNIVERSE 2.

• 36 achievements og rekorder.

GRATIS OG FAIR
Ingen reklamer. Ingen køb i appen. Ingen sporing. Ingen konto. Ænder tjenes ved at spille. Dine fremskridt bliver på din telefon, og spillet virker uden internet.

Tryk nu. Og hold til højre.
```

## 5. App-indhold (Policy > App content)

Svarene passer til appen, som den er nu: ingen reklamer, ingen køb, ingen
dataindsamling.

- **Privatlivspolitik:** URL'en fra punkt 1.5.
- **Reklamer:** "Nej, min app indeholder ikke reklamer."
- **Adgang til appen:** al funktionalitet er tilgængelig uden login eller særlig
  adgang.
- **Datasikkerhed (Data safety):**
  - Indsamler eller deler appen nogen af de nævnte datatyper? **Nej.** Spillet
    sender intet nogen steder hen: fremskridt gemmes kun på telefonen, og der er
    ingen analytics, reklamer eller konti.
  - Sletning af konto: ikke relevant (ingen konti).
- **Aldersvurdering (IARC-spørgeskemaet):** kategori *Spil*. Vold: nej (en
  abstrakt lyskugle støder ind i vægge og forhindringer; ingen figurer eller
  blod). Frygt, sex, sprog, stoffer: nej. Gambling eller simuleret gambling:
  nej. REACTOR'en giver tilfældige skins for ænder, man har tjent i spillet;
  der er ingen rigtige penge og intet casino-look. Brugere kan interagere eller
  dele indhold med hinanden: nej (SHARE åbner kun telefonens egen deleknap).
  Køb af digitale varer: nej. Forventet resultat: PEGI 3 / Everyone.
- **Målgruppe:** jeg anbefaler **13 år og op**. Spillet er ikke lavet specielt
  til børn, og vælger man under 13, gælder Googles ekstra regler for
  familieapps. ⚠️ Google spørger også, om appen "kan appellere til børn": svar
  ærligt.
- **Notifikationer:** Android 13+ spørger først om lov efter den første Daily
  Run. Appen bruger ingen præcise alarmer, så der skal ikke erklæres noget for
  det.
- **Nyhedsapp, sundhed, finans, regeringsapp:** nej til det hele.

## 6. Før knappen trykkes

- [ ] VANGR's e-mail, D-U-N-S, Play Console-konto (punkt 1)
- [ ] Privatlivsside online med e-mail og dato
- [ ] Upload-nøgle lavet, gemt to steder og lagt i GitHub-secrets
- [ ] Spillet på din egen (billige) Android-telefon: flydende? trykket
      øjeblikkeligt? lyd i takt? tilbage-knappen? kamerahullet?
- [ ] Intern test, så lukket test med rigtige spillere
- [ ] Butiksside, grafik og skærmbilleder (punkt 4)
- [ ] App-indhold (punkt 5)
- [ ] Produktion
