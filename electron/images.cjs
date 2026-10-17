const sharp = require('sharp');

// Decode one photo at a time; file paths avoid copying large originals through IPC.
// Sharp's pixel limit still protects against malformed images; file size is unrestricted.
async function prepareImage(input) {
  try {
    const image = sharp(input);
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) throw new Error('format');
    const { data: bytes, info } = await image.rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(bytes)
      .resize({ width: 560, height: 560, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer();
    return { bytes, thumbnail, width: info.width, height: info.height, ext: 'webp' };
  } catch {
    throw new Error('사진을 읽을 수 없습니다. 손상되지 않은 JPG, PNG, WEBP, GIF 파일을 선택해 주세요.');
  }
}
module.exports = { prepareImage };
