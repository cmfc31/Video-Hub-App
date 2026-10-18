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
 * Pick a second-precision mtime that makes `item` strictly the newest among all videos.
 * Returns null if it is already uniquely most recent.
 */
export function computeMoveToTopMtime(
  item: ImageElement,
  allVideos: ImageElement[]
): number | null {
  let othersMax = Number.NEGATIVE_INFINITY;

  for (const video of allVideos) {
    if (
      video.hash === item.hash
      || video.deleted
      || video.cleanName === '*FOLDER*'
    ) {
      continue;
    }

    if (typeof video.mtime === 'number' && video.mtime > othersMax) {
      othersMax = video.mtime;
    }
  }

  if (item.mtime > othersMax) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / SECOND_MS) * SECOND_MS;
  return Math.max(nowSec, Math.floor(othersMax / SECOND_MS) * SECOND_MS + SECOND_MS);
}

/**
 * Move several items (kept in their current relative order) as one block so they land
 * right before or after `targetHash` in a modifiedDesc list, and compute the mtime updates.
 */
export function computeGroupReorderMtimes(
  galleryShowing: ImageElement[],
  movedHashes: Set<string>,
  targetHash: string,
  insertAfter: boolean
): MtimeUpdate[] {
  if (movedHashes.has(targetHash)) {
    return [];
  }

  const block = galleryShowing.filter((el) => movedHashes.has(el.hash));
  const ordered = galleryShowing.filter((el) => !movedHashes.has(el.hash));
  const targetIndex = ordered.findIndex((el) => el.hash === targetHash);

  if (!block.length || targetIndex < 0) {
    return [];
  }

  const start = insertAfter ? targetIndex + 1 : targetIndex;
  ordered.splice(start, 0, ...block);

  const end = start + block.length - 1;
  const nowSec = Math.floor(Date.now() / SECOND_MS) * SECOND_MS;
  const newer = ordered[start - 1];
  const older = ordered[end + 1];

  let top: number | null = null;
  if (start === 0) {
    if (!older || nowSec - (block.length - 1) * SECOND_MS > older.mtime) {
      top = nowSec;
    }
  } else if (!older || newer.mtime - older.mtime >= (block.length + 1) * SECOND_MS) {
    top = newer.mtime - SECOND_MS;
  }

  if (top === null) {
    return cascadeMtimes(ordered, start, nowSec, end);
  }

  return stampBlock(block, top);
}

/**
 * Pick second-precision mtimes that make `items` the newest videos, preserving their
 * current relative order (newest first).
 */
export function computeGroupMoveToTopMtimes(
  items: ImageElement[],
  allVideos: ImageElement[]
): MtimeUpdate[] {
  if (!items.length) {
    return [];
  }

  const hashes = new Set(items.map((item) => item.hash));
  let othersMax = Number.NEGATIVE_INFINITY;

  for (const video of allVideos) {
    if (
      hashes.has(video.hash)
      || video.deleted
      || video.cleanName === '*FOLDER*'
    ) {
      continue;
    }

    if (typeof video.mtime === 'number' && video.mtime > othersMax) {
      othersMax = video.mtime;
    }
  }

  const block = items.slice().sort((a, b) => b.mtime - a.mtime);
  const nowSec = Math.floor(Date.now() / SECOND_MS) * SECOND_MS;
  const top = Number.isFinite(othersMax)
    ? Math.max(nowSec, Math.floor(othersMax / SECOND_MS) * SECOND_MS + block.length * SECOND_MS)
    : nowSec;

  return stampBlock(block, top);
}

/**
 * Give consecutive items descending whole-second mtimes starting at `top`.
 */
function stampBlock(block: ImageElement[], top: number): MtimeUpdate[] {
  const updates: MtimeUpdate[] = [];

  block.forEach((element, i) => {
    const mtimeMs = top - i * SECOND_MS;
    if (element.mtime !== mtimeMs) {
      updates.push({ element, mtimeMs });
    }
  });

  return updates;
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
 * Items up to `forceThrough` are always restamped (a moved block is not internally ordered).
 */
function cascadeMtimes(
  ordered: ImageElement[],
  toIndex: number,
  nowSec: number,
  forceThrough: number = toIndex
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
    if (!older || (i >= forceThrough && older.mtime < nextMtime)) {
      break;
    }

    nextMtime -= SECOND_MS;
  }

  return updates;
}
