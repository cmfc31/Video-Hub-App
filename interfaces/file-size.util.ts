import type { ImageElement } from './final-object.interface';

/**
 * Format a number with a fixed number of decimal places, truncating (not rounding)
 * extra digits — matches Windows Explorer's StrFormatByteSizeEx behavior.
 */
function truncateToFixed(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  const truncated = Math.floor(value * factor) / factor;
  return truncated.toFixed(decimals);
}

/**
 * Return size of file formatted as ### MB or ### GB (or TB)
 * @param sizeInBytes -- file size in bytes
 * @param useBinary -- when true, use 1024-based calculation (Windows-style)
 * @param excludeParen - whether (2.3GB) or 2.3GB
 */
export function formatFileSize(sizeInBytes: number, useBinary = false, excludeParen = false): string {
  if (!sizeInBytes) {
    return '';
  }

  const mbDivisor = useBinary ? 1024 * 1024 : 1000000;
  const rounded = Math.round(sizeInBytes / mbDivisor);

  let formatted: string;

  if (useBinary) {
    if (rounded > 999 * 1024) {
      formatted = truncateToFixed(rounded / (1024 * 1024), 1) + ' TB';
    } else if (rounded > 999) {
      formatted = truncateToFixed(sizeInBytes / (1024 ** 3), 2) + ' GB';
    } else {
      formatted = rounded + ' MB';
    }
  } else if (rounded > 999000) {
    formatted = (rounded / 1000000).toFixed(1) + ' TB';
  } else if (rounded > 999) {
    formatted = (rounded / 1000).toFixed(1) + ' GB';
  } else {
    formatted = rounded + ' MB';
  }

  return (excludeParen ? '' : '(') + formatted + (excludeParen ? '' : ')');
}

/**
 * Update precomputed fileSizeDisplay for all video elements (not folders).
 */
export function refreshFileSizeDisplays(images: ImageElement[], useBinary: boolean): void {
  images.forEach((element) => {
    if (element.cleanName !== '*FOLDER*') {
      element.fileSizeDisplay = formatFileSize(element.fileSize, useBinary, true);
    }
  });
}
