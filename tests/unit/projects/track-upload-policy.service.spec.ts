import { TrackUploadPolicyService } from '../../../apps/api/src/modules/projects/services/track-upload-policy.service';

describe('TrackUploadPolicyService', () => {
  const service = new TrackUploadPolicyService();

  it('accepts MP3 file names and mime types', () => {
    expect(service.isAllowedFileName('clip.mp3')).toBe(true);
    expect(service.isAllowedFileName('clip.wav')).toBe(true);
    expect(service.isAllowedMimeType('audio/mpeg')).toBe(true);
    expect(service.isAllowedMimeType('audio/mp3')).toBe(true);
    expect(service.isAllowedMimeType('audio/wav')).toBe(true);
    expect(service.isAllowedMimeType('audio/x-wav')).toBe(true);
  });

  it('rejects unsupported file names and mime types', () => {
    expect(service.isAllowedFileName('clip.txt')).toBe(false);
    expect(service.isAllowedMimeType('text/plain')).toBe(false);
    expect(service.isAllowedMimeType('video/mp4')).toBe(false);
  });
});
