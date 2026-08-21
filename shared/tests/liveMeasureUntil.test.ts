/**
 * 計測の既定の自動停止時刻（開始日 23:59 JST）。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * コンテナは UTC で動き、`TZ=Asia/Tokyo` は Alpine に tzdata が無いため効かない
 * （`server/src/shared/utils/jst.ts` と同じ理由）。JST の朝（UTC ではまだ前日）を
 * 跨ぐケースを取り違えると、**開始した当日ではなく前日や翌日の 23:59 に止まる**——
 * 画面には時刻が出るだけなので、実際に本番中に切れるまで誰も気づけない。
 */
import { describe, it, expect } from 'vitest';
import { defaultMeasureUntil } from '../../server/src/contexts/liveops/measure.service';

const utc = (iso: string) => new Date(`${iso}Z`);

describe('計測の既定の自動停止時刻（開始日 23:59 JST）', () => {
  it('JST 昼 (UTC 同日午前) に始めると、その日の 23:59:59 JST に止まる', () => {
    // UTC 2026-08-15T05:00 = JST 2026-08-15 14:00
    const until = defaultMeasureUntil(utc('2026-08-15T05:00:00'));
    expect(until.toISOString()).toBe('2026-08-15T14:59:59.000Z'); // = JST 2026-08-15 23:59:59
  });

  it('⚠️ JST 08:00 前後（UTC ではまだ前日）でも、UTC の日付に引きずられず JST の当日で止まる', () => {
    // UTC 2026-08-14T23:30 = JST 2026-08-15 08:30
    const until = defaultMeasureUntil(utc('2026-08-14T23:30:00'));
    expect(until.toISOString()).toBe('2026-08-15T14:59:59.000Z'); // JST 15日の23:59であって14日ではない
  });

  it('JST 23:50 に始めても、同じ日の 23:59:59 JST（=9分後）に止まる', () => {
    // UTC 2026-08-15T14:50 = JST 2026-08-15 23:50
    const until = defaultMeasureUntil(utc('2026-08-15T14:50:00'));
    expect(until.toISOString()).toBe('2026-08-15T14:59:59.000Z');
  });
});
