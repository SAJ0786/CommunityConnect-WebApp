export const BUSINESS_IMAGE_LIMIT = 5 * 1024 * 1024;
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function validateBusinessImage(file) {
  if (!file || !extensions[file.type] || !Number.isFinite(file.size) || file.size <= 0 || file.size >= BUSINESS_IMAGE_LIMIT) {
    throw new Error('Choose a PNG, JPEG or WebP smaller than 5 MB.');
  }
}

export async function inspectBusinessImage(file) {
  validateBusinessImage(file);
  if (typeof file.slice !== 'function') throw new Error('Choose an image file from your device.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const begins = signature => signature.every((value, index) => bytes[index] === value);
  const valid = file.type === 'image/png' ? begins([137, 80, 78, 71, 13, 10, 26, 10])
    : file.type === 'image/jpeg' ? begins([255, 216, 255])
      : begins([82, 73, 70, 70]) && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value);
  if (!valid) throw new Error('The file contents do not match its image type. Choose another image.');
}

// SDK injection keeps the upload lifecycle testable without production services.
// Paths are newly generated for every upload; published/previous images are never deleted here.
export function createDirectoryImageService({ bucket, uid, sdk, assertOpen = () => {}, newId = () => crypto.randomUUID() }) {
  if (!/^[a-zA-Z0-9_-]+$/.test(uid || '')) throw new Error('A valid image owner is required.');
  const pending = new Set();
  async function discard(imagePath) {
    if (!pending.has(imagePath)) return;
    await sdk.deleteObject(sdk.ref(bucket, imagePath));
    pending.delete(imagePath);
  }
  return {
    async upload(file, kind) {
      assertOpen();
      if (!['logo', 'cover', 'promotion'].includes(kind)) throw new Error('Unknown business image type.');
      await inspectBusinessImage(file);
      assertOpen();
      const unique = newId();
      if (!/^[a-zA-Z0-9_-]+$/.test(unique)) throw new Error('Could not create an image reference.');
      const imagePath = `business-images/${uid}/${kind}-${unique}.${extensions[file.type]}`;
      const reference = sdk.ref(bucket, imagePath);
      pending.add(imagePath);
      try {
        await sdk.uploadBytes(reference, file, { contentType: file.type });
        assertOpen();
        const imageUrl = await sdk.getDownloadURL(reference);
        assertOpen();
        return { imagePath, imageUrl };
      } catch (error) {
        // This upload has not yet been offered to Firestore, so only this new object is disposable.
        await Promise.allSettled([discard(imagePath)]);
        throw error;
      }
    },
    discard,
    retain(imagePath) { pending.delete(imagePath); },
  };
}
