import { describe, expect, it } from 'vitest';

import {
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword
} from '../../../apps/frontend/src/utils/auth-form';

describe('frontend auth form helpers', () => {
  it('normalizes emails before submission', () => {
    expect(normalizeEmail('  Demo@Example.COM  ')).toBe('demo@example.com');
  });

  it('validates required and malformed email values', () => {
    expect(validateEmail('')).toContain('Informe o seu email.');
    expect(validateEmail('invalido')).toContain('Informe um email valido.');
    expect(validateEmail('user@example.com')).toHaveLength(0);
  });

  it('validates name and password length constraints', () => {
    expect(validateName('')).toContain('Informe o seu nome.');
    expect(validateName('A')).toContain('O nome precisa ter pelo menos 2 caracteres.');
    expect(validateName('Alice')).toHaveLength(0);

    expect(validatePassword('')).toContain('Informe a sua senha.');
    expect(validatePassword('123')).toContain('A senha precisa ter pelo menos 8 caracteres.');
    expect(validatePassword('12345678')).toHaveLength(0);
  });
});
