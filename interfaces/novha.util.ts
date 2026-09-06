export const NOVHA_FILENAME = '.novha';

export function isNovhaFileName(name: string): boolean {
  return !!name && name.toLowerCase() === NOVHA_FILENAME;
}

/**
 * Catalog `partialPath` is '' or '/' at the source root, and '/folder/sub' elsewhere.
 */
export function normalizePartialPath(partialPath: string): string {
  if (!partialPath || partialPath === '/' || partialPath === '\\') {
    return '';
  }

  return partialPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * True when a catalog `partialPath` is the excluded folder or a descendant.
 * An empty prefix means the entire source folder is excluded.
 */
export function isPartialPathUnderPrefix(partialPath: string, prefix: string): boolean {
  const pathNorm = normalizePartialPath(partialPath);
  const prefixNorm = normalizePartialPath(prefix);

  if (prefixNorm === '') {
    return true;
  }

  return pathNorm === prefixNorm || pathNorm.startsWith(prefixNorm + '/');
}
