import * as path from 'path';
import { fdir } from 'fdir';

import { isNovhaFileName, NOVHA_FILENAME } from '../interfaces/novha.util';

const fs = require('fs');

export { isNovhaFileName, isPartialPathUnderPrefix, normalizePartialPath, NOVHA_FILENAME } from '../interfaces/novha.util';

export function folderHasNovha(dir: string): boolean {
  if (!dir) {
    return false;
  }

  try {
    return fs.existsSync(path.join(dir, NOVHA_FILENAME));
  } catch {
    return false;
  }
}

/**
 * True when `fileOrDir` lives in a folder (or ancestor up to `sourceRoot`) that contains `.novha`.
 */
export function isUnderNovha(sourceRoot: string, fileOrDir: string): boolean {
  if (!sourceRoot || !fileOrDir) {
    return false;
  }

  const root = path.normalize(sourceRoot);
  let current = path.normalize(fileOrDir);

  if (folderHasNovha(current)) {
    return true;
  }

  current = path.dirname(current);

  while (true) {
    const normalized = path.normalize(current);

    if (folderHasNovha(normalized)) {
      return true;
    }

    if (normalized === root) {
      break;
    }

    const parent = path.dirname(normalized);
    if (parent === normalized) {
      break;
    }

    const rel = path.relative(root, parent);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return folderHasNovha(root);
    }

    current = parent;
  }

  return false;
}

export function folderToPartialPath(sourceRoot: string, folderFullPath: string): string {
  const rel = path.relative(sourceRoot, folderFullPath).replace(/\\/g, '/');
  if (!rel || rel === '.') {
    return '';
  }
  return '/' + rel;
}

export function isPathInsideFolder(fullPath: string, folderFull: string): boolean {
  const fileNorm = path.normalize(fullPath);
  const folderNorm = path.normalize(folderFull);
  return fileNorm === folderNorm || fileNorm.startsWith(folderNorm + path.sep);
}

/**
 * Folders that contain a `.novha` marker. If the source root itself is marked,
 * only that root is returned — descendants are already covered.
 */
export function findNovhaFolderPaths(inputDir: string): Promise<string[]> {
  if (folderHasNovha(inputDir)) {
    return Promise.resolve([path.normalize(inputDir)]);
  }

  const crawler = new fdir()
    .exclude((dirName: string) => dirName.startsWith('vha-'))
    .filter((file: string) => isNovhaFileName(path.basename(file)))
    .withFullPaths()
    .crawl(inputDir);

  return crawler.withPromise()
    .then((files: string[]) => {
      return (files || []).map((file: string) => path.normalize(path.dirname(file)));
    })
    .catch(() => []);
}
