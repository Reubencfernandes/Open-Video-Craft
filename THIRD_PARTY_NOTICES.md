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
executables in the v1.0.3 macOS installers are mirrored in one release asset
beside the app installers:

<https://github.com/Reubencfernandes/Open-Video-Craft/releases/download/v1.0.3/Open-Video-Craft-1.0.3-FFmpeg-Source-Offer.tar.gz>

The Windows build’s exact scripts and FFmpeg source are published as
`Open-Video-Craft-1.0.3-Windows-FFmpeg-Build-Sources.tar.gz`; all statically
linked dependency sources are published as
`Open-Video-Craft-1.0.3-Windows-FFmpeg-Dependency-Sources.tar`.

See [FFMPEG_SOURCE_OFFER.md](FFMPEG_SOURCE_OFFER.md) for the bundle contents and
committed, SHA-256-pinned source manifests.

### Windows build provenance

The Windows x64 executable is FFmpeg 8.1.2 from BtbN’s
`autobuild-2026-07-21-13-38` static GPL build. The release workflow replaces
the platform-selected `ffmpeg-static` download with this pinned executable,
verifies the archive and binary SHA-256 values, and checks the required codecs
and filters before packaging.

- Build scripts: `BtbN/FFmpeg-Builds` commit
  `8c736b2d6fe5da2a10a8896d01e53bfb0ca4f665`
- FFmpeg revision: `703dcc25b91eacd2ab8b8b2fe888dc8d7ab4ad6d`
- Archive SHA-256:
  `ebf57e8b1a10b176b88c3cbc66e68a4aed472cf47520b0fbf003e892fb3be642`
- Extracted executable SHA-256:
  `070be6f5202e71a5e0bec88312230eebf2708f9b9ee3694596babf20902dddd2`

The source-offer document, platform rebuild notes, and these notices are
packaged in the app’s Resources directory.
