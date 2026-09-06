/**
 * 「前回の資料」のパック — 「変更点は赤字」（keep-report.md §6.3）の比較相手を読む。
 *
 * 会議日より前で**いちばん新しい凍結済みの版**（全体／全区分）。凍結し直した版が複数あるときは
 * 新しい凍結が勝つ（`keep-pack-store.service.ts` の `getFrozenPack` と同じ読み方）。
 * 凍結していない「いまの数字」は比べない — 資料に出た数字だけが「前回」になる。
 * 無ければ null（初回の資料。赤字は付かず、脚注も出ない）。
 *
 * 前回の会議日そのもの（`resolvePreviousMeetingDate`）とは別物: あちらは議事録からも引くので、
 * 凍結した資料が無い会議日を指すことがある。
 */
import { queryOne } from '../../../shared/db/connection';
import type { KeepReportPack } from './keep-pack.types';

export async function loadPreviousPack(meetingDate: string): Promise<KeepReportPack | null> {
  const row = await queryOne(
    `SELECT pack FROM keep_report_packs
      WHERE meeting_date < ? AND scope_entity = 'all' AND scope_segment = 'all' AND frozen_at IS NOT NULL
      ORDER BY meeting_date DESC, frozen_at DESC LIMIT 1`,
    [meetingDate],
  ) as { pack: KeepReportPack } | undefined;
  return row?.pack ?? null;
}
