/**
 * **数字が嘘になる・記録が別のものに付く**（案件詳細・AI の成果）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * この一群は**それらしい数字が出ます**。だから誰も報告しません:
 *
 * ・やり取りの件数は**どの案件も「20件」**でした（引いているのが 20 件まで）。
 *   「すべて見る（20件）」は**押す前に量を知るための数字**なので、
 *   頭打ちだと「もう全部見た」と思って開かなくなります（実データは 46 件）
 * ・「次にやること」にぶら下がる **①②③ は概要に1つも出ず、数も出ません**でした。
 *   読む人には**やることは1つ**に見えます
 * ・同じ名前の部屋が別の拠点にあると、**押さえた部屋が1つ画面から消え**ました
 * ・AI の成果は **`SUM(DISTINCT 金額)`** で足していたので、
 *   **同じ金額の案件が1件に潰れ**ていました（50万円が3件なら 50万円）
 * ・短い一文を作れなかった印が、**引いたあとに直された本文**に付いていました。
 *   その本文は一度も試していないのに、**二度と短くされません**
 *
 * v4 の PR で指摘された形です（#90 / #97 / #101 / #52 / #87）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNextAction } from '../../client/src/contexts/sales/pages/projectDetail/thread/nextAction';
import { venuesOf, venueSummary } from '../../client/src/contexts/sales/pages/projectDetail/venue';
import { parseNoteText } from '../src/client-v4/noteText';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const DETAIL = read('client', 'src', 'contexts', 'sales', 'pages', 'ProjectDetailPage.tsx');
const OVERVIEW = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'OverviewTab.tsx');
const DIGEST = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'ThreadDigest.tsx');
/**
 * **説明文を外してから探す。** この製品は「前の版がどう間違っていたか」を
 * コードのすぐ横に書き残す決めごとなので、素の文字列検索だと
 * **注釈に書いた古い形**に当たって、直っているのに落ちます
 * （`droppedColumns.test.ts` が SQL の `--` を落としているのと同じ理由）。
 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FEEDBACK = code(read('server', 'src', 'shared', 'services', 'ai-feedback.service.ts'));
const SHORT = code(read('server', 'src', 'contexts', 'sales', 'services', 'next-action-short.service.ts'));

/** 本番データの形（改行 ＋ 行の中に並ぶ丸数字）。この PR の材料そのもの */
const REAL = `★8/14(金)までに 8/28分の備品レンタル発注可否を確定し発注する(発注期日 8/19)。
①金子様からの酒樽設置台2台の可否・金額の回答を確認し、発注内容に含める ②★パーテーション等の追加要否・数量を確定 ③搬出時刻を一本化する`;

describe('「次にやること」を1件にまとめない', () => {
  it('改行があっても、行の中の丸数字を拾う', () => {
    // 前の版は「改行があれば行ごとに分ける」で打ち切っており、
    // **①②③ が1行に並んでいる回はまるごと1件**になっていた
    const p = parseNextAction(REAL);
    expect(p.items).toHaveLength(3);
    expect(p.items.map((i) => i.marker)).toEqual(['①', '②', '③']);
    expect(p.headline.startsWith('★8/14(金)までに')).toBe(true);
    // **1文字も捨てない**（見出しと項目を繋ぎ直せば元に戻る）
    expect(p.items[2].text).toBe('搬出時刻を一本化する');
  });

  it('行ごとに分けられるものは今までどおり', () => {
    const p = parseNextAction('見積を出す\n・先方に電話する\n・図面を送る');
    expect(p.headline).toBe('見積を出す');
    expect(p.items.map((i) => i.text)).toEqual(['先方に電話する', '図面を送る']);
  });

  it('⚠️ 数の頭のマイナスを印として食わない', () => {
    // 前の版は `-10万円` の `-` を行頭の印として落とし、
    // **「-10万円で調整」が「10万円で調整」**になっていた（符号が逆の金額が画面に出る）
    const p = parseNextAction('値引きの相談\n-10万円で調整する\n・先方に連絡');
    expect(p.items.map((i) => i.text)).toContain('-10万円で調整する');
    expect(p.items.map((i) => i.text)).not.toContain('10万円で調整する');
  });

  it('概要は「ほか N 件」を出す（帯に出せないものを黙らせない）', () => {
    expect(OVERVIEW).toMatch(/const subTasks = nextAction \? parseNextAction\(nextAction\.next_action\)\.items\.length : 0;/);
    expect(OVERVIEW).toMatch(/ほか <span className="font-number">\{subTasks\}<\/span> 件（全部読む）/);
  });
});

describe('鉤括弧で始まる文が、あとの行を飲み込まない', () => {
  it('行の中で閉じているものは引用にしない', () => {
    // 前の版は「行頭が `「` で行末が `」` でなければ複数行の引用」だったので、
    // **そのあとの行が全部その引用に飲まれて**いた
    const blocks = parseNoteText('「至急」対応をお願いします。詳細は明日ご連絡します。\n・見積を送る\n→ 先方の回答待ち');
    expect(blocks.map((b) => b.type)).toEqual(['text', 'bullets', 'note']);
  });

  it('本当の複数行の引用は今までどおり引用にする', () => {
    const blocks = parseNoteText('「本件は来週まで待ってください。\n先方の決裁が下りていません」\n・こちらは待ち');
    expect(blocks.map((b) => b.type)).toEqual(['quote', 'bullets']);
  });

  it('1行で閉じている引用も今までどおり', () => {
    const blocks = parseNoteText('「来週中にご返答します」');
    expect(blocks.map((b) => b.type)).toEqual(['quote']);
  });
});

describe('押さえた部屋を消さない', () => {
  const bookings = [{
    rooms: [
      { room_id: 'room-x1', room_name: '第1スタジオ', location_abbreviation: null },
      { room_id: 'room-y1', room_name: '第1スタジオ', location_abbreviation: null },
    ],
  }];

  it('別の拠点の同じ名前の部屋を1つに潰さない', () => {
    // 略称を決めていない拠点どうしだと**画面上の名前がまったく同じ**になる。
    // 名前で重複を除くと、**押さえた部屋が1つ消える**（そして何も出ない）
    expect(venuesOf(bookings)).toHaveLength(2);
    expect(venueSummary(bookings)).toEqual({ first: '第1スタジオ', extra: 1, unit: '室' });
  });

  it('同じ部屋を本番とリハで押さえたときは1つに数える（今までどおり）', () => {
    const same = [
      { rooms: [{ room_id: 'room-x1', room_name: '第1スタジオ' }] },
      { rooms: [{ room_id: 'room-x1', room_name: '第1スタジオ' }] },
    ];
    expect(venuesOf(same)).toHaveLength(1);
  });

  it('外現場のメモは文字で数える（id を持たない）', () => {
    const out = venuesOf([{ rooms: [], location_note: '幕張メッセ' }, { rooms: [], location_note: '幕張メッセ' }]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('place');
  });
});

describe('やり取りの件数は総数で出す', () => {
  it('`pagination.total` を読む（並んだ行を数えない）', () => {
    expect(DETAIL).toMatch(/const activityTotal = activities\.data\?\.pagination\?\.total \?\? activities\.data\?\.data\?\.length;/);
    expect(DETAIL).toMatch(/thread: activityTotal,/);
    expect(OVERVIEW).toMatch(/すべて見る（\{activityTotal \?\? activities\.length\}件）/);
  });

  it('やり取りの日付を読み上げから外さない', () => {
    // 前の版は枠ごと `aria-hidden` で、**いつのやり取りか分からないまま本文だけ**が読まれた
    expect(DIGEST).toMatch(/<time\s/);
    expect(DIGEST).toMatch(/aria-label=\{a\.activity_date/);
    expect(DIGEST).not.toMatch(/className="flex w-11 shrink-0 flex-col items-end" aria-hidden="true"/);
  });
});

describe('AI の成果の金額', () => {
  it('同じ金額の案件を1件に潰さない', () => {
    // 実測: 50万円の受注が3件あるとき、前の版は **50万円**（この版は 180万円）
    expect(FEEDBACK).not.toMatch(/SUM\(DISTINCT p\.expected_amount\)/);
    expect(FEEDBACK).toMatch(/SELECT DISTINCT p\.id, p\.stage,/);
    expect(FEEDBACK).toMatch(/AS one_row_per_project/);
  });

  it('受注額は確定売上で数え、見込みで数えた件数を書く', () => {
    // `expected_amount` は**起票のときの見込み**で、受注しても更新されない
    // （更新**しない**のが正しい — 上書きすると比べる相手が消える）
    expect(FEEDBACK).toMatch(/COALESCE\(NULLIF\(r\.confirmed, 0\), p\.expected_amount, 0\) AS amount/);
    expect(FEEDBACK).toMatch(/won_without_revenue/);
    expect(FEEDBACK).toMatch(/起票時の見込みで数えている/);
  });
});

describe('短くできなかった印を、別の本文に付けない', () => {
  it('失敗の書き込みも本文が一致するときだけ', () => {
    // 印のある行は待ち行列から外れるので、**一度も試していない本文が
    // 二度と短くされない**（画面には長い原文が出たまま・失敗も出ない）
    const at = SHORT.indexOf('next_action_short_error = ?\n');
    expect(at).toBeGreaterThan(0);
    expect(SHORT.slice(at, at + 200)).toMatch(/WHERE id = \? AND btrim\(next_action\) = \?/);
  });
});
