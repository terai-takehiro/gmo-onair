/**
 * 資料ビルダーが読む「定例報告パック」の取り口（keep-deck.service の材料）。
 *
 * ── どの版を読むか（docs/design/v4/keep-report.md §5.5）──────────────
 * `keep-pack-store.service` の `getPackForMeeting` に任せる:
 *   1. 会議日の**凍結した**パック（scope は all/all）があればそれ（`pack_id` が入る）
 *   2. 無ければ「いまの数字」（`buildPack`。`pack_id` は null で「いまの数字で組んだ」の印）
 * ここで足しているのは **3. それも作れないときに null を返す**こと — 材料の無い環境（検証・手元）でも
 * 構成づくりは止めない（自動ページは灰色の枠で出る。数字は後で「組み直す」で入る）。
 */
import { queryOne } from '../../../shared/db/connection';
import type { KeepReportPack } from './keep-pack.types';
import { getPackForMeeting } from './keep-pack-store.service';

export interface PackForMeeting {
  pack: KeepReportPack | null;
  /** 凍結版の id。いまの数字のときは null */
  pack_id: string | null;
  frozen: boolean;
}

export async function loadPackForMeeting(meetingDate: string): Promise<PackForMeeting> {
  try {
    const r = await getPackForMeeting({ meetingDate, entity: 'all', segment: 'all' });
    return { pack: r.pack, pack_id: r.pack_id, frozen: r.frozen };
  } catch (err) {
    console.warn(`[keep-deck] pack for ${meetingDate} unavailable; composing without numbers:`, (err as Error).message);
    return { pack: null, pack_id: null, frozen: false };
  }
}

/** 凍結版の id からパックを読む（構成が結んだ版をそのまま出力に使うとき） */
export async function loadPackById(packId: string): Promise<KeepReportPack | null> {
  const row = await queryOne('SELECT pack FROM keep_report_packs WHERE id = ?', [packId]);
  return row ? (row.pack as KeepReportPack) : null;
}
