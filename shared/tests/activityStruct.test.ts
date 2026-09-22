/**
 * やり取りの本文の構造を検査する（`shared/services/activity-struct.ts`・migration 188）
 *
 * **なぜここをテストするか**: 中身は AI が組み立てたもので、材料は
 * **取引先が送ってきたメール**です。壊れた形が画面に届くと
 * **React error #31 で画面全体が落ちます**（v3.2.0 で内覧会が真っ白になった事故）。
 * しかも壊れ方は「たまに来るメール」でしか起きないので、目で見つけられません。
 *
 * server は `shared` を import しない構成なので、**server のファイルを直接読みます**。
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeActivityStruct, activityStructLength,
} from '../../server/src/shared/services/activity-struct';

const full = {
  v: 1,
  subtitle: '搬入申請・GMOサイン・掲載ロゴを依頼',
  statuses: [{ label: '撮影決定', tone: 'decided' }, { label: '昇格の判断待ち', tone: 'waiting' }],
  facts: [{ icon: 'date', value: '8/10 5:00–20:00' }, { icon: 'people', value: '技術3 + 管理1' }],
  lead: '先方より撮影決定の確定連絡。**搬入申請は本番の1週間前**までに提出が必要。',
  turns: [
    { side: 'them', name: '露崎様', org: 'エンブレム', at: '7/30 21:54', quote: '「撮影は決定でお願い致します。」', note: '', fields: [] },
    { side: 'us', name: '掛田', org: '当社', at: '7/31 09:34', quote: '', note: '', fields: [{ label: '搬入', value: '1週間前までが理想。' }] },
  ],
};

describe('normalizeActivityStruct', () => {
  it('そろっているものはそのまま通す', () => {
    const s = normalizeActivityStruct(full)!;
    expect(s.v).toBe(1);
    expect(s.subtitle).toBe('搬入申請・GMOサイン・掲載ロゴを依頼');
    expect(s.statuses).toHaveLength(2);
    expect(s.facts[0]).toEqual({ icon: 'date', value: '8/10 5:00–20:00' });
    expect(s.turns).toHaveLength(2);
    expect(s.turns[1].fields[0]).toEqual({ label: '搬入', value: '1週間前までが理想。' });
  });

  it('配列でないもの・null は null（画面は今までどおり body_html に落ちる）', () => {
    expect(normalizeActivityStruct(null)).toBeNull();
    expect(normalizeActivityStruct('文字列')).toBeNull();
    expect(normalizeActivityStruct([{ type: 'text', text: 'RichBlock の配列' }])).toBeNull();
  });

  it('lead も turns も無ければ null（件名だけの記録を「整えた」にしない）', () => {
    // ここを通すと、待ち行列から外れるので**もう二度と整いません**
    expect(normalizeActivityStruct({ subtitle: '副題だけ', statuses: [{ label: '決定', tone: 'decided' }] })).toBeNull();
  });

  it('lead だけでも通す（社内メモ・短い電話）', () => {
    const s = normalizeActivityStruct({ lead: '折り返しの電話。日程は再調整。' })!;
    expect(s.lead).toBe('折り返しの電話。日程は再調整。');
    expect(s.turns).toEqual([]);
  });

  it('知らない tone / icon は既定に倒す（undefined を描かせない）', () => {
    const s = normalizeActivityStruct({
      lead: 'x',
      statuses: [{ label: 'なにか', tone: 'purple' }],
      facts: [{ icon: 'rocket', value: '値' }],
    })!;
    expect(s.statuses[0].tone).toBe('info');
    expect(s.facts[0].icon).toBe('doc');
  });

  it('知らない side は them に倒す（当社の発言として出すほうが取り返しがつかない）', () => {
    const s = normalizeActivityStruct({ turns: [{ side: 'both', quote: 'あ' }] })!;
    expect(s.turns[0].side).toBe('them');
  });

  it('中身が1つも無い発言は捨てる（名前だけの吹き出しを並べない）', () => {
    const s = normalizeActivityStruct({
      lead: 'x',
      turns: [{ side: 'them', name: '露崎様', quote: '', note: '', fields: [] }],
    })!;
    expect(s.turns).toEqual([]);
  });

  it('空文字は null になる（「無い」と「空白」を分けない）', () => {
    const s = normalizeActivityStruct({ lead: 'x', subtitle: '   ', turns: [{ side: 'us', at: '  ', note: 'あり' }] })!;
    expect(s.subtitle).toBeNull();
    expect(s.turns[0].at).toBeNull();
    expect(s.turns[0].name).toBeNull();
  });

  it('文字列以外は捨てる（画面に [object Object] を出さない）', () => {
    const s = normalizeActivityStruct({
      lead: 'x',
      facts: [{ icon: 'date', value: { toString: () => 'わな' } }, { icon: 'date', value: '本物' }],
      statuses: [{ label: 123, tone: 'decided' }],
      turns: [{ side: 'us', note: 'あり', fields: [{ label: '搬入', value: null }, 'ただの文字列'] }],
    })!;
    expect(s.facts).toEqual([{ icon: 'date', value: '本物' }]);
    expect(s.statuses).toEqual([]);
    expect(s.turns[0].fields).toEqual([]);
  });

  it('長すぎるものは切る（1件が画面何枚分にもならないように）', () => {
    const s = normalizeActivityStruct({ lead: 'あ'.repeat(1000), turns: [{ side: 'us', quote: 'い'.repeat(2000) }] })!;
    expect(s.lead!.length).toBe(700);
    expect(s.turns[0].quote!.length).toBe(1_200);
  });

  it('件数の上限を超えたぶんは捨てる', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ icon: 'doc', value: `値${i}` }));
    const s = normalizeActivityStruct({
      lead: 'x',
      facts: many(20),
      statuses: Array.from({ length: 9 }, (_, i) => ({ label: `状態${i}`, tone: 'info' })),
      turns: Array.from({ length: 30 }, () => ({ side: 'us', note: 'あり' })),
    })!;
    // **柵はプロンプトが求める件数よりひと回り大きい**（プロンプトは facts 8件・statuses 6件）。
    // ここを絞ると、長いメールほど静かに中身が落ちる（`activity-struct.ts` の LIMITS のコメント）
    expect(s.facts).toHaveLength(10);
    expect(s.statuses).toHaveLength(8);
    expect(s.turns).toHaveLength(12);
  });

  it('`**強調**` はそのまま残す（画面が <strong> にする）', () => {
    const s = normalizeActivityStruct(full)!;
    expect(s.lead).toContain('**搬入申請は本番の1週間前**');
  });

  it('v は常に 1 に揃える（送られてきた版を信じない）', () => {
    const s = normalizeActivityStruct({ v: 99, lead: 'x' })!;
    expect(s.v).toBe(1);
  });
});

describe('activityStructLength', () => {
  it('null は 0', () => {
    expect(activityStructLength(null)).toBe(0);
  });

  it('引用・補足・項目の文字数を足す（「整えたのに中身が薄い」を数えるため）', () => {
    const s = normalizeActivityStruct({ lead: '12345', turns: [{ side: 'us', quote: '123' }] })!;
    expect(activityStructLength(s)).toBe(8);
  });
});
