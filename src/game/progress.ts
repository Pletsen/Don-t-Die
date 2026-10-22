import { EV, type HudData, type NotifyData, type RunMode, type StatEvent } from './shared';
import { save } from './storage';
import { readJSON, writeJSON } from './persist';
import { ALL_LEVELS, LEVELS, LEVELS_OF, UNLOCK_AT, levelById, levelId, levelNumber, setOf } from './levels';
import { Missions, newMissionsData, type MissionCtx, type MissionsData } from './missions';
import { Achievements, type AchCtx } from './achievements';
import { Daily, DAILY_MILESTONES, dailyModifier, dayKey, dayNumber, newDailyData, todayKey, type DailyData } from './daily';
import { offerReminders, offerReview, setReminderSource, submitScore, syncReminders, type ReminderState } from '../native/bridge';

// Progress hub: lifetime stats, records, economy rewards, daily missions,
// streak and achievements. GameScene and the shop only *report* what happened
// (EV.stat events); everything here is derived from those reports and kept in
// one versioned save blob.
//
//   progress.attach(game)        once, at boot
//   progress.stats()             lifetime numbers for the Records screen
//   progress.levelBest(id)       best %, best time, attempts for a level
//   progress.survivalTop()       top-5 survival runs
//   progress.lastRun             rewards/records of the run that just ended
//   progress.missions / .daily / .achievements   the sub-systems
//   progress.onChange(fn)        refresh a screen when anything changes

const KEY = 'dontdie_progress_v1';
const VERSION = 1;

/** Economy (designer's numbers). */
export const ECONOMY = {
  /** Ducks per star you didn't have before: 1 in EASY, 2 in NORMAL, 4 in HARD MODE. */
  perNewStar: (id: number) => ({ easy: 1, normal: 2, hard: 4 })[setOf(id)],
  /** First clear of a level: 2 (level 1) up to 6 (level 20); EASY 1 to 4, HARD MODE double. */
  firstClear: (id: number) => {
    const k = (levelNumber(id) - 1) / Math.max(1, LEVELS.length - 1);
    const set = setOf(id);
    return set === 'easy' ? 1 + Math.round(k * 3) : (2 + Math.round(k * 4)) * (set === 'hard' ? 2 : 1);
  },
  /** Survival: one duck per this many metres. */
  survivalMetersPerDuck: 200,
  /** A free spin each time total stars reach one of these. */
  starRoad: [20, 40, 60],
};

export interface Stats {
  runs: number;
  levelRuns: number;
  survivalRuns: number;
  dailyRuns: number;
  clears: number;
  deaths: number;
  deathsBy: { wall: number; saw: number; bomb: number };
  /** Total metres travelled. */
  meters: number;
  /** Total seconds played. */
  seconds: number;
  perfects: number;
  bestCombo: number;
  nearMisses: number;
  /** Duck bonks (each duck once). */
  ducksBonked: number;
  /** Ducks collected in runs, by value (red = 5, frenzy taps ...). */
  ducksCollected: number;
  /** Every duck that reached the wallet, from any source. */
  ducksEarned: number;
  redDucks: number;
  goldenDucks: number;
  frenzies: number;
  bestFrenzy: number;
  abilities: number;
  /** Crashes bought back with a CONTINUE. */
  continues: number;
  /** Ducks spent on them. */
  continueDucks: number;
  warps: number;
  spins: number;
  newSkins: number;
  legendaries: number;
}

export interface LevelRecord {
  /** Best progress, 0..1 (1 = cleared). */
  best: number;
  /** Fastest clear in seconds (0 = never cleared). */
  time: number;
  attempts: number;
  clears: number;
  /** Best stars, as far as progress knows. */
  stars: number;
  /** UTC day of the first clear ('' = before progress tracking existed). */
  first: string;
}

export interface RunRecord {
  m: number;
  s: number;
  /** UTC day key ('' = unknown, from an older save). */
  key: string;
}

export interface ProgressData {
  v: number;
  /** UTC day this save started tracking. */
  since: string;
  stats: Stats;
  levels: Record<string, LevelRecord>;
  survival: { best: number; top: RunRecord[] };
  daily: DailyData;
  missions: MissionsData;
  /** Achievement id -> unlock time (ms). */
  achievements: Record<string, number>;
  /** Star Road thresholds already paid. */
  starRoad: number[];
}

/** Internal events between the sub-systems (achievements listen to these too). */
export type ProgressEvent = { type: 'streak'; count: number } | { type: 'mission'; count: number };

/** What the sub-systems (missions, daily, achievements) get from the hub. */
export interface ProgressHooks {
  readonly data: ProgressData;
  /** Something changed that must be saved. */
  dirty(): void;
  /** Something changed that a visible screen should redraw. */
  changed(): void;
  /** Pay ducks (goes through save.addDucks with a source tag). */
  reward(ducks: number, source: string): void;
  /** Show a banner. */
  notify(n: NotifyData): void;
  event(e: ProgressEvent): void;
}

/** What the run that just ended earned, for the death / clear cards. */
export interface RunSummary {
  mode: RunMode;
  level: number | null;
  meters: number;
  seconds: number;
  cleared: boolean;
  /**
   * Ducks paid by progress for this run (on top of the ducks bonked).
   * `live` ones were already paid (and announced) during the run.
   */
  rewards: { label: string; ducks: number; live?: boolean }[];
  ducks: number;
  /** Level: best progress (0..1) before/after. Survival/daily: best metres before/after. */
  bestBefore: number;
  best: number;
  newBest: boolean;
  /** Survival: place in the top 5 (1 = new record), else null. */
  rank: number | null;
  newStars: number;
  firstClear: boolean;
}

const newStats = (): Stats => ({
  runs: 0,
  levelRuns: 0,
  survivalRuns: 0,
  dailyRuns: 0,
  clears: 0,
  deaths: 0,
  deathsBy: { wall: 0, saw: 0, bomb: 0 },
  meters: 0,
  seconds: 0,
  perfects: 0,
  bestCombo: 0,
  nearMisses: 0,
  ducksBonked: 0,
  ducksCollected: 0,
  ducksEarned: 0,
  redDucks: 0,
  goldenDucks: 0,
  frenzies: 0,
  bestFrenzy: 0,
  abilities: 0,
  continues: 0,
  continueDucks: 0,
  warps: 0,
  spins: 0,
  newSkins: 0,
  legendaries: 0,
});

const newLevel = (): LevelRecord => ({ best: 0, time: 0, attempts: 0, clears: 0, stars: 0, first: '' });

function fresh(): ProgressData {
  return {
    v: VERSION,
    since: todayKey(),
    stats: newStats(),
    levels: {},
    survival: { best: 0, top: [] },
    daily: newDailyData(),
    missions: newMissionsData(),
    achievements: {},
    starRoad: [],
  };
}

/** First run with progress tracking: start from what the old save already knows. */
function migrate(d: ProgressData): ProgressData {
  for (const l of LEVELS) {
    const stars = save.starsFor(l.id);
    if (stars > 0) d.levels[l.id] = { ...newLevel(), best: 1, clears: 1, stars };
  }
  if (save.best > 0) {
    d.survival.best = save.best;
    d.survival.top = [{ m: save.best, s: 0, key: '' }];
  }
  d.stats.deaths = save.deaths;
  d.stats.warps = save.warps.size;
  return d;
}

/** Load, filling in anything a future or older version lacks. */
function load(): { data: ProgressData; isNew: boolean } {
  const raw = readJSON<Partial<ProgressData> | null>(KEY, null);
  if (!raw || typeof raw !== 'object' || typeof raw.v !== 'number') return { data: migrate(fresh()), isNew: true };
  const def = fresh();
  const data: ProgressData = {
    ...def,
    ...raw,
    v: VERSION,
    stats: { ...def.stats, ...raw.stats, deathsBy: { ...def.stats.deathsBy, ...raw.stats?.deathsBy } },
    levels: { ...raw.levels },
    survival: { ...def.survival, ...raw.survival },
    daily: { ...def.daily, ...raw.daily, streak: { ...def.daily.streak, ...raw.daily?.streak } },
    missions: { ...def.missions, ...raw.missions },
    achievements: { ...raw.achievements },
    starRoad: Array.isArray(raw.starRoad) ? raw.starRoad : [],
  };
  return { data, isNew: false };
}

interface Emitter {
  on(ev: string, fn: (...args: any[]) => void, ctx?: unknown): unknown;
  off(ev: string, fn: (...args: any[]) => void, ctx?: unknown): unknown;
  emit(ev: string, ...args: unknown[]): unknown;
  listenerCount(ev: string): number;
}

interface LiveRun {
  mode: RunMode;
  level: number | null;
  /** The record to beat when it started (metres), for the mid-run banner. */
  record: number;
  announced: boolean;
  /** Next Daily milestone (metres) to pay mid-run, or Infinity. */
  nextMilestone: number;
  /** Daily milestones paid during this run. */
  paid: RunSummary['rewards'];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

class Progress {
  private data: ProgressData;
  private events: Emitter | null = null;
  private listeners = new Set<() => void>();
  private pending: NotifyData[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private live: LiveRun | null = null;
  private isNew: boolean;

  readonly missions: Missions;
  readonly daily: Daily;
  readonly achievements: Achievements;
  /** What the last finished run earned (read it in the death / clear card). */
  lastRun: RunSummary | null = null;

  constructor() {
    const { data, isNew } = load();
    this.data = data;
    this.isNew = isNew;
    const self = this;
    const hooks: ProgressHooks = {
      get data() {
        return self.data;
      },
      dirty: () => this.dirty(),
      changed: () => this.changed(),
      reward: (n, source) => this.reward(n, source),
      notify: (n) => this.notify(n),
      event: () => this.achievements.check(),
    };
    this.missions = new Missions(hooks);
    this.daily = new Daily(hooks);
    this.achievements = new Achievements(hooks, (ev) => this.achCtx(ev));
    save.onDucks((n) => {
      if (n > 0) {
        this.data.stats.ducksEarned += n;
        this.dirty();
      }
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush());
      document.addEventListener('visibilitychange', () => document.hidden && this.flush());
    }
  }

  /** Start listening to the game. Safe to call more than once. */
  attach(game: { events: unknown }) {
    const events = game.events as Emitter;
    if (this.events === events) return;
    if (this.events) {
      this.events.off(EV.stat, this.onStat, this);
      this.events.off(EV.hud, this.onHud, this);
    }
    this.events = events;
    events.on(EV.stat, this.onStat, this);
    events.on(EV.hud, this.onHud, this);
    this.checkDay();
    // Catch up with an existing save (achievements and Star Road already earned).
    this.checkStarRoad();
    this.achievements.check(undefined, true);
    if (this.isNew) {
      this.isNew = false;
      this.flush();
    }
    // Native app: the Daily Run / streak reminders are planned from this save.
    setReminderSource(() => this.reminderState());
  }

  private reminderState(): ReminderState {
    const s = this.data.daily.streak;
    return {
      today: dayNumber(),
      playedToday: this.daily.run().attempts > 0,
      streak: this.daily.streak().count,
      // With a shield, one missed day is still saved.
      streakDeadline: s.lastDay + (s.shield > 0 ? 2 : 1),
      twist: (day) => dailyModifier(dayKey(day)).name,
    };
  }

  // --- Read API ---------------------------------------------------------------

  stats(): Readonly<Stats> {
    return this.data.stats;
  }

  /** Best progress, best time and attempts for a level. */
  levelBest(id: number): Readonly<LevelRecord> {
    return this.data.levels[id] ?? newLevel();
  }

  /** Best stars for a level (the larger of progress's and the old save's record). */
  starsFor(id: number): number {
    return Math.max(this.data.levels[id]?.stars ?? 0, save.starsFor(id));
  }

  totalStars(): number {
    return LEVELS.reduce((s, l) => s + this.starsFor(l.id), 0);
  }

  levelsCleared(): number {
    return LEVELS.filter((l) => this.starsFor(l.id) > 0).length;
  }

  survivalBest(): number {
    return this.data.survival.best;
  }

  survivalTop(): readonly RunRecord[] {
    return this.data.survival.top;
  }

  /** The distance to beat in this mode right now (for a record line on the track). */
  recordFor(mode: RunMode, level: number | null = null): number {
    if (mode === 'survival') return this.data.survival.best;
    if (mode === 'daily') return this.daily.run().best;
    return level === null ? 0 : this.levelBest(level).best;
  }

  /** Something to show on the DAILY button: a claimable streak or unfinished missions. */
  dailyBadge(): { claim: boolean; missionsLeft: number; streak: number } {
    this.checkDay();
    const st = this.daily.streak();
    return { claim: st.canClaim, missionsLeft: 3 - this.missions.completedToday, streak: st.count };
  }

  /** Call when a screen opens (and once a second while it's open): rolls over to a new UTC day. */
  checkDay(): boolean {
    const rolled = this.missions.ensureDay(this.missionCtx());
    if (rolled) {
      this.flush();
      this.changed();
    }
    return rolled;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Reroll a daily mission (one free per day). */
  rerollMission(slot: number): boolean {
    this.checkDay();
    const ok = this.missions.reroll(slot, this.missionCtx());
    if (ok) this.flush();
    return ok;
  }

  /** Claim today's streak reward. */
  claimStreak() {
    this.checkDay();
    const r = this.daily.claim();
    if (r) {
      this.flush();
      this.changed();
      syncReminders();
    }
    return r;
  }

  /** Show a banner (or keep it until a banner exists to show it). */
  notify(n: NotifyData) {
    if (this.events && this.events.listenerCount(EV.notify) > 0) this.events.emit(EV.notify, n);
    else this.pending.push(n);
  }

  /** NotifyBanner calls this once it listens, to show anything raised before it existed. */
  flushNotifications() {
    const list = this.pending;
    this.pending = [];
    list.forEach((n) => this.notify(n));
  }

  /** Write the save now. */
  flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    writeJSON(KEY, this.data);
  }

  /** Tests / debug: forget all progress (not the old save: ducks, skins, stars stay). */
  debugReset() {
    this.data = migrate(fresh());
    this.lastRun = null;
    this.live = null;
    this.flush();
    this.checkDay();
    this.changed();
  }

  /** Tests / debug: the raw blob. */
  debugData(): Readonly<ProgressData> {
    return this.data;
  }

  // --- Internals ----------------------------------------------------------------

  private dirty() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 1500);
  }

  private changed() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  }

  private reward(n: number, source: string) {
    if (n <= 0) return;
    save.addDucks(n, source);
  }

  /** The furthest level number open in any set (missions about saws wait until they've shown up). */
  private highestUnlocked(): number {
    let n = 1;
    for (const l of ALL_LEVELS) if (levelNumber(l.id) > 1 && this.starsFor(l.id - 1) > 0) n = Math.max(n, levelNumber(l.id));
    return n;
  }

  private missionCtx(): MissionCtx {
    const s = this.data.stats;
    return {
      unlocked: this.highestUnlocked(),
      ducksSeen: s.ducksCollected + save.ducks,
      survivalBest: this.data.survival.best,
      clears: s.clears + this.levelsCleared(),
    };
  }

  private achCtx(ev?: StatEvent): AchCtx {
    return {
      stats: this.data.stats,
      starsFor: (id) => this.starsFor(id),
      totalStars: this.totalStars(),
      skins: save.skins.size,
      warps: save.warps.size,
      survivalBest: this.data.survival.best,
      dailyBest: this.data.daily.bestEver.m,
      streakBest: this.data.daily.streak.best,
      missionsDone: this.data.missions.completed,
      ev,
    };
  }

  private onHud(d: HudData) {
    const run = this.live;
    if (!run || run.mode === 'level') return;
    if (!run.announced && run.record >= 25 && d.meters > run.record) {
      run.announced = true;
      this.notify({
        title: run.mode === 'daily' ? 'NEW DAILY BEST!' : 'NEW RECORD!',
        subtitle: `PAST ${run.record.toFixed(1)} M · KEEP GOING`,
        color: 0xff9a2e,
        live: true,
      });
    }
    if (run.mode === 'daily' && d.meters >= run.nextMilestone) {
      this.payMilestones(d.meters, run.paid);
      run.nextMilestone = this.nextMilestone(d.meters);
      this.changed();
    }
  }

  private payMilestones(meters: number, into: RunSummary['rewards']) {
    const before = this.daily.run().milestones;
    if (!this.daily.reachMeters(meters)) return;
    const after = this.daily.run().milestones;
    after.forEach((ms, i) => {
      if (ms.paid && !before[i].paid) into.push({ label: `DAILY ${ms.m} M`, ducks: ms.ducks, live: true });
    });
  }

  private nextMilestone(meters: number): number {
    const paid = this.daily.run().milestones;
    return paid.find((ms) => !ms.paid && ms.m > meters)?.m ?? Infinity;
  }

  private onStat(ev: StatEvent) {
    this.checkDay();
    const s = this.data.stats;
    switch (ev.type) {
      case 'runStart':
        this.live = {
          mode: ev.mode,
          level: ev.level,
          record: ev.mode === 'level' ? 0 : this.recordFor(ev.mode),
          announced: false,
          nextMilestone: ev.mode === 'daily' ? this.nextMilestone(0) : Infinity,
          paid: [],
        };
        break;
      case 'runEnd':
        this.onRunEnd(ev);
        break;
      case 'perfect':
        s.perfects++;
        s.bestCombo = Math.max(s.bestCombo, ev.combo);
        break;
      case 'nearMiss':
        s.nearMisses++;
        break;
      case 'duck':
        s.ducksBonked++;
        s.ducksCollected += ev.value;
        if (ev.variant === 'red') s.redDucks++;
        if (ev.variant === 'golden') s.goldenDucks++;
        break;
      case 'frenzy':
        s.frenzies++;
        s.bestFrenzy = Math.max(s.bestFrenzy, ev.count);
        s.ducksCollected += ev.count;
        break;
      case 'ability':
        s.abilities++;
        break;
      case 'continue':
        // A crash that was bought back is still a crash. (The run's end,
        // clear or crash, is reported once, by its runEnd.)
        s.continues++;
        s.continueDucks += ev.cost;
        s.deaths++;
        s.deathsBy[ev.cause]++;
        break;
      case 'warp':
        s.warps++;
        break;
      case 'spin':
        s.spins++;
        if (ev.isNew) s.newSkins++;
        if (ev.rarity === 'legendary') s.legendaries++;
        break;
    }
    this.dirty();
    if (ev.type !== 'runEnd') {
      this.missions.onStat(ev);
      this.achievements.check(ev);
    }
  }

  private onRunEnd(ev: Extract<StatEvent, { type: 'runEnd' }>) {
    const s = this.data.stats;
    s.runs++;
    if (ev.mode === 'level') s.levelRuns++;
    else if (ev.mode === 'survival') s.survivalRuns++;
    else s.dailyRuns++;
    s.meters += Math.max(0, ev.meters);
    s.seconds += Math.max(0, ev.seconds);
    s.bestCombo = Math.max(s.bestCombo, ev.bestCombo);
    if (ev.cleared) s.clears++;
    else {
      s.deaths++;
      if (ev.cause) s.deathsBy[ev.cause]++;
    }

    const sum: RunSummary = {
      mode: ev.mode,
      level: ev.level,
      meters: ev.meters,
      seconds: ev.seconds,
      cleared: ev.cleared,
      rewards: [],
      ducks: 0,
      bestBefore: 0,
      best: 0,
      newBest: false,
      rank: null,
      newStars: 0,
      firstClear: false,
    };
    const live = this.live;
    this.live = null;

    if (ev.mode === 'level' && ev.level !== null && levelById(ev.level)) this.endLevel(ev, sum);
    else if (ev.mode === 'survival') this.endSurvival(ev, sum);
    else if (ev.mode === 'daily') this.endDaily(ev, sum, live);

    // Pay the run's routine rewards (live ones were paid already). No banner:
    // the clear screen and the death card list them already.
    sum.ducks = sum.rewards.reduce((t, r) => t + r.ducks, 0);
    for (const r of sum.rewards) if (!r.live) this.reward(r.ducks, 'reward');
    this.lastRun = sum;

    // Game Center (native app only; nothing happens on the web).
    if (ev.mode === 'survival') submitScore('survival', ev.meters);
    else if (ev.mode === 'daily') submitScore('daily', ev.meters);
    else if (sum.newStars > 0) submitScore('stars', this.totalStars() + save.hardStars());
    // Native prompts wait for a calm moment (UIScene), never a death card: a
    // rating after a great run, the reminders after a Daily Run.
    if ((ev.cleared && ev.stars === 3 && levelNumber(ev.level ?? 0) >= 5) || (ev.mode === 'survival' && sum.newBest && sum.bestBefore >= 200)) offerReview();
    if (ev.mode === 'daily') {
      offerReminders();
      syncReminders();
    }

    this.missions.onStat(ev);
    this.achievements.check(ev);
    this.flush();
    this.changed();
  }

  private endLevel(ev: Extract<StatEvent, { type: 'runEnd' }>, sum: RunSummary) {
    const id = ev.level!;
    const rec = (this.data.levels[id] ??= newLevel());
    rec.attempts++;
    sum.bestBefore = rec.best;
    const p = ev.cleared ? 1 : clamp01(ev.progress);
    if (p > rec.best) {
      rec.best = p;
      // Only a failed attempt that got further than before is a "NEW BEST %".
      // (The death card shows it; no banner.)
      if (!ev.cleared && sum.bestBefore > 0 && p - sum.bestBefore >= 0.01) sum.newBest = true;
    }
    sum.best = rec.best;
    if (!ev.cleared) return;

    rec.clears++;
    if (rec.clears === 1) {
      sum.firstClear = true;
      rec.first = todayKey();
      sum.rewards.push({ label: 'FIRST CLEAR', ducks: ECONOMY.firstClear(id) });
      // EASY 10 opens NORMAL, NORMAL 10 opens HARD (unless it was open already).
      const opens = id === levelId('easy', UNLOCK_AT) ? 'normal' : id === levelId('normal', UNLOCK_AT) ? 'hard' : null;
      if (opens && !LEVELS_OF[opens].some((l) => this.starsFor(l.id) > 0)) {
        if (opens === 'normal') this.notify({ title: 'NORMAL UNLOCKED', subtitle: '20 LEVELS · FASTER, MORE TO DODGE', color: 0x2be8ff });
        else this.notify({ title: 'HARD MODE UNLOCKED', subtitle: '20 REMIXED LEVELS · SEE LEVELS', color: 0xff2d55 });
      }
    }
    // The fastest clear is a clean one: a CONTINUE doesn't set the record.
    if (!ev.continued && (rec.time === 0 || ev.seconds < rec.time)) rec.time = ev.seconds;
    const newStars = Math.max(0, ev.stars - rec.stars);
    if (newStars > 0) {
      rec.stars = ev.stars;
      sum.newStars = newStars;
      sum.rewards.push({ label: newStars === 1 ? 'NEW STAR' : `${newStars} NEW STARS`, ducks: newStars * ECONOMY.perNewStar(id) });
      this.checkStarRoad();
    }
  }

  private endSurvival(ev: Extract<StatEvent, { type: 'runEnd' }>, sum: RunSummary) {
    const sv = this.data.survival;
    const m = ev.meters;
    sum.bestBefore = sv.best;
    const bonus = Math.floor(m / ECONOMY.survivalMetersPerDuck);
    if (bonus > 0) sum.rewards.push({ label: `DISTANCE BONUS · ${Math.floor(m)} M`, ducks: bonus });

    if (m > 1) {
      const entry: RunRecord = { m, s: ev.seconds, key: todayKey() };
      const top = [...sv.top, entry].sort((a, b) => b.m - a.m).slice(0, 5);
      const rank = top.indexOf(entry);
      sv.top = top;
      if (rank >= 0) sum.rank = rank + 1;
    }
    if (m > sv.best) {
      sv.best = m;
      sum.newBest = true;
    }
    sum.best = sv.best;
  }

  private endDaily(ev: Extract<StatEvent, { type: 'runEnd' }>, sum: RunSummary, live: LiveRun | null) {
    sum.bestBefore = this.daily.run().best;
    // Milestones are normally paid live (from the HUD); this catches the rest.
    const paid = live?.paid ?? [];
    this.payMilestones(ev.meters, paid);
    sum.rewards.push(...paid.map((r) => ({ ...r, live: true })));
    this.daily.endRun(ev.meters);
    sum.newBest = ev.meters > sum.bestBefore;
    sum.best = this.daily.run().best;
    // (The death card shows NEW DAILY BEST.)
  }

  /** A free spin for every Star Road threshold reached. */
  private checkStarRoad() {
    const total = this.totalStars();
    for (const at of ECONOMY.starRoad) {
      if (total < at || this.data.starRoad.includes(at)) continue;
      this.data.starRoad.push(at);
      save.addFreeSpins(1);
      this.notify({ title: `STAR ROAD · ${at} STARS`, subtitle: 'FREE CHARGE FOR THE QUACK REACTOR', color: 0xffd21f });
      this.dirty();
    }
  }
}

/** The one progress tracker. Call `progress.attach(game)` once at boot. */
export const progress = new Progress();

/** Daily milestones, re-exported for screens. */
export { DAILY_MILESTONES };
