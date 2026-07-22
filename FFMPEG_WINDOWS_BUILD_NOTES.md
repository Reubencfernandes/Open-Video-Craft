# Rebuilding the bundled Windows FFmpeg

Open Video Craft 1.0.2 uses BtbN’s static Windows x64 GPL build of FFmpeg
8.1.2 from release `autobuild-2026-07-21-13-38`:

- Build scripts: `BtbN/FFmpeg-Builds` commit
  `8c736b2d6fe5da2a10a8896d01e53bfb0ca4f665`
- FFmpeg source: commit
  `703dcc25b91eacd2ab8b8b2fe888dc8d7ab4ad6d` on `release/8.1`
- Variant: `win64-gpl` with the `8.1` add-in
- Binary archive SHA-256:
  `ebf57e8b1a10b176b88c3cbc66e68a4aed472cf47520b0fbf003e892fb3be642`
- Extracted `ffmpeg.exe` SHA-256:
  `070be6f5202e71a5e0bec88312230eebf2708f9b9ee3694596babf20902dddd2`

The GitHub release includes two Windows source assets. The build-sources asset
contains the exact BtbN scripts and FFmpeg source archive. The dependency-source
asset contains the source-download cache produced by running `download.sh` from
that pinned BtbN commit. Together they contain the build scripts and complete
source inputs for the statically linked executable.

To rebuild, extract the build-sources archive, place the dependency cache at
`.cache/downloads` in the BtbN checkout, and run:

```sh
./generate.sh win64 gpl 8.1
./build.sh win64 gpl 8.1
```

The build uses Docker and cross-compiles the Windows executable from Linux.
The pinned cache avoids resolving new dependency revisions during the rebuild.
