import sharp from "sharp";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// Progressive quality reduction steps (maintaining original dimensions)
const COMPRESSION_STEPS = [80, 70, 60, 50, 40, 30];

/**
 * Compresses an image buffer to be under 5MB.
 * Always attempts maximum PNG optimization first.
 * Falls back to JPEG with progressive quality reduction if PNG remains too large.
 */
export async function compressImage(
  buffer: Buffer,
  resize?: { width: number; height: number },
): Promise<Buffer> {
  let sharpInstance = sharp(buffer);

  if (resize) {
    sharpInstance = sharpInstance.resize(resize.width, resize.height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Always optimize PNG first
  const opng = await sharpInstance
    .clone()
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (opng.length <= MAX_IMAGE_SIZE) {
    return opng;
  }

  // If optimized PNG is still over 5MB, try progressive JPEG quality reduction
  for (const quality of COMPRESSION_STEPS) {
    const jpeg = await sharpInstance.clone().jpeg({ quality }).toBuffer();

    if (jpeg.length <= MAX_IMAGE_SIZE) {
      return jpeg;
    }
  }

  // Absolute fallback: lowest quality JPEG
  return sharpInstance.clone().jpeg({ quality: 20 }).toBuffer();
}
