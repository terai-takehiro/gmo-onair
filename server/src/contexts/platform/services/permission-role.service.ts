/**
 * 役割 = 権限の「型」
 *
 * ── 何をする層か ────────────────────────────────────────────
 *
 * 役割そのものは**判定に一切使われません**。役割を人に押すと
 * `user_permissions` の行が書き換わり、判定はいままでどおり
 * `requirePermission` が `user_permissions` だけを見ます。
 *
 * ── 権限モデル単純化（この版）────────────────────────────────
 *
 * 以前は区画が12（`sales`/`budget`/`gpm`/`studio`/`partner_schedule`/
 * `equipment`/`dailyops`/`admin`/`qsheet`/`techsheet`/`liveops`/`awards`）
 * あり、型が触るのはそのうち凍結4アプリ（当時4つ）を除いた8つだけだった
 * （足すと役割を押すだけで放送系の権限が消えるため、あえて対象外にしていた）。
 *
 * ユーザーの指示（「アプリ単位で使える／使えないでいい」・「型だけにして
 * 個別の例外は廃止していい」）を受け、
 *   - `sales`/`budget`/`gpm`/`studio`/`partner_schedule` を `sales` へ統合
 *   - `admin`（権限とメンバーの管理）は区画そのものを廃止し、
 *     `system_admin` ロールだけに絞った（`requireRole('system_admin')`）
 *   - 個人ごとの例外編集（`UserPermissionsDialog`）を廃止し、型だけにした
 *   - 型が凍結4アプリも面倒を見るようにした（`ROLE_MODULES` に追加）。
 *     「フルアクセス」型がすべての区画を manager で持つため、
 *     型を押しても凍結アプリの権限が消える心配が無くなった
 *
 * 詳細は `docs/reviews/permission-model-simplification-plan.md`。
 * 移行データの扱いは migration 210 を参照。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';

/**
 * 型が面倒を見る区画。ブロックアプリ単位の5つ（凍結2アプリを含む）。
 * 技術資料アプリの削除（migration 211）で `techsheet` を外した。
 * 計時・視聴者のミニアプリ化フェーズ2（migration 232）で `liveops` を `qsheet` へ
 * 統合したので外した — 計時・視聴者の権限は `qsheet` 区画が面倒を見る。
 */
export const ROLE_MODULES = [
  'sales', 'equipment', 'dailyops', 'qsheet', 'awards',
] as const;

export type RoleLevel = 'reader' | 'editor' | 'manager';

export interface PermissionRole {
  id: string;
  name: string;
  description: string | null;
  is_builtin: boolean;
  sort_order: number;
  /** module → level。ここに無い区画は「なし」 */
  modules: Record<string, RoleLevel>;
  /** この型を押してある人数 */
  member_count: number;
}

function isRoleModule(m: string): boolean {
  return (ROLE_MODULES as readonly string[]).includes(m);
}

export async function listRoles(): Promise<PermissionRole[]> {
  const roles = await queryAll(
    `SELECT r.id, r.name, r.description, r.is_builtin, r.sort_order,
            (SELECT COUNT(*)::int FROM users u
              WHERE u.permission_role_id = r.id AND u.deleted_at IS NULL) AS member_count
       FROM permission_roles r
      WHERE r.deleted_at IS NULL
      ORDER BY r.sort_order, r.name`,
  );
  const mods = await queryAll(
    `SELECT m.role_id, m.module, m.access_level
       FROM permission_role_modules m
       JOIN permission_roles r ON r.id = m.role_id AND r.deleted_at IS NULL`,
  );
  const byRole = new Map<string, Record<string, RoleLevel>>();
  for (const m of mods) {
    const bag = byRole.get(m.role_id as string) ?? {};
    bag[m.module as string] = m.access_level as RoleLevel;
    byRole.set(m.role_id as string, bag);
  }
  return roles.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    is_builtin: !!r.is_builtin,
    sort_order: Number(r.sort_order) || 0,
    modules: byRole.get(r.id as string) ?? {},
    member_count: Number(r.member_count) || 0,
  }));
}

export async function getRole(id: string): Promise<PermissionRole | null> {
  const all = await listRoles();
  return all.find((r) => r.id === id) ?? null;
}

/**
 * 型の中身を保存する。**`ROLE_MODULES` に無い区画は捨てます**
 * （`admin` など、型では扱わなくなった区画が紛れ込むのを防ぐ）。
 */
export async function setRoleModules(roleId: string, modules: Record<string, string>): Promise<void> {
  await execute('DELETE FROM permission_role_modules WHERE role_id = ?', [roleId]);
  for (const [module, level] of Object.entries(modules)) {
    if (!isRoleModule(module)) continue;
    if (level !== 'reader' && level !== 'editor' && level !== 'manager') continue;
    await execute(
      `INSERT INTO permission_role_modules (role_id, module, access_level) VALUES (?, ?, ?)
       ON CONFLICT (role_id, module) DO UPDATE SET access_level = EXCLUDED.access_level`,
      [roleId, module, level],
    );
  }
}

/**
 * 型を1人に押す。**戻り値は実際に変わった区画**（呼び出し側が
 * 「N 件を書き換えました」と出せるように）。
 */
export async function applyRoleToUser(userId: string, roleId: string): Promise<string[]> {
  const role = await getRole(roleId);
  if (!role) return [];

  const current = await queryAll(
    'SELECT module, access_level FROM user_permissions WHERE user_id = ?',
    [userId],
  );
  const now: Record<string, string> = {};
  for (const r of current) now[r.module as string] = r.access_level as string;

  const changed: string[] = [];
  for (const module of ROLE_MODULES) {
    const want = role.modules[module];
    const have = now[module];
    if (want) {
      if (have === want) continue;
      await execute(
        `INSERT INTO user_permissions (id, user_id, module, access_level) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, module) DO UPDATE SET access_level = EXCLUDED.access_level, updated_at = NOW()`,
        [uuidv4(), userId, module, want],
      );
      changed.push(module);
    } else if (have) {
      await execute('DELETE FROM user_permissions WHERE user_id = ? AND module = ?', [userId, module]);
      changed.push(module);
    }
  }

  await execute('UPDATE users SET permission_role_id = ?, updated_at = NOW() WHERE id = ?', [roleId, userId]);
  return changed;
}

/**
 * その人の権限が、押してある型とずれているか。
 *
 * 個人ごとの例外編集は廃止したので、通常はずれません。それでもこの関数を
 * 残してあるのは、①移行（migration 210）で自動生成された型がその人の
 * 実際の権限と一致しているかの確認、②将来 DB を直接いじった場合の
 * 診断用。凍結4アプリも `ROLE_MODULES` に含まれるので判定対象になる。
 */
export async function roleDrift(userId: string, roleId: string): Promise<string[]> {
  const role = await getRole(roleId);
  if (!role) return [];
  const current = await queryAll(
    'SELECT module, access_level FROM user_permissions WHERE user_id = ?',
    [userId],
  );
  const now: Record<string, string> = {};
  for (const r of current) now[r.module as string] = r.access_level as string;

  const out: string[] = [];
  for (const module of ROLE_MODULES) {
    if ((role.modules[module] ?? null) !== (now[module] ?? null)) out.push(module);
  }
  return out;
}

/** 型を押してある人の一覧（型を直したとき「N 名にも反映しますか」を出すため） */
export async function membersOfRole(roleId: string): Promise<{ id: string; name: string }[]> {
  const rows = await queryAll(
    `SELECT id, name FROM users
      WHERE permission_role_id = ? AND deleted_at IS NULL
      ORDER BY name`,
    [roleId],
  );
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
}

export async function createRole(input: {
  name: string; description?: string | null; modules?: Record<string, string>;
}): Promise<PermissionRole> {
  const id = `role-${uuidv4().slice(0, 8)}`;
  const max = (await queryOne('SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM permission_roles')) as { m: number } | null;
  await execute(
    `INSERT INTO permission_roles (id, name, description, is_builtin, sort_order)
     VALUES (?, ?, ?, FALSE, ?)`,
    [id, input.name.trim(), input.description?.trim() || null, (max?.m ?? 0) + 1],
  );
  if (input.modules) await setRoleModules(id, input.modules);
  return (await getRole(id))!;
}
