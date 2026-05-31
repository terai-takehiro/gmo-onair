import jwt from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { config } from '../../config';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  /** v2 SSO: 表示名。Interactive 側で auto-mirror 時に users.name に使う */
  name?: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as StringValue });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}
