import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

import { seedDatabase } from './seed-data';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedDatabase(prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
