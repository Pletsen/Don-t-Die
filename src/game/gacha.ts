import { read, readJSON, writeJSON } from './persist';
import { save } from './storage';
import { PITY, RARITIES, RARITY_ORDER, REFUND, SPIN_COST, SKINS, rollRarity, skinsOf, type Rarity, type Skin } from './skins';

// The DUCK-O-MATIC's rules, kept apart from its looks (ui/SkinShop.ts).
//
// - Odds per rarity are in RARITIES (65 / 25 / 8 / 2 %).
// - Pity: an epic-or-better is guaranteed within PITY.epic spins, a
//   legendary within PITY.legendary spins.
// - No duplicates until a rarity's set is complete: the roll picks one of the
//   skins of that rarity you don't have yet. Only once you own all of them
//   can it repeat, and a repeat pays REFUND[rarity] ducks back.
// - A free spin (save.freeSpins) is used before any ducks.
// - The very first pull ever is at least a rare.
//
// Everything is decided and saved the moment you pull, before the reels
// spin, so closing the app mid-spin can't lose or duplicate a prize.

const KEYS = {
  /** { epic, legendary }: spins since the last epic-or-better / legendary. */
  pity: 'dontdie_gacha_pity',
  /** Skin ids the player has seen in the collection (no "NEW!" sticker). */
  seen: 'dontdie_gacha_seen',
  /** { spins, dupes, refunded }: lifetime totals. */
  stats: 'dontdie_gacha_stats',
};

export interface SpinResult {
  skin: Skin;
  rarity: Rarity;
  isNew: boolean;
  /** Ducks paid back (duplicates only). */
  refund: number;
  /** Which pity guarantee forced this rarity, if any. */
  pity: 'epic' | 'legendary' | null;
  /** Paid with a free spin instead of ducks. */
  free: boolean;
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function loadPity() {
  const raw = readJSON<Record<string, unknown>>(KEYS.pity, {});
  return { epic: Math.min(count(raw.epic), PITY.epic - 1), legendary: Math.min(count(raw.legendary), PITY.legendary - 1) };
}

function loadStats() {
  const raw = readJSON<Record<string, unknown>>(KEYS.stats, {});
  return { spins: count(raw.spins), dupes: count(raw.dupes), refunded: count(raw.refunded) };
}

function loadSeen(): Set<string> {
  // First run of this version: everything already owned counts as seen, so
  // old saves don't light up with stickers.
  if (read(KEYS.seen) === null) {
    const seen = new Set(save.skins);
    writeJSON(KEYS.seen, [...seen]);
    return seen;
  }
  const list = readJSON<unknown>(KEYS.seen, []);
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
}

export const gacha = {
  pity: loadPity(),
  stats: loadStats(),
  seen: loadSeen(),

  /** How the next spin would be paid for, or null if it can't be. */
  payment(): 'free' | 'ducks' | null {
    if (save.freeSpins > 0) return 'free';
    return save.ducks >= SPIN_COST ? 'ducks' : null;
  },

  /** At most this many spins until an epic-or-better is guaranteed (1 = the next one). */
  epicIn(): number {
    return PITY.epic - this.pity.epic;
  },
  /** At most this many spins until a legendary is guaranteed. */
  legendaryIn(): number {
    return PITY.legendary - this.pity.legendary;
  },

  /** [owned, total] for one rarity. */
  owned(rarity: Rarity): [number, number] {
    const pool = skinsOf(rarity);
    return [pool.filter((s) => save.skins.has(s.id)).length, pool.length];
  },
  ownedAll(): [number, number] {
    return [SKINS.filter((s) => save.skins.has(s.id)).length, SKINS.length];
  },

  /** Owned but never looked at in the collection: gets a "NEW!" sticker. */
  isUnseen(id: string) {
    return save.skins.has(id) && !this.seen.has(id);
  },
  markSeen(id: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    writeJSON(KEYS.seen, [...this.seen]);
  },

  /** Decide the rarity: the pity guarantees first, then the odds. */
  rollRarity(rand = Math.random): { rarity: Rarity; pity: SpinResult['pity'] } {
    if (this.pity.legendary >= PITY.legendary - 1) return { rarity: 'legendary', pity: 'legendary' };
    if (this.pity.epic >= PITY.epic - 1) {
      // Guaranteed epic or better, keeping their relative odds.
      const { epic, legendary } = RARITIES;
      const rarity = rand() < legendary.chance / (epic.chance + legendary.chance) ? 'legendary' : 'epic';
      return { rarity, pity: 'epic' };
    }
    const rarity = rollRarity(rand);
    // The very first pull is at least a rare: a character with a real power is a better first taste.
    if (this.stats.spins === 0 && rarity === 'common') return { rarity: 'rare', pity: null };
    return { rarity, pity: null };
  },

  /**
   * Pay (free spin first, else SPIN_COST ducks), roll, grant and save.
   * Returns null if the player can't pay.
   */
  spin(rand = Math.random): SpinResult | null {
    const pay = this.payment();
    if (!pay) return null;
    if (pay === 'free') save.addFreeSpins(-1);
    else save.addDucks(-SPIN_COST, 'spin');

    const { rarity, pity } = this.rollRarity(rand);
    const pool = skinsOf(rarity);
    const missing = pool.filter((s) => !save.skins.has(s.id));
    const pick = missing.length > 0 ? missing : pool;
    const skin = pick[Math.floor(rand() * pick.length)] ?? pool[0];
    const isNew = !save.skins.has(skin.id);
    const refund = isNew ? 0 : REFUND[rarity];
    if (isNew) save.addSkin(skin.id);
    else save.addDucks(refund, 'refund');

    const rank = RARITY_ORDER.indexOf(rarity);
    this.pity.epic = rank >= 2 ? 0 : this.pity.epic + 1;
    this.pity.legendary = rank >= 3 ? 0 : this.pity.legendary + 1;
    writeJSON(KEYS.pity, this.pity);
    this.stats.spins++;
    if (!isNew) {
      this.stats.dupes++;
      this.stats.refunded += refund;
    }
    writeJSON(KEYS.stats, this.stats);
    return { skin, rarity, isNew, refund, pity, free: pay === 'free' };
  },
};
