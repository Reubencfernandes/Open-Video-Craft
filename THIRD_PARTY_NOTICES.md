# Third-party notices

Open Video Craft is distributed under the ISC License. Its installers also
contain third-party software under separate licenses.

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
executables in the v1.0.2 macOS installers are mirrored in one release asset
beside the app installers:

<https://github.com/Reubencfernandes/Open-Video-Craft/releases/download/v1.0.2/Open-Video-Craft-1.0.2-FFmpeg-Source-Offer.tar.gz>

See [FFMPEG_SOURCE_OFFER.md](FFMPEG_SOURCE_OFFER.md) for its contents and the
committed, SHA-256-pinned source manifest.

### Windows release status

Version 1.0.2 does not publish Windows installers. The release workflow blocks
them because the `ffmpeg-static` executable previously selected for Windows
does not provide enough verified build provenance for this project to identify
and distribute its exact complete corresponding source. This is a release
compliance gate, not a claim about the upstream package's license. Windows
distribution can resume after the app adopts a reproducible, source-complete
FFmpeg build.

The source-offer document, macOS rebuild notes, and these notices are packaged
in the app's Resources directory so a recipient does not need to locate the
repository.
