# FFmpeg source-code offer

Open Video Craft for macOS includes an FFmpeg executable under the GNU General
Public License, version 3 or later. FFmpeg is a separate program that Open
Video Craft invokes for recording remux, audio conversion, subtitle rendering,
and export.

## macOS source bundle

The release-side source bundle is published beside the installer:

<https://github.com/micio86dev/openvideocraft/releases/latest>

That bundle contains the complete corresponding source and build inputs for
the statically linked FFmpeg executable in the macOS Apple Silicon installer,
including:

- the official FFmpeg 8.1.2 source archive;
- source archives for every external library enabled in the shipped binary;
- vendored Rust crate sources locked by rav1e 0.8.1;
- x264 at commit `0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee`,
  the `master` revision used by the upstream build on July 2, 2026;
- Martin Riedl's macOS build scripts and dependency version manifest at commit
  `bb1d6db29cee948f9685bcd69e6caf17d960662b`;
- the exact FFmpeg configure flags and binary archive identifiers and
  checksums;
- `SOURCE_SHA256SUMS.txt`, generated from a committed manifest that pins every
  downloaded archive by SHA-256, plus `SOURCE_TREE_SHA256SUMS.txt` covering the
  complete assembled tree including vendored Rust sources;
- Open Video Craft's third-party notices and this source offer; and
- release metadata describing how those inputs map to the shipped binary.

Offline rebuild notes, including the one required x264 pin and the vendored
rav1e setup, are in
[FFMPEG_MACOS_BUILD_NOTES.md](FFMPEG_MACOS_BUILD_NOTES.md).

The source bundle is provided at no charge from the same GitHub release as the
object-code installer. If the link is unavailable, open an issue at
<https://github.com/micio86dev/openvideocraft/issues>.

## Verified source archives

The authoritative URL, filename, and SHA-256 list is committed at
[`.github/ffmpeg-macos-sources.txt`](.github/ffmpeg-macos-sources.txt).
The release job refuses to publish when pinned downloads differ. The bundle
also contains its manifest and generated source-tree checksums.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for binary provenance,
license details, and the pinned binary archive checksums.
