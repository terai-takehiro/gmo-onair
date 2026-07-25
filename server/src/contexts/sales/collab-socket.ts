// 案件 (GLS-B) 共同編集の Socket.IO ネームスペース (要件 B1 / B2)
//
// 中身は shared/collab/socket.ts の汎用ファクトリに任せ、ここは
// **誰が編集していいか**だけを決める。

import type { Server } from 'socket.io';
import { queryOne } from '../../shared/db/connection';
import { meetsPermissionLevel } from '../../shared/middleware/auth';
import { initCollabNamespace } from '../../shared/collab/socket';
import type { SocketUser } from '../../shared/collab/socketAuth';
import { projectCollabRooms } from './services/project-collab.service';

/**
 * 案件の共同編集ができるか。
 *
 * HTTP 側 (`/projects/:id/collab`) と**同じ条件**にする。
 * ここだけ緩いと「画面からは書けないのに socket からは書ける」穴になる。
 *   - sales の editor 以上、または system_admin
 *   - かつ案件が実在する (削除済みは不可)
 */
async function canEditProject(user: SocketUser, projectId: string): Promise<boolean> {
  const proj = await queryOne(
    'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL',
    [projectId]
  );
  if (!proj) return false;
  const perm = await queryOne(
    `SELECT access_level FROM user_permissions WHERE user_id = $1 AND module = 'sales'`,
    [user.id]
  );
  // HTTP の requirePermission('sales','editor') と**同じ関数**で判定する
  return meetsPermissionLevel(user.role, perm?.access_level as string | undefined, 'editor');
}

export function initProjectCollabSocketIO(io: Server): void {
  initCollabNamespace(io, {
    namespace: '/project-collab',
    idParam: 'projectId',
    roomPrefix: 'project',
    label: 'project-collab',
    rooms: projectCollabRooms,
    canEdit: canEditProject,
  });
}
