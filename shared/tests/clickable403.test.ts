/**
 * **押せるのに 403 にしない**（v4 の決めごと）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 「ボタンは出るが押すと 403」は、**押した人には『壊れている』としか見えません**。
 * しかも**型検査にも lint にも出ません** — 画面は権限を知らずにボタンを描けますし、
 * サーバーは正しく断っているので、どちらにも間違いが無いように見えます。
 * 気づけるのは、その権限の人が実際に押したときだけです。
 *
 * v4 の PR には**この形の指摘が繰り返し付いています**（#55 / #58 / #60 / #102 / #103）。
 * 出す条件とサーバーが要求するものが**別々の場所にある**限り、また離れます。
 * せめて「離れたら落ちる」ところまでは機械に見させます。
 *
 * ⚠️ **ここで見るのは「出す側が権限を見ているか」だけ**です。権限の中身が
 * 正しいかは実サーバーで測るしかありません（この版でも4通り測っています）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('押せるのに 403 にしない', () => {
  it('請求書・検収書 PDF は sales か budget のどちらかで出せる', () => {
    // ⑤ 見積・請求（全案件）は `sales` でも開ける画面なのに、この口だけ
    // `budget` を要求していたので、**`sales` だけの人は押すと必ず 403** だった
    const src = read('server', 'src', 'contexts', 'finance', 'routes', 'revenues.routes.ts');
    const pdfAt = src.indexOf("router.get('/:id/pdf'");
    const gateAt = src.indexOf("router.use(requireAuth, requirePermission('budget'))");
    expect(pdfAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    // ⚠️ 全体のゲートより**前**にあること（後ろに戻すと budget 必須に戻る）
    expect(pdfAt).toBeLessThan(gateAt);
    expect(src.slice(pdfAt, pdfAt + 200)).toContain("requireAnyPermission(['sales', 'budget'])");
    // BOX に置くほうも両方の editor で通す（出せるのに毎回「保存されませんでした」にしない）
    expect(src).toMatch(/canStore = meetsPermissionLevel\([^)]*budget[^)]*\)\s*\n\s*\|\| meetsPermissionLevel\([^)]*sales/);
  });

  it('わたしのタスクの四角は dailyops の editor にだけ出す', () => {
    // 一覧を読む口は reader で通るので、reader にもこのカードは出る。
    // 四角まで出すと `PATCH /dailyops/tasks/:id` が editor を要求して 403 になる
    const card = read('client', 'src', 'contexts', 'platform', 'pages', 'home', 'MyTasksCard.tsx');
    expect(card).toMatch(/canComplete = hasPermission\('dailyops', 'editor'\)/);
    expect(card).toMatch(/\{canComplete && \(/);

    const routes = read('server', 'src', 'contexts', 'dailyops', 'routes', 'tasks.routes.ts');
    // サーバー側が editor を要求していることも一緒に見る（緩めたら画面の条件も見直す）
    expect(routes).toMatch(/router\.patch\('\/tasks\/:id', \.\.\.canEdit/);
    expect(routes).toMatch(/canEdit = \[requireAuth, requirePermission\('dailyops', 'editor'\)\]/);
  });

  it('タスク一覧へのリンクは sales を持つ人にだけ出す', () => {
    // 行き先（全案件タスク一覧）は `sales` を要求するので、`dailyops` だけの人は
    // タスクを見ているのに押すと「権限がありません」の画面に着いていた
    const card = read('client', 'src', 'contexts', 'platform', 'pages', 'home', 'MyTasksCard.tsx');
    expect(card).toMatch(/canOpenList = hasPermission\('sales'\)/);
    expect(card).toMatch(/\{canOpenList && \(/);

    // 同じ行き先がトップページにもある（**2か所とも直す** — 片方だけだと残る）
    const home = read('client', 'src', 'contexts', 'platform', 'pages', 'HomePage.tsx');
    expect(home).toMatch(/\{canSeeDailyops && canSeeSales && !isMobile && \(/);

    const app = read('client', 'src', 'App.tsx');
    expect(app).toMatch(/path="\/sales\/tasks\/:view" element=\{<PermissionRoute module="sales">/);
  });

  it('受信箱は sales か dailyops のどちらかで開き、中身は権限のぶんだけ返す', () => {
    // `dailyops` だけの人はこの口が 403 で、**お待たせ中がいつも「ありません」**だった
    // （数えていないのに「無い」と言い切る）。口を開けるだけだと今度は案件名が漏れる
    const src = read('server', 'src', 'contexts', 'platform', 'routes', 'dashboard.routes.ts');
    const inboxAt = src.indexOf("router.get('/inbox'");
    const gateAt = src.indexOf("router.use(requireAuth, requirePermission('sales'))");
    expect(inboxAt).toBeGreaterThan(-1);
    expect(inboxAt).toBeLessThan(gateAt);
    expect(src.slice(inboxAt, inboxAt + 200)).toContain("requireAnyPermission(['sales', 'dailyops'])");
    // 案件側は `salesVisible` で絞る（絞らないと案件名・お客様名が渡る）
    expect(src).toMatch(/salesVisible \? queryAll\(OVERDUE_ACTIONS_SQL\)/);
    expect(src).toMatch(/salesVisible \? queryAll\(AI_INBOX_SQL/);
    expect(src).toMatch(/sales: \{ visible: salesVisible \}/);

    // 画面は**応答が来てから**数字を出す（権限の有無だけで判断しない）
    const home = read('client', 'src', 'contexts', 'platform', 'pages', 'HomePage.tsx');
    expect(home).toMatch(/canCount = \(canSeeSales \|\| canSeeDailyops\) && !!inbox\.data/);
    expect(home).toMatch(/inbox\.data\?\.sales\?\.visible \? \{ n: salesWaiting/);
    expect(home).toMatch(/inbox\.data\?\.dailyops\?\.visible \? \{ n: dailyWaiting/);
  });

  it('仮押さえの「落とす」は manager にだけ出す（PC もスマホも）', () => {
    // `DELETE /studios/bookings/:id` は manager を要求する。**確定にするほうは editor**
    // なので、1つの `canEdit` でまとめると editor に「落とす」が出て 403 になる
    const page = read('client', 'src', 'contexts', 'production', 'pages', 'HoldListPage.tsx');
    const cards = read('client', 'src', 'contexts', 'production', 'pages', 'holds', 'HoldCards.tsx');
    expect(page).toMatch(/canDrop = hasPermission\('studio', 'manager'\)/);
    for (const src of [page, cards]) expect(src).toMatch(/\{canDrop && \(/);

    const routes = read('server', 'src', 'contexts', 'production', 'routes', 'studio.routes.ts');
    expect(routes).toMatch(/router\.delete\('\/bookings\/:id', requirePermission\('studio', 'manager'\)/);
  });
});
