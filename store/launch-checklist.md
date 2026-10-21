# DON'T DIE: launch checklist

Everything left between "the game is done" and "Submit for Review". In order;
tick as you go. Details live in `store/ios-plan.md` (build), `store/listing.md`
(texts, age rating) and `store/privacy-policy.md` (privacy forms).

## A. Decisions for the owner (before anything is uploaded)

- [ ] **Store name**: `DON'T DIE: One Tap` recommended (the bare name is
      crowded and close to Bryan Johnson's "Don't Die" brand). Quick trademark
      search in class 9 / 41.
- [ ] **Bundle ID**: `dk.dontdie.game` or another; it can never change later.
- [ ] **DUCK-O-MATIC look**: keep the slot machine (age rating 13+, R 18+ in
      Australia) or re-theme it as a capsule machine (4+). listing.md §7.
- [ ] **Developer account type**: individual (your own name shows as the
      seller) or company (needs a D-U-N-S number, shows the company name).
- [ ] **Support e-mail**: a dedicated public address for the support and
      privacy pages.
- [ ] **Leaderboards in 1.0?** If yes, add a leaderboard button on RECORDS
      (bridge.ts has `showLeaderboard`/`hasLeaderboards`). If no, remove
      "Game Center leaderboards" from the description.

## B. The game itself

- [ ] All features merged (50 skins, rebalanced powers, CONTINUE, ghost run,
      guest skin, sound/music toggles, HARD MODE teaser).
- [ ] `package.json` version `1.0.0`.
- [ ] README updated (Danish).
- [ ] Re-render the screenshots after the merge (`store/screenshots.cjs`),
      check the skin count in caption 3, and look at every shot.
- [ ] Re-check listing facts against the build: skin count, number of
      achievements (35), features named in the description.
- [ ] Re-run `store/art.cjs` only if the look of the orb changes.

## C. Accounts and App Store Connect (browser only)

- [ ] Apple Developer Program membership active (99 USD/year).
- [ ] Agreements, Tax and Banking: accept the Free Apps agreement (needed even
      for a free app; banking/tax is only for paid apps).
- [ ] App ID with Game Center (ios-plan.md §6 step 2).
- [ ] App record created (reserves the name).
- [ ] App Store Connect API key (Admin) + the four GitHub secrets.
- [ ] Game Center: the three leaderboards (`dontdie.survival`,
      `dontdie.daily` recurring daily at 00:00 UTC, `dontdie.stars`).
- [ ] GitHub Pages on (`store/site` → `docs/`), `[CONTACT EMAIL]` and `[DATE]`
      filled in; open the privacy and support URLs on a phone.

## D. First TestFlight build

- [ ] Native packages installed, workflow copied, run (ios-plan.md §6 steps 7-10).
- [ ] Build processed in App Store Connect; internal testers added.
- [ ] Installed via the TestFlight app on a real iPhone.

## E. Test on real iPhones (the important part)

Test on an **older iPhone** first (an iPhone XR / 11 / SE 2nd gen, A12-A13):
that's where WebGL and the glow effects cost the most. Also on one new phone
with a Dynamic Island.

Performance
- [ ] Menu, levels in all 4 worlds, Survival past 1000 m, DUCK FRENZY,
      Universe 2 and a super power: smooth (the quality ladder in
      `game/display.ts` may step down; it must not end blurry).
- [ ] No stutter on the first run after launch (texture baking at boot).
- [ ] Battery/heat: 15 minutes of play doesn't make the phone hot.
- [ ] Low Power Mode on: still playable (it caps at 30 fps).

Screen and input
- [ ] HUD below the notch / Dynamic Island; buttons above the home indicator.
- [ ] Portrait only; rotating the phone does nothing.
- [ ] No status bar; no white flash at launch; launch art fades into the menu.
- [ ] Fast taps (DUCK FRENZY, 4-tap spin) never zoom, select text or scroll.
- [ ] A tap near the bottom edge doesn't open the app switcher by accident
      (if it does: defer system gestures in a custom view controller).

App life
- [ ] Home button / swipe up mid-run: the run pauses; back again: pause
      overlay with countdown.
- [ ] A phone call or Siri mid-run: sound comes back afterwards (see the audio
      note in ios-plan.md §3).
- [ ] Silent switch, other music playing (Spotify): sensible behaviour.
- [ ] Force-quit and relaunch: progress, ducks, skins and settings are kept.
- [ ] Airplane mode: everything works.
- [ ] Haptics: turn, PERFECT, crash feel right and can be turned off with the
      effects toggle.

Native features
- [ ] First Daily Run → back to the menu → the notification permission dialog
      appears once (never at first launch).
- [ ] Reminders arrive at about 18:00 and (with a 2+ day streak) 20:00, and
      not after the Daily Run was played / the streak claimed. Quick test:
      change the phone's time, or temporarily lower the hours in
      `planReminders`.
- [ ] Game Center: signs in quietly; scores show on the leaderboards.
- [ ] Rating prompt: in TestFlight it never shows (Apple's rule), so check it
      with a debug build or trust the tests; after release, look for it once.
- [ ] Share a result: the share sheet opens with the picture.

## F. App Store Connect forms

- [ ] Name, subtitle, promotional text, description, keywords, what's new:
      English and Danish (listing.md).
- [ ] Screenshots: 6.9" (1290 x 2796) at least, plus 6.5" and 6.3" if wanted;
      EN set for English, DA set for Danish. Up to 10 per size.
- [ ] Optional app preview video (15-30 s, recorded on the device with the
      screen recorder).
- [ ] App icon is in the build (no upload needed).
- [ ] Category Games > Arcade, secondary Casual. Price Free, all territories
      (Australia only if the rating allows what you want there).
- [ ] Age rating questionnaire (listing.md §7).
- [ ] App Privacy: Data Not Collected; privacy policy URL.
- [ ] Support URL (marketing URL optional).
- [ ] Copyright line, e.g. `2026 <your name or company>`.
- [ ] Contact info for App Review, and the review notes (listing.md §10). No
      demo account needed.
- [ ] Game Center enabled on the version page (and the leaderboards attached).
- [ ] Version release: manual release is safest for 1.0 (you choose the day).

## G. Submit

- [ ] Pick the TestFlight build on the 1.0 version page, Save, **Add for
      Review**, Submit. Review usually takes 1-2 days.
- [ ] If rejected: read the message in App Store Connect (Resolution Center),
      fix, upload a new build (new build number), reply and resubmit.
- [ ] After release: put the App Store badge and link on the Pages site; check
      the listing on a phone in Denmark and one other country.

## Common rejection reasons to avoid

- Age rating lower than the content (the slot machine look: §A).
- Listing promises a feature the build doesn't have (leaderboards, skin count).
- Broken support or privacy URL.
- Crash or black screen on the reviewer's device (test an older iPhone, §E).
- "Minimum functionality" (4.2): not a risk for a full game, but the app must
  work fully offline and never show a blank web page.
