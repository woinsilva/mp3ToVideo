import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '../../../apps/frontend/src/services/api.service';

describe('frontend api service error type', () => {
  it('preserves the HTTP status on request failures', () => {
    const error = new ApiRequestError('Unauthorized', 401);

    expect(error.message).toBe('Unauthorized');
    expect(error.status).toBe(401);
    expect(error.name).toBe('ApiRequestError');
  });
});
