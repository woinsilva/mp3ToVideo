import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      bcryptjs: fileURLToPath(new URL('./node_modules/bcryptjs/index.js', import.meta.url)),
      '@nestjs/common': resolve('node_modules/@nestjs/common'),
      '@nestjs/config': resolve('node_modules/@nestjs/config'),
      '@nestjs/core': resolve('node_modules/@nestjs/core'),
      '@nestjs/jwt': resolve('node_modules/@nestjs/jwt'),
      '@nestjs/passport': resolve('node_modules/@nestjs/passport'),
      '@nestjs/platform-express': resolve('node_modules/@nestjs/platform-express'),
      '@nestjs/testing': resolve('node_modules/@nestjs/testing'),
      '@prisma/client': resolve('node_modules/@prisma/client'),
      supertest: resolve('node_modules/supertest')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: false,
    include: ['tests/**/*.spec.ts']
  }
});
