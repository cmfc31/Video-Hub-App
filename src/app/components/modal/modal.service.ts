import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ModalComponent } from './modal.component';
import { WelcomeComponent } from './welcome.component';

export interface DialogData {
  content: string;
  title: string;
  details?: string;
  confirm?: boolean;
}

@Injectable()
export class ModalService {

  constructor(
    public dialog: MatDialog,
    public snack: MatSnackBar,
  ) { }

  /**
   * Opens a modal popup which can be exited via `Esc` key or clicking outside of it
   * returns a promise you can `.subscribe(() => { ... }` to
   * @param title
   * @param content
   * @param details
   */
  openDialog(title: string, content: string, details: string) {

    const dialogRef = this.dialog.open(
      ModalComponent,
      {
        data: {
          content: content,
          details: details,
          title: title,
        }
      }
    );

    return dialogRef.afterClosed();
  }

  /**
   * Opens a confirm / cancel dialog. Resolves `true` only when the user confirms.
   */
  openConfirm(title: string, content: string) {
    const dialogRef = this.dialog.open(
      ModalComponent,
      {
        data: {
          confirm: true,
          content: content,
          title: title,
        },
        maxWidth: '420px',
        width: '90vw',
        panelClass: 'confirm-dialog-panel',
      }
    );

    return dialogRef.afterClosed();
  }

  /**
   * Open the welcome message that tells users how to use the app
   */
  openWelcomeMessage() {
    this.dialog.open(WelcomeComponent);
  }

  /**
   * Show "snack bar" / "toaster" at the bottom center with a message for 1.5 seconds
   * @param message
   * @param panelClass -- styling variant; defaults to the red 'custom-snackbar'
   *                      pass 'success-snackbar' for the green success variant
   */
  openSnackbar(message: string, panelClass: string = 'custom-snackbar') {
    this.snack.open(message, '', {
      duration: 1500,
      panelClass: [panelClass]
    });
  }

}
