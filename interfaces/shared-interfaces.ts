import type { ImageElement } from './final-object.interface';

// Identical to settings buttons
export type SupportedView = 'showThumbnails'
                          | 'showFilmstrip'
                          | 'showFullView'
                          | 'showDetails'
                          | 'showDetails2'
                          | 'showFiles'
                          | 'showClips';

export const AllSupportedViews: SupportedView[] = [
                            'showThumbnails',
                            'showFilmstrip',
                            'showFullView',
                            'showDetails',
                            'showDetails2',
                            'showFiles',
                            'showClips',
];

export type SupportedTrayView = 'showDetailsTray'
                              | 'showFreq'
                              | 'showRecentlyPlayed'
                              | 'showRelatedVideosTray'
                              | 'showTagTray';

export const AllSupportedBottomTrayViews: SupportedTrayView[] = [
                                'showDetailsTray',
                                'showFreq',
                                'showRecentlyPlayed',
                                'showRelatedVideosTray',
                                'showTagTray',
];

// Mouse click events
export interface VideoClickEmit {
  mouseEvent: PointerEvent;
  thumbIndex?: number;
  doubleClick?: boolean;
}

export interface RightClickEmit {
  mouseEvent: PointerEvent;
  item: ImageElement;
}

// Tags stuffs
export interface Tag {
  name: string;
  colour: string;
  removable: boolean;
}

export interface TagEmit {
  tag: Tag;
  event: PointerEvent;
}

export interface TagEmission {
  index: number;
  tag: string;
  type: 'add' | 'remove';
}

export interface HistoryItem {
  vhaFilePath: string;
  hubName: string;
}

export interface RenameFileResponse {
  index: number;
  success: boolean;
  renameTo: string;
  oldFileName: string;
  errMsg?: string;
}

export interface RemoteVideoClick {
  video: ImageElement;
  thumbIndex?: number;
}

export interface ContextMenuCoordinate {
  x: number;
  y: number;
}

/**
 * A Windows drive letter the hub's folders could be switched to
 */
export interface DriveLetterInfo {
  letter: string;       // uppercase, e.g. `E`
  found: string[];      // hub folder paths (as saved in the hub) that exist when moved to this letter
}

/**
 * Drive letter of a Windows path like `E:\Videos` -- uppercase, or `null` for any other path
 */
export function driveLetterOf(folderPath: string): string | null {
  const match = /^([A-Za-z]):([\\/]|$)/.exec(folderPath || '');
  return match ? match[1].toUpperCase() : null;
}

/**
 * Same path on another drive letter: `E:\Videos` -> `F:\Videos`
 */
export function withDriveLetter(folderPath: string, letter: string): string {
  return driveLetterOf(folderPath) ? letter.toUpperCase() + folderPath.substring(1) : folderPath;
}
