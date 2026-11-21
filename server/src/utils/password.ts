import bcrypt from 'bcryptjs';

export async function hashPassword(plainPassword: string, saltRounds: number): Promise<string> {
  return bcrypt.hash(plainPassword, saltRounds);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
