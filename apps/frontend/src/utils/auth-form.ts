const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateName(value: string): string[] {
  const normalized = value.trim();
  const errors: string[] = [];

  if (!normalized) {
    errors.push('Informe o seu nome.');
  } else if (normalized.length < 2) {
    errors.push('O nome precisa ter pelo menos 2 caracteres.');
  }

  return errors;
}

export function validateEmail(value: string): string[] {
  const normalized = normalizeEmail(value);
  const errors: string[] = [];

  if (!normalized) {
    errors.push('Informe o seu email.');
  } else if (!EMAIL_PATTERN.test(normalized)) {
    errors.push('Informe um email valido.');
  }

  return errors;
}

export function validatePassword(value: string): string[] {
  const normalized = value.trim();
  const errors: string[] = [];

  if (!normalized) {
    errors.push('Informe a sua senha.');
  } else if (normalized.length < 8) {
    errors.push('A senha precisa ter pelo menos 8 caracteres.');
  }

  return errors;
}
