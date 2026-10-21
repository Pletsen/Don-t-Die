// The thin seam between the web game and a native app shell (Capacitor on
// iOS). On the web every call here quietly falls back to a browser API or
// does nothing, so the game never depends on the shell being there.
//
// Plugins it looks for (by their Capacitor names), all optional:
//   Haptics      @capacitor/haptics        (iPhones ignore navigator.vibrate)
//   Preferences  @capacitor/preferences    (iOS can wipe a web view's localStorage)
//   Share        @capacitor/share          (web views have no navigator.share)
//   GameCenter   a Game Center plugin exposing submitScore / showLeaderboard
//   RewardedAds  (later) a rewarded-video plugin exposing isReady / show

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
