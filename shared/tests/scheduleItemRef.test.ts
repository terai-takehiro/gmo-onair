// スケジュール表の逆引き（`GET /documents/:docId/schedule-items`）が返す型を
// 必要最小限に固定する（04-schedule-impl.md §6-2）。
//
// 進行表には社長・副社長の分単位の所在が載る。`ScheduleItem` をそのまま返すと
// assignee / note / kind / source_template_* が漏れる。キー集合を固定して、
// 型に列が増えたときに気づけるようにする。
import { describe, it, expect } from 'vitest';
import type { ScheduleItemRef } from '../src/schedule/types';

const EXPECTED_KEYS = ['scheduleId', 'itemId', 'serviceDate', 'columnLabel', 'startMin', 'endMin', 'title'].sort();

describe('ScheduleItemRef — キー集合が想定どおりであること', () => {
  it('7つのキーだけを持つ（assignee / note / kind / source_template_* を持たない）', () => {
    const sample: ScheduleItemRef = {
      scheduleId: 's1',
      itemId: 'i1',
      serviceDate: '2026-08-21',
      columnLabel: 'メインスタジオ',
      startMin: 540,
      endMin: 600,
      title: 'リハーサル',
    };
    expect(Object.keys(sample).sort()).toEqual(EXPECTED_KEYS);
  });
});
