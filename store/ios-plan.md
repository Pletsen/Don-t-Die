# DON'T DIE on iOS: the plan

Status: **prepared, not built.** The owner wants the game finished first. Nothing
here runs until someone starts step 1. No Mac is needed at any point: the app
is built on GitHub's macOS runners (or another cloud Mac) and installed from
TestFlight.

What is ready in the repo:

| Path | What |
|---|---|
| `src/native/bridge.ts` | The only place the game talks to iOS. Registers the plugins the app has; every call is a no-op on the web. Haptics, save backup, share, Game Center, Daily Run / streak reminders, the rating prompt. |
| `store/ios/capacitor.config.ts` | Capacitor settings (copy to the repo root in step 2). |
| `store/ios/configure-ios.sh` + `configure-xcode.rb` | Turns a fresh `npx cap add ios` into the DON'T DIE app: Info.plist, icon, launch art, entitlements, privacy manifest, iPhone only. Tested on Capacitor 8.5's template. |
| `store/ios/game-center-plugin/` | A small Swift plugin (`GameCenter`): quiet sign-in, scores, leaderboard sheet. |
| `store/ios/App.entitlements`, `PrivacyInfo.xcprivacy`, `ExportOptions.plist` | Copied in by the scripts / used by the upload. |
| `store/ios/testflight.yml` | The GitHub Actions workflow (inactive until copied to `.github/workflows/`). |
| `store/art/` | App icon 1024, launch art 1024 + 2732 (rendered by `store/art.cjs`). |

The iOS project (`ios/`) is **not** kept in git: CI makes it fresh on every
build from the files above. Nobody ever has to open Xcode.

---

## 1. Plugins and versions

Capacitor 8 needs Xcode 26+ (GitHub's `macos-26` runner has it), iOS 15+ on
the phone and Node 22+. Versions as of Oct 2026, all published for Capacitor 8
with Swift Package Manager support:

| Package | Version | Capacitor name | Used for |
|---|---|---|---|
| `@capacitor/core` | 8.5.2 | | already a dependency (bridge.ts) |
| `@capacitor/cli` (dev) | 8.5.2 | | `npx cap add/sync` |
| `@capacitor/ios` | 8.5.2 | | the native shell |
| `@capacitor/haptics` | 8.0.2 | `Haptics` | taps, PERFECT, crash (iPhones ignore `navigator.vibrate`) |
| `@capacitor/preferences` | 8.0.1 | `Preferences` | backup of the save outside the web view |
| `@capacitor/share` | 8.0.3 | `Share` | share sheet fallback |
| `@capacitor/local-notifications` | 8.3.1 | `LocalNotifications` | Daily Run / streak reminders |
| `@capacitor/app` | 8.1.2 | `App` | app version (rating prompt once per version) |
| `@capacitor/splash-screen` | 8.0.2 | `SplashScreen` | hold the launch art while WebGL starts (optional) |
| `@capacitor-community/in-app-review` | 8.0.0 | `InAppReview` | the App Store rating prompt |
| `dontdie-game-center` | `file:store/ios/game-center-plugin` | `GameCenter` | leaderboards |

The status bar needs no plugin: Capacitor 8's built-in SystemBars hides it
(config below).

Why our own Game Center plugin: the Capacitor 8 ports of the old community
plugin mix Objective-C and Swift in one Swift package target, which SPM can't
build. Ours is one Swift file with exactly the two calls bridge.ts makes:

```
GameCenter.submitScore({ leaderboardId, score })   // only if the player is signed in
GameCenter.showLeaderboard({ leaderboardId })
```

The JS side of every plugin is a single `registerPlugin(name)` in bridge.ts, so
the game imports none of these packages; they only bring their native code.

## 2. capacitor.config.ts

`store/ios/capacitor.config.ts`, the values that matter:

| Key | Value | Why |
|---|---|---|
| `appId` | `dk.dontdie.game` (proposal) | The bundle ID. Decide before the first upload; it can never change afterwards. |
| `appName` | `DON'T DIE` | |
| `webDir` | `dist` | `npm run build` output |
| `backgroundColor`, `ios.backgroundColor` | `#05070a` | no white flash |
| `ios.contentInset` | `never` | edge to edge; the game handles safe areas itself |
| `ios.scrollEnabled` | `false` | no rubber-band scrolling |
| `ios.allowsLinkPreview` | `false` | no long-press previews |
| `plugins.SystemBars` | `{ hidden: true, style: 'DARK' }` | no status bar in the game |
| `plugins.SplashScreen` | 1200 ms, fade 300 ms, no spinner | launch art stays up while WebGL boots |

Never change `appId` or Capacitor's `iosScheme` after release: the web view's
save is stored under them (the Preferences backup would restore it, but don't
rely on that).

## 3. Info.plist and project settings (all applied by configure-ios.sh)

| Setting | Value |
|---|---|
| `CFBundleDisplayName` | `DON'T DIE` (home screen name) |
| `UISupportedInterfaceOrientations` | Portrait only (**portrait lock**) |
| `UISupportedInterfaceOrientations~ipad` | Portrait, upside down |
| `UIRequiresFullScreen` | `YES` |
| `UIStatusBarHidden` | `YES` (hidden from the first frame) |
| `UIViewControllerBasedStatusBarAppearance` | `YES` (SystemBars needs it) |
| `UIRequiredDeviceCapabilities` | `arm64` |
| `ITSAppUsesNonExemptEncryption` | `NO` (export compliance, see privacy-policy.md) |
| `TARGETED_DEVICE_FAMILY` | `1`: iPhone only for 1.0 (no iPad screenshots needed) |
| `CODE_SIGN_ENTITLEMENTS` | `App/App.entitlements` (Game Center) |
| `PrivacyInfo.xcprivacy` | in the app bundle: no tracking, nothing collected, UserDefaults CA92.1 |
| App icon | `store/art/icon-1024.png` → `AppIcon-512@2x.png` (single 1024 icon) |
| Launch screen | `store/art/splash-2732.png` → `Splash.imageset`, dark background |
| `MARKETING_VERSION` | from `package.json` `version` (set it to `1.0.0` for release) |
| `CURRENT_PROJECT_VERSION` | the CI run number (every upload needs a new build number) |

No usage-description strings are needed: the app uses no camera, microphone,
photos, location or tracking. Local notifications need no Info.plist key (the
permission dialog text is Apple's).

**Safe areas.** The page is `viewport-fit=cover` and the web view is edge to
edge, so the game reads `env(safe-area-inset-top/bottom)` (`game/display.ts`).
On a real iPhone check that the HUD sits below the Dynamic Island and that the
ability pill and bottom buttons sit above the home indicator.

**Audio.** iOS can mute Web Audio with the silent switch, and after a phone
call the audio context comes back "interrupted". Check both on the device;
if sound stays off after a call, `Sfx.unlock()` should resume the context
whenever `ctx.state !== 'running'` (it currently checks for `'suspended'`).

## 4. Game Center

Leaderboard IDs already used in `src/native/bridge.ts` (scores are sent at the
end of each run by `game/progress.ts`):

| ID | What | Score | App Store Connect setup |
|---|---|---|---|
| `dontdie.survival` | best Survival distance | metres, integer | Classic, high to low, "Integer", suffix " M" |
| `dontdie.daily` | today's Daily Run | metres, integer | **Recurring**: starts 00:00 UTC, lasts 1 day, repeats daily (the Daily Run flips at midnight UTC) |
| `dontdie.stars` | total stars (normal + HARD) | count | Classic, high to low |

Set them up under App Store Connect > the app > Services > Game Center.
Scores are already submitted, but **no screen opens the leaderboards yet**:
`showLeaderboard(board)` and `hasLeaderboards()` exist in bridge.ts, so a
small button on the RECORDS screen (shown only when `hasLeaderboards()`) is a
to-do before 1.0, or drop "Game Center leaderboards" from the listing.
Achievements: the game has 35 of its own; mirroring them to Game Center is a
nice 1.1 item, not needed for 1.0.

## 5. Native hooks (already in the game)

- **Reminders** (`syncReminders` in bridge.ts, planned from `progress`):
  "YOUR DAILY RUN IS READY" around 18:00 local time (today if not played, and
  the next two days, then silence until the player comes back) and "YOUR
  STREAK ENDS TONIGHT" around 20:00 on the last day a 2+ day streak can be
  saved. All times fall inside the UTC day the Daily Run belongs to, so they
  are right in every time zone (tested: Copenhagen, New York, Los Angeles,
  Tokyo, Sydney). Rebuilt at launch, when the app comes back, after a Daily
  Run and after a streak claim.
- **Permission** is asked once, after the first Daily Run, at the next calm
  moment (menu or level map, 1.2 s after it appears). Never at first launch,
  never during a run or on a death card.
- **Rating prompt** (`InAppReview.requestReview`): once per app version, after
  a 3-star clear of level 5+ or a new Survival record (beating at least
  200 m), at the next calm moment. iOS itself caps it at 3 a year and never
  shows it in TestFlight.
- At most one system prompt per app session.

## 6. Build on GitHub Actions and upload to TestFlight (no Mac)

One-time setup, about an hour, all in a browser:

1. **Apple Developer Program**: enrol at developer.apple.com (99 USD a year;
   as an individual or as a company with a D-U-N-S number). Wait for the
   approval mail (usually a day or two).
2. **Bundle ID**: decide it (proposal `dk.dontdie.game`). developer.apple.com >
   Certificates, Identifiers & Profiles > Identifiers > + > App IDs > App.
   Enter the ID, tick **Game Center** (on by default). Push Notifications is
   *not* needed (reminders are local).
3. **App record**: appstoreconnect.apple.com > Apps > + > New App. Platform
   iOS, name `DON'T DIE: One Tap` (store/listing.md), primary language English,
   the bundle ID from step 2, SKU e.g. `dontdie-ios`. This also reserves the
   name.
4. **API key for CI**: App Store Connect > Users and Access > Integrations >
   App Store Connect API > Team Keys > +. Name `GitHub CI`, access **Admin**
   (needed so Xcode may create the cloud-managed distribution certificate and
   profiles by itself). Download the `.p8` (only possible once), note the Key
   ID and the Issuer ID.
5. **Team ID**: developer.apple.com > Account > Membership details.
6. **GitHub secrets**: github.com/Pletsen/Don-t-Die > Settings > Secrets and
   variables > Actions > New repository secret:
   - `APPLE_TEAM_ID`
   - `ASC_KEY_ID`
   - `ASC_ISSUER_ID`
   - `ASC_KEY_P8`: the .p8 file base64-encoded (on Windows:
     `certutil -encode AuthKey_X.p8 out.txt`, then paste the lines between the
     BEGIN/END lines; on Linux/macOS: `base64 -i AuthKey_X.p8`).

Turning the iOS build on (one commit, when the game is done):

7. Install the native packages and the Game Center plugin:
   ```
   npm install --save-exact @capacitor/ios@8.5.2 @capacitor/haptics@8.0.2 \
     @capacitor/preferences@8.0.1 @capacitor/share@8.0.3 \
     @capacitor/local-notifications@8.3.1 @capacitor/app@8.1.2 \
     @capacitor/splash-screen@8.0.2 @capacitor-community/in-app-review@8.0.0 \
     ./store/ios/game-center-plugin
   npm install --save-dev --save-exact @capacitor/cli@8.5.2
   ```
8. Set `"version": "1.0.0"` in package.json (it becomes the App Store version).
9. Add `ios/` and `/capacitor.config.ts` to `.gitignore` (both are made by CI),
   and copy the workflow: `.github/workflows/testflight.yml` ←
   `store/ios/testflight.yml`. Commit and push.
10. GitHub > Actions > **iOS TestFlight** > Run workflow. About 15 minutes.
    The steps: build the web game, `npx cap add ios`, `configure-ios.sh`,
    `npx cap sync ios`, `xcodebuild archive` (signed automatically with the API
    key), `xcodebuild -exportArchive` with `destination: upload`.
11. App Store Connect > the app > TestFlight: the build appears after 5 to 30
    minutes of processing. Answer the export compliance question if asked (it
    shouldn't be: `ITSAppUsesNonExemptEncryption = NO`).
12. Add yourself (and friends) as testers: **Internal testing** (up to 100
    people in your team, no review) or **External testing** (up to 10,000
    with a public link, after a short beta review). Install the **TestFlight**
    app on the iPhone and accept the invite.
13. Every later build: push a tag (`git tag v1.0.1 && git push --tags`) or run
    the workflow by hand. The build number goes up by itself.

GitHub's macOS minutes are free for public repositories. If the workflow fails,
the log of the failing step says why; the usual first-time causes are a
missing secret, an API key without Admin access, or the bundle ID not matching
the App ID.

**Alternative to GitHub Actions**: Codemagic (codemagic.io, free tier with
macOS build minutes, a web UI and automatic App Store signing via the same API
key). Its build steps are the same commands as the workflow above. A rented
cloud Mac (MacinCloud, AWS EC2 Mac) also works with the same commands, plus
the option to open Xcode if something needs a look.

## 7. Before calling a build "the one"

See `store/launch-checklist.md`: performance on an older iPhone, safe areas,
audio after a call, notifications, Game Center, the rating prompt, offline
play, and the App Store Connect forms.
