import type { ImageElement } from '../../../interfaces/final-object.interface';

export interface MtimeUpdate {
  element: ImageElement;
  mtimeMs: number;
}

const SECOND_MS = 1000;

/**
 * After moving an item from `fromIndex` to `toIndex` in a modifiedDesc (newest-first) list,
 * compute the minimal set of second-precision mtime updates needed to preserve that order.
 */
export function computeReorderMtimes(
  galleryShowing: ImageElement[],
  fromIndex: number,
  toIndex: number
): MtimeUpdate[] {
  if (
    fromIndex === toIndex
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= galleryShowing.length
    || toIndex >= galleryShowing.length
  ) {
    return [];
  }

  const ordered = galleryShowing.slice();
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);

  const nowSec = Math.floor(Date.now() / SECOND_MS) * SECOND_MS;
  const single = trySingleItemMtime(ordered, toIndex, nowSec);

  if (single !== null) {
    if (single !== ordered[toIndex].mtime) {
      return [{ element: ordered[toIndex], mtimeMs: single }];
    }
    return [];
  }

  return cascadeMtimes(ordered, toIndex, nowSec);
}

/**
 * Prefer updating only the moved item when a whole-second gap exists between neighbors.
 */
function trySingleItemMtime(
  ordered: ImageElement[],
  toIndex: number,
  nowSec: number
): number | null {
  const older = ordered[toIndex + 1];
  const newer = ordered[toIndex - 1];

  if (toIndex === 0) {
    if (!older || nowSec > older.mtime) {
      return nowSec;
    }
    return null;
  }

  if (!older) {
    return newer.mtime - SECOND_MS;
  }

  if (newer.mtime - older.mtime >= 2 * SECOND_MS) {
    return newer.mtime - SECOND_MS;
  }

  return null;
}

/**
 * Restamp from `toIndex` downward with consecutive seconds until the remaining list is valid.
 */
function cascadeMtimes(
  ordered: ImageElement[],
  toIndex: number,
  nowSec: number
): MtimeUpdate[] {
  const updates: MtimeUpdate[] = [];
  let nextMtime = toIndex === 0
    ? nowSec
    : ordered[toIndex - 1].mtime - SECOND_MS;

  for (let i = toIndex; i < ordered.length; i++) {
    if (ordered[i].mtime !== nextMtime) {
      updates.push({ element: ordered[i], mtimeMs: nextMtime });
    }

    const older = ordered[i + 1];
    if (!older || older.mtime < nextMtime) {
      break;
    }

    nextMtime -= SECOND_MS;
  }

  return updates;
}
