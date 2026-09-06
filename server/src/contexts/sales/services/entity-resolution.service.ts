/**
 * 計上会社の導出・新方式の採番・改番 — 2026年10月の事業再編
 *
 * 設計の全文: docs/reorg-2026-10-plan.md（§4.3・§4.4・§4.8）。P0（migration 280〜283・
 * `legal_entities`／`org_transition`／`entity_code` 列／`project_numbers`）の続き。
 *
 * ── いつ効くか ────────────────────────────────────────────────
 *
 * `org_transition.state === 'off'` のあいだは `resolveEntity()` が必ず
 * `{ entityCode: null }` を返す——**呼び出し側（`issueGls`）はそのとき今までどおり
 * `generateGlsNumber` を使う**ので、状態が 'off' の環境では挙動が1ミリも変わらない
 * （P0 の受け入れ条件をそのまま引き継ぐ）。
 *
 * ── なぜ project.service.ts に置かないか ─────────────────────
 *
 * `project.service.ts` が既に2,700行を超えており、これ以上増やさない。
 * ここから `project.service.ts` の一部（`buildProjectFolderName`・`generateGlsNumber` 等）を
 * import する一方向の依存にして、循環 import を作らない
 * （`customerIsGroup` は import せず、同じ1行の SELECT をここで直接書く——
 * 3行の重複と循環 import を天秤にかけて重複を選んだ）。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import type { GlsCategory } from '../../../shared/services/sequence.service';
import { getOrgTransition } from '../../platform/services/org-transition.service';
import { getLegalEntity, type LegalEntityCode } from '../../platform/services/legal-entity.service';
import { extractFolderId } from '../../../shared/services/box';
import { renameProjectFolderPair } from './box-folder.service';

/**
 * `project.service.ts` の同名関数と同一実装。**import せず複製する**——
 * 実測したところ `project.service.ts ⇄ entity-resolution.service.ts` の循環 import は
 * 一方の named export が解決されない実行時エラーを起こした（`tsx` で確認済み）。
 * 1行の関数を複製するほうが、循環 import の実行順に依存する壊れ方より安全。
 */
function buildProjectFolderName(project: { gls_number?: string | null; code: string; name: string }): string {
  const idCode = project.gls_number || project.code;
  return `${idCode}_${project.name}`;
}

// ───────────────────────────────────────────────────────────
// 実施日 — §4.4「event_start(=project_datesの最小日) → 回の最小recording_date →
// スタジオ予約の最小開始日」の順。event_start は syncProjectEventDates が
// 既に project_dates の MIN/MAX と同期しているので、ここでは projects 1列だけ見ればよい
// （project_dates を二重に見に行かない — 「同じ事実に2つ目の置き場を作らない」原則）。
// ───────────────────────────────────────────────────────────
export async function resolveEventDate(projectId: string): Promise<string | null> {
  const p = await queryOne(
    'SELECT event_start FROM projects WHERE id = ?', [projectId],
  ) as { event_start: string | null } | undefined;
  if (p?.event_start) return p.event_start;

  const ep = await queryOne(
    `SELECT MIN(recording_date) AS d FROM episodes
      WHERE project_id = ? AND deleted_at IS NULL AND recording_date IS NOT NULL`,
    [projectId],
  ) as { d: string | null } | undefined;
  if (ep?.d) return ep.d;

  // studio_bookings.start_time は時刻つきの TEXT。日付部分だけ使う
  const b = await queryOne(
    `SELECT MIN(start_time) AS d FROM studio_bookings WHERE project_id = ?`,
    [projectId],
  ) as { d: string | null } | undefined;
  return b?.d ? b.d.slice(0, 10) : null;
}

export interface ResolvedEntity {
  /** null = 「まだ旧方式（GLS）のまま扱う」。呼び出し側は generateGlsNumber を使うこと */
  entityCode: LegalEntityCode | null;
  /** entity_note に書く、人が読める理由（§4.4 の分岐のどれを通ったか） */
  reason: string;
}

/**
 * §4.4 の擬似コードそのもの。案件の作成・受注・改番のたびに呼び、
 * 都度の最新の切替日・取引先情報で判定する（結果はそのつど `entity_code`/`entity_source`/
 * `entity_note` に保存する初期値——保存後は取引先マスターが変わっても動かさない、が原則）。
 */
export async function resolveEntity(
  projectId: string,
  glsCategory: GlsCategory | null,
  customerId: string | null,
): Promise<ResolvedEntity> {
  const transition = await getOrgTransition();
  if (transition.state === 'off') {
    return { entityCode: null, reason: '旧方式（切替前）' };
  }
  if (glsCategory === 'B') {
    return { entityCode: 'GMO', reason: 'プロジェクト（GLS-B）はグループ本体（コストセンター）へ' };
  }
  if (!transition.cutoverDate) {
    return { entityCode: null, reason: '切替日が未設定のため判定できません' };
  }
  const eventDate = await resolveEventDate(projectId);
  if (!eventDate) {
    return { entityCode: null, reason: '実施日が未定のため判定できません' };
  }
  if (eventDate < transition.cutoverDate) {
    return { entityCode: null, reason: `実施日（${eventDate}）が切替日より前` };
  }
  const company = customerId
    ? (await queryOne(
        'SELECT is_gmo_group FROM companies WHERE id = ? AND deleted_at IS NULL', [customerId],
      ) as { is_gmo_group: boolean } | undefined)
    : undefined;
  return company?.is_gmo_group === true
    ? { entityCode: 'GSS', reason: '客先がグループ内（コンテンツスタジオ以外）' }
    : { entityCode: 'GJV', reason: '客先がグループ外' };
}

// ───────────────────────────────────────────────────────────
// 新方式の採番 — generateGlsNumber と同型（sequences の ON CONFLICT で原子的に進める）。
// prefix は legal_entities.number_prefix（例 'GJV-'）、4桁通し、年なし・リセットなし（§4.3）
// ───────────────────────────────────────────────────────────
export async function generateProjectNumber(entityCode: LegalEntityCode): Promise<string> {
  const entity = await getLegalEntity(entityCode);
  if (!entity) throw new AppError(500, 'INTERNAL_ERROR', `計上会社（${entityCode}）が見つかりません`);
  const row = await queryOne(
    `INSERT INTO sequences (seq_name, prefix, year_month, counter)
     VALUES (?, ?, '000000', 1)
     ON CONFLICT (seq_name) DO UPDATE SET counter = sequences.counter + 1
     RETURNING counter`,
    [`project_${entityCode}`, entity.numberPrefix],
  );
  const counter = row!.counter as number;
  return `${entity.numberPrefix}${String(counter).padStart(4, '0')}`;
}

/** 採らずに見るだけ（peekNextGlsNumber と同型。確認ダイアログ用） */
export async function peekNextProjectNumber(entityCode: LegalEntityCode): Promise<string | null> {
  const entity = await getLegalEntity(entityCode);
  if (!entity) return null;
  const row = await queryOne('SELECT counter FROM sequences WHERE seq_name = ?', [`project_${entityCode}`]);
  const next = ((row?.counter as number | undefined) ?? 0) + 1;
  return `${entity.numberPrefix}${String(next).padStart(4, '0')}`;
}

/** `project_numbers` に1行追記する（発番・改番の両方から呼ぶ共通部） */
async function recordNumberIssued(
  projectId: string, number: string, entityCode: LegalEntityCode | null, scheme: 'gls' | 'entity', userId: string,
): Promise<void> {
  await execute(
    `INSERT INTO project_numbers (id, project_id, number, entity_code, scheme, assigned_at, assigned_by)
     VALUES (?, ?, ?, ?, ?, NOW(), ?)
     ON CONFLICT (number) DO NOTHING`,
    [uuidv4(), projectId, number, entityCode, scheme, userId],
  );
}

/** 発番（`issueGls` から呼ぶ）のときの履歴追記。新規発番は `retired_at` が要らない分だけ簡潔 */
export async function recordFirstIssue(
  projectId: string, number: string, entityCode: LegalEntityCode | null, userId: string,
): Promise<void> {
  await recordNumberIssued(projectId, number, entityCode, entityCode ? 'entity' : 'gls', userId);
}

// ───────────────────────────────────────────────────────────
// 改番（§4.8 の4番）— changeGlsCategory と同じカスケードの一般形
// ───────────────────────────────────────────────────────────
export interface RenumberPreview {
  oldNumber: string;
  newNumber: string;
}

/** 改番の確認ダイアログ用。**採らない**（peekNextProjectNumber と同じ注意点を持つ） */
export async function previewRenumber(projectId: string, targetEntityCode: LegalEntityCode): Promise<RenumberPreview> {
  const project = await queryOne(
    'SELECT gls_number FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId],
  ) as { gls_number: string | null } | undefined;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  if (!project.gls_number) throw new AppError(400, 'VALIDATION_ERROR', 'まだ番号が発番されていません');
  const newNumber = await peekNextProjectNumber(targetEntityCode);
  if (!newNumber) throw new AppError(400, 'VALIDATION_ERROR', '不正な計上会社です');
  return { oldNumber: project.gls_number, newNumber };
}

export interface RenumberResult {
  projectId: string;
  oldNumber: string;
  newNumber: string;
  entityCode: LegalEntityCode;
  /** BOX フォルダの付け替えができたか。失敗しても改番そのものは成立する（既存方針） */
  boxRenamed: boolean;
  boxReason: string | null;
}

/**
 * 発番済みの案件を、別の計上会社の番号へ改番する。
 *
 * 追随するもの（§4.8）: 回コード・Qシートの写し・BOX フォルダ名・**未請求**の請求キー
 * （売上は `invoice_issued=false AND paid_date IS NULL` の行だけ——発行済み・入金済みは
 * 触らない。仕入は「発行した請求書」という概念自体が無いので無条件に追随させる）。
 * 旧番号は `project_numbers` に `retired_at` 付きで残し、消さない。
 */
export async function renumberProject(
  projectId: string, targetEntityCode: LegalEntityCode, reason: string, userId: string,
): Promise<RenumberResult> {
  if (!reason || !reason.trim()) throw new AppError(400, 'VALIDATION_ERROR', '改番の理由を入力してください');
  const project = await queryOne(
    'SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId],
  ) as Record<string, unknown> | undefined;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  const oldNumber = project.gls_number as string | null;
  if (!oldNumber) throw new AppError(400, 'VALIDATION_ERROR', 'まだ番号が発番されていません');
  if (!(await getLegalEntity(targetEntityCode))) {
    throw new AppError(400, 'VALIDATION_ERROR', '不正な計上会社です');
  }
  const trimmedReason = reason.trim();
  const newNumber = await generateProjectNumber(targetEntityCode);

  await execute(
    `UPDATE projects SET gls_number = ?, entity_code = ?, entity_source = 'manual', entity_note = ?,
                          updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [newNumber, targetEntityCode, trimmedReason, userId, projectId],
  );

  // 履歴: 旧番号を退役させ、新番号を追記
  await execute(
    `UPDATE project_numbers SET retired_at = NOW(), reason = ? WHERE number = ? AND retired_at IS NULL`,
    [trimmedReason, oldNumber],
  );
  await recordNumberIssued(projectId, newNumber, targetEntityCode, 'entity', userId);
  await execute(
    `UPDATE project_numbers SET reason = ? WHERE number = ? AND reason IS NULL`,
    [trimmedReason, newNumber],
  );

  // 回コード・Qシートの写し（changeGlsCategory と同じ REPLACE 方式）
  await execute(
    `UPDATE episodes SET episode_code = REPLACE(episode_code, ?, ?), updated_at = NOW()
      WHERE project_id = ? AND deleted_at IS NULL AND episode_code LIKE ?`,
    [oldNumber, newNumber, projectId, `${oldNumber}%`],
  );
  await execute(
    `UPDATE qsheet_documents SET episode_code = REPLACE(episode_code, ?, ?), updated_at = NOW()
      WHERE project_id = ? AND episode_code LIKE ?`,
    [oldNumber, newNumber, projectId, `${oldNumber}%`],
  );

  // 未請求の請求キー（売上は発行済み・入金済みを除く。仕入は無条件）
  await execute(
    `UPDATE revenues SET billing_key = REPLACE(billing_key, ?, ?), updated_at = NOW()
      WHERE project_id = ? AND deleted_at IS NULL AND billing_key LIKE ?
        AND invoice_issued = false AND paid_date IS NULL`,
    [oldNumber, newNumber, projectId, `${oldNumber}%`],
  );
  await execute(
    `UPDATE purchases SET billing_key = REPLACE(billing_key, ?, ?), updated_at = NOW()
      WHERE project_id = ? AND deleted_at IS NULL AND billing_key LIKE ?`,
    [oldNumber, newNumber, projectId, `${oldNumber}%`],
  );

  // BOX フォルダ名（失敗しても改番は成立させる。理由を返す — 200 + reason の既存方針）
  let boxRenamed = false;
  let boxReason: string | null = null;
  try {
    const internalFolderId = extractFolderId(project.box_url_internal as string | null);
    const externalFolderId = extractFolderId(project.box_url_external as string | null);
    if (internalFolderId || externalFolderId) {
      const newFolderName = buildProjectFolderName({
        gls_number: newNumber, code: project.code as string, name: project.name as string,
      });
      await renameProjectFolderPair(internalFolderId, externalFolderId, newFolderName);
      boxRenamed = true;
    } else {
      boxReason = 'BOXフォルダがまだありません';
    }
  } catch (err) {
    boxReason = 'BOXフォルダの付け替えに失敗しました';
    console.warn('[renumberProject] BOX folder rename failed (non-blocking):', projectId, (err as Error).message);
  }

  return { projectId, oldNumber, newNumber, entityCode: targetEntityCode, boxRenamed, boxReason };
}
