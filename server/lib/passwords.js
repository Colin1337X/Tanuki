import { Algorithm, hashSync, verify } from '@node-rs/argon2';
export const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 };
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length > 1024) throw new Error('Invalid password');
  return hashSync(password, passwordOptions);
}
export async function verifyPassword(encoded, password) {
  try { return await verify(encoded, password); } catch { return false; }
}
export function validCredentials(username, password) {
  return typeof username === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(username) && typeof password === 'string' && password.length >= 12 && password.length <= 1024;
}
