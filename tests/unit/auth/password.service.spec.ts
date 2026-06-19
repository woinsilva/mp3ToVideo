import { PasswordService } from '../../../apps/api/src/modules/auth/services/password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes and validates passwords', async () => {
    const passwordHash = await service.hash('12345678');

    await expect(service.compare('12345678', passwordHash)).resolves.toBe(true);
    await expect(service.compare('wrong-pass', passwordHash)).resolves.toBe(false);
  });
});
