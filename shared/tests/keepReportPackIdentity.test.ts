/**
 * 定例報告パックの「中身が同じか」（server/src/contexts/dailyops/services/keep-pack-identity.ts）
 *
 * 凍結の束ね方を固定する: 同じ会議日の凍結が 60 秒以内に 2 回来ても、**中身が同じときだけ**
 * 1 行にまとめる。jsonb が鍵の並びを変えて返しても「同じ」と分かり、数字が 1 円でも動けば
 * 「違う」と分かること。
 */
import { describe, it, expect } from 'vitest';
import { canonicalJson, samePackContent, PACK_VOLATILE_KEYS } from '../../server/src/contexts/dailyops/services/keep-pack-identity';
import sample from '../../server/src/contexts/dailyops/services/__fixtures__/keep-pack.sample.json';

/** PostgreSQL の jsonb と同じく、鍵の並びを変えた写しを作る（長さ順→辞書順） */
function reorderLikeJsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderLikeJsonb);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = reorderLikeJsonb(obj[k]);
    return out;
  }
  return value;
}

describe('canonicalJson', () => {
  it('鍵の並びが違っても同じ文字列になる', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it('undefined の値は JSON.stringify と同じく落とす・配列の中は null になる', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });
});

describe('samePackContent（凍結の束ね方）', () => {
  const pack = sample as unknown as Record<string, unknown>;

  it('jsonb から読み戻した並びでも「同じ」', () => {
    expect(samePackContent(pack, reorderLikeJsonb(pack))).toBe(true);
  });

  it('凍結のたびに変わる時刻（generated_at / frozen_at）は見ない', () => {
    expect(PACK_VOLATILE_KEYS).toEqual(['generated_at', 'frozen_at']);
    const later = { ...pack, generated_at: '2099-01-01T00:00:00.000Z', frozen_at: '2099-01-01T00:00:01.000Z' };
    expect(samePackContent(pack, later)).toBe(true);
  });

  it('数字が 1 円でも動けば「違う」（数字を直してすぐ確定し直した版を捨てない）', () => {
    const edited = JSON.parse(JSON.stringify(pack)) as { landing: { all: { lines: { actual: number }[] } } };
    edited.landing.all.lines[0].actual += 1;
    expect(samePackContent(pack, edited)).toBe(false);
  });

  it('ヨミ表の行が増えれば「違う」', () => {
    const edited = JSON.parse(JSON.stringify(pack)) as { pipeline: { external: unknown[] } };
    edited.pipeline.external.push({ project_id: 'x', project_name: '追加' });
    expect(samePackContent(pack, edited)).toBe(false);
  });
});
