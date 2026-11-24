import type { ImageElement } from '../../../interfaces/final-object.interface';

export interface MtimeUpdate {
  element: ImageElement;
  mtimeMs: number;
}

// Two seconds: FAT / exFAT drives store Date modified in 2-second steps, so 1-second steps would tie on disk
const STEP_MS = 2000;

/**
 * After moving an item from `fromIndex` to `toIndex` in a modifiedDesc (newest-first) list,
 * compute the minimal set of 2-second-step mtime updates needed to preserve that order.
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

  const nowSec = Math.floor(Date.now() / STEP_MS) * STEP_MS;
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
 * Pick a 2-second-step mtime that makes `item` strictly the newest among all videos.
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

  const nowSec = Math.floor(Date.now() / STEP_MS) * STEP_MS;
  return Math.max(nowSec, Math.floor(othersMax / STEP_MS) * STEP_MS + STEP_MS);
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

  return placeBlockMtimes(ordered, block, insertAfter ? targetIndex + 1 : targetIndex);
}

/**
 * Re-order the selected videos A-Z (by file name) where they stand: the block takes the place
 * of the topmost selected video in a modifiedDesc list, and the rest of the list keeps its order.
 */
export function computeSortSelectionMtimes(
  galleryShowing: ImageElement[],
  selectedHashes: Set<string>
): MtimeUpdate[] {
  const firstSelected = galleryShowing.findIndex((el) => selectedHashes.has(el.hash));
  if (firstSelected < 0) {
    return [];
  }

  const block = galleryShowing.filter((el) => selectedHashes.has(el.hash)).sort(compareFileNames);
  const ordered = galleryShowing.filter((el) => !selectedHashes.has(el.hash));

  // everything above the topmost selected video stays above the block
  return placeBlockMtimes(ordered, block, firstSelected);
}

/**
 * Insert `block` into `ordered` (a modifiedDesc list without the block) at `start`
 * and compute the mtime updates that make the list read in that order.
 */
function placeBlockMtimes(ordered: ImageElement[], block: ImageElement[], start: number): MtimeUpdate[] {
  ordered.splice(start, 0, ...block);

  const end = start + block.length - 1;
  const nowSec = Math.floor(Date.now() / STEP_MS) * STEP_MS;
  const newer = ordered[start - 1];
  const older = ordered[end + 1];

  let top: number | null = null;
  if (start === 0) {
    if (!older || nowSec - (block.length - 1) * STEP_MS > older.mtime) {
      top = nowSec;
    }
  } else if (!older || newer.mtime - older.mtime >= (block.length + 1) * STEP_MS) {
    top = newer.mtime - STEP_MS;
  }

  if (top === null) {
    return cascadeMtimes(ordered, start, nowSec, end);
  }

  return stampBlock(block, top);
}

/**
 * Pick 2-second-step mtimes that make `items` the newest videos, preserving their
 * current relative order (newest first).
 */
export function computeGroupMoveToTopMtimes(
  items: ImageElement[],
  allVideos: ImageElement[]
): MtimeUpdate[] {
  if (!items.length) {
    return [];
  }

  const block = items.slice().sort((a, b) => b.mtime - a.mtime);
  return computeGroupMoveToTopMtimesInOrder(block, allVideos);
}

/**
 * Natural, case-insensitive file name order (like File Explorer): "Ep 2" comes before "Ep 10"
 */
const fileNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareFileNames(a: ImageElement, b: ImageElement): number {
  return fileNameCollator.compare(a.fileName, b.fileName) || a.partialPath.localeCompare(b.partialPath);
}

/**
 * Stamp newly detected videos as the newest in the hub, as if they were just added to the drive
 * one after another: sorting by Date modified (newest first) lists them on top in A-Z order.
 */
export function computeNewVideosMtimes(
  newVideos: ImageElement[],
  allVideos: ImageElement[]
): MtimeUpdate[] {
  const block = newVideos
    .filter((video) => !video.deleted && video.cleanName !== '*FOLDER*')
    .sort(compareFileNames);

  if (!block.length) {
    return [];
  }

  return computeGroupMoveToTopMtimesInOrder(block, allVideos);
}

/**
 * Like `computeGroupMoveToTopMtimes` but keeps the given order (first item becomes the newest)
 */
function computeGroupMoveToTopMtimesInOrder(
  block: ImageElement[],
  allVideos: ImageElement[]
): MtimeUpdate[] {
  const hashes = new Set(block.map((item) => item.hash));
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

  const nowSec = Math.floor(Date.now() / STEP_MS) * STEP_MS;
  const top = Number.isFinite(othersMax)
    ? Math.max(nowSec, Math.floor(othersMax / STEP_MS) * STEP_MS + block.length * STEP_MS)
    : nowSec;

  return stampBlock(block, top);
}

/**
 * Give consecutive items descending 2-second mtimes starting at `top`.
 */
function stampBlock(block: ImageElement[], top: number): MtimeUpdate[] {
  const updates: MtimeUpdate[] = [];

  block.forEach((element, i) => {
    const mtimeMs = top - i * STEP_MS;
    if (element.mtime !== mtimeMs) {
      updates.push({ element, mtimeMs });
    }
  });

  return updates;
}

/**
 * Prefer updating only the moved item when a 2-second gap exists between neighbors.
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
    return newer.mtime - STEP_MS;
  }

  if (newer.mtime - older.mtime >= 2 * STEP_MS) {
    return newer.mtime - STEP_MS;
  }

  return null;
}

/**
 * Restamp from `toIndex` downward with consecutive 2-second steps until the remaining list is valid.
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
    : ordered[toIndex - 1].mtime - STEP_MS;

  for (let i = toIndex; i < ordered.length; i++) {
    if (ordered[i].mtime !== nextMtime) {
      updates.push({ element: ordered[i], mtimeMs: nextMtime });
    }

    const older = ordered[i + 1];
    if (!older || (i >= forceThrough && older.mtime < nextMtime)) {
      break;
    }

    nextMtime -= STEP_MS;
  }

  return updates;
}
