import { Injectable } from '@nestjs/common';
import { extname } from 'node:path';

@Injectable()
export class TrackUploadPolicyService {
  private static readonly allowedMimeTypes = new Set(['audio/mpeg', 'audio/mp3']);

  isAllowedFileName(fileName: string): boolean {
    return extname(fileName).toLowerCase() === '.mp3';
  }

  isAllowedMimeType(mimeType: string): boolean {
    return TrackUploadPolicyService.allowedMimeTypes.has(mimeType.toLowerCase());
  }
}
