/**
 * **案件の BOX フォルダ名を、いまの案件の値に合わせる**
 *
 * ── ご依頼（2026-09-24）──────────────────────────────────────
 *
 * 「BOX の案件フォルダに案件実施日をつけたい。日付が先頭だと BOX でソートできるので
 *   【社内】日付_ID_案件名」 → `【社内】2026.12.03_GLS-A001_案件名`
 * 名前の組み立ては `box-folder.service.ts` の `buildProjectFolderName` だけが持つ。
 *
 * ── なぜ「差分を見て合わせる」形にしたか ─────────────────────
 *
 * 名前の材料（案件名・番号・実施日）は何か所からも変わる。とくに実施日は
 * 案件の編集・カレンダーの予約（`syncProjectEventDates`）・Excel 取込・MCP から動く。
 * 変わる場所ごとに改名を書くと、書き忘れた場所だけ名前が古いまま残る。
 *
 * そこで**最後に合わせた名前を `projects.box_folder_name` に持ち**（migration 310）、
 * 「いまの値から組み立てた名前」と違う案件だけ BOX を触る。
 *   - 変わった直後の呼び出し（案件の保存・発番・改番・予約の変更）→ その場で合わせる
 *   - 取りこぼし・既存フォルダ → 日次ジョブ（`syncAllProjectFolderNames`）が拾う
 *
 * ── 触ってよいフォルダ（安全弁）───────────────────────────────
 *
 * `box_url_*` は画面から書き換えられるただの文字列なので、指している先を無条件に
 * 改名すると**別の案件や親フォルダの名前を変えられる**。
 *   ① 親フォルダ・取込フォルダの ID なら触らない（`forbiddenFolderIds`）
 *   ② **いまの名前にその案件の番号（管理番号 / 案件コード）が入っているものだけ**改名する。
 *      プロジェクト管理（GPM）が作ったフォルダは番号を持たない（案件名だけ）ので、ここで外れる
 *      — 今回の対象は案件フォルダだけ。
 * 置き場（`98_終了案件`/`99_失注・見送り`）へ移したフォルダも ID は変わらないので同じく合わせる。
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { getBoxClient, isBoxConfigured, extractFolderId } from '../../../shared/services/box';
import { buildProjectFolderName, INTERNAL_PREFIX, EXTERNAL_PREFIX } from './box-folder.service';
import { forbiddenFolderIds, stripFolderPrefix } from './box-lost-cleanup.service';

/**
 * - `same`     … 合わせ済み（BOX を触っていない）
 * - `renamed`  … 1つ以上付け直した
 * - `checked`  … BOX を見たが、すでにその名前だった／安全弁で触らなかった（印は付けた）
 * - `retry`    … BOX が読めない・改名に失敗した。印を付けないので次回もう一度試す
 * - `off`      … BOX 未設定・案件が無い
 */
export type FolderNameOutcome = 'same' | 'renamed' | 'checked' | 'retry' | 'off';

interface NamingRow {
  id: string; code: string | null; gls_number: string | null; name: string | null;
  event_start: string | null; event_end: string | null;
  box_url_internal: string | null; box_url_external: string | null;
  box_folder_name: string | null;
}

const NAMING_COLUMNS = `id, code, gls_number, name, event_start, event_end,
  box_url_internal, box_url_external, box_folder_name`;

/**
 * そのフォルダを付け直してよいか（純関数）。
 * @returns 触ってよければ `null`、触らない理由があればその文
 */
export function renameBlockReason(
  folderId: string, currentName: string, numbers: (string | null | undefined)[],
  forbidden: (string | null | undefined)[],
): string | null {
  if (forbidden.some((f) => !!f && f === folderId)) return '親フォルダ・取込フォルダを指している';
  const bare = stripFolderPrefix(currentName);
  const nums = numbers.map((n) => String(n ?? '').trim()).filter((n) => n !== '');
  if (!nums.some((n) => bare.includes(n))) return `名前に番号が入っていない (${currentName})`;
  return null;
}

async function syncRow(row: NamingRow): Promise<{ outcome: FolderNameOutcome; notes: string[] }> {
  const expected = buildProjectFolderName(row);
  if (row.box_folder_name === expected) return { outcome: 'same', notes: [] };
  if (!isBoxConfigured()) return { outcome: 'off', notes: [] };
  const client = getBoxClient();
  if (!client) return { outcome: 'off', notes: [] };

  const forbidden = forbiddenFolderIds();
  const notes: string[] = [];
  let renamed = 0;
  let retry = false;
  const sides = [
    { key: 'internal', url: row.box_url_internal, prefix: INTERNAL_PREFIX },
    { key: 'external', url: row.box_url_external, prefix: EXTERNAL_PREFIX },
  ];

  for (const side of sides) {
    if (!side.url) continue;
    const folderId = extractFolderId(side.url);
    if (!folderId || !/^\d+$/.test(folderId)) { notes.push(`${side.key}: 触らず (URLが読めない)`); continue; }

    let current: string;
    try {
      current = String((await client.folders.get(folderId, { fields: 'id,name' })).name ?? '');
    } catch (e) {
      notes.push(`${side.key}: 読めず (${(e as Error).message})`);
      retry = true;
      continue;
    }
    if (stripFolderPrefix(current) === expected) continue;

    const blocked = renameBlockReason(folderId, current, [row.gls_number, row.code], forbidden);
    if (blocked) { notes.push(`${side.key}: 触らず (${blocked})`); continue; }

    // 頭は**その側の**頭に揃える（頭が付く前の古いフォルダにも付く）
    const next = `${side.prefix}${expected}`;
    try {
      await client.folders.update(folderId, { name: next });
      notes.push(`${side.key}: ${current} → ${next}`);
      renamed += 1;
    } catch (e) {
      notes.push(`${side.key}: 改名できず (${(e as Error).message})`);
      retry = true;
    }
  }

  if (retry) {
    console.warn('[box-folder-name] 付け直しきれませんでした（次回もう一度）:', row.id, notes.join(' / '));
    return { outcome: 'retry', notes };
  }
  // **`updated_at` は動かさない** — 名前合わせは人の操作ではない（「止まっている」の判定を崩さない）
  await execute('UPDATE projects SET box_folder_name = ? WHERE id = ?', [expected, row.id]);
  if (notes.length) console.log('[box-folder-name]', row.id, notes.join(' / '));
  return { outcome: renamed > 0 ? 'renamed' : 'checked', notes };
}

/** 1件だけ合わせる。案件名・番号・実施日を変えた直後に呼ぶ */
export async function syncProjectFolderName(projectId: string): Promise<{ outcome: FolderNameOutcome; notes: string[] }> {
  const row = await queryOne(
    `SELECT ${NAMING_COLUMNS} FROM projects WHERE id = ?`, [projectId],
  ) as unknown as NamingRow | null;
  if (!row) return { outcome: 'off', notes: [] };
  return syncRow(row);
}

/**
 * **失敗しても呼び出し元は止めない**入口（BOX の不調で案件の保存・発番を止めない —
 * `box.ts` 冒頭の方針）。
 */
export async function syncProjectFolderNameSafe(projectId: string | null | undefined): Promise<FolderNameOutcome> {
  if (!projectId) return 'off';
  try {
    return (await syncProjectFolderName(projectId)).outcome;
  } catch (e) {
    console.warn('[box-folder-name] 付け直しに失敗 (non-blocking):', projectId, (e as Error).message);
    return 'retry';
  }
}

export interface FolderNameSweepResult {
  /** 付け直した案件の数 */
  renamed: number;
  /** 見たが付け直す必要が無かった・触らなかった数 */
  checked: number;
  /** まだ合わせていない案件の数（次の実行で続きをやる） */
  remaining: number;
  timedOut: boolean;
}

/** 日次ジョブが BOX を触ってよい時間。応答を待つ人がいないので画面の往復より長く取る */
export const FOLDER_NAME_SWEEP_BUDGET_MS = 180_000;

/**
 * **名前が合っていない案件を、まとめて合わせる**（既存フォルダの付け直しを兼ねる）。
 * どれが違うかは DB だけで分かるので、BOX を触るのは違う案件だけ。
 * 件数ではなく時間で区切り、続きは次の実行で進む。
 */
export async function syncAllProjectFolderNames(
  budgetMs = FOLDER_NAME_SWEEP_BUDGET_MS,
): Promise<FolderNameSweepResult> {
  const rows = await queryAll(
    `SELECT ${NAMING_COLUMNS} FROM projects
      WHERE deleted_at IS NULL AND (box_url_internal IS NOT NULL OR box_url_external IS NOT NULL)
      ORDER BY created_at DESC`,
  ) as unknown as NamingRow[];
  const pending = rows.filter((r) => r.box_folder_name !== buildProjectFolderName(r));
  const result: FolderNameSweepResult = { renamed: 0, checked: 0, remaining: pending.length, timedOut: false };
  if (!isBoxConfigured() || pending.length === 0) return result;

  const started = Date.now();
  for (const row of pending) {
    if (Date.now() - started > budgetMs) { result.timedOut = true; break; }
    let outcome: FolderNameOutcome;
    try {
      outcome = (await syncRow(row)).outcome;
    } catch (e) {
      console.warn('[box-folder-name] 付け直しに失敗:', row.id, (e as Error).message);
      continue;
    }
    if (outcome === 'renamed') result.renamed += 1;
    if (outcome === 'checked') result.checked += 1;
    if (outcome === 'renamed' || outcome === 'checked') result.remaining -= 1;
  }
  console.log('[box-folder-name] まとめて付け直し:', result);
  return result;
}
