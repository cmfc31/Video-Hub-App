# Video Hub App 3

[_Video Hub App 3_](https://videohubapp.com/) is the fastest way to browse, search, and organize videos on your computer. Think of it like YouTube for videos on your computer. Works on **Windows**, **Mac**, and **Linux**!

## Download Now

This software is available for $10.00 through [videohubapp.com](https://videohubapp.com/en/download)

Over $16,000 donated from the sale of this software to the [_cost-effective_](https://www.givewell.org/charities/top-charities) charity [Against Malaria Foundation](https://www.againstmalaria.com/). See [donation history](https://www.againstmalaria.com/Fundraiser.aspx?FundraiserID=8035)

![video-hub-app](https://github.com/user-attachments/assets/9f13fc21-63ab-46ae-8409-ba2d9b5f289a)

## About

_Video Hub App_ was created by [Boris Yakubchik](https://videohubapp.com/en/about). It uses the frameworks _Angular_ and _Electron_.

## License

This software was built on top of [`angular-electron`](https://github.com/maximegris/angular-electron) by [Belnadris](https://github.com/belnadris). It carries an _MIT_ license (see the _LICENSE_ file). While the license is permissive, I ask that you do not distribute free copies of this software unless you have significantly changed it.

## Contributing

I would love to see the improvements you make to this app and am happy to accept pull requests. See [issues](https://github.com/whyboris/Video-Hub-App/issues) for ideas for improving this app or to add your suggestions.

Please consider improving any of the translations, or [add a new translation](https://github.com/whyboris/Video-Hub-App/tree/master/i18n)!

Please consider improving or adding an icon to the app. It's a simple process, just [follow the instructions](https://github.com/whyboris/Video-Hub-App/tree/master/src/app/components/icon)!

## Upcoming features

See [issues](https://github.com/whyboris/Video-Hub-App/issues) for what is in progress.

## Development

⚠ The repository is usually ahead of the publicly [released version](https://github.com/whyboris/Video-Hub-App/releases) - it is 🚧 WIP and may have bugs in it.

How to start:

- `npm install --legacy-peer-deps` to install
- `npm start` to develop
- `npm run electron` to build

Main dependencies in use:

| Library          | Version | Date      | Comment |
| ---------------- | ------- | --------- | ------- |
| Angular          | v20     | Oct 2025  |         |
| Angular-CLI      | v20     | Oct 2025  |         |
| Electron         | v42     | Jun 2026  | (internally uses Node `v24.16.0` and Chromium 148) |
| Electron Builder | v26     | Oct 2025  |         |

- **Node**: It may be best to use the same version as _Electron_ uses internally (`v24.16.0`)

- **Angular CLI**: not required but may be useful: [Angular CLI](https://cli.angular.io).

- **Mac**: We now have `M1` and `Intel` builds, but you may need to manually update the _FFmpeg_ and _FFprobe_ executables if you're building for a different architecture than you are on.

To help debug a production build of VHA you can use [Debugtron](https://github.com/bytedance/debugtron)

### Regenerating thumbnails, filmstrips, and preview clips

Generated assets are stored under your hub output folder:

- `vha-<hubName>/thumbnails/*.jpg` (or `*.avif`)
- `vha-<hubName>/filmstrips/*.jpg` (or `*.avif`)
- `vha-<hubName>/clips/*.mp4` and matching `*.jpg` (or `*.avif`) posters

The image format is chosen per hub in the import wizard (**JPG** or **AVIF**, about 60% smaller). An existing hub can switch format under **Settings → Current hub → Image format → Convert images**: the existing images are re-encoded (the source videos are not needed), the hub is saved, and the old files are deleted. AVIF filmstrips wider than 32,768 px (the most Chromium can decode) stay JPG.

VHA skips extraction when these files already exist, so **upgrading the app does not automatically re-encode old assets**.

To regenerate with the latest FFmpeg settings:

1. Close VHA (or stop any active import).
2. Back up your hub if desired (copy the `vha-<hubName>` folder and the `.vha2` file).
3. Delete the assets you want recreated:
   - **Thumbnails only:** delete files in `thumbnails/`
   - **Filmstrips only:** delete files in `filmstrips/`
   - **Preview clips only:** delete `.mp4` and `.jpg` / `.avif` pairs in `clips/`
   - **Everything:** delete all three subfolders' contents (keep the folders themselves).
4. Re-open the hub in VHA.
5. Open **Statistics** and click **Add missing thumbnails** to queue re-extraction.

Notes:

- Screenshot height and clip settings come from the hub's `.vha2` file (`screenshotSettings`); they are chosen at hub creation time.
- Preview clips use browser-friendly **H.264 + AAC** encoding with **`faststart`** for streaming playback in Firefox and other browsers.
- Silent source videos still generate preview clips (video-only output when no audio stream is detected).

## Remote

👩‍🚀 a new feature in VHA is the option for the user to turn on a _server_ after the app starts. This will let the user open a simpler version of the VHA user interface on their phone or tablet (if both PC and device are on the same WiFi) and use it as remote control to play videos 🚀

For details, see [instructions](https://github.com/whyboris/Video-Hub-App/blob/master/remote/README.md).

## Thank you

This software would not be possible without the tremendous work by other people:

- [Angular](https://github.com/angular/angular)
- [Electron](https://github.com/electron/electron)
- [FFmpeg](https://www.ffmpeg.org/)
- [angular-electron](https://github.com/maximegris/angular-electron)
- [ngx-virtual-scroller](https://github.com/rintoj/ngx-virtual-scroller)
- [fdir](https://github.com/thecodrr/fdir)
- [async](https://github.com/caolan/async)
- [chokidar](https://github.com/paulmillr/chokidar)
- [trash](https://github.com/sindresorhus/trash)
- [Fuse.js](https://github.com/krisk/Fuse)
- [electron-window-state](https://github.com/mawie81/electron-window-state)

This software uses libraries from the FFmpeg project under the LGPLv2.1 with binaries from [here](https://github.com/kribblo/node-ffmpeg-installer#the-binaries)

Since becoming open source, this software was made better with the awesome contributions by [cal2195](https://github.com/cal2195)
