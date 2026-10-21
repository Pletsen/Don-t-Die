# DON'T DIE: privacy

This file has the privacy policy to publish (English and Danish), the answers
for App Store Connect's App Privacy section, and the export compliance answer.
The hostable page is `store/site/privacy.html` (same text). Replace
`[CONTACT EMAIL]` and `[DATE]` before publishing.

What the policy says was checked against the code (21 Oct 2026): the game
makes no network requests (fonts and sounds are bundled; the only `fetch` loads
its own sound files), has no analytics, ads, accounts or third-party SDKs, and
saves only in the browser's localStorage and, in the iOS app, the app's own
native storage (`src/native/bridge.ts`, `src/game/persist.ts`).

---

## Privacy policy (English)

**DON'T DIE: Privacy Policy**
Effective [DATE]

DON'T DIE is a game. It does not collect, store or share any personal data.

- **No data collection.** The game has no account, no login, no analytics, no
  advertising and no tracking. It does not use your contacts, photos, location,
  camera, microphone or any identifier for advertising.
- **Your progress stays on your device.** Levels, stars, ducks, skins,
  records and settings are saved on your iPhone (or in your browser if you play
  on the web). They are never sent to us or to anyone else. Deleting the app
  deletes them. Like all app data, they can be part of your own iCloud or
  device backups, which Apple handles under its own privacy policy.
- **Game Center (optional).** If you are signed in to Apple's Game Center, your
  scores are sent to Game Center for the leaderboards. This is Apple's service:
  Apple handles that data under its privacy policy, and we can only see what
  Game Center shows every player (your Game Center nickname and scores).
- **Notifications (optional).** If you allow notifications, the game schedules
  reminders on your device (for example when a new Daily Run is out). They are
  created and shown by your iPhone; nothing is sent anywhere. You can turn them
  off at any time in Settings.
- **Sharing (optional).** When you tap Share, the game opens your device's
  share sheet with a picture of your result. You choose where it goes; the game
  sends nothing by itself.
- **Children.** The game collects no data from anyone, including children.
- **No ads, no purchases.** The game has no advertising and no in-app
  purchases.
- **Changes.** If this ever changes (for example a new feature that needs
  data), this policy will be updated before the feature ships, and the date
  above will change.
- **Contact.** Questions: [CONTACT EMAIL]

## Privatlivspolitik (dansk)

**DON'T DIE: Privatlivspolitik**
Gælder fra [DATE]

DON'T DIE er et spil. Det indsamler, gemmer og deler ingen personoplysninger.

- **Ingen dataindsamling.** Spillet har ingen konto, intet login, ingen
  statistik, ingen reklamer og ingen sporing. Det bruger ikke dine kontakter,
  billeder, din placering, dit kamera, din mikrofon eller noget
  reklame-id.
- **Dine fremskridt bliver på din enhed.** Levels, stjerner, ænder, skins,
  rekorder og indstillinger gemmes på din iPhone (eller i din browser, hvis du
  spiller på nettet). De sendes aldrig til os eller andre. Sletter du appen,
  slettes de. Som alle apps' data kan de indgå i dine egne iCloud- eller
  enhedsbackups, som Apple håndterer efter sin egen privatlivspolitik.
- **Game Center (valgfrit).** Er du logget ind i Apples Game Center, sendes
  dine point til Game Center til toplisterne. Det er Apples tjeneste: Apple
  håndterer de data efter sin privatlivspolitik, og vi kan kun se det, Game
  Center viser alle spillere (dit Game Center-kaldenavn og dine point).
- **Notifikationer (valgfrit).** Tillader du notifikationer, planlægger spillet
  påmindelser på din enhed (fx når en ny Daily Run er klar). De laves og vises
  af din iPhone; intet sendes nogen steder hen. Du kan slå dem fra når som
  helst under Indstillinger.
- **Deling (valgfrit).** Når du trykker på Del, åbner spillet din enheds
  delingsmenu med et billede af dit resultat. Du vælger selv, hvor det skal
  hen; spillet sender intet af sig selv.
- **Børn.** Spillet indsamler ingen data fra nogen, heller ikke fra børn.
- **Ingen reklamer, ingen køb.** Spillet har ingen reklamer og ingen køb i
  appen.
- **Ændringer.** Hvis det nogensinde ændrer sig (fx en ny funktion, der kræver
  data), opdateres denne politik, før funktionen kommer, og datoen ovenfor
  ændres.
- **Kontakt.** Spørgsmål: [CONTACT EMAIL]

---

## App Store Connect: App Privacy ("nutrition label")

App Store Connect > the app > App Privacy > Get Started.

1. **Do you or your third-party partners collect data from this app?**
   **No, we do not collect data from this app.**
2. Result on the App Store page: **Data Not Collected**.
3. **Privacy Policy URL:** `https://pletsen.github.io/Don-t-Die/privacy.html`
   (see listing.md section 9).

Why "No" is right:

- Apple's definition of "collect" is transmitting data off the device in a way
  that lets you or a partner access it for longer than needed to serve the
  request. The game transmits nothing.
- Game Center data is collected by Apple, not by the developer, and Apple's own
  frameworks don't count as third-party partners here.
- Data kept only on the device (the save, scheduled notifications) is not
  "collected".
- The privacy manifest in the app says the same (`store/ios/PrivacyInfo.xcprivacy`:
  no tracking, no collected data types, UserDefaults for the app's own data only,
  reason CA92.1).

If anything that sends data is ever added (analytics, crash reporting, ads,
cloud saves), this section and the policy must be redone first.

## Export compliance (encryption)

- **Answer: the app uses no encryption** beyond what is built into iOS, and
  makes no network connections. In App Store Connect: *"None of the algorithms
  mentioned above"* / not using non-exempt encryption.
- The Info.plist key **`ITSAppUsesNonExemptEncryption = NO`** is set by
  `store/ios/configure-ios.sh`, so App Store Connect never asks on upload.
- No export compliance documentation or French encryption declaration is
  needed.
