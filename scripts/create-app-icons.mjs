import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceIcon = path.join(rootDir, "src", "renderer", "assets", "app.png");
const outputDir = path.join(rootDir, "build");

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icnsEntries = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024]
];

async function createPng(size) {
  return sharp(sourceIcon)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
}

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = header.length + images.length * 16;

  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += image.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.buffer)]);
}

function createIcns(images) {
  const chunks = images.map((image) => {
    const header = Buffer.alloc(8);
    header.write(image.type, 0, 4, "ascii");
    header.writeUInt32BE(image.buffer.length + 8, 4);
    return Buffer.concat([header, image.buffer]);
  });

  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, 4, "ascii");
  fileHeader.writeUInt32BE(chunks.reduce((total, chunk) => total + chunk.length, 8), 4);

  return Buffer.concat([fileHeader, ...chunks]);
}

await mkdir(outputDir, { recursive: true });

const icoImages = await Promise.all(
  icoSizes.map(async (size) => ({
    size,
    buffer: await createPng(size)
  }))
);
const icnsImages = await Promise.all(
  icnsEntries.map(async ([type, size]) => ({
    type,
    buffer: await createPng(size)
  }))
);

await writeFile(path.join(outputDir, "icon.ico"), createIco(icoImages));
await writeFile(path.join(outputDir, "icon.icns"), createIcns(icnsImages));
