import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError, ApiService } from '../../../apps/frontend/src/services/api.service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('frontend api service error type', () => {
  it('preserves the HTTP status on request failures', () => {
    const error = new ApiRequestError('Unauthorized', 401);

    expect(error.message).toBe('Unauthorized');
    expect(error.status).toBe(401);
    expect(error.name).toBe('ApiRequestError');
  });

  it('notifies the application when an authenticated request returns 401', async () => {
    const onUnauthorized = vi.fn();
    const service = new ApiService();
    service.setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );

    await expect(service.request('/projects', {}, 'expired-token')).rejects.toMatchObject({
      status: 401
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not treat an unauthenticated login failure as an expired session', async () => {
    const onUnauthorized = vi.fn();
    const service = new ApiService();
    service.setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );

    await expect(service.request('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      status: 401
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
