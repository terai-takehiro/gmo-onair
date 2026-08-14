/**
 * 帳票（見積書・請求書・検収書）を BOX の案件フォルダへ自動で格納する。
 *
 * ── なぜ「出したら入る」なのか ──────────────────────────────
 *
 * 出した PDF が手元にしか残らないと、**何を誰にいくらで出したかが
 * 出した人の PC にしか無い**状態になります（v3 はそうでした）。
 * ご指示どおり、**PDF を出す操作＝発行**とし、その場で BOX に置きます。
 *
 * ── どこに入れるか ──────────────────────────────────────────
 *
 * 対応表は **`doc-box-dest.ts` の1つだけ**（BOX につながない環境でも試験で
 * 固定できるように、表だけ純粋なファイルに分けてあります）。
 * 2か所に書くと、片方だけ直した日から同じ帳票が案件によって違う場所に入ります。
 *
 * ── 失敗の扱い ──────────────────────────────────────────────
 *
 * **PDF のダウンロードは止めません。** BOX が落ちている日に帳票を出せなく
 * なるのは本末転倒です（`shared/services/box.ts` の「BOX 障害が業務を
 * ブロックしない」方針）。ただし **黙って握り潰しません** —
 * 上がっていないのに上がったように見えるのが一番困るので、
 * 返り値と応答ヘッダーで「入ったか・入らなかった理由」を必ず返し、
 * 画面がそのまま出します。
 */
import type { Response } from 'express';
import { queryOne } from '../db/connection';
import {
  isBoxConfigured, extractFolderId, ensureSubfolder, uploadToFolder, type BoxItem,
} from './box';
import { DOC_BOX_DEST, describeDocBoxDest, type FinanceDocKind } from './doc-box-dest';

export type { FinanceDocKind };

/**
 * 入らなかった理由。**画面がそのまま文言に直せる粒度**にしてある
 * （「失敗しました」だけだと、押し直せば直るのか直らないのか分からない）。
 */
export type DocBoxReason =
  /** この環境は BOX につないでいない（検証・手元） */
  | 'NOT_CONFIGURED'
  /** 案件の BOX フォルダがまだ無い（GLS 未発番など） */
  | 'NO_FOLDER'
  /** 置き場所（`01_見積・提案` など）を用意できなかった */
  | 'NO_SUBFOLDER'
  /** BOX が応答しない・アップロードに失敗した */
  | 'UNAVAILABLE'
  /** 読むだけの権限なので保存しなかった */
  | 'NO_PERMISSION';

export interface DocBoxResult {
  /** 入ったファイル。入らなかったときは null */
  stored: BoxItem | null;
  /** 入らなかった理由。入ったときは null */
  reason: DocBoxReason | null;
  /** 入った（入るはずだった）場所の言い方。画面はこれをそのまま出す */
  where: string;
}

/**
 * 帳票を案件の BOX フォルダへ置く。**投げません**（理由を返します）。
 *
 * @param projectId 案件 (`projects.id`)。プロジェクト管理 (GLS-B) も同じ表なので同じ経路で入る
 * @param kind      帳票の種類
 * @param filename  BOX に載せるファイル名（同名は BOX の新しい版になる）
 */
export async function fileFinanceDocToBox(
  projectId: string | null | undefined,
  kind: FinanceDocKind,
  filename: string,
  buffer: Buffer,
): Promise<DocBoxResult> {
  const where = describeDocBoxDest(kind);
  const no = (reason: DocBoxReason): DocBoxResult => ({ stored: null, reason, where });

  if (!projectId) return no('NO_FOLDER');
  if (!isBoxConfigured()) return no('NOT_CONFIGURED');

  const dest = DOC_BOX_DEST[kind];
  const project = await queryOne(
    'SELECT box_url_internal, box_url_external FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId],
  ) as { box_url_internal: string | null; box_url_external: string | null } | undefined;
  if (!project) return no('NO_FOLDER');

  const rootId = extractFolderId(
    dest.scope === 'internal' ? project.box_url_internal : project.box_url_external,
  );
  if (!rootId) return no('NO_FOLDER');

  try {
    // 発番前に作られた案件にはサブフォルダが揃っていないことがある。
    // **置くときだけ作る**（読むだけで作ると BOX が空フォルダで埋まる）
    const folderId = await ensureSubfolder(rootId, dest.subfolder);
    if (!folderId) return no('NO_SUBFOLDER');
    const stored = await uploadToFolder(folderId, filename, buffer);
    console.log(`[doc-box] ${kind} → ${dest.scope}/${dest.subfolder} : ${filename}`);
    return { stored, reason: null, where };
  } catch (err) {
    console.error(`[doc-box] failed to store ${kind} '${filename}':`, (err as Error).message);
    return no('UNAVAILABLE');
  }
}

/** 権限が無くて置かなかったとき。**行き先だけは同じ表から出す**（画面の文言を揃える） */
export function docBoxSkipped(kind: FinanceDocKind, reason: DocBoxReason): DocBoxResult {
  return { stored: null, reason, where: describeDocBoxDest(kind) };
}

/**
 * 結果を応答ヘッダーに載せる。
 *
 * **本文は PDF そのもの**なので、入ったかどうかを JSON で返す場所がありません。
 * ヘッダーに載せて、画面（`client/src/lib/docPdf.ts`）が読み取って出します。
 * `Access-Control-Expose-Headers` を付けているのは、別オリジンから呼ばれても
 * 読めるようにするためです（同一オリジンでは無くても読めますが、
 * **無いと別オリジンのときだけ黙って「保存できたか分からない」になる**）。
 */
export function applyDocBoxHeaders(res: Response, result: DocBoxResult): void {
  res.setHeader('X-Box-Stored', result.stored ? '1' : '0');
  if (result.reason) res.setHeader('X-Box-Reason', result.reason);
  if (result.stored) res.setHeader('X-Box-File-Url', result.stored.url);
  // **行き先の言い方はサーバーが決めて渡す。** 画面に書き写させると、
  // 表を直した日から「社外に入りました」と読んだのに社内にある、が起きる。
  // ヘッダーは ASCII しか通らないので %エンコードして渡す（画面が戻す）
  res.setHeader('X-Box-Where', encodeURIComponent(result.where));
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Disposition, X-Box-Stored, X-Box-Reason, X-Box-File-Url, X-Box-Where',
  );
}
