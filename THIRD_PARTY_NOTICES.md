# Third-party notices

Open Video Craft is distributed under the ISC License. Its installers also
contain third-party software under separate licenses.

## Inter

Open Video Craft bundles the Inter typeface. The editor renders text overlays
with it, and the export passes the same font files to FFmpeg's `drawtext`
filter, so the preview and the rendered video agree. Inter is licensed under
the SIL Open Font License 1.1, which permits bundling and redistribution.

- Inter project: <https://rsms.me/inter/>
- Version 4.1: <https://github.com/rsms/inter/releases/tag/v4.1>
- License text: `resources/fonts/LICENSE.txt`, packaged as `fonts/LICENSE.txt`
- Bundled weights: Regular (400), SemiBold (600), Bold (700), ExtraBold (800)

## FFmpeg

Open Video Craft invokes FFmpeg as a separate executable for recording remux,
audio conversion, subtitle rendering, and video export. The bundled FFmpeg
builds include GPL components such as x264 and are distributed under the GNU
General Public License, version 3 or later. The Open Video Craft license does
not replace or limit the rights granted for FFmpeg.

- FFmpeg project and license: <https://ffmpeg.org/>
- GPLv3 text: <https://www.gnu.org/licenses/gpl-3.0.html>
- FFmpeg 8.1.2 source: <https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz>

### macOS build provenance

The macOS Intel and Apple Silicon executables are pinned FFmpeg 8.1.2 builds
from Martin Riedl's reproducible FFmpeg build service. Installation verifies
the published archive SHA-256 before use and rejects any binary configured with
`--enable-nonfree`.

- Build scripts: <https://git.martin-riedl.de/ffmpeg/build-script>
- Build service: <https://ffmpeg.martin-riedl.de/>
- Apple Silicon archive SHA-256:
  `ef1aa60006c7b77ce170c1608c08d8e4ba1c30c5746f2ac986ded932d0ac2c3c`
- Intel archive SHA-256:
  `a52ef43883f44c219766d4b3bdde4e635b35465d0b704c01c3a0566b59775df9`

### Source-code offer

The complete corresponding source, statically linked library sources, vendored
rav1e crate sources, pinned x264 revision, and build scripts for the FFmpeg
executables in the v1.0.3 macOS installers are mirrored in one release asset
beside the app installers:

<https://github.com/Reubencfernandes/Open-Video-Craft/releases/download/v1.0.3/Open-Video-Craft-1.0.3-FFmpeg-Source-Offer.tar.gz>

See [FFMPEG_SOURCE_OFFER.md](FFMPEG_SOURCE_OFFER.md) for the bundle contents and
committed, SHA-256-pinned source manifests.

The source-offer document, macOS rebuild notes, and these notices are packaged
in the app’s Resources directory.

### RNNoise model

The bundled `resources/models/cb.rnnn` model is distributed by the
`richardpl/arnndn-models` repository and was trained by Gregor Richards. The
model repository states that the model files are not creative works and are not
subject to copyright: <https://github.com/GregorR/rnnoise-models>.
