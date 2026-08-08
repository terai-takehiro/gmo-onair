/**
 * 役割 = 権限の「型」
 *
 * ── 何をする層か ────────────────────────────────────────────
 *
 * 役割そのものは**判定に一切使われません**。役割を人に押すと
 * `user_permissions` の行が書き換わり、判定はいままでどおり
 * `requirePermission` が `user_permissions` だけを見ます
 * （311 か所の判定を 1 か所も触らないための作り。migration 174 に理由）。
 *
 * ── 型が触ってよい区画を固定する ────────────────────────────
 *
 * 「役割が持っていない区画は消す」を素直に書くと、**凍結4アプリの権限が
 * 役割を押した瞬間に消えます**（どの役割も凍結アプリを持たないため）。
 * Qシートや リアルタイムCG は放送で使うので、消えると本番が止まります。
 *
 * そこで型が触る区画を `ROLE_MODULES` に固定します。
 *   - `ROLE_MODULES` の中 … 役割が持つ = その段で上書き、持たない = 消す
 *   - `ROLE_MODULES` の外 … **一切触らない**（凍結4アプリはここ）
 *
 * 「役割が持っていないから消す」ではなく「型の担当範囲だから消す」に
 * することで、範囲外が巻き込まれません。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';

/**
 * 型が面倒を見る区画。**`UserListPage.tsx` の PERM_MODULES から
 * 凍結4アプリを除いたもの**。
 *
 * ここに凍結アプリ (`qsheet` / `techsheet` / `liveops` / `awards`) を
 * 足してはいけません。足すと役割を押すだけで放送系の権限が消えます。
 */
export const ROLE_MODULES = [
  'sales', 'budget', 'gpm', 'studio', 'partner_schedule', 'equipment', 'dailyops', 'admin',
] as const;

/** 型が絶対に触らない区画（説明のために名前で持つ。判定には使わない） */
export const ROLE_UNTOUCHED_MODULES = ['qsheet', 'techsheet', 'liveops', 'awards'] as const;

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
 * 型の中身を保存する。**`ROLE_MODULES` の外は捨てます** —
 * 画面から凍結アプリを型に入れられると、押した人の放送系の権限が
 * 型の言うとおりに書き換わってしまうため。
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
 * 型を押したあとに個別で直すのは**認めている**（「この人だけ例外」）ので、
 * ずれ自体は異常ではありません。ただし黙っていると
 * 「役割を見れば分かる」と思い込んだまま実際は違う、が起きるので画面に出します。
 * **凍結4アプリは型の範囲外なので、ずれの判定に入れません。**
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
