import type { StatEvent } from './shared';
import type { ProgressHooks, Stats } from './progress';
import { LEVELS } from './levels';
import { SKINS } from './skins';

// ~30 achievements, each with a duck reward. They are checked after every
// stat event (cheap: a handful of comparisons each) and never re-lock.

/** Icon drawn on the achievement tile (see RecordsScreen.drawGlyph). */
export type Glyph = 'flag' | 'star' | 'combo' | 'road' | 'duck' | 'warp' | 'orb' | 'flame' | 'skull' | 'bolt' | 'crown' | 'check';

/** Everything an achievement may look at. */
export interface AchCtx {
  stats: Readonly<Stats>;
  /** Best stars for a level (0 = not cleared). */
  starsFor(id: number): number;
  totalStars: number;
  skins: number;
  /** Levels where a warp star was found. */
  warps: number;
  survivalBest: number;
  dailyBest: number;
  streakBest: number;
  missionsDone: number;
  /** The event being processed, if any (some achievements are about one moment). */
  ev?: StatEvent;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  ducks: number;
  glyph: Glyph;
  /** Gold border for the big ones. */
  big?: boolean;
  check(c: AchCtx): boolean;
  /** [current, goal] for a progress readout on locked tiles. */
  progress?(c: AchCtx): [number, number];
}

const worldIds = (w: number) => LEVELS.filter((l) => l.world === w).map((l) => l.id);
const clearedAll = (c: AchCtx, w: number) => worldIds(w).every((id) => c.starsFor(id) > 0);
const clearedCount = (c: AchCtx, w: number) => worldIds(w).filter((id) => c.starsFor(id) > 0).length;
const runEnd = (c: AchCtx) => (c.ev?.type === 'runEnd' ? c.ev : null);
const a = (def: AchievementDef) => def;

export const ACHIEVEMENTS: AchievementDef[] = [
  // --- Levels ---
  a({ id: 'first_clear', name: 'FIRST STEPS', desc: 'Clear level 1.', ducks: 10, glyph: 'flag', check: (c) => c.starsFor(1) > 0 }),
  a({
    id: 'world1',
    name: 'BASIC TRAINING',
    desc: 'Clear every World 1 level.',
    ducks: 20,
    glyph: 'flag',
    check: (c) => clearedAll(c, 0),
    progress: (c) => [clearedCount(c, 0), 5],
  }),
  a({
    id: 'world2',
    name: 'SAW WHISPERER',
    desc: 'Clear every World 2 level.',
    ducks: 25,
    glyph: 'flag',
    check: (c) => clearedAll(c, 1),
    progress: (c) => [clearedCount(c, 1), 5],
  }),
  a({
    id: 'world3',
    name: 'BOMB SQUAD',
    desc: 'Clear every World 3 level.',
    ducks: 30,
    glyph: 'flag',
    check: (c) => clearedAll(c, 2),
    progress: (c) => [clearedCount(c, 2), 5],
  }),
  a({
    id: 'world4',
    name: "DIDN'T DIE",
    desc: 'Clear all 20 levels.',
    ducks: 60,
    glyph: 'crown',
    big: true,
    check: (c) => LEVELS.every((l) => c.starsFor(l.id) > 0),
    progress: (c) => [LEVELS.filter((l) => c.starsFor(l.id) > 0).length, LEVELS.length],
  }),
  a({ id: 'three_star', name: 'FLAWLESS', desc: 'Get 3 stars on any level.', ducks: 10, glyph: 'star', check: (c) => LEVELS.some((l) => c.starsFor(l.id) >= 3) }),
  a({
    id: 'w1_stars',
    name: 'STARGAZER',
    desc: '3 stars on every World 1 level.',
    ducks: 25,
    glyph: 'star',
    check: (c) => worldIds(0).every((id) => c.starsFor(id) >= 3),
    progress: (c) => [worldIds(0).reduce((s, id) => s + c.starsFor(id), 0), 15],
  }),
  a({
    id: 'stars30',
    name: 'STAR COLLECTOR',
    desc: 'Earn 30 stars.',
    ducks: 25,
    glyph: 'star',
    check: (c) => c.totalStars >= 30,
    progress: (c) => [c.totalStars, 30],
  }),
  a({
    id: 'stars60',
    name: 'ALL THE STARS',
    desc: 'Earn all 60 stars.',
    ducks: 100,
    glyph: 'star',
    big: true,
    check: (c) => c.totalStars >= LEVELS.length * 3,
    progress: (c) => [c.totalStars, LEVELS.length * 3],
  }),
  a({
    id: 'pure',
    name: 'NO HELP NEEDED',
    desc: 'Clear a World 3+ level without your ability.',
    ducks: 20,
    glyph: 'check',
    check: (c) => !!runEnd(c)?.cleared && !runEnd(c)!.abilityUsed && (runEnd(c)!.level ?? 0) >= 11,
  }),

  // --- Skill ---
  a({ id: 'combo5', name: 'IN THE ZONE', desc: 'Hit a x5 PERFECT combo.', ducks: 10, glyph: 'combo', check: (c) => c.stats.bestCombo >= 5, progress: (c) => [c.stats.bestCombo, 5] }),
  a({
    id: 'combo10',
    name: 'METRONOME',
    desc: 'Hit a x10 PERFECT combo.',
    ducks: 30,
    glyph: 'combo',
    check: (c) => c.stats.bestCombo >= 10,
    progress: (c) => [c.stats.bestCombo, 10],
  }),
  a({
    id: 'perfect100',
    name: 'PRECISION',
    desc: 'Make 100 PERFECT turns.',
    ducks: 15,
    glyph: 'combo',
    check: (c) => c.stats.perfects >= 100,
    progress: (c) => [c.stats.perfects, 100],
  }),
  a({
    id: 'perfect1000',
    name: 'SURGEON',
    desc: 'Make 1000 PERFECT turns.',
    ducks: 50,
    glyph: 'combo',
    big: true,
    check: (c) => c.stats.perfects >= 1000,
    progress: (c) => [c.stats.perfects, 1000],
  }),
  a({
    id: 'near50',
    name: 'CLOSE SHAVE',
    desc: 'Get 50 CLOSE calls.',
    ducks: 15,
    glyph: 'bolt',
    check: (c) => c.stats.nearMisses >= 50,
    progress: (c) => [c.stats.nearMisses, 50],
  }),

  // --- Survival & distance ---
  a({
    id: 'surv250',
    name: 'SURVIVOR',
    desc: 'Reach 250 m in Survival.',
    ducks: 10,
    glyph: 'road',
    check: (c) => c.survivalBest >= 250,
    progress: (c) => [Math.floor(c.survivalBest), 250],
  }),
  a({
    id: 'surv1000',
    name: '1 KM. RESPECT.',
    desc: 'Reach 1000 m in Survival.',
    ducks: 40,
    glyph: 'road',
    big: true,
    check: (c) => c.survivalBest >= 1000,
    progress: (c) => [Math.floor(c.survivalBest), 1000],
  }),
  a({
    id: 'marathon',
    name: 'MARATHON',
    desc: 'Travel 42 km in total.',
    ducks: 50,
    glyph: 'road',
    check: (c) => c.stats.meters >= 42_000,
    progress: (c) => [Math.floor(c.stats.meters / 1000), 42],
  }),
  a({
    id: 'daily1000',
    name: 'DAILY DRIVER',
    desc: 'Reach 1000 m in a Daily Run.',
    ducks: 30,
    glyph: 'road',
    check: (c) => c.dailyBest >= 1000,
    progress: (c) => [Math.floor(c.dailyBest), 1000],
  }),

  // --- Secrets & ducks ---
  a({ id: 'warp1', name: 'WARP DRIVE', desc: 'Find a hidden warp star.', ducks: 15, glyph: 'warp', check: (c) => c.warps >= 1 || c.stats.warps >= 1 }),
  a({
    id: 'warp5',
    name: 'STAR HUNTER',
    desc: 'Find the warp star in 5 levels.',
    ducks: 40,
    glyph: 'warp',
    check: (c) => c.warps >= 5,
    progress: (c) => [c.warps, 5],
  }),
  a({ id: 'golden', name: 'GOLDEN GOOSE', desc: 'Catch a golden duck.', ducks: 25, glyph: 'duck', check: (c) => c.stats.goldenDucks >= 1 }),
  a({
    id: 'frenzy50',
    name: 'FRENZY!',
    desc: 'Get 50 ducks in one DUCK FRENZY.',
    ducks: 40,
    glyph: 'duck',
    check: (c) => c.stats.bestFrenzy >= 50,
    progress: (c) => [c.stats.bestFrenzy, 50],
  }),
  a({
    id: 'red10',
    name: 'RED ALERT',
    desc: 'Catch 10 red ducks.',
    ducks: 20,
    glyph: 'duck',
    check: (c) => c.stats.redDucks >= 10,
    progress: (c) => [c.stats.redDucks, 10],
  }),
  a({
    id: 'ducks500',
    name: 'DUCK HOARDER',
    desc: 'Collect 500 ducks.',
    ducks: 30,
    glyph: 'duck',
    check: (c) => c.stats.ducksEarned >= 500,
    progress: (c) => [c.stats.ducksEarned, 500],
  }),

  // --- Collection ---
  a({
    id: 'skins10',
    name: 'FASHIONISTA',
    desc: 'Own 10 skins.',
    ducks: 30,
    glyph: 'orb',
    check: (c) => c.skins >= 10,
    progress: (c) => [c.skins, 10],
  }),
  a({
    id: 'skins24',
    name: 'GOTTA CATCH EM',
    desc: `Own all ${SKINS.length} skins.`,
    ducks: 150,
    glyph: 'orb',
    big: true,
    check: (c) => c.skins >= SKINS.length,
    progress: (c) => [c.skins, SKINS.length],
  }),
  a({ id: 'legendary', name: 'LEGENDARY', desc: 'Win a legendary skin.', ducks: 50, glyph: 'crown', check: (c) => c.stats.legendaries >= 1 }),
  a({
    id: 'ability10',
    name: 'POWER USER',
    desc: 'Use skin abilities 10 times.',
    ducks: 10,
    glyph: 'bolt',
    check: (c) => c.stats.abilities >= 10,
    progress: (c) => [c.stats.abilities, 10],
  }),

  // --- Habits ---
  a({
    id: 'streak7',
    name: 'DEVOTED',
    desc: 'Reach a 7-day streak.',
    ducks: 40,
    glyph: 'flame',
    check: (c) => c.streakBest >= 7,
    progress: (c) => [c.streakBest, 7],
  }),
  a({
    id: 'missions10',
    name: 'ON A MISSION',
    desc: 'Complete 10 daily missions.',
    ducks: 25,
    glyph: 'check',
    check: (c) => c.missionsDone >= 10,
    progress: (c) => [c.missionsDone, 10],
  }),
  a({
    id: 'oops',
    name: 'OOPS',
    desc: 'Crash in the first 2 seconds.',
    ducks: 5,
    glyph: 'skull',
    check: (c) => !!runEnd(c) && !runEnd(c)!.cleared && runEnd(c)!.seconds < 2,
  }),
  a({
    id: 'deaths500',
    name: 'WE NEED TO TALK',
    desc: 'Die 500 times. Keep going.',
    ducks: 25,
    glyph: 'skull',
    check: (c) => c.stats.deaths >= 500,
    progress: (c) => [c.stats.deaths, 500],
  }),
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((d) => d.id === id);

export interface AchievementView {
  def: AchievementDef;
  unlocked: boolean;
  /** When it was unlocked (ms), or 0. */
  at: number;
  progress: [number, number] | null;
}

export class Achievements {
  constructor(
    private hooks: ProgressHooks,
    private ctx: (ev?: StatEvent) => AchCtx,
  ) {}

  private get data(): Record<string, number> {
    return this.hooks.data.achievements;
  }

  isUnlocked(id: string) {
    return !!this.data[id];
  }

  get count() {
    return ACHIEVEMENTS.filter((d) => this.data[d.id]).length;
  }

  list(): AchievementView[] {
    const c = this.ctx();
    return ACHIEVEMENTS.map((def) => {
      const at = this.data[def.id] ?? 0;
      const p = def.progress?.(c) ?? null;
      return { def, unlocked: at > 0, at, progress: p ? [Math.min(p[0], p[1]), p[1]] : null };
    });
  }

  /**
   * Unlock whatever is now earned. Each unlock pays its ducks and shows a
   * banner, except `quiet` (first launch with an existing save), which pays
   * everything as one summary banner.
   */
  check(ev?: StatEvent, quiet = false): number {
    const c = this.ctx(ev);
    const fresh: AchievementDef[] = [];
    for (const def of ACHIEVEMENTS) {
      if (this.data[def.id]) continue;
      let ok = false;
      try {
        ok = def.check(c);
      } catch {
        ok = false;
      }
      if (!ok) continue;
      this.data[def.id] = Date.now();
      fresh.push(def);
    }
    if (!fresh.length) return 0;
    this.hooks.dirty();
    const total = fresh.reduce((s, d) => s + d.ducks, 0);
    this.hooks.reward(total, 'achievement');
    if (quiet && fresh.length > 1) {
      this.hooks.notify({ title: `${fresh.length} ACHIEVEMENTS UNLOCKED`, subtitle: 'SEE THEM IN RECORDS', color: 0xffd21f, ducks: total });
    } else {
      for (const d of fresh) this.hooks.notify({ title: d.name, subtitle: `ACHIEVEMENT · ${d.desc.toUpperCase().replace(/\.$/, '')}`, color: 0xffd21f, ducks: d.ducks });
    }
    this.hooks.changed();
    return fresh.length;
  }
}
