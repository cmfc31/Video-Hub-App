/**
 * Image format of a hub's generated assets (thumbnails, filmstrips, clip posters).
 * Shared by Node (extraction / conversion) and Angular (building `file://` paths).
 */
export type ImageFormat = 'jpg' | 'avif';

export type ImageAssetFolder = 'thumbnails' | 'filmstrips' | 'clips';

export const ALL_IMAGE_FORMATS: ImageFormat[] = ['jpg', 'avif'];

export const ALL_IMAGE_EXTENSIONS: string[] = ALL_IMAGE_FORMATS.map((format: ImageFormat) => '.' + format);

// Chromium (Electron 42) fails to decode AVIF images wider than 32768px (verified empirically).
// Filmstrips wider than this stay JPG even when the hub format is AVIF.
export const MAX_AVIF_WIDTH = 32768;

/**
 * Hubs created before this setting existed have no `imageFormat` -- they are JPG.
 */
export function normalizeImageFormat(format: string | undefined): ImageFormat {
  return format === 'avif' ? 'avif' : 'jpg';
}

/**
 * Width in px of a single screenshot (filmstrips are `screens` of these stacked horizontally)
 */
export function tileWidth(screenshotHeight: number): number {
  return screenshotHeight * (16 / 9);
}

/**
 * The format an asset is actually stored in.
 * Equal to the hub format, except filmstrips too wide for AVIF, which fall back to JPG.
 *
 * @param folder           -- `thumbnails`, `filmstrips`, or `clips`
 * @param hubFormat        -- the hub's `screenshotSettings.imageFormat`
 * @param screens          -- number of screenshots in the filmstrip (`ImageElement.screens`)
 * @param screenshotHeight -- the hub's `screenshotSettings.height`
 */
export function imageFormatFor(
  folder: ImageAssetFolder,
  hubFormat: ImageFormat | undefined,
  screens: number,
  screenshotHeight: number,
): ImageFormat {
  const format: ImageFormat = normalizeImageFormat(hubFormat);

  if (format === 'avif' && folder === 'filmstrips' && screens * tileWidth(screenshotHeight) > MAX_AVIF_WIDTH) {
    return 'jpg';
  }

  return format;
}

/**
 * File name (no folder) of an image asset, e.g. `abc123.avif`
 */
export function imageFileName(
  hash: string,
  folder: ImageAssetFolder,
  hubFormat: ImageFormat | undefined,
  screens: number,
  screenshotHeight: number,
): string {
  return hash + '.' + imageFormatFor(folder, hubFormat, screens, screenshotHeight);
}
