import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// プロジェクト担当メンバー (複数担当・外部の方対応)。
// user_id が居れば登録ユーザー、無ければ外部の方 (member_name は手入力)。
// 表示名 (member_name) は常に保持しつつ、登録ユーザーは最新の users.name を優先表示する。

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string | null;
  member_name: string;
  role: string | null;
  is_external: boolean;
  sort_order: number;
}

const SELECT_MEMBER = `
  SELECT
    m.id, m.project_id, m.user_id,
    COALESCE(u.name, m.member_name) AS member_name,
    m.role, m.is_external, m.sort_order
  FROM project_members m
  LEFT JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
`;

export const projectMembersService = {
  async list(projectId: string): Promise<ProjectMember[]> {
    return (await queryAll(
      `${SELECT_MEMBER}
       WHERE m.project_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.sort_order, m.created_at`,
      [projectId]
    )) as unknown as ProjectMember[];
  },

  async add(
    projectId: string,
    data: { user_id?: string | null; member_name?: string | null; role?: string | null; is_external?: boolean },
    actorId: string
  ): Promise<ProjectMember> {
    const userId = data.user_id ?? null;
    let memberName = (data.member_name ?? '').trim();
    let isExternal = data.is_external ?? false;

    if (userId) {
      // 登録ユーザー: 実在確認 + 表示名スナップショット
      const u = (await queryOne(
        `SELECT id, name FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      )) as unknown as { id: string; name: string } | undefined;
      if (!u) throw new AppError(400, 'VALIDATION_ERROR', '指定されたユーザーが見つかりません');
      if (!memberName) memberName = u.name;
      isExternal = false;

      // 既に同じユーザーが担当なら重複させず既存を返す (冪等)
      const existing = (await queryOne(
        `SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [projectId, userId]
      )) as unknown as { id: string } | undefined;
      if (existing) {
        // 役割の更新だけ反映
        if (data.role !== undefined) {
          await execute(
            `UPDATE project_members SET role = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3`,
            [data.role ?? null, actorId, existing.id]
          );
        }
        return (await this.getById(existing.id))!;
      }
    } else {
      // 外部の方: 名前必須
      if (!memberName) throw new AppError(400, 'VALIDATION_ERROR', '担当者名を入力してください');
      isExternal = true;
    }

    const maxRow = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1) AS max FROM project_members
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );
    const sortOrder = ((maxRow?.max as number) ?? -1) + 1;

    const id = uuidv4();
    await execute(
      `INSERT INTO project_members
         (id, project_id, user_id, member_name, role, is_external, sort_order,
          created_at, updated_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, $8)`,
      [id, projectId, userId, memberName, data.role ?? null, isExternal, sortOrder, actorId]
    );
    return (await this.getById(id))!;
  },

  async getById(id: string): Promise<ProjectMember | null> {
    const row = (await queryOne(
      `${SELECT_MEMBER} WHERE m.id = $1 AND m.deleted_at IS NULL`,
      [id]
    )) as unknown as ProjectMember | undefined;
    return row ?? null;
  },

  async update(
    id: string,
    data: Partial<{ member_name: string; role: string | null; sort_order: number }>,
    actorId: string
  ): Promise<ProjectMember> {
    const existing = await queryOne(
      `SELECT id FROM project_members WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', '担当メンバーが見つかりません');

    const sets: string[] = ['updated_at = NOW()', 'updated_by = $2'];
    const params: unknown[] = [id, actorId];
    let i = 3;
    if ('member_name' in data) { sets.push(`member_name = $${i++}`); params.push(data.member_name); }
    if ('role' in data) { sets.push(`role = $${i++}`); params.push(data.role); }
    if ('sort_order' in data) { sets.push(`sort_order = $${i++}`); params.push(data.sort_order); }

    await execute(`UPDATE project_members SET ${sets.join(', ')} WHERE id = $1`, params);
    return (await this.getById(id))!;
  },

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await queryOne(
      `SELECT id FROM project_members WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', '担当メンバーが見つかりません');
    await execute(
      `UPDATE project_members SET deleted_at = NOW(), updated_by = $1 WHERE id = $2`,
      [actorId, id]
    );
  },

  async reorder(
    projectId: string,
    items: Array<{ id: string; sort_order: number }>,
    actorId: string
  ): Promise<void> {
    for (const item of items) {
      await execute(
        `UPDATE project_members SET sort_order = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3 AND project_id = $4 AND deleted_at IS NULL`,
        [item.sort_order, actorId, item.id, projectId]
      );
    }
  },
};
