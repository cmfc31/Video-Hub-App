/**
 * This file contains all the logic for extracting:
 * first thumbnail,
 * full filmstrip,
 * the preview clip
 * the clip's first thumbnail
 *
 * All functions are PURE
 *
 * Huge thank you to cal2195 for the code contribution
 * He implemented the efficient filmstrip and clip extraction!
 */

// ========================================================================================
//          Imports
// ========================================================================================

// cool method to disable all console.log statements!
// console.log('console.log disabled in main-extract.ts');
// console.log = function() {};

// const { performance } = require('perf_hooks');  // for logging time taken during debug

const fs = require('fs');
import * as path from 'path';
const spawn = require('child_process').spawn;
const exec = require('child_process').exec;
import { resolveSpawnableExecutablePath } from './ffmpeg-paths';

const ffmpegPath = resolveSpawnableExecutablePath(require('ffmpeg-static'), 'ffmpeg');
const ffprobePath = resolveSpawnableExecutablePath(require('@ffprobe-installer/ffprobe').path, 'ffprobe');

import { GLOBALS } from './main-globals';

import type { ImageElement, ScreenshotSettings } from '../interfaces/final-object.interface';

// High JPEG quality for thumbnails and filmstrips (1 = best, 31 = worst).
const FFMPEG_JPEG_QUALITY = '1';

// Browser-safe preview clip encoding (H.264 Main + AAC), higher quality than default web presets.
const PREVIEW_CLIP_CRF = '20';
const PREVIEW_CLIP_PRESET = 'slow';
const PREVIEW_CLIP_AUDIO_BITRATE = '160k';

interface HardwareDecodeConfig {
  inputArgs: string[];
  name: string;
  amdH264EncoderAvailable: boolean;
}

let hardwareDecodeConfigPromise: Promise<HardwareDecodeConfig>;

const NO_HARDWARE_DECODE: HardwareDecodeConfig = {
  inputArgs: [],
  name: 'none',
  amdH264EncoderAvailable: false,
};

function execCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout || '');
      }
    });
  });
}

/**
 * Detect the best available hardware decoder for Windows + AMD setups.
 * We prefer d3d11va, then dxva2.
 */
function detectHardwareDecodeConfig(): Promise<HardwareDecodeConfig> {
  if (process.platform !== 'win32') {
    return Promise.resolve(NO_HARDWARE_DECODE);
  }

  const hwaccelCmd = '"' + ffmpegPath + '" -hide_banner -hwaccels';
  const encoderCmd = '"' + ffmpegPath + '" -hide_banner -encoders';

  return Promise.all([
    execCommand(hwaccelCmd).catch(() => ''),
    execCommand(encoderCmd).catch(() => ''),
  ])
    .then(([hwaccelsOutput, encodersOutput]) => {
      const amfAvailable = /\bh264_amf\b/i.test(encodersOutput);

      if (/\bd3d11va\b/i.test(hwaccelsOutput)) {
        return { inputArgs: ['-hwaccel', 'd3d11va'], name: 'd3d11va', amdH264EncoderAvailable: amfAvailable };
      }
      if (/\bdxva2\b/i.test(hwaccelsOutput)) {
        return { inputArgs: ['-hwaccel', 'dxva2'], name: 'dxva2', amdH264EncoderAvailable: amfAvailable };
      }
      return {
        ...NO_HARDWARE_DECODE,
        amdH264EncoderAvailable: amfAvailable,
      };
    })
    .catch(() => NO_HARDWARE_DECODE);
}

function getHardwareDecodeConfig(): Promise<HardwareDecodeConfig> {
  if (!hardwareDecodeConfigPromise) {
    hardwareDecodeConfigPromise = detectHardwareDecodeConfig();
  }
  return hardwareDecodeConfigPromise;
}

/**
 * Input-scoped ffmpeg args (like -hwaccel) must appear before each `-i`.
 */
function injectInputScopedArgs(baseArgs: string[], inputScopedArgs: string[]): string[] {
  if (inputScopedArgs.length === 0) {
    return [...baseArgs];
  }

  const result: string[] = [];
  for (let i = 0; i < baseArgs.length; i++) {
    if (baseArgs[i] === '-i') {
      result.push(...inputScopedArgs);
    }
    result.push(baseArgs[i]);
  }

  return result;
}

// ========================================================================================
//          FFMPEG arg generating functions
// ========================================================================================

/**
 * Shared libx264 settings for preview clips — broad HTML5 / Firefox compatibility.
 */
function browserSafeVideoEncodeArgs(preferAmdH264Encoder: boolean): string[] {
  if (preferAmdH264Encoder) {
    return [
      '-c:v', 'h264_amf',
      '-quality', 'quality',
      '-rc', 'vbr_peak',
      '-b:v', '4M',
      '-maxrate', '8M',
      '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-f', 'mp4',
    ];
  }

  return [
    '-c:v', 'libx264',
    '-profile:v', 'main',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-preset', PREVIEW_CLIP_PRESET,
    '-crf', PREVIEW_CLIP_CRF,
    '-movflags', '+faststart',
    '-f', 'mp4',
  ];
}

/**
 * Shared AAC settings for preview clips.
 */
function browserSafeAudioEncodeArgs(): string[] {
  return [
    '-c:a', 'aac',
    '-b:a', PREVIEW_CLIP_AUDIO_BITRATE,
    '-ac', '2',
    '-ar', '48000',
  ];
}

/**
 * Detect whether a video file has at least one audio stream.
 * Used to pick a concat graph that works for silent sources.
 */
function hasAudioStream(pathToVideo: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ffprobeCommand = '"' + ffprobePath + '" -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "' + path.normalize(pathToVideo) + '"';

    exec(ffprobeCommand, (err, stdout) => {
      resolve(!err && stdout.trim().length > 0);
    });
  });
}

interface VideoColorProfile {
  isHdr: boolean;
}

const HDR_COLOR_TRANSFERS: Set<string> = new Set(['smpte2084', 'arib-std-b67']);

/**
 * Detect HDR sources so we can tone-map before JPEG / SDR preview output.
 */
function getVideoColorProfile(pathToVideo: string): Promise<VideoColorProfile> {
  const ffprobeCommand = '"' + ffprobePath + '" -v error -select_streams v:0 -show_entries stream=color_transfer -of csv=p=0 "' + path.normalize(pathToVideo) + '"';

  return new Promise((resolve) => {
    exec(ffprobeCommand, (err, stdout) => {
      const colorTransfer = (stdout || '').trim().toLowerCase();
      resolve({ isHdr: !err && HDR_COLOR_TRANSFERS.has(colorTransfer) });
    });
  });
}

/**
 * Generate the ffmpeg args to extract a single frame according to settings
 * @param pathToVideo
 * @param screenshotHeight
 * @param duration
 * @param savePath
 * @param isHdr
 * @param seekTimeSeconds -- optional explicit seek position; defaults to duration / 10
 */
const extractSingleFrameArgs = (
  pathToVideo: string,
  screenshotHeight: number,
  duration: number,
  savePath: string,
  isHdr: boolean,
  seekTimeSeconds?: number,
): string[] => {

  const ssWidth: number = screenshotHeight * (16 / 9);

  const seekTime: number = seekTimeSeconds === undefined ? duration / 10 : seekTimeSeconds;

  const args: string[] = [
    '-ss', seekTime.toString(),
    '-i', pathToVideo,
    '-frames:v', '1',
    '-q:v', FFMPEG_JPEG_QUALITY,
    '-vf', scaleAndPadString(ssWidth, screenshotHeight, isHdr),
    savePath,
  ];

  return args;
};

/**
 * Take N screenshots of a particular file
 * at particular file size
 * save as particular fileHash
 * (if filmstrip not already present)
 *
 * @param pathToVideo          -- full path to the video file
 * @param duration             -- duration of clip
 * @param screenshotHeight     -- height of screenshot in pixels
 * @param numberOfScreenshots  -- number of screenshots to extract
 * @param savePath             -- full path to file name and extension
 */
const generateScreenshotStripArgs = (
  pathToVideo: string,
  duration: number,
  screenshotHeight: number,
  numberOfScreenshots: number,
  savePath: string,
  isHdr: boolean,
): string[] => {

  let current = 0;
  const totalCount = numberOfScreenshots;
  const step: number = duration / (totalCount + 1);
  const args: string[] = [];
  let allFramesFiltered = '';
  let outputFrames = '';

  // Hardcode a specific 16:9 ratio
  const ssWidth: number = screenshotHeight * (16 / 9);

  const fancyScaleFilter: string = scaleAndPadString(ssWidth, screenshotHeight, isHdr);

  // make the magic filter
  while (current < totalCount) {
    const time = (current + 1) * step; // +1 so we don't pick the 0th frame
    args.push('-ss', time.toString(), '-i', pathToVideo);
    allFramesFiltered += '[' + current + ':V]' + fancyScaleFilter + '[' + current + '];';
    outputFrames += '[' + current + ']';
    current++;
  }
  args.push(
    '-filter_complex', allFramesFiltered + outputFrames + 'hstack=inputs=' + totalCount,
    '-frames:v', '1',
    '-q:v', FFMPEG_JPEG_QUALITY,
    savePath
  );

  return args;
};

/**
 * Generate the mp4 preview clip of the video file
 * (if clip is not already present)
 *
 * @param pathToVideo   -- full path to the video file
 * @param duration      -- duration of the original video file
 * @param clipHeight    -- height of clip
 * @param clipSnippets  -- number of clip snippets to extract
 * @param snippetLength -- length in seconds of each snippet
 * @param savePath      -- full path to file name and extension
 */
const generatePreviewClipArgs = (
  pathToVideo: string,
  duration: number,
  clipHeight: number,
  clipSnippets: number,
  snippetLength: number,
  savePath: string,
  hasAudio: boolean,
  preferAmdH264Encoder: boolean,
  isHdr: boolean,
): string[] => {

  let current = 1;
  const totalCount = clipSnippets;
  const step: number = duration / (totalCount + 1);
  const args: string[] = [];
  let concatInputs = '';
  const videoScale = '[v]' + previewClipVideoScaleFilter(clipHeight, isHdr) + '[v2]';

  // make the magic filter
  while (current <= totalCount) {
    const time = current * step;
    const preview_duration = snippetLength;
    args.push('-ss', time.toString(), '-t', preview_duration.toString(), '-i', pathToVideo);
    current++;
  }

  if (hasAudio) {
    for (let i = 0; i < totalCount; i++) {
      concatInputs += '[' + i + ':v][' + i + ':a]';
    }
    concatInputs += 'concat=n=' + totalCount + ':v=1:a=1[v][a];' + videoScale;
    args.push(
      '-filter_complex', concatInputs,
      '-map', '[v2]',
      '-map', '[a]',
      ...browserSafeVideoEncodeArgs(preferAmdH264Encoder),
      ...browserSafeAudioEncodeArgs(),
      savePath
    );
  } else {
    for (let i = 0; i < totalCount; i++) {
      concatInputs += '[' + i + ':v]';
    }
    concatInputs += 'concat=n=' + totalCount + ':v=1:a=0[v];' + videoScale;
    args.push(
      '-filter_complex', concatInputs,
      '-map', '[v2]',
      '-an',
      ...browserSafeVideoEncodeArgs(preferAmdH264Encoder),
      savePath
    );
  }

  return args;
};

/**
 * Extract the first frame from the preview clip
 *
 * @param pathToClip -- full path to where the .mp4 clip is located
 * @param fileHash   -- full path to where the .jpg should be saved
 */
const extractFirstFrameArgs = (
  pathToClip: string,
  pathToThumb: string
): string[] => {

  const args: string[] = [
    '-ss', '0',
    '-i', pathToClip,
    '-frames:v', '1',
    '-q:v', FFMPEG_JPEG_QUALITY,
    pathToThumb,
  ];

  return args;
};

// ========================================================================================
//          Extraction engine
// ========================================================================================

/**
 * Extract thumbnail, filmstrip, and possibly clip
 *
 * Extract following this order. Each stage returns a boolean
 * (^) means RESTART -- go back to (1) with the next item-to-extract on the list
 *
 * SOURCE FILE ============================
 *   (1) check if input file exists
 *         T:                           (2)
 *         F:                           (^) restart
 * THUMB ==================================
 *   (2) check thumb exists
 *         T:                           (4)
 *         F:                           (3)
 *   (3) extract the SINGLE screenshot
 *         T:                           (4)
 *         F:                           (^) restart - assume corrupt
 * FILMSTRIP ==============================
 *   (4) check filmstrip exists
 *         T:                           (6)
 *         F:                           (5)
 *   (5) extract the FILMSTRIP
 *         T: (clipSnippets === 0) ?
 *             T:   nothing to do       (^) restart
 *             F:                       (6)
 *         F:                           (^) restart - assume corrupt
 * CLIP ===================================
 *   (6) check clip exists
 *         T:                           (8)
 *         F:                           (7)
 *   (7) extract the CLIP
 *         T:                           (8)
 *         F:                           (^) restart - assume corrupt
 * CLIP THUMB =============================
 *   (8) check clip thumb exists
 *         T:                           (^) restart
 *         F:                           (9)
 *   (9) extract the CLIP preview
 *         T:                           (^) restart
 *         F:                           (^) restart
 *
 * @param currentElement     -- ImageElement to extract thumbs
 * @param videoFolderPath    -- path to base folder where videos are
 * @param screenshotFolder   -- path to folder where .jpg files will be saved
 * @param screenshotSettings -- ScreenshotSettings object
 * @param done               -- execute this method when done extracting
 */
export function extractAll(
  currentElement: ImageElement,
  videoFolderPath: string,
  screenshotFolder: string,
  screenshotSettings: ScreenshotSettings,
  done
): void {

  const clipHeight:       number = screenshotSettings.clipHeight;        // -- number in px how tall each clip should be
  const clipSnippets:     number = screenshotSettings.clipSnippets;      // -- number of clip snippets to extract; 0 == do not extract clip
  const screenshotHeight: number = screenshotSettings.height;            // -- number in px how tall each screenshot should be
  const snippetLength:    number = screenshotSettings.clipSnippetLength; // -- length of each snippet in the clip

  const pathToVideo: string = path.join(videoFolderPath, currentElement.partialPath, currentElement.fileName);

  const duration:     number = currentElement.duration;
  const fileHash:     string = currentElement.hash;
  const numOfScreens: number = currentElement.screens;
  const sourceHeight: number = currentElement.height;

  const thumbnailSavePath: string = path.normalize(screenshotFolder + '/thumbnails/' + fileHash + '.jpg');
  const filmstripSavePath: string = path.normalize(screenshotFolder + '/filmstrips/' + fileHash + '.jpg');
  const clipSavePath:      string = path.normalize(screenshotFolder + '/clips/' +      fileHash + '.mp4');
  const clipThumbSavePath: string = path.normalize(screenshotFolder + '/clips/' +      fileHash + '.jpg');

  const maxRunTime: ExtractionDurations = setExtractionDurations(
    sourceHeight, numOfScreens, screenshotHeight, clipSnippets, snippetLength, clipHeight
  );

  let sourceIsHdr = false;

  const hdrTimeoutFactor = (durationMs: number): number => sourceIsHdr ? durationMs * 2 : durationMs;

  checkFileExists(pathToVideo)                                                            // (1)
    .then((videoFileExists: boolean) => {
      // console.log('01 - video file live = ' + videoFileExists);

      if (!videoFileExists) {
        throw new Error('VIDEO FILE NOT PRESENT');
      } else {
        return getVideoColorProfile(pathToVideo);
      }
    })
    .then((colorProfile: VideoColorProfile) => {
      sourceIsHdr = colorProfile.isHdr;
      return checkFileExists(thumbnailSavePath);                                          // (2)
    })
    .then((thumbExists: boolean) => {
      // console.log('02 - thumbnail already present = ' + thumbExists);

      if (thumbExists) {
        return true;
      } else {
        const ffmpegArgs: string[] =  extractSingleFrameArgs(
          pathToVideo, screenshotHeight, duration, thumbnailSavePath, sourceIsHdr
        );

        return run_ffmpeg_with_decode_acceleration(ffmpegArgs, hdrTimeoutFactor(maxRunTime.thumb), 'thumb'); // (3)
      }
    })
    .then((thumbSuccess: boolean) => {
      // console.log('03 - single screenshot now present = ' + thumbSuccess);

      if (!thumbSuccess) {
        throw new Error('SINGLE SCREENSHOT EXTRACTION TIMED OUT - LIKELY CORRUPT');
      } else {
        return checkFileExists(filmstripSavePath);                                        // (4)
      }
    })
    .then((filmstripExists: boolean) => {
      // console.log('04 - filmstrip already present = ' + filmstripExists);

      if (filmstripExists) {
        return true;
      } else {

        const ffmpegArgs: string [] = generateScreenshotStripArgs(
          pathToVideo, duration, screenshotHeight, numOfScreens, filmstripSavePath, sourceIsHdr
        );

        return run_ffmpeg_with_decode_acceleration(ffmpegArgs, hdrTimeoutFactor(maxRunTime.filmstrip), 'filmstrip'); // (5)
      }
    })
    .then((filmstripSuccess: boolean) => {
      // console.log('05 - filmstrip now present = ' + filmstripSuccess);

      if (!filmstripSuccess) {
        throw new Error('FILMSTRIP GENERATION TIMED OUT - LIKELY CORRUPT');
      } else if (clipSnippets === 0) {
        throw new Error('USER DOES NOT WANT CLIPS');
      } else {
        return checkFileExists(clipSavePath);                                             // (6)
      }
    })
    .then((clipExists: boolean) => {
      // console.log('04 - preview clip already present = ' + clipExists);

      if (clipExists) {
        return true;
      } else {
        return hasAudioStream(pathToVideo)
          .then((sourceHasAudio: boolean) => {
            const ffmpegArgs: string[] = generatePreviewClipArgs(
              pathToVideo, duration, clipHeight, clipSnippets, snippetLength, clipSavePath, sourceHasAudio, false, sourceIsHdr
            );

            return getHardwareDecodeConfig()
              .then((decodeConfig: HardwareDecodeConfig) => {
                const acceleratedClipArgs = generatePreviewClipArgs(
                  pathToVideo,
                  duration,
                  clipHeight,
                  clipSnippets,
                  snippetLength,
                  clipSavePath,
                  sourceHasAudio,
                  decodeConfig.amdH264EncoderAvailable,
                  sourceIsHdr
                );

                return run_ffmpeg_with_decode_acceleration(
                  acceleratedClipArgs,
                  hdrTimeoutFactor(maxRunTime.clip),
                  'clip',
                  ffmpegArgs
                );
              });
          });
      }

    })
    .then((clipGenerationSuccess: boolean) => {
      // console.log('07 - preview clip now present = ' + clipGenerationSuccess);

      if (clipGenerationSuccess) {
        return checkFileExists(clipThumbSavePath);                                        // (8)
      } else {
        throw new Error('ERROR GENERATING CLIP');
      }
    })
    .then((clipThumbExists: boolean) => {
      // console.log('05 - preview clip thumb already present = ' + clipThumbExists);

      if (clipThumbExists) {
        return true;
      } else {
        const ffmpegArgs: string[] = extractFirstFrameArgs(clipSavePath, clipThumbSavePath);

        return run_ffmpeg_with_decode_acceleration(ffmpegArgs, maxRunTime.clipThumb, 'clip thumb'); // (9)
      }
    })
    .then((success: boolean) => {
      // console.log('09 - preview clip thumb now exists = ' + success);

      if (success) {
        // console.log('======= ALL STEPS SUCCESSFUL ==========');
      }
      done();
    })
    .catch((err) => {
      // console.log('===> ERROR - RESTARTING: ' + err);
      done();
    });
}

// ========================================================================================
//         Helper methods
// ========================================================================================

interface ExtractionDurations {
  thumb: number;
  filmstrip: number;
  clip: number;
  clipThumb: number;
}

/**
 * Set the ExtractionDurations - the maximum running time per extraction type
 * if ffmpeg takes longer, it is taken out the back and shot - killed with no mercy
 *
 * These computations are not exact, they are meant meant to give a rough timeout window
 * to prevent corrupt files from slowing down the extraction too much
 *
 * @param sourceHeight - height of the original video
 * @param numOfScreens
 * @param screenshotHeight
 * @param clipSnippets
 * @param snippetLength
 * @param clipHeight
 */
function setExtractionDurations(
  sourceHeight: number,
  numOfScreens: number,
  screenshotHeight: number,
  clipSnippets: number,
  snippetLength: number,
  clipHeight: number
): ExtractionDurations {

  // screenshot heights range from 144px to 720px
  // we'll call 144 the baseline and increase duration based on this
  // number of pixels grows ~ as square of height, so we square below
  // this means at highest resolution we multyply by 12.5 the time we wait
  const thumbHeightRatio = screenshotHeight / 144; // max 5.0 at 720px or 25 when squared
  const thumbHeightFactor = 1 + (thumbHeightRatio * thumbHeightRatio / 4); // square of ratio
  // not using Math.pow(n,2) because this is apparently faster https://stackoverflow.com/a/26594370/5017391

  const clipHeightRatio = clipHeight / 144; // max 5.0 at 720px or 25 when squared
  const clipHeightFactor = 1 + (clipHeightRatio * clipHeightRatio / 4); // square of ratio

  const sourceRatio = (sourceHeight === 0) ? 1 : (sourceHeight / 720); // 3 when source is 4k
  const sourceFactor = 1 + (sourceRatio * sourceRatio / 3); // square of ratio

  return {                                                                           // for me:
    thumb:     500 * sourceFactor * thumbHeightFactor,                               // never above 800ms
    filmstrip: 350 * sourceFactor * thumbHeightFactor * numOfScreens,                // rarely above 15s, but 4K 30screens took 50s
    // libx264 re-encode (slow preset) needs extra headroom vs implicit defaults
    clip:      1200 * sourceFactor * clipHeightFactor * clipSnippets * snippetLength,
    clipThumb: 400 * clipHeightRatio,                                                // never above 600ms
  };
}

/**
 * Return promise for whether file exists
 * @param pathToFile string
 */
function checkFileExists(pathToFile: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.access(pathToFile, fs.constants.F_OK, (err: any) => {
      return(resolve(!err));
    });
  });
}

/**
 * Replace original file with new file
 * use ffmpeg to convert and letterbox to fit width and height
 *
 * @param oldFile full path to thumbnail to replace
 * @param newFile full path to sounce image to use as replacement
 * @param height
 */
export function replaceThumbnailWithNewImage(
  oldFile: string,
  newFile: string,
  height: number
): Promise<boolean> {

  console.log('Resizing new image and replacing old thumbnail');

  const width: number = Math.floor(height * (16 / 9));

  const args = [
    '-i', newFile,
    '-vf', scaleAndPadString(width, height, false),
    '-q:v', FFMPEG_JPEG_QUALITY,
    oldFile,
  ];

  return run_ffmpeg_with_decode_acceleration(args, 1000, 'replacing thumbnail');
  // resizing an image file with ffmpeg should take less than 1 second
}

/**
 * Replace the thumbnail of an item by cropping the clicked screenshot straight out
 * of the already-generated filmstrip .jpg, overwriting the existing thumbnail.
 *
 * The filmstrip is `numOfScreens` equal-width tiles stacked horizontally (see
 * `generateScreenshotStripArgs`), and each tile is generated at the exact same
 * dimensions as the thumbnail, so cropping tile `screenIndex` reproduces the frame
 * without decoding the source video. This is faster and more reliable than
 * re-extracting from source, and works even when the source drive is offline.
 *
 * @param currentElement   -- ImageElement whose thumbnail to replace
 * @param screenshotFolder -- path to the `vha-<hubName>` folder holding thumbnails/ and filmstrips/
 * @param screenIndex      -- index of the clicked screenshot in the filmstrip (0-based)
 */
export function replaceThumbnailWithFilmstripFrame(
  currentElement: ImageElement,
  screenshotFolder: string,
  screenIndex: number,
): Promise<boolean> {

  const fileHash: string = currentElement.hash;
  const numOfScreens: number = currentElement.screens;

  const filmstripPath: string = path.normalize(screenshotFolder + '/filmstrips/' + fileHash + '.jpg');
  const thumbnailSavePath: string = path.normalize(screenshotFolder + '/thumbnails/' + fileHash + '.jpg');

  // clamp so a click on the very right edge can't index past the last tile
  const tileIndex: number = Math.max(0, Math.min(screenIndex, numOfScreens - 1));

  // each tile is exactly iw/numOfScreens wide; crop the tile at tileIndex
  const cropFilter: string = 'crop=iw/' + numOfScreens + ':ih:iw/' + numOfScreens + '*' + tileIndex + ':0';

  const args: string[] = [
    '-i', filmstripPath,
    '-vf', cropFilter,
    '-frames:v', '1',
    '-q:v', FFMPEG_JPEG_QUALITY,
    thumbnailSavePath,
  ];

  return spawn_ffmpeg_and_run(args, 2000, 'crop thumbnail from filmstrip');
}

/**
 * Tone-map HDR (PQ / HLG) to SDR before scaling to JPEG-friendly output.
 */
function hdrToSdrFilterPrefix(): string {
  return 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=pc,format=yuv420p,';
}

/**
 * Scale filter color options — SDR sources use auto range detection; post-HDR is already PC range.
 */
function scaleColorOptions(isHdr: boolean): string {
  if (isHdr) {
    return ':in_range=pc:out_range=pc:out_color_matrix=bt709';
  }
  return ':in_range=auto:out_range=pc:out_color_matrix=bt709';
}

/**
 * Scale + pad filter for thumbnails and filmstrips with correct color range handling.
 */
function scaleAndPadString(width: number, height: number, isHdr: boolean): string {
  // sweet thanks to StackExchange!
  // https://superuser.com/questions/547296/resizing-videos-with-ffmpeg-avconv-to-fit-into-static-sized-player

  const prefix = isHdr ? hdrToSdrFilterPrefix() : '';
  const scaleOpts = scaleColorOptions(isHdr);

  return prefix +
         'scale=w=' + width + ':h=' + height + ':force_original_aspect_ratio=decrease' + scaleOpts + ',' +
         'pad='     + width + ':'   + height + ':(ow-iw)/2:(oh-ih)/2';

}

/**
 * Post-concat scale filter for preview clips.
 */
function previewClipVideoScaleFilter(clipHeight: number, isHdr: boolean): string {
  const prefix = isHdr ? hdrToSdrFilterPrefix() : '';
  const scaleOpts = scaleColorOptions(isHdr);

  return prefix + 'scale=-2:' + clipHeight + scaleOpts + ',format=yuv420p';
}

/**
 * Spawn ffmpeg and run the appropriate arguments
 * Kill the process after maxRunningTime
 * @param args            args to pass into ffmpeg
 * @param maxRunningTime  maximum time to run ffmpeg
 * @param description     log for console.log
 */
function spawn_ffmpeg_and_run(
  args: string[],
  maxRunningTime: number,
  description: string
): Promise<boolean> {

  return new Promise((resolve) => {

    // Uncomment things in this method (and the `performance` import) to check how long extraction takes
    // const t0: number = performance.now();

    const ffmpeg_process = spawn(ffmpegPath, ['-nostdin', '-y', ...args]);
    let timedOut = false;
    let settled = false;

    const settle = (success: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(success);
    };

    const killProcessTimeout = setTimeout(() => {
      if (!ffmpeg_process.killed) {
        timedOut = true;
        ffmpeg_process.kill();
        // console.log(description + ' KILLED EARLY');
        return settle(false);
      }
    }, maxRunningTime);

    // Note from past Cal to future Cal:
    // ALWAYS READ THE DATA, EVEN IF YOU DO NOTHING WITH IT
    ffmpeg_process.stdout.on('data', data => {
      if (GLOBALS.debug) {
        console.log(data);
      }
    });
    ffmpeg_process.stderr.on('data', data => {
      if (GLOBALS.debug) {
        console.log('grep stderr: ' + data);
      }
    });
    ffmpeg_process.on('exit', (code) => {
      clearTimeout(killProcessTimeout);
      // const t1: number = performance.now();
      // console.log(description + ' ' + Math.round(t1 - t0) + ' < ' + maxRunningTime);
      if (timedOut) {
        return;
      }
      return settle(code === 0);
    });

    ffmpeg_process.on('error', (error) => {
      clearTimeout(killProcessTimeout);
      if (GLOBALS.debug) {
        console.log('ffmpeg spawn error (' + description + '):', error);
      }
      settle(false);
    });

  });

}

/**
 * Try GPU-accelerated decode first, then retry with CPU decode if needed.
 */
function run_ffmpeg_with_decode_acceleration(
  baseArgs: string[],
  maxRunningTime: number,
  description: string,
  cpuFallbackBaseArgs?: string[],
): Promise<boolean> {
  const fallbackArgs = cpuFallbackBaseArgs || baseArgs;

  return getHardwareDecodeConfig()
    .then((decodeConfig: HardwareDecodeConfig) => {
      if (decodeConfig.inputArgs.length === 0) {
        return spawn_ffmpeg_and_run(baseArgs, maxRunningTime, description)
          .then((success: boolean) => {
            if (success || serializeFfmpegArgs(baseArgs) === serializeFfmpegArgs(fallbackArgs)) {
              return success;
            }
            return spawn_ffmpeg_and_run(fallbackArgs, maxRunningTime, description + ' (cpu fallback)');
          });
      }

      const acceleratedArgs = injectInputScopedArgs(baseArgs, decodeConfig.inputArgs);

      return spawn_ffmpeg_and_run(acceleratedArgs, maxRunningTime, description + ' (' + decodeConfig.name + ')')
        .then((acceleratedSuccess: boolean) => {
          if (acceleratedSuccess) {
            return true;
          }

          // If hardware decode fails for a specific file/codec, fall back automatically.
          return spawn_ffmpeg_and_run(fallbackArgs, maxRunningTime, description + ' (cpu fallback)');
        });
    });
}

function serializeFfmpegArgs(args: string[]): string {
  return args.join('\0');
}
