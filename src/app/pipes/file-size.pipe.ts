import type { PipeTransform } from '@angular/core';
import { Pipe } from '@angular/core';

import { formatFileSize } from '../../../interfaces/file-size.util';
import { SettingsButtons } from '../common/settings-buttons';

@Pipe({
  standalone: false,
  name: 'fileSizePipe'
})
export class FileSizePipe implements PipeTransform {

  /**
   * Return size of file formatted as ### MB or ### GB
   * @param sizeInBytes -- file size in bytes
   * @param excludeParen - whether (2.3GB) or 2.3GB
   */
  transform(sizeInBytes: number, excludeParen?: boolean): string {
    return formatFileSize(sizeInBytes, SettingsButtons['binaryFileSize'].toggled, excludeParen);
  }

}
