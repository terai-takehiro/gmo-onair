/**
 * AI の出力の検査（やり取りの整形と KPT の下書き）
 *
 * ── なぜ試すのか ────────────────────────────────────────────
 *
 * どちらも **AI が出したものをそのまま信じない**ための関門です。
 * ネットワークにも DB にも触らないので素で試せます。
 *
 * ここが緩むと:
 *   ・整形 … 期限だけが入った「次にやること」が画面のどこにも出ない行になる
 *   ・KPT  … 同じ行が何件も並ぶ／1件が長すぎて誰も読まない
 */
import { describe, it, expect } from 'vitest';
import { normalizeActivity } from '../../server/src/contexts/sales/services/activity-ai.service';
import { normalizeKpt, buildSourceText } from '../../server/src/contexts/sales/services/kpt-ai.service';

describe('normalizeActivity — 件名', () => {
  it('AI の件名をそのまま使う', () => {
    expect(normalizeActivity({ subject: '配信の回線を確認' }, '原文').subject).toBe('配信の回線を確認');
  });
  it('空なら**原文の1行目**で埋める（一覧が「無題」だらけにならない）', () => {
    expect(normalizeActivity({ subject: '' }, '  \n回線の件で電話\n金額は追って').subject).toBe('回線の件で電話');
  });
  it('原文も空なら決まった文字を入れる', () => {
    expect(normalizeActivity({}, '   ').subject).toBe('やり取りの記録');
  });
});

describe('normalizeActivity — 次にやること', () => {
  it('日付は YYYY-MM-DD のときだけ通す', () => {
    expect(normalizeActivity({ next_action: '見積を送る', next_action_date: '2026-10-03' }, 'x').nextActionDate).toBe('2026-10-03');
    expect(normalizeActivity({ next_action: '見積を送る', next_action_date: '来週' }, 'x').nextActionDate).toBeNull();
    expect(normalizeActivity({ next_action: '見積を送る', next_action_date: '2026/10/03' }, 'x').nextActionDate).toBeNull();
  });
  it('**やることが無いのに期限だけ残さない**（画面のどこにも出ない行になる）', () => {
    const r = normalizeActivity({ next_action: '', next_action_date: '2026-10-03' }, 'x');
    expect(r.nextAction).toBeNull();
    expect(r.nextActionDate).toBeNull();
  });
});

describe('normalizeActivity — 本文と要点', () => {
  it('本文はサニタイズを通る（属性は残らない）', () => {
    const r = normalizeActivity({ body_html: '<p onclick="alert(1)">本文</p>' }, 'x');
    expect(r.bodyHtml).toBe('<p>本文</p>');
  });
  it('本文が無ければ null（空の枠を保存しない）', () => {
    expect(normalizeActivity({ body_html: '' }, 'x').bodyHtml).toBeNull();
    expect(normalizeActivity({}, 'x').bodyHtml).toBeNull();
  });
  it('要点は4件まで（画面のチップが折り返さない数）', () => {
    const r = normalizeActivity({ key_points: ['1', '2', '3', '4', '5'] }, 'x');
    expect(r.keyPoints).toEqual(['1', '2', '3', '4']);
  });
  it('文字列以外の要点は落とす', () => {
    expect(normalizeActivity({ key_points: ['ok', { t: 1 }, null] }, 'x').keyPoints).toEqual(['ok']);
  });
});

describe('normalizeKpt', () => {
  it('3枠それぞれを取り出す', () => {
    const r = normalizeKpt({ keep: ['続ける'], problem: ['困った'], try: ['試す'] });
    expect(r).toEqual({ keep: ['続ける'], problem: ['困った'], try: ['試す'] });
  });
  it('配列でないものは空（AI が文字列で返しても落ちない）', () => {
    expect(normalizeKpt({ keep: '続ける' }).keep).toEqual([]);
    expect(normalizeKpt(null)).toEqual({ keep: [], problem: [], try: [] });
  });
  it('同じ行は1つにする（AI は言い回しを変えて同じことを2回書く）', () => {
    expect(normalizeKpt({ keep: ['同じ', '同じ'] }).keep).toEqual(['同じ']);
  });
  it('枠ごと4件まで（多いと人が読まない）', () => {
    expect(normalizeKpt({ problem: ['1', '2', '3', '4', '5'] }).problem).toHaveLength(4);
  });
  it('改行と連続した空白は畳む', () => {
    expect(normalizeKpt({ try: ['見積は\n  分けて出す'] }).try).toEqual(['見積は 分けて出す']);
  });
  it('空文字は落とす', () => {
    expect(normalizeKpt({ keep: ['', '  ', '残る'] }).keep).toEqual(['残る']);
  });
});

describe('buildSourceText — AI に渡す材料', () => {
  const base = {
    projectName: '記念式典', customerName: 'GMO', eventStart: '2026-10-01', eventEnd: '2026-10-01',
    activities: [], minutes: [], lateTasks: [],
  };

  it('やり取り・議事録・遅れたタスクを見出しごとに並べる', () => {
    const t = buildSourceText({
      ...base,
      activities: [{ activity_date: '2026-09-30', activity_type: 'call', subject: '回線の確認', description: '予備を入れる' }],
      minutes: [{ met_on: '2026-09-28', title: '事前打合せ', summary: '香盤の確認', decisions: [{ text: '2カメで行く' }], open_items: [{ text: '素材の受領' }] }],
      lateTasks: [{ title: '見積を送る', due_date: '2026-09-25', is_completed: false }],
    });
    expect(t).toContain('## やり取り');
    expect(t).toContain('回線の確認');
    expect(t).toContain('決定: 2カメで行く');
    expect(t).toContain('持ち帰り: 素材の受領');
    expect(t).toContain('見積を送る 期限 2026-09-25 （期限を過ぎたまま）');
  });

  it('遅れて完了したタスクは「遅れて完了」と書く（期限切れのままとは別のこと）', () => {
    const t = buildSourceText({ ...base, lateTasks: [{ title: '台本を出す', due_date: '2026-09-20', is_completed: true }] });
    expect(t).toContain('（遅れて完了）');
  });

  it('材料が無くても壊れない（見出しだけが並ぶ）', () => {
    expect(() => buildSourceText(base)).not.toThrow();
  });

  it('**長すぎる材料は途中で止める**（AI に上限を超えて投げない）', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      activity_date: '2026-09-30', activity_type: 'call',
      subject: `件名${i}`, description: 'あ'.repeat(400),
    }));
    const t = buildSourceText({ ...base, activities: many });
    expect(t.length).toBeLessThan(26_000);
  });
});
