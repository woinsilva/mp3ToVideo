import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

@Injectable()
export class PasswordService {
  private static readonly saltRounds = 10;

  compare(plainText: string, passwordHash: string): Promise<boolean> {
    return compare(plainText, passwordHash);
  }

  hash(plainText: string): Promise<string> {
    return hash(plainText, PasswordService.saltRounds);
  }
}
