import { Injectable } from '@nestjs/common';
import { extname } from 'node:path';

@Injectable()
export class TrackUploadPolicyService {
  private static readonly allowedExtensions = new Set(['.mp3', '.wav']);
  private static readonly allowedMimeTypes = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave'
  ]);

  isAllowedFileName(fileName: string): boolean {
    return TrackUploadPolicyService.allowedExtensions.has(extname(fileName).toLowerCase());
  }

  isAllowedMimeType(mimeType: string): boolean {
    return TrackUploadPolicyService.allowedMimeTypes.has(mimeType.toLowerCase());
  }
}
