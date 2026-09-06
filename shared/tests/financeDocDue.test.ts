/**
 * **受領書類は「払う前に確かめる机」**（⑥ 受領書類・migration 247）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * ① **支払期日**: 請求書の一覧なのに `08/20` と出るだけで、過ぎているのか
 *    明日なのかは読む人の引き算に任されていました（ユーザー報告
 *    「結局何をしたいのかわからないアプリになってる」）。
 *    日付の境目（今日ちょうど・月またぎ・期日なし）は**その日にならないと
 *    再現しない**ので、画面を開いても確かめられません。
 * ② **押せるのに 403**: 「仕入・販管費に登録」は画面が
 *    `sales:editor || dailyops:editor` で出していたのに、API は
 *    `sales:editor` だけを通します。**`dailyops` だけの人にはボタンが見えて、
 *    押せて、403** でした（`shared/tests/clickable403.test.ts` と同じ形。
 *    型検査にも lint にも出ないので、機械に見させるしかない）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  daysBetween, docTrail, dueState, md, DUE_SOON_DAYS,
} from '../../client/src/contexts/finance/pages/documents/due';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('支払期日の急ぎ具合', () => {
  it('過ぎた・今日・3日以内・先 を言い分ける', () => {
    expect(dueState('2026-08-29', '2026-08-31')).toMatchObject({ tone: 'overdue', days: -2 });
    expect(dueState('2026-08-31', '2026-08-31')).toMatchObject({ tone: 'today', days: 0 });
    expect(dueState('2026-09-03', '2026-08-31')).toMatchObject({ tone: 'soon', days: 3 });
    // 段の境目のすぐ外
    expect(dueState('2026-09-04', '2026-08-31')).toMatchObject({ tone: 'later', days: 4 });
    expect(DUE_SOON_DAYS).toBe(3);
  });

  it('色だけに頼らない — 文字にも残り日数を書く', () => {
    expect(dueState('2026-08-29', '2026-08-31').text).toBe('8/29（2日超過）');
    expect(dueState('2026-08-31', '2026-08-31').text).toBe('8/31（今日）');
    expect(dueState('2026-09-02', '2026-08-31').text).toBe('9/2（あと2日）');
    // 先のものは日付だけ（急がないものに毎回「あと62日」と書かない）
    expect(dueState('2026-11-01', '2026-08-31').text).toBe('11/1');
  });

  it('期日が無い書類を「急がない」と言わない', () => {
    // AI が読み取れなかっただけかもしれない。黙って空欄にすると
    // 期日の無い請求書が一覧のいちばん下で忘れられる
    expect(dueState(null, '2026-08-31')).toMatchObject({ tone: 'none', text: '期日なし', days: null });
    expect(dueState('2026/08/31', '2026-08-31').tone).toBe('none');
  });

  it('日数の差は現地時刻に依らない', () => {
    // `new Date('2026-08-31')` は UTC の真夜中。現地時刻で数えると
    // 日本時間の午前中に1日ずれる
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(md('2026-09-05')).toBe('9/5');
  });
});

describe('書類の経緯（誰がいつ）', () => {
  it('AI が取り込んだものと人が登録したものを言い分ける', () => {
    expect(docTrail({ is_ai: true, created_at: '2026-07-20T02:00:00.000Z' }))
      .toEqual(['AI が取り込み 7/20']);
    expect(docTrail({ is_ai: false, created_by_name: '寺井 赳博', created_at: '2026-07-20T02:00:00.000Z' }))
      .toEqual(['寺井 赳博 が登録 7/20']);
  });

  it('台帳に入れた人と日も出す', () => {
    expect(docTrail({
      is_ai: true, created_at: '2026-07-20T02:00:00.000Z',
      processed_by: '経理 花子', processed_at: '2026-07-25T02:00:00.000Z',
    })).toEqual(['AI が取り込み 7/20', '経理 花子 が台帳に入れました 7/25']);
  });

  it('分からないところは書かない（「不明」で埋めない）', () => {
    // 記録が無いことと「不明という人が触った」ことの区別が付かなくなる
    expect(docTrail({})).toEqual([]);
    expect(docTrail({ is_ai: false, created_by_name: null, created_at: null })).toEqual([]);
  });
});

describe('押せるのに 403 にしない（受領書類）', () => {
  it('「仕入・販管費に登録」は sales の editor にだけ出す', () => {
    // 2026-09（migration 280）: 一覧を「ひとつづり」で出すようにしたので、
    // **権限の判定は画面（DocumentsPage）・出し分けはカード（GroupCard）**に分かれた。
    // どちらが欠けても「押せるのに 403」に戻るので、両方見る
    const page = read('client', 'src', 'contexts', 'finance', 'pages', 'DocumentsPage.tsx');
    const card = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'GroupCard.tsx');
    // 確かめる（確認する / 承認 / 却下）は dailyops でも通る = `canReview`
    expect(page).toMatch(/canReview = hasPermission\('sales', 'editor'\) \|\| hasPermission\('dailyops', 'editor'\)/);
    // 台帳に書くのは sales だけ = `canLedger`
    expect(page).toMatch(/canLedger = hasPermission\('sales', 'editor'\)/);
    // 出し分けている（1つの `canEdit` に戻すと、また 403 になる）
    expect(card).toMatch(/doc\.status === 'approved' && doc\.doc_type !== 'quote' && \(a\.canLedger \? \(/);
    expect(card).toMatch(/\{a\.canLedger && \(/);
    // 出さない人には**誰に頼めばよいか**を書く（黙って消すと「機能が無い」に見える）
    // 2026-09-05: 操作名を「台帳に入れる」→「仕入・販管費に登録」に統一した
    // （同じ操作が「台帳に入れる／仕入に入れる／処理完了」の3表記だったため）。
    // **誰に頼めばよいかを書く**という趣旨は変えていない
    expect(card).toContain('仕入・販管費に登録するのは財務の担当者です');
    // **見積書には登録ボタンを出さない**（migration 280 で一覧に出るようになったぶん、
    // 押せない理由を書く。押せるボタンを出して 400 にするのは同じ形の失敗）
    expect(card).toContain('見積書は仕入・販管費に入れられません');

    // サーバー側が sales:editor を要求していることも一緒に見る（緩めたら画面も見直す）
    const routes = read('server', 'src', 'contexts', 'dailyops', 'routes', 'inbox.routes.ts');
    expect(routes).toMatch(/ledgerWrite = \[requireAuth, requirePermission\('sales', 'editor'\)\]/);
    expect(routes).toMatch(/router\.post\('\/finance-docs\/:id\/handoff', \.\.\.ledgerWrite/);
    expect(routes).toMatch(/router\.post\('\/finance-docs\/:id\/handoff\/undo', \.\.\.ledgerWrite/);
  });

  it('✨ は `source` ではなく `ai_outputs` から求める', () => {
    // `source` は出どころ（メール／手入力）であって「誰が入れたか」ではない。
    // 手で足したメールの行に嘘の ✨ が付いていた（入ってきた情報は
    // migration 171 で直っており、書類側だけ取り残されていた）
    const card = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'GroupCard.tsx');
    expect(card).toMatch(/doc\.is_ai && </);
    expect(card).not.toMatch(/doc\.source === 'email'/);

    const svc = read('server', 'src', 'contexts', 'dailyops', 'services', 'inbox.service.ts');
    expect(svc).toMatch(/o\.target_table = 'finance_docs'[\s\S]{0,120}o\.kind = 'finance_doc_intake'/);
  });

  it('却下した書類に辿り着ける（片づいたものの束に残る）', () => {
    /*
      一覧の既定は「片づいていない」で、その条件が 登録済 と 却下 を外している。
      **辿り着く道が1本も無いと、間違えて却下したものは画面から二度と見えない。**

      2026-09（migration 280）で一覧を「ひとつづり」にしたので、道の作り方が変わった:
      以前は「却下」チップ、いまは **`settled`（中の書類が全部 登録済/却下）の束**を
      「片づいたもの」チップで出し、**カードの中に却下した書類がそのまま並ぶ**。
      そこから「受信に戻す」を押せる。
    */
    const page = read('client', 'src', 'contexts', 'finance', 'pages', 'DocumentsPage.tsx');
    expect(page).toMatch(/\{ key: 'settled', label: '片づいたもの'/);
    expect(page).toMatch(/chip === 'settled'\) return all\.filter\(\(g\) => g\.settled\)/);

    const card = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'GroupCard.tsx');
    expect(card).toMatch(/doc\.status === 'rejected' && \(/);
    expect(card).toContain('受信に戻す');

    // サーバー側も「全部 登録済/却下 なら片づき」で数えている（片方だけ直すと
    // チップの件数と中身が食い違う）
    const svc = read('server', 'src', 'contexts', 'dailyops', 'services', 'finance-doc-chain.service.ts');
    expect(svc).toMatch(/d\.status === 'processed' \|\| d\.status === 'rejected'/);
  });

  it('並びは支払期日が近い順（状態より先）', () => {
    // 以前は状態が第1キーで、**明日が期日の承認済みより、期日が2か月先の受信**が
    // 上に来ていた
    const svc = read('server', 'src', 'contexts', 'dailyops', 'services', 'inbox.service.ts');
    const at = svc.indexOf('ORDER BY COALESCE(d.payment_due, d.received_at) ASC NULLS LAST');
    expect(at).toBeGreaterThan(-1);
    expect(svc.slice(at, at + 200)).toContain('CASE d.status');
  });
});
