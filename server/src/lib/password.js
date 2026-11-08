import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const SALT_ROUNDS = 10;

export async function hashPassword(password) {
  return 'sha256:' + await bcrypt.hash(createHash('sha256').update(password).digest('hex'), SALT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  return passwordHash.startsWith('sha256:') ? bcrypt.compare(createHash('sha256').update(password).digest('hex'), passwordHash.slice(7)) : bcrypt.compare(password, passwordHash);
}

