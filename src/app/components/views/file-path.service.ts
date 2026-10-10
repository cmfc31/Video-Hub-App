import { Injectable } from '@angular/core';

import * as path from 'path';

import { SourceFolderService } from '../statistics/source-folder.service';

import type { ImageElement } from '../../../../interfaces/final-object.interface';
import type { ImageAssetFolder, ImageFormat } from '../../../../interfaces/image-format.util';
import { imageFileName } from '../../../../interfaces/image-format.util';

@Injectable()
export class FilePathService {

  replaceMap: any = {
    ' ': '%20',
    '(': '%28',
    ')': '%29',
  };

  // set from the hub's `screenshotSettings` whenever a hub is opened
  imageFormat: ImageFormat = 'jpg';
  screenshotHeight = 288;

  constructor(
    public sourceFolderService: SourceFolderService,
  ) { }

  /**
   * Build the browser-friendly path based on the input (only `/` and `%20`), prepend with `file://`
   * @param folderPath - path to where `vha-folder` is stored
   * @param hubName    - name of hub (to pick the correct `vha-folder` name)
   * @param subfolder  - whether `thumbnails`, `filmstrips`, or `clips`
   * @param hash       - file hash
   * @param video      - boolean -- if true then extension is `.mp4`
   * @param screens    - number of screenshots in the filmstrip -- needed for `filmstrips` (very wide ones stay `.jpg`)
   */
  createFilePath(folderPath: string, hubName: string, subfolder: ImageAssetFolder, hash: string, video?: boolean, screens = 0): string {
    return 'file://' + path.normalize(path.join(
      folderPath,
      'vha-' + hubName,
      subfolder,
      video ? hash + '.mp4' : imageFileName(hash, subfolder, this.imageFormat, screens, this.screenshotHeight)
    )).replace(/\\/g, '/')
      .replace(/[ \(\)]/g, (match) => { return this.replaceMap[match]; });
      //         ^^^^^ replace the ` ` (space) as well as parentheses `(` and `)` with URL encoding from the `replaceMap`
  }

  /**
   * return file name without extension
   * e.g. `video.mp4` => `video`
   */
  getFileNameWithoutExtension(fileName: string): string {
    return fileName.slice().substr(0, fileName.lastIndexOf('.'));
  }

  /**
   * return extension without file name
   * e.g. `video.mp4` => `.mp4`
   */
  getFileNameExtension(fileName: string): string {
    return fileName.slice().split('.').pop();
  }

  /**
   * Return full filesystem path to video file
   */
  getPathFromImageElement(item: ImageElement): string {
    return path.join(
      this.sourceFolderService.selectedSourceFolder[item.inputSource].path,
      item.partialPath,
      item.fileName
    );
  }

}
