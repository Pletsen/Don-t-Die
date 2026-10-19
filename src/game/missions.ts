import type { StatEvent } from './shared';
import { seededRng } from './rng';
import { hashString, todayKey } from './daily';
import type { ProgressHooks } from './progress';

// Three daily missions (easy / medium / hard), picked from a pool by the UTC
// date, driven entirely by StatEvents. Finishing a mission pays ducks right
// away; finishing all three pays a bonus. One free reroll per day.

export type Tier = 'easy' | 'medium' | 'hard';

export const TIERS: Tier[] = ['easy', 'medium', 'hard'];
export const TIER_REWARD: Record<Tier, number> = { easy: 10, medium: 15, hard: 25 };
export const TIER_COLOR: Record<Tier, number> = { easy: 0x2be8ff, medium: 0xff9a2e, hard: 0xff2f9e };
export const ALL_DONE_BONUS = 20;
export const REROLLS_PER_DAY = 1;

/** What a mission may look at to decide if it makes sense for this player yet. */
export interface MissionCtx {
  /** Highest level id that's open to play (1 for a brand-new player). */
  unlocked: number;
  /** Ducks ever bonked: has the player met ducks at all? */
  ducksSeen: number;
  survivalBest: number;
  /** Total level clears. */
  clears: number;
}

export interface MissionDef {
  id: string;
  tier: Tier;
  goal: number;
  /** Shown on the Daily screen. */
  text: string;
  /** 'sum' adds up what `count` returns; 'best' keeps the highest value. */
  kind: 'sum' | 'best';
  count(ev: StatEvent): number;
  requires?(c: MissionCtx): boolean;
}

const end = (ev: StatEvent) => (ev.type === 'runEnd' ? ev : null);
const m = (def: MissionDef) => def;

export const MISSIONS: MissionDef[] = [
  // --- Easy (+10) ---
  m({ id: 'e_runs3', tier: 'easy', goal: 3, kind: 'sum', text: 'PLAY 3 RUNS', count: (ev) => (ev.type === 'runEnd' ? 1 : 0) }),
  m({ id: 'e_perfect10', tier: 'easy', goal: 10, kind: 'sum', text: 'MAKE 10 PERFECT TURNS', count: (ev) => (ev.type === 'perfect' ? 1 : 0) }),
  m({ id: 'e_combo3', tier: 'easy', goal: 3, kind: 'best', text: 'HIT A x3 PERFECT COMBO', count: (ev) => (ev.type === 'perfect' ? ev.combo : 0) }),
  m({
    id: 'e_survive150',
    tier: 'easy',
    goal: 150,
    kind: 'best',
    text: 'REACH 150 M IN SURVIVAL',
    count: (ev) => (end(ev)?.mode === 'survival' ? Math.floor(end(ev)!.meters) : 0),
  }),
  m({ id: 'e_near5', tier: 'easy', goal: 5, kind: 'sum', text: 'GET 5 CLOSE CALLS', count: (ev) => (ev.type === 'nearMiss' ? 1 : 0) }),
  m({ id: 'e_clear1', tier: 'easy', goal: 1, kind: 'sum', text: 'CLEAR ANY LEVEL', count: (ev) => (end(ev)?.cleared ? 1 : 0) }),
  m({ id: 'e_daily1', tier: 'easy', goal: 1, kind: 'sum', text: 'PLAY THE DAILY RUN', count: (ev) => (end(ev)?.mode === 'daily' ? 1 : 0) }),
  m({
    id: 'e_ducks10',
    tier: 'easy',
    goal: 10,
    kind: 'sum',
    text: 'COLLECT 10 DUCKS',
    count: (ev) => (ev.type === 'duck' ? ev.value : 0),
    requires: (c) => c.ducksSeen > 0,
  }),

  // --- Medium (+15) ---
  m({ id: 'm_perfect30', tier: 'medium', goal: 30, kind: 'sum', text: 'MAKE 30 PERFECT TURNS', count: (ev) => (ev.type === 'perfect' ? 1 : 0) }),
  m({ id: 'm_combo5', tier: 'medium', goal: 5, kind: 'best', text: 'HIT A x5 PERFECT COMBO', count: (ev) => (ev.type === 'perfect' ? ev.combo : 0) }),
  m({
    id: 'm_survive400',
    tier: 'medium',
    goal: 400,
    kind: 'best',
    text: 'REACH 400 M IN SURVIVAL',
    count: (ev) => (end(ev)?.mode === 'survival' ? Math.floor(end(ev)!.meters) : 0),
  }),
  m({ id: 'm_clear3', tier: 'medium', goal: 3, kind: 'sum', text: 'CLEAR 3 LEVELS', count: (ev) => (end(ev)?.cleared ? 1 : 0) }),
  m({
    id: 'm_stars2',
    tier: 'medium',
    goal: 1,
    kind: 'sum',
    text: 'CLEAR A LEVEL WITH 2+ STARS',
    count: (ev) => (end(ev)?.cleared && end(ev)!.stars >= 2 ? 1 : 0),
  }),
  m({ id: 'm_ability3', tier: 'medium', goal: 3, kind: 'sum', text: 'USE YOUR SKIN ABILITY 3 TIMES', count: (ev) => (ev.type === 'ability' ? 1 : 0) }),
  m({
    id: 'm_dist1500',
    tier: 'medium',
    goal: 1500,
    kind: 'sum',
    text: 'TRAVEL 1500 M IN TOTAL',
    count: (ev) => (ev.type === 'runEnd' ? Math.floor(ev.meters) : 0),
  }),
  m({
    id: 'm_daily250',
    tier: 'medium',
    goal: 250,
    kind: 'best',
    text: 'REACH 250 M IN THE DAILY RUN',
    count: (ev) => (end(ev)?.mode === 'daily' ? Math.floor(end(ev)!.meters) : 0),
  }),
  m({ id: 'm_near15', tier: 'medium', goal: 15, kind: 'sum', text: 'GET 15 CLOSE CALLS', count: (ev) => (ev.type === 'nearMiss' ? 1 : 0) }),

  // --- Hard (+25) ---
  m({
    id: 'h_survive800',
    tier: 'hard',
    goal: 800,
    kind: 'best',
    text: 'REACH 800 M IN SURVIVAL',
    count: (ev) => (end(ev)?.mode === 'survival' ? Math.floor(end(ev)!.meters) : 0),
  }),
  m({ id: 'h_combo8', tier: 'hard', goal: 8, kind: 'best', text: 'HIT A x8 PERFECT COMBO', count: (ev) => (ev.type === 'perfect' ? ev.combo : 0) }),
  m({
    id: 'h_3star',
    tier: 'hard',
    goal: 1,
    kind: 'sum',
    text: 'CLEAR A LEVEL WITH 3 STARS',
    count: (ev) => (end(ev)?.cleared && end(ev)!.stars >= 3 ? 1 : 0),
  }),
  m({
    id: 'h_warp',
    tier: 'hard',
    goal: 1,
    kind: 'sum',
    text: 'FIND A HIDDEN WARP STAR',
    count: (ev) => (ev.type === 'warp' ? 1 : 0),
    requires: (c) => c.clears >= 3,
  }),
  m({
    id: 'h_red3',
    tier: 'hard',
    goal: 3,
    kind: 'sum',
    text: 'CATCH 3 RED DUCKS',
    count: (ev) => (ev.type === 'duck' && ev.variant === 'red' ? 1 : 0),
    requires: (c) => c.ducksSeen >= 20,
  }),
  m({
    id: 'h_noability',
    tier: 'hard',
    goal: 1,
    kind: 'sum',
    text: 'CLEAR WORLD 2+ WITHOUT ABILITY',
    count: (ev) => (end(ev)?.cleared && !end(ev)!.abilityUsed && (end(ev)!.level ?? 0) >= 6 ? 1 : 0),
    requires: (c) => c.unlocked >= 6,
  }),
  m({
    id: 'h_daily600',
    tier: 'hard',
    goal: 600,
    kind: 'best',
    text: 'REACH 600 M IN THE DAILY RUN',
    count: (ev) => (end(ev)?.mode === 'daily' ? Math.floor(end(ev)!.meters) : 0),
    requires: (c) => c.survivalBest >= 300,
  }),
  m({
    id: 'h_perfect15run',
    tier: 'hard',
    goal: 15,
    kind: 'best',
    text: '15 PERFECT TURNS IN ONE RUN',
    count: (ev) => (ev.type === 'runEnd' ? ev.perfects : 0),
  }),
  m({
    id: 'h_survive90s',
    tier: 'hard',
    goal: 90,
    kind: 'best',
    text: 'LAST 90 SEC IN ONE ENDLESS RUN',
    count: (ev) => (end(ev) && end(ev)!.mode !== 'level' ? Math.floor(end(ev)!.seconds) : 0),
  }),
];

export const missionById = (id: string) => MISSIONS.find((d) => d.id === id);

// --- Saved state -----------------------------------------------------------------

export interface MissionSlot {
  id: string;
  progress: number;
  done: boolean;
}

export interface MissionsData {
  /** The UTC day these missions belong to. */
  day: string;
  slots: MissionSlot[];
  rerolls: number;
  /** All-three bonus paid today. */
  bonus: boolean;
  /** Lifetime missions completed. */
  completed: number;
}

export const newMissionsData = (): MissionsData => ({ day: '', slots: [], rerolls: REROLLS_PER_DAY, bonus: false, completed: 0 });

export interface MissionView {
  slot: number;
  def: MissionDef;
  tier: Tier;
  text: string;
  progress: number;
  goal: number;
  done: boolean;
  reward: number;
}

/** Pick one mission of a tier for a day: deterministic for the day (and the player's progress). */
function pick(day: string, tier: Tier, salt: number, ctx: MissionCtx, exclude: string[]): MissionDef {
  const pool = MISSIONS.filter((d) => d.tier === tier && (!d.requires || d.requires(ctx)));
  const open = pool.filter((d) => !exclude.includes(d.id));
  const from = open.length ? open : pool;
  const rng = seededRng(hashString(`missions-${day}-${tier}-${salt}`));
  return from[Math.floor(rng() * from.length) % from.length];
}

export class Missions {
  constructor(private hooks: ProgressHooks) {}

  private get data(): MissionsData {
    return this.hooks.data.missions;
  }

  /** Make sure today's missions exist. Returns true if a new day started. */
  ensureDay(ctx: MissionCtx): boolean {
    const day = todayKey();
    const d = this.data;
    if (d.day === day && d.slots.length === TIERS.length) return false;
    d.day = day;
    d.rerolls = REROLLS_PER_DAY;
    d.bonus = false;
    const ids: string[] = [];
    d.slots = TIERS.map((tier) => {
      const def = pick(day, tier, 0, ctx, ids);
      ids.push(def.id);
      return { id: def.id, progress: 0, done: false };
    });
    this.hooks.dirty();
    return true;
  }

  /** Today's three missions (call ensureDay first; progress does). */
  list(): MissionView[] {
    return this.data.slots.map((s, slot) => {
      const def = missionById(s.id) ?? MISSIONS[0];
      return {
        slot,
        def,
        tier: def.tier,
        text: def.text,
        progress: Math.min(s.progress, def.goal),
        goal: def.goal,
        done: s.done,
        reward: TIER_REWARD[def.tier],
      };
    });
  }

  get rerollsLeft() {
    return this.data.rerolls;
  }
  get bonusPaid() {
    return this.data.bonus;
  }
  get completedToday() {
    return this.data.slots.filter((s) => s.done).length;
  }
  get completedEver() {
    return this.data.completed;
  }

  /** Swap one unfinished mission for another of the same tier. */
  reroll(slot: number, ctx: MissionCtx): boolean {
    const d = this.data;
    const s = d.slots[slot];
    if (!s || s.done || d.rerolls <= 0) return false;
    const def = missionById(s.id);
    if (!def) return false;
    d.rerolls--;
    const salt = 1 + (REROLLS_PER_DAY - d.rerolls) * 7 + slot;
    const next = pick(d.day, def.tier, salt, ctx, d.slots.map((x) => x.id));
    d.slots[slot] = { id: next.id, progress: 0, done: false };
    this.hooks.dirty();
    this.hooks.changed();
    return true;
  }

  /** Reward hook (e.g. a future rewarded ad): one more reroll today. */
  grantReroll() {
    this.data.rerolls++;
    this.hooks.dirty();
    this.hooks.changed();
  }

  /** Feed a stat event to today's missions. Returns how many were completed by it. */
  onStat(ev: StatEvent): number {
    const d = this.data;
    let finished = 0;
    d.slots.forEach((s) => {
      if (s.done) return;
      const def = missionById(s.id);
      if (!def) return;
      const v = def.count(ev);
      if (!v) return;
      const before = s.progress;
      s.progress = def.kind === 'sum' ? s.progress + v : Math.max(s.progress, v);
      if (s.progress !== before) this.hooks.dirty();
      if (s.progress >= def.goal) {
        s.done = true;
        d.completed++;
        finished++;
        const ducks = TIER_REWARD[def.tier];
        this.hooks.reward(ducks, 'mission');
        this.hooks.notify({ title: 'MISSION COMPLETE', subtitle: def.text, color: TIER_COLOR[def.tier], ducks });
      }
    });
    if (finished && !d.bonus && d.slots.every((s) => s.done)) {
      d.bonus = true;
      this.hooks.reward(ALL_DONE_BONUS, 'mission');
      this.hooks.notify({ title: 'ALL MISSIONS DONE', subtitle: 'DAILY BONUS · NEW ONES TOMORROW', color: 0xffd21f, ducks: ALL_DONE_BONUS });
    }
    if (finished) {
      this.hooks.event({ type: 'mission', count: d.completed });
      this.hooks.changed();
    }
    return finished;
  }
}
