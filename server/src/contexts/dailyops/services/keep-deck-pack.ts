/**
 * 資料ビルダーが読む「定例報告パック」の取り口（keep-deck.service の材料）。
 *
 * ── どの版を読むか（docs/design/v4/keep-report.md §5.5）──────────────
 * 1. 会議日の**凍結した**パック（`keep_report_packs.frozen_at IS NOT NULL`・scope は all/all）があればそれ。
 *    凍結し直して版が複数あるときは、いちばん新しく凍結したもの
 * 2. 無ければ「いまの数字」（`keep-pack.service` の `buildPack`）。パックの服務は Agent B（段1）側で、
 *    こちらは**読むだけ**
 * 3. それも作れない環境（パックの service が無い・DB に材料が無い）では null —
 *    構成は組める（自動ページは灰色の枠で出る）
 *
 * `pack_id` は凍結版のときだけ入る（`keep_decks.pack_id`。凍結前は NULL で「いまの数字で組んだ」の印）。
 */
import { queryOne } from '../../../shared/db/connection';
import type { KeepReportPack } from './keep-deck.types';

export interface PackForMeeting {
  pack: KeepReportPack | null;
  /** 凍結版の id。いまの数字のときは null */
  pack_id: string | null;
  frozen: boolean;
}

export async function loadPackForMeeting(meetingDate: string): Promise<PackForMeeting> {
  const frozen = await queryOne(
    `SELECT id, pack FROM keep_report_packs
      WHERE meeting_date = ? AND frozen_at IS NOT NULL AND scope_entity = 'all' AND scope_segment = 'all'
      ORDER BY frozen_at DESC LIMIT 1`,
    [meetingDate],
  );
  if (frozen) return { pack: frozen.pack as KeepReportPack, pack_id: String(frozen.id), frozen: true };
  // TODO(段1と結ぶ): `keep-pack.service` の `buildPack({ meetingDate, entity: 'all', segment: 'all' })` で
  // 「いまの数字」を作る。service が入るまでは、その会議日の下書き（凍結前に保存した版）があればそれを読む
  const draft = await queryOne(
    `SELECT id, pack FROM keep_report_packs
      WHERE meeting_date = ? AND scope_entity = 'all' AND scope_segment = 'all'
      ORDER BY generated_at DESC LIMIT 1`,
    [meetingDate],
  );
  if (draft) return { pack: draft.pack as KeepReportPack, pack_id: null, frozen: false };
  // いまの数字が作れなくても構成づくりは止めない（自動ページは灰色の枠になる）
  return { pack: null, pack_id: null, frozen: false };
}

/** 凍結版の id からパックを読む（構成が結んだ版を出力に使うとき） */
export async function loadPackById(packId: string): Promise<KeepReportPack | null> {
  const row = await queryOne('SELECT pack FROM keep_report_packs WHERE id = ?', [packId]);
  return row ? (row.pack as KeepReportPack) : null;
}
