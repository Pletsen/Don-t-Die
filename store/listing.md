# DUCKWISE: App Store listing (v1.0)

Everything App Store Connect asks for on the app's page, in English (primary
language) and Danish. Character counts are checked against Apple's limits
(name and subtitle 30, promotional text 170, keywords 100, description 4000).

Before submitting, check the facts against the build you upload: the skin
count (**50**),
Game Center leaderboards (only if the plugin ships in 1.0 and a screen opens
them; today scores are sent but no button shows them), and any
features added since (CONTINUE, ghost run, guest skin). Words in the listing
must match the app, or review rejects it (guideline 2.3).

---

## 1. App name

Decided by the owner (22 Oct 2026): the game is called **DUCKWISE** ("duck" +
"clockwise": the ball only ever turns right, and ducks are the currency).

| Option | Length | Verdict |
|---|---|---|
| **`DUCKWISE`** | 8 | **Chosen.** A web search (22 Oct 2026) found no game or app with this name. |
| `DUCKWISE: One Tap` | 17 | Fallback if App Store Connect reports the bare name as taken. |
| `Duckwise – Neon Tap` | 19 | Second fallback. |

- Home screen name: **DUCKWISE** (Xcode's display name, set by
  store/ios/configure-ios.sh).
- Danish storefront: same name (names are not translated).
- Before launch, a quick trademark search (EUIPO, USPTO, DKPTO) for "DUCKWISE"
  in class 9 (games software) and 41 (entertainment).
- Reserve the name early: creating the app record in App Store Connect holds
  the name (Apple releases it if no build follows within about 180 days).

## 2. Subtitle (max 30)

The subtitle is searchable, so it repeats no word from the name.

| | Text | Length |
|---|---|---|
| EN | `Neon arcade runner, one thumb` | 29 |
| DA | `Neon-arkadespil med ét tryk` | 27 |

Alternatives: EN `One-tap neon arcade runner` (26), `One rule: never touch a wall` (28).

## 3. Promotional text (max 170, can change any time without review)

**EN** (156)

> Tap to turn. Touch a wall, a saw or a bomb and it's over. 4 worlds, HARD MODE, a new Daily Run every day and 50 skins with super powers. How far can you go?

**DA** (166)

> Tryk for at dreje. Rør du en væg, en sav eller en bombe, er det slut. 4 verdener, HARD MODE, en ny Daily Run hver dag og 50 skins med superkræfter. Hvor langt når du?

## 4. Description (max 4000)

### EN (1,773 characters)

```
ONE TAP. ALWAYS RIGHT.

You are a ball of light racing down a neon corridor that spirals tighter and tighter. Every tap turns you 90 degrees. Turn inside the corner, hit the middle for a PERFECT, and keep the combo alive. Touch a wall, a saw or a bomb and it's over.

Learn it in five seconds. Put it down... maybe tomorrow.

• 20 LEVELS IN 4 WORLDS
Basics, Saws, Bombs and Chaos. Every level is the same every time, so you can learn it, beat it and go back for 3 stars.

• HARD MODE
Clear level 20 to unlock 20 remixed levels: faster, narrower, meaner. Double rewards for the brave.

• SURVIVAL
An endless run that never stops speeding up, with zones like SAW ALLEY, BOMB FIELD and the NARROWS. Beat your record and the game tells you mid-run.

• A NEW DAILY RUN EVERY DAY
The same track for everyone in the world, with a twist for each day of the week. Three daily missions and a streak that pays out.

• 50 SKINS WITH SUPER POWERS
Tap 4 times fast to spin, and your skin's power kicks in for 10 seconds: slow time, smash saws, ride a shield, call a QUACK ARMY...

• DUCKS!
Collect rubber ducks, chase the red ones that run away, and catch the rare golden duck for a DUCK FRENZY where every tap is a duck.

• THE QUACK REACTOR
Feed it 100 ducks and watch it overload: out comes a glowing orb, grey, blue, purple or (screen-shaking) gold, with a new skin inside. Fair by design: no repeats until you own every skin of a rarity, guaranteed epics and legendaries, and the odds are shown on screen.

• SECRETS
A tiny rainbow star hides late in some levels. Find it and warp to UNIVERSE 2.

• 35 achievements, lifetime records and Game Center leaderboards.

FREE AND FAIR
No ads. No in-app purchases. No tracking. No account. Ducks are earned by playing and can never be bought. Your progress stays on your iPhone, and the game works offline.

Now tap. And stay right.
```

### DA (1,826 characters)

```
ÉT TRYK. ALTID TIL HØJRE.

Du er en lyskugle, der suser gennem en neonkorridor, som snor sig tættere og tættere. Hvert tryk drejer dig 90 grader. Drej inde i hjørnet, ram midten for et PERFECT, og hold combo'en i live. Rører du en væg, en sav eller en bombe, er det slut.

Du lærer det på fem sekunder. Du lægger det fra dig ... måske i morgen.

• 20 LEVELS I 4 VERDENER
Basics, Saws, Bombs og Chaos. Hvert level er det samme hver gang, så du kan lære det, klare det og komme igen efter 3 stjerner.

• HARD MODE
Klar level 20 og lås 20 nye udgaver op: hurtigere, smallere og ondere. Dobbelt belønning til de modige.

• SURVIVAL
En uendelig tur, der bliver ved med at gå hurtigere, med zoner som SAW ALLEY, BOMB FIELD og NARROWS. Slår du din rekord, får du det at vide med det samme.

• EN NY DAILY RUN HVER DAG
Samme bane for alle i hele verden, med et nyt twist for hver ugedag. Tre daglige missioner og en streak, der giver gaver.

• 50 SKINS MED SUPERKRÆFTER
Tryk 4 gange hurtigt for at snurre rundt, så tænder dit skins kraft i 10 sekunder: sænk tiden, smadr save, kør med skjold, kald på en QUACK ARMY ...

• ÆNDER!
Saml gummiænder, jag de røde, der løber væk, og fang den sjældne gyldne and til en DUCK FRENZY, hvor hvert tryk er en and.

• QUACK REACTOR
Fodr den med 100 ænder, og se den koge over: ud kommer en glødende kugle, grå, blå, lilla eller (så hele skærmen ryster) guld, med et nyt skin indeni. Fair fra start: ingen gentagelser, før du har alle skins af en sjældenhed, garanterede epic- og legendary-skins, og chancerne står på skærmen.

• HEMMELIGHEDER
En lillebitte regnbuestjerne gemmer sig sent på nogle baner. Find den, og warp til UNIVERSE 2.

• 35 achievements, rekorder og Game Center-toplister.

GRATIS OG FAIR
Ingen reklamer. Ingen køb i appen. Ingen sporing. Ingen konto. Ænder tjenes ved at spille og kan aldrig købes. Dine fremskridt bliver på din iPhone, og spillet virker uden internet.

Tryk nu. Og hold til højre.
```

## 5. Keywords (max 100, comma separated, no spaces)

Apple already indexes the name, subtitle and category, so these don't repeat
"duckwise", "neon", "arcade", "runner" or "one tap".

| | Keywords | Length |
|---|---|---|
| EN | `reflex,endless,hyper casual,tap,turn,corner,maze,ball,dash,skill,daily,skins,ducks,survival,offline` | 99 |
| DA | `refleks,uendelig,tryk,sving,hjørne,labyrint,kugle,hurtig,spil,daglig,skins,ænder,survival,offline` | 97 |

## 6. Category

- **Primary: Games > Arcade.** Secondary: Games > Casual.
- Price: **Free** in all territories. No in-app purchases, no ads, no
  subscriptions.
- Devices: iPhone only for 1.0 (iPads run it in iPhone mode).

## 7. Age rating questionnaire

Apple's current questionnaire (App Store Connect > App Information > Age
Rating). The answers below are honest for the game as it is now; one of them
reflect the QUACK REACTOR (the slot machine is gone).

| Section | Question | Answer | Why |
|---|---|---|---|
| In-app controls | Parental controls | No | |
| | Age assurance | No | |
| Capabilities | Unrestricted web access | No | No browser, no links out. |
| | User-generated content | No | Nothing players make is shown to others. |
| | Social media / messaging and chat | No | Sharing a result opens the system share sheet; the game hosts no social features. |
| | Advertising | No | No ads. |
| Mature themes | Profanity or crude humour | None | |
| | Horror / fear themes | None | A cartoon ghost skin (BOO) is cute, not scary. |
| | Alcohol, tobacco or drug use | None | |
| Medical or wellness | Medical / health topics | No | |
| Sexuality or nudity | All | None | |
| Violence | Cartoon or fantasy violence | **None** (or Infrequent, see below) | An abstract orb bursts into light when it hits a wall, saw or bomb. No characters are hurt, no blood. If you'd rather be extra safe, "Infrequent" is also defensible; it makes the rating 9+. |
| | Realistic violence, graphic violence, weapons | None | |
| Chance-based | Gambling (real money) | No | Nothing can be bought or cashed out. |
| | **Simulated gambling** | **None** | The QUACK REACTOR has no reels, payline, lever or "win" wording (see below). |
| | Contests | Infrequent | Leaderboards and the shared Daily Run let players compare scores (4+). |
| | Loot boxes | No | Apple defines them as random items "for purchase". Ducks are only earned by playing; there is no purchase of any kind. |

**The skin machine.** The old DUCK-O-MATIC looked like a slot machine (reels, a
payline, a lever), which would have meant Simulated gambling = Infrequent and a
13+ rating (R 18+ in Australia). The owner chose to replace it: the QUACK
REACTOR is fed ducks and bursts open to reveal a skin in an orb whose colour
shows the rarity, like a pack opening. No reels, payline, lever, coins or "win"
wording, and duplicates show their fixed refund. So Simulated gambling =
*None* and the game is **4+** (9+ if violence is answered Infrequent).

Keep the odds shown on the reactor screen (they are).

## 8. What's new in 1.0

**EN**

> The first release of DUCKWISE! 20 levels in 4 worlds, HARD MODE, endless Survival, a new Daily Run every day and 50 skins with super powers. Tap to turn. Always right.

**DA**

> Den første udgave af DUCKWISE! 20 levels i 4 verdener, HARD MODE, uendelig Survival, en ny Daily Run hver dag og 50 skins med superkræfter. Tryk for at dreje. Altid til højre.

## 9. URLs

App Store Connect needs a **Support URL** and a **Privacy Policy URL**
(Marketing URL is optional). Plan: free GitHub Pages from this public repo.

| Field | URL |
|---|---|
| Marketing URL | `https://pletsen.github.io/Don-t-Die/` |
| Support URL | `https://pletsen.github.io/Don-t-Die/#support` |
| Privacy Policy URL | `https://pletsen.github.io/Don-t-Die/privacy.html` |

The pages are in `store/site/` (index.html with the support section,
privacy.html). To publish: copy `store/site/*` to a `docs/` folder on `main`
and turn on GitHub Pages (Settings > Pages > Deploy from a branch > `main` /
`docs`). Before that, replace `[CONTACT EMAIL]` in both pages with a support
address (a dedicated one, e.g. a new Gmail or a domain alias, rather than a
personal inbox: it will be public). A custom domain (e.g. duckwise.dk) can be
pointed at the same pages later without changing the app.

## 10. App Review notes (paste into "Notes" for the reviewer)

```
DUCKWISE is a one-tap arcade game. Tap anywhere to turn the ball 90° right; touch a wall, saw or bomb and the run ends.

- No account, no login, no network: everything works offline.
- No ads, no in-app purchases. "Ducks" are an in-game currency earned only by playing; they cannot be bought or exchanged for anything outside the game. The QUACK REACTOR spends earned ducks on cosmetic skins and shows its odds on screen.
- Game Center (optional) is used only for leaderboards.
- Local notifications (optional, asked after the first Daily Run): a reminder when a new Daily Run is out and when a streak is about to end.
- Quick tour: PLAY starts level 1, which teaches itself. SURVIVAL is endless. DAILY has today's run. Tapping 4 times fast fires the skin's super power (from level 3).
```
