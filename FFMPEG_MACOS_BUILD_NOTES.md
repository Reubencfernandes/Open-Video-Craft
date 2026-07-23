# Rebuilding the bundled macOS FFmpeg

Open Video Craft 1.0.3 uses the Martin Riedl FFmpeg 8.1.2 macOS archives with
build identifiers `1783011502_8.1.2` (Apple Silicon) and
`1783018342_8.1.2` (Intel). Their published archive checksums and the exact
`ffmpeg -buildconf` output are recorded in `RELEASE_METADATA.txt` in the source
bundle.

The source bundle contains the upstream build-script archive at commit
`bb1d6db29cee948f9685bcd69e6caf17d960662b` and all source archives used by the
enabled libraries. Extract the build scripts and use their macOS build flow.
The archive names, URLs, versions, and checksums are in
`ffmpeg-macos-sources.txt` and `SOURCE_SHA256SUMS.txt`.

## Pin x264 before rebuilding

The upstream `build-x264.sh` downloaded x264's moving `master` archive. At the
July 2, 2026 binary build time, that branch resolved to:

`0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee`

That commit predates the build and remained the branch head through the
v1.0.3 source-bundle preparation. Its exact archive is included as:

`upstream-archives/x264-0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee.tar.gz`

Before rebuilding, change `script/build-x264.sh` so it unpacks that included
archive instead of downloading `master`, and change its source-directory name
from `x264-master` to
`x264-0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee`. This removes the moving input
while preserving the source revision used by the shipped binary.

## Rebuild rav1e without the network

`rav1e-0.8.1-complete/` is the rav1e 0.8.1 source tree with every registry
crate from its `Cargo.lock` vendored under `vendor/`. Its `.cargo/config.toml`
redirects crates.io to that directory. Use Cargo's `--locked` option when
rebuilding it.

General-purpose build tools and the Apple SDK are not copied into this bundle.
They are not part of the statically linked FFmpeg executable. The exact source
for FFmpeg and every enabled external library is included.
