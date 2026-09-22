/**
 * **ストックは見送りではない**（入ってきた情報・migration 247）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 「あとで効く話ならストックして」と画面が謳っているのに、
 * ストックしたものを戻す仕掛けが**1つもありません**でした
 * （見直す日も通知も週報への反映も無し）。つまり `stock` と `dropped` は
 * **名前が違うだけの同じ穴**でした（ユーザー報告
 * 「結局何をしたいのかわからないアプリになってる」の中身の1つ）。
 *
 * 直したあとに壊れやすいのは、**日付の境目**です:
 * ・今日ちょうどが見直しの日 → 出るのか出ないのか
 * ・見直す日を決めていない → 出るのか出ないのか
 * ・1/31 の1か月後 → 2/31 は存在しない
 *
 * どれも画面を開いても確かめられません（その日にならないと再現しない）。
 * `shared/src/utils/inboxDesk.ts` に純粋な関数として出してあるので、ここで固定します。
 *
 * ⚠️ **サーバー側は同じ規則を SQL で書いています**
 * （`inbox.service.ts` の `DESK_COND`）。**片方だけ直すと、画面の件数と
 * ホームのバッジが食い違います。**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addMonthsIso, daysBetweenIso, defaultStockReviewOn, deskSummary,
  isStockReviewDue, jaMd, stockReviewNote, STOCK_REVIEW_DEFAULT_MONTHS,
} from '../src/utils/inboxDesk';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('ストックの見直し期限', () => {
  it('決めていない（空）ものは机に出す', () => {
    // ⚠️ ここが要。空を「まだ出さない」にすると、migration 247 を入れる前と
    // 同じ行き止まり（ストック＝見送り）に戻る
    expect(isStockReviewDue(null, '2026-08-31')).toBe(true);
    expect(isStockReviewDue(undefined, '2026-08-31')).toBe(true);
    expect(isStockReviewDue('', '2026-08-31')).toBe(true);
  });

  it('今日ちょうどは「来ている」', () => {
    // 「その日に見る」ためのものなので、当日に出ないと1日ずれる
    expect(isStockReviewDue('2026-08-31', '2026-08-31')).toBe(true);
  });

  it('過ぎたものは出る・まだのものは出ない', () => {
    expect(isStockReviewDue('2026-08-30', '2026-08-31')).toBe(true);
    expect(isStockReviewDue('2026-09-01', '2026-08-31')).toBe(false);
  });
});

describe('見直す日の既定（1か月後）', () => {
  it('月末は詰める（1/31 の1か月後は 2/28）', () => {
    // 詰めないと 2/31 という日付ができ、DB に入れた瞬間に弾かれる
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    // うるう年
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('年をまたぐ', () => {
    expect(addMonthsIso('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsIso('2026-10-31', 3)).toBe('2027-01-31');
  });

  it('既定は1か月後', () => {
    expect(STOCK_REVIEW_DEFAULT_MONTHS).toBe(1);
    expect(defaultStockReviewOn('2026-08-31')).toBe(addMonthsIso('2026-08-31', 1));
    expect(defaultStockReviewOn('2026-08-31')).toBe('2026-09-30');
  });

  it('日数の差は現地時刻に依らない', () => {
    // `new Date('2026-08-31')` は UTC の真夜中。現地時刻で数えると
    // 日本時間の午前中に1日ずれる
    expect(daysBetweenIso('2026-08-31', '2026-09-30')).toBe(30);
    expect(daysBetweenIso('2026-08-31', '2026-08-29')).toBe(-2);
    expect(daysBetweenIso('2026-08-31', '2026-08-31')).toBe(0);
  });
});

describe('行に出す一言（色だけに頼らない）', () => {
  it('期限を越えたものは「◯日超過」まで書く', () => {
    // 「見直し 8/29」だけだと、それが過去か未来かを読む人が毎回引き算する
    const n = stockReviewNote('2026-08-29', '2026-08-31');
    expect(n.tone).toBe('due');
    expect(n.text).toContain('2日超過');
    expect(n.days).toBe(-2);
  });

  it('今日・近い・先・決めていない を言い分ける', () => {
    expect(stockReviewNote('2026-08-31', '2026-08-31').text).toBe('本日が見直し日です');
    expect(stockReviewNote('2026-09-03', '2026-08-31')).toMatchObject({ tone: 'soon', days: 3 });
    expect(stockReviewNote('2026-11-30', '2026-08-31').tone).toBe('later');
    expect(stockReviewNote(null, '2026-08-31')).toMatchObject({ tone: 'undecided', days: null });
    expect(stockReviewNote(null, '2026-08-31').text).toBe('見直し日が未設定です');
  });

  it('日付は 9/30 の形（0 を付けない）', () => {
    expect(jaMd('2026-09-05')).toBe('9/5');
  });
});

describe('「本日対応」の見出し', () => {
  it('内訳を分けて書く', () => {
    // 未仕分け 0・見直し 5 のとき「5件」とだけ出すと、
    // 今日届いたものが5件あるように読める
    expect(deskSummary(0, 5)).toBe('本日対応 5件（見直し時期 5件）');
    expect(deskSummary(3, 5)).toBe('本日対応 8件（未処理 3件 ・ 見直し時期 5件）');
    expect(deskSummary(3, 0)).toBe('本日対応 3件（未処理 3件）');
  });

  it('0 のときは「ありません」と言い切る（0件と書かない）', () => {
    expect(deskSummary(0, 0)).toBe('本日対応する項目はありません');
  });
});

describe('画面とサーバーが同じ規則で数えている', () => {
  it('サーバーの SQL も「空 または 今日以前」で拾う', () => {
    // ⚠️ 片方だけ直すと、画面の見出しとホームのバッジが食い違う
    const svc = read('server', 'src', 'contexts', 'dailyops', 'services', 'inbox.service.ts');
    expect(svc).toMatch(/const DESK_COND = /);
    expect(svc).toContain('i.stock_review_on IS NULL OR i.stock_review_on <= ${TODAY_JST}');
    // ⚠️ **`CURRENT_DATE` は使わない** — DB のタイムゾーンは UTC なので、
    // 日本時間の 00:00〜09:00 はまだ「前日」を返す（朝いちばんに机へ出ない）
    expect(svc).toMatch(/TODAY_JST = `\(NOW\(\) AT TIME ZONE 'Asia\/Tokyo'\)::date`/);
    expect(svc).not.toContain('<= CURRENT_DATE');
    // ホームのタイル・バッジが読む件数も同じ条件で数える
    const at = svc.indexOf('async unhandledCount()');
    expect(at).toBeGreaterThan(-1);
    expect(svc.slice(at, at + 400)).toContain('${DESK_COND}');
  });

  it('チケット・案件にしたら見直す日は消す', () => {
    // 片づいた仕事が1か月後にまた机へ出ると、やり直しに見える
    const svc = read('server', 'src', 'contexts', 'dailyops', 'services', 'inbox.service.ts');
    expect(svc).toMatch(/state = 'ticket'[\s\S]{0,200}stock_review_on = NULL/);
    expect(svc).toMatch(/state = 'project'[\s\S]{0,200}stock_review_on = NULL/);
  });

  it('一覧は上限つき・件数は別に数える（数えていない総数を作らない）', () => {
    const svc = read('server', 'src', 'contexts', 'dailyops', 'services', 'inbox.service.ts');
    expect(svc).toMatch(/INQUIRY_LIST_LIMIT_DEFAULT = 50/);
    expect(svc).toMatch(/LIMIT \$\{limit\} OFFSET \$\{offset\}/);
    expect(svc).toMatch(/async counts\(\)/);

    const routes = read('server', 'src', 'contexts', 'dailyops', 'routes', 'inbox.routes.ts');
    // ⚠️ `/inquiries/counts` は `/inquiries/:id` より前に置く（後ろだと id 扱いになる）
    const countsAt = routes.indexOf("router.get('/inquiries/counts'");
    const idAt = routes.indexOf("router.get('/inquiries/:id'");
    expect(countsAt).toBeGreaterThan(-1);
    expect(idAt).toBeGreaterThan(-1);
    expect(countsAt).toBeLessThan(idAt);
  });
});
