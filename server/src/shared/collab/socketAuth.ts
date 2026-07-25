// Socket.IO ハンドシェイクのユーザー解決 (共有)
//
// もともと qsheet/socket.ts に閉じていたが、案件の共同編集でも同じ判定が必要になったので
// shared に出した。**コピーせず共有する**のが要点 — ここは認証なので、
// 片方だけ直して片方が緩いまま残ると穴になる (v2.9.207 で MCP 側で踏んだのと同じ形)。

import type { Socket } from 'socket.io';
import { verifyToken } from '../auth/jwt';
import { queryOne } from '../db/connection';
import { config } from '../../config';

export interface SocketUser {
  id: string;
  name: string;
  role: string;
}

export function parseCookie(header: string | undefined, key: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === key) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** ハンドシェイクからユーザーを解決する (JWT 優先、dev のみ userId を信頼)。 */
export async function resolveSocketUser(socket: Socket): Promise<SocketUser | null> {
  const auth = (socket.handshake.auth || {}) as { token?: string; userId?: string };
  let userId: string | null = null;

  // 1) JWT (prod): auth.token または cookie
  const token =
    auth.token && auth.token !== 'undefined' && auth.token !== 'null'
      ? auth.token
      : parseCookie(socket.handshake.headers.cookie, 'gmo_onair_token');
  if (token) {
    const payload = verifyToken(token);
    if (payload) userId = payload.userId;
  }

  // 2) dev mockAuth: password 認証が無効なときのみ client の userId を信頼
  //    (HTTP の x-user-id と同じ扱い)。**本番では絶対にここを通さない。**
  if (!userId && config.authMode !== 'password' && auth.userId) {
    userId = auth.userId;
  }

  if (!userId) return null;
  try {
    const u = (await queryOne(
      'SELECT id, name, role FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    )) as { id: string; name: string; role: string } | undefined;
    return u ? { id: u.id, name: u.name, role: u.role } : null;
  } catch {
    return null; // DB not ready
  }
}
