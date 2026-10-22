import { settings } from './settings';

/** True on the low graphics setting (or with `?lite` in the address). Kept for older call sites. */
export function isLite(): boolean {
  return settings.quality === 'low';
}
