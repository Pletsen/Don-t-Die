import { SKINS, skinById, type Skin } from './skins';
import { save } from './storage';
import { read, write } from './persist';
import { hashString, todayKey } from './daily';

// TODAY'S GUEST: every day one skin you don't own yet is lent to you for the
// Daily Run, super power included, as a taste of what the DUCK-O-MATIC has.
// Your own equipped skin is never changed.
//
// The guest is picked by the date from the skins you don't own (any skin
// once you own them all), then pinned for the rest of the UTC day, so a
// spin on the DUCK-O-MATIC doesn't swap it for another one mid-day.

const KEY = 'dontdie_guest';

/** The guest for day `key`, from the skins not in `owned` (from all skins if that's none). */
export function pickGuest(key: string, owned: ReadonlySet<string>): Skin {
  const pool = SKINS.filter((s) => !owned.has(s.id));
  const from = pool.length > 0 ? pool : SKINS;
  return from[hashString(`dontdie-guest-${key}`) % from.length];
}

/** Today's guest skin: the same one all day. */
export function todaysGuest(): Skin {
  const key = todayKey();
  const [day, id] = (read(KEY) ?? '').split(':');
  if (day === key && SKINS.some((s) => s.id === id)) return skinById(id);
  const guest = pickGuest(key, save.skins);
  write(KEY, `${key}:${guest.id}`);
  return guest;
}
