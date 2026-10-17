import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { prepareImage } = createRequire(import.meta.url)('../electron/images.cjs');

describe('automatic photo resizing', () => {
  it('accepts an original over 30MB by path, saves a small copy, and leaves the original intact', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photocalendar-image-'));
    try {
      const file = path.join(directory, 'large.png');
      await sharp({ create: { width: 3400, height: 3300, channels: 3, background: '#4a8ace' } }).png({ compressionLevel: 0 }).toFile(file);
      const originalSize = (await fs.stat(file)).size;
      expect(originalSize).toBeGreaterThan(30 * 1024 * 1024);
      const result = await prepareImage(file);
      expect(result.width).toBe(1920);
      expect(result.height / result.width).toBeCloseTo(3300 / 3400, 3);
      expect(result.bytes.length).toBeLessThan(originalSize / 10);
      expect((await sharp(result.bytes).metadata()).format).toBe('webp');
      expect((await sharp(result.thumbnail).metadata()).width).toBe(560);
      expect((await fs.stat(file)).size).toBe(originalSize);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
  it('preserves transparency, applies EXIF rotation, and does not enlarge small images', async () => {
    const png = await sharp({ create: { width: 120, height: 60, channels: 4, background: '#ff000080' } }).png().toBuffer();
    const result = await prepareImage(png);
    expect(result).toMatchObject({ width: 120, height: 60 });
    expect((await sharp(result.bytes).metadata()).hasAlpha).toBe(true);
    const rotated = await sharp(png).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await prepareImage(rotated)).toMatchObject({ width: 60, height: 120 });
    await expect(prepareImage(Buffer.from('invalid image'))).rejects.toThrow();
  });
});
