/**
 * 制作資料 (production) ツール共通の入口（段10 / 05-mcp.md §3-1）。
 *
 * 既存 19 カテゴリと違い、制作資料のツールだけは**静的 API キーを拒否し OAuth actor 専用**にする。
 * 台本は「作成者本人／共有先／`system_admin`」の**文書単位の秘匿**（`contexts/qsheet/access.ts`）で、
 * 共有 actor（`mcp-claude`）には「誰の台本まで見てよいか」を定義できないため。
 *
 * **全ツール（read も write も）の先頭で呼ぶこと。** read ツールには `gate.ts` の権限ゲートが
 * 掛からない（`gate.ts:14` の既知の穴）ので、静的キーを止められるのはここだけ。
 */
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne } from '../../../shared/db/connection';
import { actorContext } from '../helpers';

export interface ProductionActor {
  /** users.id（OAuth actor を実ユーザーへ解決した結果） */
  id: string;
  role: string;
  /** `qsheet` モジュールのアクセスレベル（`access.ts` の判定関数が期待する形に合わせる） */
  permissions: Record<string, string>;
}

const LEVEL_ORDER: Record<string, number> = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 };

interface UserRow {
  id: string;
  role: string;
  deleted_at: unknown;
}

/**
 * 制作資料ツールの共通ゲート。
 * - 静的 API キー actor（`isOAuth: false`）は 403（読み取りも含め全面拒否）
 * - OAuth actor は実ユーザーへ解決する。退職済み（`deleted_at`）・存在しないユーザーは 403
 * - `minLevel: 'editor'` を渡すと `qsheet` モジュールが editor 以上（または `system_admin`）
 *   であることも要求する（write 系ツール用。read 系は渡さない＝閲覧できれば足りる）
 */
export async function requireProductionActor(minLevel?: 'editor'): Promise<ProductionActor> {
  const actor = actorContext.getStore();
  if (!actor || !actor.isOAuth) {
    throw new AppError(
      403,
      'FORBIDDEN',
      '制作資料のツールは ONAiR ログイン連携（OAuth）でのみ使えます。共有APIキーでは台本を開けません。',
    );
  }

  const user = (await queryOne('SELECT id, role, deleted_at FROM users WHERE id = ?', [actor.actorId])) as
    | UserRow
    | undefined;
  if (!user || user.deleted_at) {
    throw new AppError(403, 'FORBIDDEN', 'このアカウントでは制作資料のツールを使えません。');
  }

  const permRow = (await queryOne(
    'SELECT access_level FROM user_permissions WHERE user_id = ? AND module = ?',
    [user.id, 'qsheet'],
  )) as { access_level?: string } | undefined;
  const qsheetLevel = permRow?.access_level ?? null;

  if (minLevel) {
    const ok = user.role === 'system_admin' || (qsheetLevel != null && (LEVEL_ORDER[qsheetLevel] ?? 0) >= LEVEL_ORDER[minLevel]);
    if (!ok) {
      throw new AppError(403, 'FORBIDDEN', `この操作には制作資料（qsheet）の ${minLevel} 以上の権限が必要です。`);
    }
  }

  return {
    id: user.id,
    role: user.role,
    permissions: qsheetLevel ? { qsheet: qsheetLevel } : {},
  };
}
