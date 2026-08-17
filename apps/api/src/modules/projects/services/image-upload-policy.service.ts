import { Injectable } from '@nestjs/common';
import { extname } from 'node:path';

@Injectable()
export class ImageUploadPolicyService {
  private static readonly allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  private static readonly allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);

  isAllowedFileName(fileName: string): boolean {
    return ImageUploadPolicyService.allowedExtensions.has(extname(fileName).toLowerCase());
  }

  isAllowedMimeType(mimeType: string): boolean {
    return ImageUploadPolicyService.allowedMimeTypes.has(mimeType.toLowerCase());
  }
}
