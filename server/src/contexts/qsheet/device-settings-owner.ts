// 収録設定・配信設定（機器設定）の `:ownerKey` 解決とアクセス判定を1か所に閉じる。
//
// `canAccessDoc`（`access.ts`）は**文書単位**（`qsheet_document_shares`）の判定なので、
// **案件単位**の `:ownerKey` にはそのまま使えない。7エンドポイント全部がここを通る形にする
// （`customers.routes.ts` の `resolveLegacyCustomerId` を1箇所に寄せたのと同じ形。v4.1.6 の判断）。
//
// ── 「その案件が見えてよい人」の定義（impl doc §4-1 の未決事項） ──────────
//
// いまの qsheet は文書単位の可視性しか持っていない。案件単位の可視性を決める関数は
// このリポジトリのどこにもない。**当面は「`qsheet` 区画の reader 以上」を「その案件が
// 見える」とみなす**（08 の書き方どおり・impl doc §4-1 の既定）。これは
// `server/src/contexts/sales/routes/projects.routes.ts` が案件を「`sales` 区画の
// reader 以上なら全件見える」で扱っているのと同じ作法（行単位の絞り込みをしていない）。
// ルーター側で既に `requireAuth, requirePermission('qsheet')`（reader 以上）を通しているため、
// ここまで到達した時点で「案件が見える」は満たされている。system_admin は
// `requirePermission` が素通しするので同様。番組（マニュアル）も同じ扱い
// （`qsheet_programs` は行単位の権限を持たない・2026-08-22 追加）。
//
// ⚠️ **`doc_no`（資料単体）側はまだ解決できない。** `qsheet_documents.doc_no` 列が
// まだ存在しない（01 段の migration 未着手）ため、`kind: 'doc'` は現時点では
// 常に見つからない扱いにする（404）。01 の `doc_no` が入ったら、
// `canAccessDoc` と同じ判定（作成者／`qsheet_document_shares`／system_admin）で
// `qsheet_documents.doc_no = :ownerKey` を引く実装に差し替える。
// impl doc §1「先に済んでいる必要があるもの」の指示どおり、`doc_no` を待たずに
// `project_id` 側だけで先行実装している。
import { queryOne } from '../../shared/db/connection';

export interface AccessUser {
  id: string;
  role: string;
  permissions?: Record<string, string>;
}

export type Owner =
  | { kind: 'project'; projectId: string; date?: string }
  | { kind: 'program'; programId: string; date?: string }
  | { kind: 'doc'; docNo: string; date?: string };

/**
 * `:ownerKey` と `?date=` を `Owner` に直す。
 *   - `projects.id` または `projects.gls_number` に一致するもの → `project`
 *   - `qsheet_programs.id` に一致するもの → `program`（マニュアル番組。2026-08-22 追加）
 *   - それ以外（将来の `doc_no`）→ 今はまだ解決できないので `null`
 * 見つからない・見えない → **null を返す。呼び出し側は 404**（403 にしない。存在秘匿）。
 */
export async function resolveOwner(
  _user: AccessUser,
  ownerKey: string,
  date?: string
): Promise<Owner | null> {
  const key = (ownerKey ?? '').trim();
  if (!key) return null;

  const project = await queryOne(
    `SELECT id FROM projects WHERE (id = $1 OR gls_number = $1) AND deleted_at IS NULL`,
    [key]
  );
  if (project) {
    return { kind: 'project', projectId: project.id as string, date: date || undefined };
  }

  const program = await queryOne(
    `SELECT id FROM qsheet_programs WHERE id = $1 AND deleted_at IS NULL`,
    [key]
  );
  if (program) {
    return { kind: 'program', programId: program.id as string, date: date || undefined };
  }

  // `doc_no` はまだ存在しない列（01 段待ち）。ここに来るのは「案件でも番組でも将来の
  // 資料番号でもない」キーなので、存在秘匿の 404 として扱う。
  return null;
}

/** `qsheet_recording_settings` / `qsheet_streaming_settings` の owner 列条件を組み立てる */
export function ownerWhere(owner: Owner, paramIndex: number): { clause: string; params: unknown[] } {
  if (owner.kind === 'project') {
    return { clause: `project_id = $${paramIndex}`, params: [owner.projectId] };
  }
  if (owner.kind === 'program') {
    return { clause: `program_id = $${paramIndex}`, params: [owner.programId] };
  }
  return { clause: `doc_no = $${paramIndex}`, params: [owner.docNo] };
}
