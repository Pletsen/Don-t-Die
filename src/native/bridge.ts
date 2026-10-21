// The thin seam between the web game and a native app shell (Capacitor on
// iOS). On the web every call here quietly falls back to a browser API or
// does nothing, so the game never depends on the shell being there.
//
// Plugins it looks for (by their Capacitor names), all optional:
//   Haptics             @capacitor/haptics              (iPhones ignore navigator.vibrate)
//   Preferences         @capacitor/preferences          (iOS can wipe a web view's localStorage)
//   Share               @capacitor/share                (web views have no navigator.share)
//   GameCenter          store/ios/game-center-plugin    (submitScore / showLeaderboard)
//   LocalNotifications  @capacitor/local-notifications  (Daily Run and streak reminders)
//   InAppReview         @capacitor-community/in-app-review (the App Store rating prompt)
//   App                 @capacitor/app                  (the app's version)
//   RewardedAds         (later) a rewarded-video plugin  (isReady / show)
// store/ios-plan.md has the versions and the iOS setup.

import { Capacitor, registerPlugin } from '@capacitor/core';

// Capacitor only puts a plugin on `Capacitor.Plugins` once its JS side is
// registered. Registering by name is all the JS side does, so the game needs
// none of the plugin packages: the native app ships their native halves. Only
// plugins the app really has are registered, so a missing one stays undefined.
// (On the web nothing is registered and every call below is a no-op.)
const PLUGIN_NAMES = ['Haptics', 'Preferences', 'Share', 'GameCenter', 'LocalNotifications', 'InAppReview', 'App', 'RewardedAds'];
if (Capacitor.isNativePlatform()) {
  for (const name of PLUGIN_NAMES) if (Capacitor.isPluginAvailable(name)) registerPlugin(name);
}

interface PendingNotification {
  id: number;
  title: string;
  body: string;
  schedule: { at: Date; allowWhileIdle?: boolean };
}

interface CapPlugins {
  Haptics?: {
    impact(o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>;
    notification(o: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): Promise<void>;
  };
  Preferences?: {
    get(o: { key: string }): Promise<{ value: string | null }>;
    set(o: { key: string; value: string }): Promise<void>;
    keys(): Promise<{ keys: string[] }>;
  };
  Share?: { share(o: { title?: string; text?: string; url?: string; files?: string[] }): Promise<unknown> };
  GameCenter?: {
    submitScore(o: { leaderboardId: string; score: number }): Promise<void>;
    showLeaderboard(o: { leaderboardId: string }): Promise<void>;
  };
  LocalNotifications?: {
    checkPermissions(): Promise<{ display: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' }>;
    requestPermissions(): Promise<{ display: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' }>;
    schedule(o: { notifications: PendingNotification[] }): Promise<unknown>;
    cancel(o: { notifications: { id: number }[] }): Promise<void>;
  };
  InAppReview?: { requestReview(): Promise<void> };
  App?: { getInfo(): Promise<{ version: string; build: string }> };
  RewardedAds?: {
    isReady(o: { placement: string }): Promise<{ ready: boolean }>;
    show(o: { placement: string }): Promise<{ rewarded: boolean }>;
  };
}

function plugins(): CapPlugins | null {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: CapPlugins } }).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins ?? null) : null;
}

const quiet = (p: Promise<unknown> | undefined) => {
  p?.catch(() => {});
};

// --- Haptics -------------------------------------------------------------------

/** Vibrate: a number (ms) or a pattern, mapped to the closest native feel. */
export function vibrate(pattern: number | number[]) {
  const h = plugins()?.Haptics;
  if (h) {
    if (Array.isArray(pattern)) quiet(h.notification({ type: pattern.length > 3 ? 'SUCCESS' : 'WARNING' }));
    else quiet(h.impact({ style: pattern <= 10 ? 'LIGHT' : pattern <= 30 ? 'MEDIUM' : 'HEAVY' }));
    return;
  }
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (e.g. iOS Safari).
  }
}

// --- Storage backup --------------------------------------------------------------

const PREFIX = 'dontdie_';

/** Mirror a saved value to native storage, which iOS doesn't clear. */
export function backup(key: string, value: string) {
  if (!key.startsWith(PREFIX)) return;
  quiet(plugins()?.Preferences?.set({ key, value }));
}

/**
 * At boot: if the web view lost its storage but the native backup still has
 * the save, put it back and reload once. Returns true if it reloads.
 */
export async function restoreBackup(): Promise<boolean> {
  const prefs = plugins()?.Preferences;
  if (!prefs) return false;
  try {
    const { keys } = await prefs.keys();
    let restored = 0;
    for (const key of keys) {
      if (!key.startsWith(PREFIX) || localStorage.getItem(key) !== null) continue;
      const { value } = await prefs.get({ key });
      if (value === null) continue;
      localStorage.setItem(key, value);
      restored++;
    }
    if (restored > 0) {
      location.reload();
      return true;
    }
  } catch {
    // No backup to restore: carry on with what's there.
  }
  return false;
}

// --- Share -----------------------------------------------------------------------

export type ShareResult = 'shared' | 'copied' | 'failed';

/** Share an image (when the platform can) with a line of text. */
export async function share(text: string, image?: Blob): Promise<ShareResult> {
  try {
    if (typeof navigator.share === 'function') {
      const file = image ? new File([image], 'dont-die.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ text, files: [file] });
      else await navigator.share({ text });
      return 'shared';
    }
    const native = plugins()?.Share;
    if (native) {
      await native.share({ title: "DON'T DIE", text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    // Closing the share sheet is not an error worth showing.
    return (e as Error)?.name === 'AbortError' ? 'shared' : 'failed';
  }
}

// --- Leaderboards ----------------------------------------------------------------

export type Board = 'survival' | 'daily' | 'stars';

/** Game Center leaderboard ids (set up in App Store Connect). */
const BOARD_IDS: Record<Board, string> = {
  survival: 'dontdie.survival',
  daily: 'dontdie.daily',
  stars: 'dontdie.stars',
};

/** True when there are real leaderboards to show (the native app). */
export const hasLeaderboards = () => !!plugins()?.GameCenter;

export function submitScore(board: Board, score: number) {
  quiet(plugins()?.GameCenter?.submitScore({ leaderboardId: BOARD_IDS[board], score: Math.floor(score) }));
}

export function showLeaderboard(board: Board) {
  quiet(plugins()?.GameCenter?.showLeaderboard({ leaderboardId: BOARD_IDS[board] }));
}

// --- Native prompts: notification permission and the rating ---------------------
//
// Both are system dialogs, so they only ever come up at a calm moment (the
// menu or the level map, see calmMoment) and never during a run or on a death
// card. At most one per app session. A small record of what was asked is
// kept with the save.

const ASKED_KEY = 'dontdie_native_asked';
const asked: { notifications?: boolean; review?: string } = (() => {
  try {
    return JSON.parse(localStorage.getItem(ASKED_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
})();

function rememberAsked() {
  const value = JSON.stringify(asked);
  try {
    localStorage.setItem(ASKED_KEY, value);
  } catch {
    // The worst case is asking again.
  }
  backup(ASKED_KEY, value);
}

const want = { notifications: false, review: false };
let promptedThisSession = false;

/**
 * The player just finished a Daily Run: a good time to offer the reminders
 * (asked once, at the next calm moment; never on first launch).
 */
export function offerReminders() {
  if (!asked.notifications) want.notifications = true;
}

/**
 * A great moment (a 3-star clear, a new Survival record): ask for an App Store
 * rating at the next calm moment, once per app version. iOS itself also caps
 * the prompt at three times a year.
 */
export function offerReview() {
  want.review = true;
}

/** The menu or the level map is showing and nothing is moving: show one pending prompt. */
export function calmMoment() {
  const p = plugins();
  if (!p || promptedThisSession) return;
  if (want.notifications && p.LocalNotifications) {
    want.notifications = false;
    promptedThisSession = true;
    asked.notifications = true;
    rememberAsked();
    p.LocalNotifications.requestPermissions()
      .then((r) => r.display === 'granted' && syncReminders())
      .catch(() => {});
    return;
  }
  if (want.review && p.InAppReview) {
    want.review = false;
    void (async () => {
      const version = (await p.App?.getInfo().catch(() => null))?.version ?? '?';
      if (asked.review === version) return;
      promptedThisSession = true;
      asked.review = version;
      rememberAsked();
      quiet(p.InAppReview?.requestReview());
    })();
  }
}

// --- Local notifications: the Daily Run and the streak ---------------------------
//
// The Daily Run changes at midnight UTC (game/daily.ts), so every reminder is
// placed inside the UTC day it is about, at a friendly local time:
//   YOUR DAILY RUN IS READY   ~18:00 local, today (if not played yet) and the
//                             next two days; a player who stops coming back
//                             stops hearing from the game after that.
//   YOUR STREAK ENDS TONIGHT  ~20:00 local on the last day the streak can be
//                             saved, only for a streak of 2+ days.
// The whole plan is rebuilt (cancel + schedule) whenever something changes:
// at launch, back from the background, after a Daily Run, after a claim.

/** What progress knows, for planning the reminders. */
export interface ReminderState {
  /** Today's UTC day number (game/daily.ts dayNumber). */
  today: number;
  /** Today's Daily Run has been played. */
  playedToday: boolean;
  /** The current streak (consecutive claimed days), 0 if none. */
  streak: number;
  /** The last UTC day the streak can still be claimed on. */
  streakDeadline: number;
  /** The Daily Run's twist on a day, e.g. 'SAW STORM'. */
  twist(day: number): string;
}

const DAY_MS = 86_400_000;
const HOUR = 3_600_000;
const READY_IDS = [7101, 7102, 7103];
const STREAK_ID = 7110;

/** The moment it is hour:min local time inside UTC day `day` (each UTC day holds one). */
function localTimeIn(day: number, hour: number, min = 0): number {
  const start = day * DAY_MS;
  for (const probe of [start, start + DAY_MS - 1]) {
    const d = new Date(probe);
    d.setHours(hour, min, 0, 0);
    if (d.getTime() >= start && d.getTime() < start + DAY_MS) return d.getTime();
  }
  return start + DAY_MS / 2;
}

const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toUpperCase();

/** The reminders to have scheduled right now (pure: easy to test). */
export function planReminders(s: ReminderState, now = Date.now()) {
  const out: { id: number; title: string; body: string; at: number }[] = [];
  READY_IDS.forEach((id, i) => {
    const day = s.today + i;
    if (i === 0 && s.playedToday) return;
    const start = day * DAY_MS;
    // 18:00 local, but never in the day's first hour or its last three.
    const at = Math.max(start + HOUR, Math.min(localTimeIn(day, 18), start + DAY_MS - 3 * HOUR));
    if (at <= now + 60_000) return;
    out.push({ id, title: 'YOUR DAILY RUN IS READY', body: `TODAY: ${s.twist(day)}. SAME TRACK FOR EVERYONE.`, at });
  });

  if (s.streak >= 2 && s.streakDeadline >= s.today) {
    const end = (s.streakDeadline + 1) * DAY_MS;
    // 20:00 local if that is a sensible while before the deadline, else three
    // hours before it; never at night.
    const fits = (t: number) => {
      const h = new Date(t).getHours();
      return t >= end - 14 * HOUR && t <= end - HOUR && h >= 8 && h < 22;
    };
    const at = [localTimeIn(s.streakDeadline, 20), end - 3 * HOUR].find(fits);
    const endHour = new Date(end).getHours();
    if (at !== undefined && at > now + 60_000) {
      out.push({
        id: STREAK_ID,
        title: endHour >= 18 || endHour < 6 ? 'YOUR STREAK ENDS TONIGHT' : 'YOUR STREAK ENDS SOON',
        body: `CLAIM DAY ${s.streak + 1} IN DAILY BEFORE ${clockTime(end)} TO KEEP YOUR ${s.streak}-DAY STREAK.`,
        at,
      });
    }
  }
  return out;
}

let reminderSource: (() => ReminderState) | null = null;
let reminderQueue: Promise<unknown> = Promise.resolve();

/** progress gives the bridge a way to read its state; plans the reminders right away. */
export function setReminderSource(source: () => ReminderState) {
  const first = !reminderSource;
  reminderSource = source;
  syncReminders();
  // Back from the background: the day may have changed.
  if (first && plugins()) document.addEventListener('visibilitychange', () => !document.hidden && syncReminders());
}

/** Rebuild the scheduled reminders from the current state (native app, permission given). */
export function syncReminders() {
  const ln = plugins()?.LocalNotifications;
  const source = reminderSource;
  if (!ln || !source) return;
  // One rebuild at a time, so an older plan can never land after a newer one.
  reminderQueue = reminderQueue
    .then(async () => {
      if ((await ln.checkPermissions()).display !== 'granted') return;
      await ln.cancel({ notifications: [...READY_IDS, STREAK_ID].map((id) => ({ id })) });
      const plan = planReminders(source());
      if (plan.length === 0) return;
      await ln.schedule({
        notifications: plan.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true } })),
      });
    })
    .catch(() => {});
}

// --- Rewarded ads (a hook for later) ---------------------------------------------
//
// Nothing shows ads yet. When a rewarded-video plugin is added, the death
// card could offer "WATCH AN AD TO CONTINUE" next to the duck price: call
// showRewardedAd('continue') and, if it resolves true, emit EV.continueRun
// with 'ad' (GameScene then skips the duck price).

export type AdPlacement = 'continue';

/** True when a rewarded ad could be shown right now. Always false on the web. */
export async function rewardedAdReady(placement: AdPlacement): Promise<boolean> {
  try {
    return !!(await plugins()?.RewardedAds?.isReady({ placement }))?.ready;
  } catch {
    return false;
  }
}

/** Show a rewarded ad. Resolves true only if it was watched to the end; on the web, false. */
export async function showRewardedAd(placement: AdPlacement): Promise<boolean> {
  try {
    return !!(await plugins()?.RewardedAds?.show({ placement }))?.rewarded;
  } catch {
    return false;
  }
}
