import type { Request } from 'express';
import busboy from 'busboy';

export interface ValidatedImageFile {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export class ImageValidationError extends Error {
  constructor(
    public statusCode: number,
    public errorName: string,
    message: string
  ) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

export const MAX_IMAGE_FILE_SIZE = 8 * 1024 * 1024; // 8MB

/**
 * Sniffs magic byte signatures to accurately verify JPEG, PNG, or WebP image headers.
 */
export function detectImageMimeType(
  buffer: Buffer
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF (bytes 0-3: 52 49 46 46) ... WEBP (bytes 8-11: 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Parses and validates an incoming multipart/form-data request stream with Busboy.
 * Enforces incremental 8MB streaming size check, zero-byte check, and magic byte header sniffing.
 */
export function parseAndValidateImageStream(req: Request): Promise<ValidatedImageFile> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return reject(
        new ImageValidationError(400, 'BadRequest', 'Content-Type must be multipart/form-data.')
      );
    }

    let bb: busboy.Busboy;
    try {
      bb = busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_IMAGE_FILE_SIZE,
          files: 1,
        },
      });
    } catch {
      return reject(new ImageValidationError(400, 'BadRequest', 'Invalid multipart headers.'));
    }

    let fileFound = false;
    let fileTooLarge = false;

    bb.on('file', (_name, fileStream, info) => {
      fileFound = true;
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      fileStream.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_IMAGE_FILE_SIZE) {
          fileTooLarge = true;
          fileStream.resume(); // Drain stream
          return;
        }
        chunks.push(chunk);
      });

      fileStream.on('limit', () => {
        fileTooLarge = true;
        fileStream.resume();
      });

      fileStream.on('end', () => {
        if (fileTooLarge || totalBytes > MAX_IMAGE_FILE_SIZE) {
          return reject(
            new ImageValidationError(
              400,
              'FileTooLargeError',
              'Uploaded file exceeds 8MB size limit.'
            )
          );
        }

        if (totalBytes === 0) {
          return reject(
            new ImageValidationError(400, 'InvalidFileError', 'Uploaded file is empty (0 bytes).')
          );
        }

        const buffer = Buffer.concat(chunks);
        const detectedType = detectImageMimeType(buffer);

        if (!detectedType) {
          return reject(
            new ImageValidationError(
              400,
              'InvalidFileError',
              `Uploaded file type (${info.mimeType || 'unknown'}) or byte signature is disallowed. Allowed formats: image/jpeg, image/png, image/webp.`
            )
          );
        }

        resolve({
          buffer,
          mimeType: detectedType,
        });
      });
    });

    bb.on('error', (err: Error) => {
      reject(new ImageValidationError(400, 'BadRequest', err.message));
    });

    bb.on('finish', () => {
      if (!fileFound) {
        reject(
          new ImageValidationError(
            400,
            'BadRequest',
            'No image file provided in multipart request.'
          )
        );
      }
    });

    req.pipe(bb);
  });
}
