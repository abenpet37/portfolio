const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\Users\\abene\\OneDrive\\Documents\\GitHub\\portfolio';
const THRESHOLD = 500 * 1024; // 500kb in bytes
const MIN_QUALITY = 40;
const START_QUALITY = 80;
const MAX_DIMENSION = 1920; // resize longest side to this if larger

async function compressFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stats = fs.statSync(filePath);
  const originalSize = stats.size;

  if (originalSize <= THRESHOLD) {
    return null; // skip, already small enough
  }

  const isPng = ext === '.png';
  const isJpg = ext === '.jpg' || ext === '.jpeg';

  if (!isPng && !isJpg) return null;

  const meta = await sharp(filePath).metadata();
  let pipeline = sharp(filePath);

  // Resize if image is larger than MAX_DIMENSION on either side
  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
  }

  let quality = START_QUALITY;
  let buffer;

  while (quality >= MIN_QUALITY) {
    let p = pipeline;
    if (isJpg) {
      p = p.jpeg({ quality, progressive: true, mozjpeg: true });
    } else if (isPng) {
      p = p.png({ quality, compressionLevel: 9, palette: true });
    }

    try {
      buffer = await p.toBuffer();
    } catch (e) {
      console.error(`  Error processing ${filePath}:`, e.message);
      return null;
    }

    if (buffer.length <= THRESHOLD) break;
    quality -= 10;
  }

  if (!buffer || buffer.length >= originalSize) {
    console.log(`  SKIP ${path.basename(filePath)}: could not compress below threshold`);
    return null;
  }

  const tmpPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    console.log(`  SKIP ${path.basename(filePath)}: write failed (${e.message})`);
    try { fs.unlinkSync(tmpPath); } catch(_) {}
    return null;
  }

  const newSize = buffer.length;
  const reduction = ((1 - newSize / originalSize) * 100).toFixed(1);
  console.log(`  OK ${path.basename(filePath)}: ${(originalSize/1024).toFixed(0)}KB -> ${(newSize/1024).toFixed(0)}KB (${reduction}% reduction, q=${quality})`);
  return { originalSize, newSize };
}

async function main() {
  const imageFiles = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(entry.name)) {
        imageFiles.push(full);
      }
    }
  }
  walk(ROOT);

  console.log(`Found ${imageFiles.length} image files. Compressing those above 500KB...\n`);

  let totalSaved = 0;
  let totalOriginal = 0;
  let count = 0;

  for (const file of imageFiles) {
    const result = await compressFile(file);
    if (result) {
      totalSaved += (result.originalSize - result.newSize);
      totalOriginal += result.originalSize;
      count++;
    }
  }

  console.log(`\nDone. Compressed ${count} files. Total saved: ${(totalSaved/1024).toFixed(0)}KB (${((1 - totalSaved/totalOriginal)*100).toFixed(1)}% of compressed total)`);
}

main().catch(err => { console.error(err); process.exit(1); });