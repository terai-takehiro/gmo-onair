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
  it('請求書・検収書 PDF は sales で出せる', () => {
    // 以前は `sales` と `budget` が別区画で、⑤ 見積・請求（全案件）は `sales` でも
    // 開ける画面なのに、この口だけ `budget` を要求していたので**`sales` だけの人は
    // 押すと必ず 403** だった。権限モデル単純化で `budget` は `sales` に統合され、
    // この種の事故自体が起きなくなった
    const src = read('server', 'src', 'contexts', 'finance', 'routes', 'revenues.routes.ts');
    const pdfAt = src.indexOf("router.get('/:id/pdf'");
    const gateAt = src.indexOf("router.use(requireAuth, requirePermission('sales'))");
    expect(pdfAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    expect(pdfAt).toBeLessThan(gateAt);
    expect(src.slice(pdfAt, pdfAt + 200)).toContain("requirePermission('sales')");
    // BOX に置くほうも sales の editor で通す（出せるのに毎回「保存されませんでした」にしない）
    expect(src).toMatch(/canStore = meetsPermissionLevel\([^)]*sales[^)]*\)/);
  });

  it('わたしのタスクの四角は dailyops の editor にだけ出す', () => {
    // 一覧を読む口は reader で通るので、reader にもこのカードは出る。
    // 四角まで出すと `PATCH /dailyops/tasks/:id` が editor を要求して 403 になる
    const card = read('client', 'src', 'contexts', 'platform', 'pages', 'home', 'TaskHubCard.tsx');
    expect(card).toMatch(/canComplete = hasPermission\('dailyops', 'editor'\)/);
    expect(card).toMatch(/\{canComplete && \(/);

    const routes = read('server', 'src', 'contexts', 'dailyops', 'routes', 'tasks.routes.ts');
    // サーバー側が editor を要求していることも一緒に見る（緩めたら画面の条件も見直す）
    expect(routes).toMatch(/router\.patch\('\/tasks\/:id', \.\.\.canEdit/);
    expect(routes).toMatch(/canEdit = \[requireAuth, requirePermission\('dailyops', 'editor'\)\]/);
  });

  it('「わたしのタスク」の全部ひらくは、カードと同じ集合（個人+案件+プロジェクト）を出す画面に送る', () => {
    // ⚠️ 以前は `/sales/tasks/list`（GLS-A の案件タスクだけの一覧）に固定していたが、
    // カード自身は個人タスク・GLS-A案件タスク・GLS-B（プロジェクト管理）のタスクを
    // 混ぜて出しており、押した先にそのうち一部しか出てこなかった（ユーザー指摘）。
    // `/daily/tasks` の「マイタスク」タブは `GET /dailyops/tasks/mine` を読むので、
    // カードが数えているのと同じ集合になる
    const card = read('client', 'src', 'contexts', 'platform', 'pages', 'home', 'TaskHubCard.tsx');
    expect(card).toContain("href=\"/daily/tasks\"");
    // ⚠️ コメントで旧い行き先に触れるのは可（経緯の記録）。**実際のリンク先**として
    // 出していないことだけを見る（`href="…"` / `navigate('…')` の形）
    expect(card).not.toMatch(/(href|navigate\()\s*=?\s*['"]\/sales\/tasks\/list['"]/);

    // 同じ理由で「期限切れ」（挨拶の数字）の行き先もトップページで直した
    // （**2か所とも直す** — 片方だけだと残る）
    const home = read('client', 'src', 'contexts', 'platform', 'pages', 'HomePage.tsx');
    expect(home).toMatch(/overdueHref = canSeeDailyops \? '\/daily\/tasks' : null/);
    expect(home).not.toMatch(/(href|navigate\()\s*=?\s*['"]\/sales\/tasks\/list['"]/);

    // `/sales/tasks/list` 自体（案件管理の GLS-A タスク一覧）は残っている——
    // 削除したのではなく、トップからの誤ったリンク先をやめただけ
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

  it('受信箱の行き先は「案件作成」に固定しない（開ける場所へ送る）', () => {
    // ⚠️ 受信箱を `dailyops` にも開けた以上、行き先を案件作成に固定すると
    // **API の 403 を画面の「権限がありません」に移し替えただけ**になる
    // （`/sales/projects/new` は `sales` の editor が要る）。レビューでの指摘
    const kinds = read('client', 'src', 'contexts', 'sales', 'pages', 'inbox', 'kinds.ts');
    expect(kinds).toMatch(/export function inboxHrefOf/);
    expect(kinds).toMatch(/export function inboxAllHrefOf/);
    // 種類ごとの行き先（問い合わせ → 入ってきた情報／書類 → 受け取った書類）
    expect(kinds).toContain("'/daily/inquiries'");
    expect(kinds).toContain("'/budget/documents'");
    // **別バンドルへは素の遷移**（ルーターでは動けない）
    expect(kinds).toMatch(/export function isCrossApp/);

    const card = read('client', 'src', 'contexts', 'platform', 'pages', 'home', 'TaskHubCard.tsx');
    // 行き先が無い行は押せなくする（押して権限エラーに送らない）
    expect(card).toMatch(/const href = inboxHrefOf\(it\.kind, can\)/);
    expect(card).toMatch(/return href \? \(/);
    expect(card).not.toContain("navigate('/sales/projects/new')");

    // 挨拶の件数も同じ。**行き先を知っているのは呼ぶ側**（部品は見た目だけ持つ）
    const greeting = read('client', 'src', 'contexts', 'platform', 'pages', 'home', 'Greeting.tsx');
    expect(greeting).not.toContain("navigate('/sales/projects/new')");
    expect(greeting).not.toContain("navigate('/sales/tasks/list')");
    expect(greeting).toMatch(/onWaiting\?: \(\) => void/);

    const home = read('client', 'src', 'contexts', 'platform', 'pages', 'HomePage.tsx');
    expect(home).toMatch(/onWaiting=\{waitingHref \? \(\) => go\(waitingHref\) : undefined\}/);
    expect(home).toMatch(/overdueHref = canSeeDailyops \? '\/daily\/tasks' : null/);
  });

  it('計時・視聴者のタイルは reader でも既存セッションを開ける（resolve-by-project は新規作成だけ manager）', () => {
    // v4.1 段2 ミニアプリ化フェーズ2の回帰: `resolve-by-project` が常に
    // `requirePermission('qsheet', 'manager')` を要求していたため、タイルは誰にでも
    // 見えるのに reader/editor は「既存セッションを開くだけ」でも常に 403 だった
    // （旧 `ExternalMiniAppLink` が担っていた「タイルを隠す」二重防御がレジストリ統合で
    // 失われ、代わりに入る側のゲートも無かった）。ルートを reader まで下げ、
    // 「新規作成（INSERT）のときだけ」手動で manager を要求する2段構えに直した。
    const routes = read('server', 'src', 'contexts', 'liveops', 'routes', 'programs.routes.ts');
    const at = routes.indexOf("router.post('/resolve-by-project/:projectId'");
    expect(at).toBeGreaterThan(-1);
    // ゲート自体は reader（= canRead）— canWrite（manager 固定）に戻すと reader は
    // 既存セッションの取得段階で 403 になる
    expect(routes.slice(at, at + 120)).toContain('...canRead');
    expect(routes.slice(at, at + 120)).not.toContain('...canWrite');
    // 「既存が無いとき」だけ manager を手動チェックしてから INSERT する
    const afterGate = routes.slice(at);
    const existingCheckAt = afterGate.indexOf('SELECT id FROM liveops_programs WHERE project_id');
    const managerCheckAt = afterGate.indexOf("meetsPermissionLevel(authUser?.role, authUser?.permissions?.['qsheet'], 'manager')");
    const insertAt = afterGate.indexOf('INSERT INTO liveops_programs');
    expect(existingCheckAt).toBeGreaterThan(-1);
    expect(managerCheckAt).toBeGreaterThan(existingCheckAt);
    expect(insertAt).toBeGreaterThan(managerCheckAt);

    // クライアント側のタイル・スイッチャーは元々どのミニアプリも権限で隠していない
    // （ハブ自体の qsheet 権限ゲートに委ねる方針）。計時・視聴者だけ特別扱いしていないことを見る
    const tiles = read('client-techops', 'src', 'components', 'journey', 'MiniAppTiles.tsx');
    expect(tiles).not.toMatch(/hasPermission\(['"]qsheet['"],\s*['"]manager['"]\)/);
  });

  it('仮押さえの「落とす」は manager にだけ出す（PC もスマホも）', () => {
    // `DELETE /studios/bookings/:id` は manager を要求する。**確定にするほうは editor**
    // なので、1つの `canEdit` でまとめると editor に「落とす」が出て 403 になる
    const page = read('client', 'src', 'contexts', 'production', 'pages', 'HoldListPage.tsx');
    const cards = read('client', 'src', 'contexts', 'production', 'pages', 'holds', 'HoldCards.tsx');
    // `studio` は権限モデル単純化で `sales` に統合済み
    expect(page).toMatch(/canDrop = hasPermission\('sales', 'manager'\)/);
    for (const src of [page, cards]) expect(src).toMatch(/\{canDrop && \(/);

    const routes = read('server', 'src', 'contexts', 'production', 'routes', 'studio.routes.ts');
    expect(routes).toMatch(/router\.delete\('\/bookings\/:id', requirePermission\('sales', 'manager'\)/);
  });
});
