import sharp from 'sharp';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
]);

export function isAllowedReceiptImage(mimetype = '', originalname = '') {
  const type = mimetype.toLowerCase();
  if (ALLOWED_IMAGE_TYPES.has(type)) return true;
  return /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(originalname);
}

/**
 * Convert any supported receipt image (PNG, WebP, JPEG, GIF) to RGB JPEG.
 * Tesseract and many OCR APIs reject WebP and mishandle PNG with alpha
 * when the file is labeled as JPEG.
 */
export async function receiptImageToJpeg(input) {
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
