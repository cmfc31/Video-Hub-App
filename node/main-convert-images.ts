/**
 * Convert a hub's existing images (thumbnails, filmstrips, clip posters) to another image format
 * e.g. JPG -> AVIF, re-encoding the already-generated files (no need for the source videos).
 *
 * Flow:
 *   1. `startImageConversion` -- encode every image into the new format next to the old one (old files untouched)
 *   2. Angular receives `image-format-converted`, updates the hub's `screenshotSettings.imageFormat`
 *   3. `commitImageConversion` -- after the .vha2 file is saved with the new format, delete the old files
 *
 * If the app quits or the job is cancelled before (3), the hub still points to the old files which are intact;
 * running the conversion again skips images already converted.
 */

const async = require('async');
const fs = require('fs');
import * as path from 'path';

import { GLOBALS } from './main-globals';
import { formatOfPath, imageAssetPath, imageEncodeArgs, imageEncodeBudget, spawn_ffmpeg_and_run } from './main-extract';
import { allowSleep, preventSleep } from './main-extract-async';
import { sendCurrentProgress } from './main-support';

import type { ImageElement, ScreenshotSettings } from '../interfaces/final-object.interface';
import type { ImageAssetFolder, ImageFormat } from '../interfaces/image-format.util';
import { normalizeImageFormat, tileWidth } from '../interfaces/image-format.util';

// libaom already uses several threads per image (`-row-mt`) -- a few parallel jobs keep all cores busy
const CONVERSION_CONCURRENCY = 3;

// minimum time before a single image conversion is considered stuck
const CONVERSION_MIN_TIMEOUT_MS = 30000;

const IMAGE_FOLDERS: ImageAssetFolder[] = ['thumbnails', 'filmstrips', 'clips'];

export interface ImageConversionResult {
  converted: number;   // images now present in the new format
  failed: number;      // images that could not be converted (they will show up as missing assets)
  format: ImageFormat; // the new format
  missing: number;     // images that were already missing from disk before the conversion
}

export interface ImageConversionFailure {
  folder: ImageAssetFolder;
  hash: string;
  willRetry: boolean;  // true the first time an image fails -- it is queued again at the end
}

/**
 * Sent to Angular (`image-conversion-progress`) when the conversion starts, after every image, and when it ends
 */
export interface ImageConversionProgress {
  converted: number;
  done: number;                         // images handled so far (converted + failed + missing)
  elapsedMs: number;                    // time since the conversion started
  failed: number;                       // images that failed twice -- they will show up as missing assets
  format: ImageFormat;                  // the format being converted to
  lastFailure?: ImageConversionFailure; // set only on the update right after an image failed
  missing: number;                      // images that were already missing from disk
  retrying: number;                     // images that failed once and are waiting for (or running) their retry
  state: 'running' | 'finished' | 'cancelled';
  total: number;
  vhaFile: string;
}

type ConversionOutcome = 'converted' | 'failed' | 'missing';

interface ConversionTask {
  folder: ImageAssetFolder;
  hash: string;
  retried?: boolean;  // true once a failed conversion was queued again
  screens: number;
}

interface ConversionJob {
  converted: number;
  done: number;
  failed: number;
  missing: number;
  queue: any;                       // async QueueObject
  retrying: number;
  screenshotFolder: string;
  sourceFilesToDelete: string[];    // old-format files that now have a new-format copy
  sourceSettings: ScreenshotSettings;
  startTime: number;
  targetSettings: ScreenshotSettings;
  total: number;
  vhaFile: string;
}

let currentJob: ConversionJob;

// set once the conversion finished, until it's committed (or another conversion starts)
let finishedJob: ConversionJob;

export function isImageConversionRunning(): boolean {
  return !!currentJob;
}

/**
 * Start converting every image of the open hub to `targetFormat`
 * @param elements     -- all the hub's ImageElements
 * @param targetFormat -- the new image format
 */
export function startImageConversion(elements: ImageElement[], targetFormat: ImageFormat): void {

  cancelImageConversion();
  finishedJob = undefined;

  const screenshotFolder: string = path.join(GLOBALS.selectedOutputFolder, 'vha-' + GLOBALS.hubName);

  const sourceSettings: ScreenshotSettings = { ...GLOBALS.screenshotSettings };

  // hubs without clips have no clip posters
  const folders: ImageAssetFolder[] = sourceSettings.clipSnippets > 0 ? IMAGE_FOLDERS : ['thumbnails', 'filmstrips'];

  const tasks: ConversionTask[] = [];

  (elements || [])
    .filter((element: ImageElement) => !element.deleted && element.cleanName !== '*FOLDER*')
    .forEach((element: ImageElement) => {
      folders.forEach((folder: ImageAssetFolder) => {
        tasks.push({ folder: folder, hash: element.hash, screens: element.screens });
      });
    });

  const job: ConversionJob = {
    converted: 0,
    done: 0,
    failed: 0,
    missing: 0,
    queue: async.queue((task: ConversionTask, done) => convertOneImage(job, task, done), CONVERSION_CONCURRENCY),
    retrying: 0,
    screenshotFolder: screenshotFolder,
    sourceFilesToDelete: [],
    sourceSettings: sourceSettings,
    startTime: Date.now(),
    targetSettings: { ...sourceSettings, imageFormat: normalizeImageFormat(targetFormat) },
    total: tasks.length,
    vhaFile: GLOBALS.currentlyOpenVhaFile,
  };

  currentJob = job;
  sendConversionProgress(job, 'running');

  if (tasks.length === 0) {
    finishJob(job);
    return;
  }

  preventSleep();

  job.queue.drain(() => {
    finishJob(job);
  });

  job.queue.push(tasks);
}

/**
 * Stop the running conversion -- files already converted stay on disk and are reused next time
 */
export function cancelImageConversion(): void {
  if (currentJob) {
    const job: ConversionJob = currentJob;
    job.queue.kill();
    currentJob = undefined;
    allowSleep();
    sendConversionProgress(job, 'cancelled');
  }
}

/**
 * Call once the hub was saved with the new `imageFormat`: delete the old-format images that were converted.
 * @param vhaFile -- the hub that was saved
 * @param format  -- the format the hub was saved with
 */
export function commitImageConversion(vhaFile: string, format: ImageFormat): void {
  if (!finishedJob || finishedJob.vhaFile !== vhaFile || finishedJob.targetSettings.imageFormat !== format) {
    return;
  }

  finishedJob.sourceFilesToDelete.forEach((oldFile: string) => {
    fs.unlink(oldFile, () => {});
  });

  finishedJob = undefined;
}

function finishJob(job: ConversionJob): void {
  if (currentJob !== job) {
    return; // cancelled
  }

  currentJob = undefined;
  finishedJob = job;
  allowSleep();
  sendCurrentProgress(1, 1, 'done');
  sendConversionProgress(job, 'finished');

  const result: ImageConversionResult = {
    converted: job.converted,
    failed: job.failed,
    format: job.targetSettings.imageFormat,
    missing: job.missing,
  };

  GLOBALS.angularApp.sender.send('image-format-converted', result, job.vhaFile);
}

function sendConversionProgress(
  job: ConversionJob,
  state: ImageConversionProgress['state'],
  lastFailure?: ImageConversionFailure
): void {
  if (!GLOBALS.angularApp) {
    return;
  }

  const progress: ImageConversionProgress = {
    converted: job.converted,
    done: job.done,
    elapsedMs: Date.now() - job.startTime,
    failed: job.failed,
    format: job.targetSettings.imageFormat,
    lastFailure: lastFailure,
    missing: job.missing,
    retrying: job.retrying,
    state: state,
    total: job.total,
    vhaFile: job.vhaFile,
  };

  GLOBALS.angularApp.sender.send('image-conversion-progress', progress);
}

/**
 * Convert a single image of the hub into the target format
 *   - nothing to do when the image already exists in the target format (or the format of this image stays the same)
 *   - skip images missing from disk (they are re-extracted from the source with `Generate missing assets`)
 */
function convertOneImage(job: ConversionJob, task: ConversionTask, done): void {

  const sourcePath: string = imageAssetPath(job.screenshotFolder, task.folder, task.hash, task.screens, job.sourceSettings);
  const targetPath: string = imageAssetPath(job.screenshotFolder, task.folder, task.hash, task.screens, job.targetSettings);

  const finished = (outcome: ConversionOutcome): void => {
    if (currentJob !== job) {
      return; // cancelled -- the queue is already dead
    }
    if (outcome === 'failed') {
      job.failed++;
    } else if (outcome === 'missing') {
      job.missing++;
    } else {
      job.converted++;
    }
    if (task.retried) {
      job.retrying--;
    }
    job.done++;
    sendCurrentProgress(job.done, job.total, 'convertingImages');
    sendConversionProgress(
      job,
      'running',
      outcome === 'failed' ? { folder: task.folder, hash: task.hash, willRetry: false } : undefined
    );
    done();
  };

  if (sourcePath === targetPath) {
    finished('converted');
    return;
  }

  fs.access(targetPath, fs.constants.F_OK, (targetMissing: any) => {
    if (!targetMissing) {
      // converted during an earlier (interrupted) run
      job.sourceFilesToDelete.push(sourcePath);
      finished('converted');
      return;
    }

    fs.access(sourcePath, fs.constants.F_OK, (sourceMissing: any) => {
      if (sourceMissing) {
        finished('missing');
        return;
      }

      // write into a temporary file first so an interrupted encode never leaves a broken image behind
      const parsedTarget = path.parse(targetPath);
      const tempPath: string = path.join(parsedTarget.dir, parsedTarget.name + '.tmp' + parsedTarget.ext);
      const targetFormat: ImageFormat = formatOfPath(targetPath);

      const args: string[] = [
        '-i', sourcePath,
        '-frames:v', '1',
        ...imageEncodeArgs(targetFormat),
        tempPath,
      ];

      const width: number =
          task.folder === 'filmstrips' ? tileWidth(job.sourceSettings.height) * task.screens
        : task.folder === 'clips'      ? tileWidth(job.sourceSettings.clipHeight)
        :                                tileWidth(job.sourceSettings.height);

      // several encodes run in parallel and compete for the CPU -- be generous, an image-to-image encode never hangs
      const maxRunTime: number = CONVERSION_MIN_TIMEOUT_MS + imageEncodeBudget(targetFormat, width) * 4;

      spawn_ffmpeg_and_run(args, maxRunTime, 'convert image')
        .then((success: boolean) => {
          if (!success) {
            // a killed ffmpeg keeps the temp file locked for a moment (Windows) -- wait before removing it
            setTimeout(() => {
              fs.unlink(tempPath, () => {
                if (!task.retried && currentJob === job) {
                  // retry once at the end of the queue, when fewer encodes compete for the CPU
                  job.retrying++;
                  job.queue.push({ ...task, retried: true });
                  sendConversionProgress(job, 'running', { folder: task.folder, hash: task.hash, willRetry: true });
                  done();
                } else {
                  finished('failed');
                }
              });
            }, 1500);
            return;
          }
          fs.rename(tempPath, targetPath, (err: any) => {
            if (!err) {
              job.sourceFilesToDelete.push(sourcePath);
            }
            finished(err ? 'failed' : 'converted');
          });
        });
    });
  });
}
