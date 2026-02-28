import sharp from "sharp";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// Progressive quality reduction steps (maintaining original dimensions)
const COMPRESSION_STEPS = [80, 70, 60, 50, 40, 30];

/**
 * Compresses an image buffer to be under 5MB.
 * Always attempts maximum PNG optimization first.
 * Falls back to JPEG with progressive quality reduction if PNG remains too large.
 */
export async function compressImage(buffer: Buffer): Promise<Buffer> {
  // Always optimize PNG first
  const opng = await sharp(buffer).png({ compressionLevel: 9 }).toBuffer();

  if (opng.length <= MAX_IMAGE_SIZE) {
    return opng;
  }

  // If optimized PNG is still over 5MB, try progressive JPEG quality reduction
  for (const quality of COMPRESSION_STEPS) {
    const jpeg = await sharp(buffer).jpeg({ quality }).toBuffer();

    if (jpeg.length <= MAX_IMAGE_SIZE) {
      return jpeg;
    }
  }

  // Absolute fallback: lowest quality JPEG
  return sharp(buffer).jpeg({ quality: 20 }).toBuffer();
}
