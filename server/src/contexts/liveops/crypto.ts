import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { config } from '../../config';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY || '';
  if (hex && hex.length >= 64) {
    return Buffer.from(hex.slice(0, 64), 'hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY is required in production (must be 64+ hex chars)');
  }
  // Dev: derive from the resolved JWT secret (which itself is now never the legacy default — see config.ts)
  return createHash('sha256').update(config.jwtSecret).digest();
}

/** Encrypt plaintext → iv:authTag:ciphertext (all hex) */
export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypt iv:authTag:ciphertext → plaintext. Returns null on error. */
export function decrypt(data: string): string | null {
  if (!data) return null;
  try {
    const [ivHex, authTagHex, dataHex] = data.split(':');
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(dataHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Mask a decrypted token for safe client display: show only last 4 chars */
export function mask(value: string | null): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}
