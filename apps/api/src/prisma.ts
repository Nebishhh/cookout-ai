import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DATABASE_URL) {
  const defaultDbPath = path.resolve(__dirname, '../../prisma/dev.db');
  process.env.DATABASE_URL = `file:${defaultDbPath}`;
}

export const prisma = new PrismaClient();
