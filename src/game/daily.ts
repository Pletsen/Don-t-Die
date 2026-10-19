import { palette } from './palette';
import { save } from './storage';
import type { HazardKind } from './Track';
import type { Placement } from './levels';
import type { ProgressHooks } from './progress';

// The Daily Run, the daily streak and the daily-run milestones.
//
// Everything "daily" uses the UTC calendar day, so every player in the world
// gets the same track and the same modifier on the same day, and the day
// flips at the same moment for everyone.

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 (UTC). */
export const dayNumber = (ms = Date.now()) => Math.floor(ms / DAY_MS);

/** 'YYYY-MM-DD' (UTC) for a day number. */
export function dayKey(day = dayNumber()): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today's key, 'YYYY-MM-DD' (UTC). */
export const todayKey = () => dayKey();

/** The day number for a 'YYYY-MM-DD' key. */
export const keyToDay = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY_MS);

/** Milliseconds until the next UTC midnight (when the daily content resets). */
export const msToNextDay = (ms = Date.now()) => (dayNumber(ms) + 1) * DAY_MS - ms;

/** "05:12:33" */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** "MON 19 OCT" for a 'YYYY-MM-DD' key. */
export function prettyDate(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "19 OCT" for a 'YYYY-MM-DD' key. */
export function shortDate(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** A stable 32-bit hash (FNV-1a) of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The track seed for a day: the same for every player. */
export const dailySeed = (key: string) => hashString(`dontdie-daily-${key}`) & 0x7fffffff;

// --- Weekday modifiers -------------------------------------------------------

/**
 * A daily modifier is plain data: how it bends the survival rules. `chance`
 * is survival's hazard chance at that distance; the modifier's chance is
 * `chance * chanceMul + chanceAdd` once past `after` metres.
 */
export interface DailyModifier {
  id: string;
  name: string;
  /** One line explaining the twist. */
  blurb: string;
  /** Accent for the Daily screen and the banner. */
  color: number;
  speedMul: number;
  /** px/s added to the speed. */
  speedAdd: number;
  widthMul: number;
  /** px added to the corridor's half width. */
  widthAdd: number;
  /** Hazard kinds; repeats make a kind more likely. */
  kinds: HazardKind[];
  chanceMul: number;
  chanceAdd: number;
  /** Hazard-free run-up, metres. */
  after: number;
  moving: number;
  placement: Placement;
  perSegment: 1 | 2;
  /** Play the whole run in the bonus universe's party look. */
  party?: boolean;
}

const base: Omit<DailyModifier, 'id' | 'name' | 'blurb' | 'color'> = {
  speedMul: 1,
  speedAdd: 0,
  widthMul: 1,
  widthAdd: 0,
  kinds: ['saw', 'bomb'],
  chanceMul: 1,
  chanceAdd: 0,
  after: 110,
  moving: 0.3,
  placement: 'side',
  perSegment: 1,
};

export const DAILY_MODIFIERS: DailyModifier[] = [
  { ...base, id: 'classic', name: 'CLASSIC', blurb: 'Pure survival. Same track for everyone.', color: palette.cyan },
  {
    ...base,
    id: 'sawstorm',
    name: 'SAW STORM',
    blurb: 'Saws everywhere. Some of them move.',
    color: palette.orange,
    kinds: ['saw'],
    chanceMul: 1.3,
    chanceAdd: 0.12,
    after: 60,
    moving: 0.5,
    placement: 'any',
    perSegment: 2,
  },
  {
    ...base,
    id: 'tightrope',
    name: 'TIGHTROPE',
    blurb: 'A narrow corridor. A little slower.',
    color: 0x3dffb5,
    widthMul: 0.8,
    speedMul: 0.94,
    chanceMul: 0.6,
  },
  {
    ...base,
    id: 'duckhunt',
    name: 'DUCK HUNT',
    blurb: 'Ducks among the saws. Keep every one.',
    color: 0xffd21f,
    kinds: ['duck', 'duck', 'saw', 'bomb'],
    chanceAdd: 0.35,
    after: 30,
    placement: 'any',
    perSegment: 2,
  },
  {
    ...base,
    id: 'fastlane',
    name: 'FAST LANE',
    blurb: 'Starts fast, gets faster. Wider road.',
    color: 0x7cff6b,
    speedMul: 1.12,
    speedAdd: 30,
    widthAdd: 6,
    chanceMul: 0.7,
  },
  {
    ...base,
    id: 'bombparty',
    name: 'BOMB PARTY',
    blurb: 'Bombs. Lots of bombs. Listen for the ticks.',
    color: palette.violet,
    kinds: ['bomb'],
    chanceMul: 1.3,
    chanceAdd: 0.12,
    after: 60,
    moving: 0.1,
    placement: 'any',
    perSegment: 2,
  },
  {
    ...base,
    id: 'universe2',
    name: 'UNIVERSE 2',
    blurb: 'The party universe, all run long. Bonk ducks!',
    color: palette.magenta,
    kinds: ['duck', 'duck', 'duck', 'saw'],
    chanceAdd: 0.5,
    after: 20,
    placement: 'any',
    perSegment: 2,
    party: true,
  },
];

/** Monday CLASSIC ... Sunday UNIVERSE 2 (UTC weekday). */
const BY_WEEKDAY = ['universe2', 'classic', 'sawstorm', 'tightrope', 'duckhunt', 'fastlane', 'bombparty'];

export function dailyModifier(key = todayKey()): DailyModifier {
  const wd = new Date(`${key}T00:00:00Z`).getUTCDay();
  const id = BY_WEEKDAY[Number.isNaN(wd) ? 1 : wd];
  return DAILY_MODIFIERS.find((m) => m.id === id) ?? DAILY_MODIFIERS[0];
}

// --- Rewards -----------------------------------------------------------------

/** Daily Run milestones: each pays once per day. */
export const DAILY_MILESTONES = [
  { m: 250, ducks: 10 },
  { m: 600, ducks: 15 },
  { m: 1000, ducks: 25 },
];

/** Streak rewards for day 1..7 of a cycle. Day 7 is a free spin instead of ducks. */
export const STREAK_REWARDS: { ducks: number; spins: number }[] = [
  { ducks: 10, spins: 0 },
  { ducks: 15, spins: 0 },
  { ducks: 20, spins: 0 },
  { ducks: 25, spins: 0 },
  { ducks: 30, spins: 0 },
  { ducks: 40, spins: 0 },
  { ducks: 0, spins: 1 },
];

// --- Saved state ---------------------------------------------------------------

export interface DailyDayRecord {
  /** Best distance in today's Daily Run, metres. */
  best: number;
  attempts: number;
  /** Milestone metres already paid today. */
  paid: number[];
  modifier: string;
}

export interface StreakData {
  /** Current streak length (consecutive claimed days, shield-bridged). */
  count: number;
  /** Day number of the last claim, or -1. */
  lastDay: number;
  /** Streak shields (max 1): protects one missed day. */
  shield: number;
  best: number;
  /** Lifetime claims. */
  claims: number;
}

export interface DailyData {
  days: Record<string, DailyDayRecord>;
  bestEver: { m: number; key: string };
  streak: StreakData;
}

export const newDailyData = (): DailyData => ({
  days: {},
  bestEver: { m: 0, key: '' },
  streak: { count: 0, lastDay: -1, shield: 1, best: 0, claims: 0 },
});

/** How many past days of Daily Run results are kept. */
const KEEP_DAYS = 30;

export type DayState = 'claimed' | 'today' | 'missed' | 'future';

export interface StreakView {
  /** The streak as it stands right now (0 if it already broke). */
  count: number;
  claimedToday: boolean;
  canClaim: boolean;
  shield: number;
  /** A shield would be used up by today's claim. */
  shieldAtRisk: boolean;
  best: number;
  /** 0..6: today's position in the 7-day track. */
  todayIndex: number;
  /** The reward today's claim gives (or gave). */
  reward: { ducks: number; spins: number };
  track: { day: number; ducks: number; spins: number; state: DayState }[];
}

export interface DailyRunView {
  key: string;
  modifier: DailyModifier;
  best: number;
  attempts: number;
  milestones: { m: number; ducks: number; paid: boolean }[];
  msToReset: number;
  bestEver: { m: number; key: string };
}

/**
 * Daily state machine. Owned by `progress`, which feeds it run events and
 * gives it the shared save blob through `hooks`.
 */
export class Daily {
  constructor(private hooks: ProgressHooks) {}

  private get data(): DailyData {
    return this.hooks.data.daily;
  }

  private today(key = todayKey()): DailyDayRecord {
    let rec = this.data.days[key];
    if (!rec) {
      rec = { best: 0, attempts: 0, paid: [], modifier: dailyModifier(key).id };
      this.data.days[key] = rec;
      // Forget old days.
      const keys = Object.keys(this.data.days).sort();
      while (keys.length > KEEP_DAYS) delete this.data.days[keys.shift()!];
    }
    return rec;
  }

  /** Today's Daily Run card. */
  run(): DailyRunView {
    const key = todayKey();
    const rec = this.data.days[key];
    return {
      key,
      modifier: dailyModifier(key),
      best: rec?.best ?? 0,
      attempts: rec?.attempts ?? 0,
      milestones: DAILY_MILESTONES.map((ms) => ({ ...ms, paid: !!rec?.paid.includes(ms.m) })),
      msToReset: msToNextDay(),
      bestEver: { ...this.data.bestEver },
    };
  }

  /** Past Daily Run results, newest first. */
  history(): ({ key: string } & DailyDayRecord)[] {
    return Object.entries(this.data.days)
      .filter(([, r]) => r.attempts > 0)
      .map(([key, r]) => ({ key, ...r }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }

  /**
   * Pays every milestone up to `meters` that wasn't paid today. Called live
   * during a Daily Run (from the HUD) and again when it ends.
   */
  reachMeters(meters: number): number {
    const rec = this.today();
    let total = 0;
    for (const ms of DAILY_MILESTONES) {
      if (meters < ms.m || rec.paid.includes(ms.m)) continue;
      rec.paid.push(ms.m);
      total += ms.ducks;
      this.hooks.reward(ms.ducks, 'daily');
      this.hooks.notify({ title: `DAILY RUN ${ms.m} M`, subtitle: 'MILESTONE REACHED', color: 0xffd21f, ducks: ms.ducks });
    }
    if (total) this.hooks.dirty();
    return total;
  }

  /** A Daily Run ended. Returns true if it beat today's best. */
  endRun(meters: number): { todayBest: boolean; everBest: boolean } {
    const key = todayKey();
    const rec = this.today(key);
    rec.attempts++;
    const todayBest = meters > rec.best;
    if (todayBest) rec.best = meters;
    const everBest = meters > this.data.bestEver.m;
    if (everBest) this.data.bestEver = { m: meters, key };
    this.reachMeters(meters);
    this.hooks.dirty();
    return { todayBest: todayBest && rec.attempts > 1, everBest };
  }

  // --- Streak --------------------------------------------------------------------

  /** The streak as shown on the Daily screen. */
  streak(): StreakView {
    const s = this.data.streak;
    const today = dayNumber();
    const claimedToday = s.lastDay === today;
    const gap = s.lastDay < 0 ? Infinity : today - s.lastDay;
    // Still alive: claimed today or yesterday, or one missed day a shield covers.
    const alive = claimedToday || gap === 1 || (gap === 2 && s.shield > 0);
    const count = alive ? s.count : 0;
    // Today's slot in the 7-day track.
    const position = claimedToday ? count : count + 1;
    const todayIndex = (position - 1) % 7;
    const cycleStart = position - todayIndex;
    const track = STREAK_REWARDS.map((r, i) => {
      const n = cycleStart + i;
      const state: DayState = n < position ? 'claimed' : n === position ? (claimedToday ? 'claimed' : 'today') : 'future';
      return { day: i + 1, ducks: r.ducks, spins: r.spins, state };
    });
    return {
      count,
      claimedToday,
      canClaim: !claimedToday,
      shield: s.shield,
      shieldAtRisk: !claimedToday && gap === 2 && s.shield > 0,
      best: s.best,
      todayIndex,
      reward: STREAK_REWARDS[todayIndex],
      track,
    };
  }

  /** Claim today's streak reward. Returns what was paid, or null if already claimed. */
  claim(): { day: number; ducks: number; spins: number; count: number; usedShield: boolean } | null {
    const s = this.data.streak;
    const today = dayNumber();
    if (s.lastDay === today) return null;
    const gap = s.lastDay < 0 ? Infinity : today - s.lastDay;
    let usedShield = false;
    if (gap === 1) s.count++;
    else if (gap === 2 && s.shield > 0) {
      s.shield--;
      usedShield = true;
      s.count++;
    } else s.count = 1;
    s.lastDay = today;
    s.claims++;
    s.best = Math.max(s.best, s.count);

    const index = (s.count - 1) % 7;
    const reward = STREAK_REWARDS[index];
    if (reward.ducks) this.hooks.reward(reward.ducks, 'streak');
    if (reward.spins) save.addFreeSpins(reward.spins);
    // Finishing a 7-day cycle refills the shield.
    if (index === 6) s.shield = 1;
    this.hooks.dirty();
    this.hooks.notify({
      title: `DAY ${s.count} STREAK`,
      subtitle: reward.spins
        ? `FREE SPIN ON THE DUCK-O-MATIC${usedShield ? ' · SHIELD USED' : ''}`
        : usedShield
          ? 'SHIELD SAVED YOUR STREAK'
          : 'COME BACK TOMORROW FOR MORE',
      color: 0xff9a2e,
      ducks: reward.ducks || undefined,
    });
    this.hooks.event({ type: 'streak', count: s.count });
    return { day: index + 1, ducks: reward.ducks, spins: reward.spins, count: s.count, usedShield };
  }

  /** Reward hook (e.g. a future rewarded ad): give back a streak shield. */
  grantShield() {
    this.data.streak.shield = 1;
    this.hooks.dirty();
    this.hooks.changed();
  }
}
