import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Some packagers resolve executables from `app.asar` while others already resolve
 * from `app.asar.unpacked`. Rewrite only the packed variant so we never end up with
 * `app.asar.unpacked.unpacked`.
 */
export function resolveAsarUnpackedPath(executablePath: string): string {
  if (!executablePath || executablePath.includes('app.asar.unpacked')) {
    return executablePath;
  }

  return executablePath.replace('app.asar', 'app.asar.unpacked');
}

function isPackedAsarPath(executablePath: string): boolean {
  return executablePath.includes('app.asar') && !executablePath.includes('app.asar.unpacked');
}

function ensureTempBinaryDir(): string {
  const binaryDir = path.join(os.tmpdir(), 'vha3-bin');
  fs.mkdirSync(binaryDir, { recursive: true });
  return binaryDir;
}

function resolveBundledResourceBinary(binaryName: string): string {
  const extension = process.platform === 'win32' ? '.exe' : '';
  const resourcePath = (process as any).resourcesPath;
  if (!resourcePath) {
    return '';
  }

  const bundledPath = path.join(resourcePath, 'bin', binaryName + extension);
  return fs.existsSync(bundledPath) ? bundledPath : '';
}

function materializePackedExecutable(executablePath: string, binaryName: string): string {
  const extension = path.extname(executablePath);
  const tempPath = path.join(ensureTempBinaryDir(), binaryName + extension);

  if (!fs.existsSync(tempPath)) {
    // Read from ASAR virtual path and write to a real file that child_process can execute.
    fs.copyFileSync(executablePath, tempPath);
    if (process.platform !== 'win32') {
      fs.chmodSync(tempPath, 0o755);
    }
  }

  return tempPath;
}

/**
 * Return an executable path that is safe to spawn in dev and packaged modes.
 */
export function resolveSpawnableExecutablePath(executablePath: string, binaryName: string): string {
  const bundledResourceBinary = resolveBundledResourceBinary(binaryName);
  if (bundledResourceBinary) {
    return bundledResourceBinary;
  }

  const unpackedPath = resolveAsarUnpackedPath(executablePath);

  if (unpackedPath && fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  if (executablePath && !isPackedAsarPath(executablePath) && fs.existsSync(executablePath)) {
    return executablePath;
  }

  if (executablePath && isPackedAsarPath(executablePath) && fs.existsSync(executablePath)) {
    try {
      return materializePackedExecutable(executablePath, binaryName);
    } catch (error) {
      // Fall through to original path and let caller surface spawn error details.
    }
  }

  return unpackedPath || executablePath;
}
