import { Component, HostListener, input, output } from '@angular/core';

import type { AppStateInterface } from '../../common/app-state';
import type { SettingsButtonsType } from '../../common/settings-buttons';
import type { HistoryItem } from '../../../../interfaces/shared-interfaces';

@Component({
  standalone: false,
  selector: 'app-title-bar',
  templateUrl: './title-bar.component.html',
  styleUrls: ['./title-bar.component.scss']
})
export class TitleBarComponent {

  readonly initiateClose = output<void>();
  readonly initiateMaximize = output<void>();
  readonly initiateMinimize = output<void>();
  readonly openFromHistory = output<number>();
  readonly openFromFile = output<void>();

  readonly appState = input<AppStateInterface>();
  readonly demo = input<boolean>();
  readonly importStage = input();
  readonly macVersion = input<boolean>();
  readonly progressString = input();
  readonly settingsButtons = input<SettingsButtonsType>();
  readonly vhaFileHistory = input<HistoryItem[]>();

  hubSwitcherOpen = false;
  hubSwitcherLeft = 0;

  constructor() { }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeHubSwitcher(): void {
    this.hubSwitcherOpen = false;
  }

  toggleHubSwitcher(event: MouseEvent): void {
    event.stopPropagation();
    const left = (event.currentTarget as HTMLElement).getBoundingClientRect().left;
    this.hubSwitcherLeft = Math.max(0, Math.min(left, window.innerWidth - 410));
    this.hubSwitcherOpen = !this.hubSwitcherOpen;
  }

  selectHub(index: number): void {
    this.hubSwitcherOpen = false;
    if (index !== 0) {
      this.openFromHistory.emit(index);
    }
  }

  selectOpenFromFile(): void {
    this.hubSwitcherOpen = false;
    this.openFromFile.emit();
  }

}
