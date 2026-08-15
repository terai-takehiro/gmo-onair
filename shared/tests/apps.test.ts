/**
 * アプリ登録とメニューの権限フィルタのテスト。
 *
 * ── なぜここをテストするか ──────────────────────────────────
 *
 * **壊れると利用者からメニュー項目が黙って消えます。**
 * 消えた側の人は「そんな画面は無い」と思うだけなので報告されず、
 * 作った側は自分の権限では見えているので気づきません。
 * **レビューでも型でも lint でも絶対に見つからない壊れ方**です。
 *
 * 逆向きの壊れ方 — 権限が無い人にメニューが出る — も同じくらい悪く、
 * 押すと 403 で止まるので「使えないものが並んでいる」画面になります。
 *
 * アプリ登録そのもの (名前・入口・凍結の印) も、4か所に散っていたものを
 * 1つにまとめた直後なので、写し間違いをここで止めます。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPS, APP_BY_KEY, APP_LABELS, canOpenApp, visibleApps, appOfPath } from '../src/client/apps';
import { isCurrent, currentTo, visibleSections } from '../src/client/shell/AppSideMenu';

const admin = { role: 'system_admin', permissions: {} };
const nobody = { role: 'staff', permissions: {} };
const equipmentOnly = { role: 'staff', permissions: { equipment: 'reader' } };
const sales = { role: 'staff', permissions: { sales: 'editor', budget: 'reader' } };

describe('アプリ登録そのもの', () => {
  it('キーが重複していない', () => {
    expect(new Set(APPS.map((a) => a.key)).size).toBe(APPS.length);
  });

  it('入口の URL が重複していない (外部リンクを除く)', () => {
    const paths = APPS.filter((a) => !a.external).map((a) => a.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('凍結は4アプリだけ (制作資料 / 技術資料 / 計時LIVE / リアルタイムCG)', () => {
    expect(APPS.filter((a) => a.frozen).map((a) => a.key).sort()).toEqual(
      ['awards', 'liveops', 'qsheet', 'techsheet'],
    );
  });

  it('**名前は決めたとおり** (4か所で食い違っていた分)', () => {
    expect(APP_LABELS.studio).toBe('カレンダー');   // 「スタジオ予約」ではない
    expect(APP_LABELS.sales).toBe('案件管理');
    // v4 で改名した2つ (利用者に確認済み)。
    // 「Qシート」は**制作資料の中のミニアプリの名前**として残っており、
    // アプリの名前は「制作資料」。設定は `/admin` → `/settings` の改名と対
    expect(APP_LABELS.qsheet).toBe('制作資料');
    expect(APP_LABELS.admin).toBe('設定');
  });

  it('外部リンクは http で始まる', () => {
    for (const a of APPS.filter((x) => x.external)) {
      expect(a.external).toMatch(/^https?:\/\//);
    }
  });

  it('アイコンは部品 (名前の文字列ではない)', () => {
    for (const a of APPS) expect(typeof a.icon).not.toBe('string');
  });

  it('色は hex 1本 (Tailwind のクラスを混ぜない)', () => {
    for (const a of APPS) expect(a.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('canOpenApp — 開けるかどうか', () => {
  it('system_admin は全部開ける', () => {
    for (const a of APPS) expect(canOpenApp(a, admin)).toBe(true);
  });

  it('**権限が無い人には開けない**', () => {
    expect(canOpenApp(APP_BY_KEY.sales, nobody)).toBe(false);
    expect(canOpenApp(APP_BY_KEY.equipment, nobody)).toBe(false);
  });

  it('持っている権限のアプリだけ開ける', () => {
    expect(canOpenApp(APP_BY_KEY.equipment, equipmentOnly)).toBe(true);
    expect(canOpenApp(APP_BY_KEY.sales, equipmentOnly)).toBe(false);
  });

  it('外部リンクと権限を持たないアプリは誰でも開ける', () => {
    expect(canOpenApp(APP_BY_KEY.translate, nobody)).toBe(true);
    expect(canOpenApp(APP_BY_KEY.interactive, nobody)).toBe(true);
    expect(canOpenApp(APP_BY_KEY.home, nobody)).toBe(true);
  });

  it('権限の値は何でもよい (reader でも開ける)', () => {
    expect(canOpenApp(APP_BY_KEY.equipment, { role: 'staff', permissions: { equipment: 'reader' } })).toBe(true);
  });
});

describe('visibleApps — メニューに出す一覧', () => {
  it('いま開いているアプリは出さない', () => {
    const keys = visibleApps({ current: 'equipment', ...admin }).map((a) => a.key);
    expect(keys).not.toContain('equipment');
  });

  it('**既定では凍結4アプリを出さない** (v4 のシェル用)', () => {
    const keys = visibleApps(admin).map((a) => a.key);
    for (const k of ['qsheet', 'techsheet', 'liveops', 'awards']) expect(keys).not.toContain(k);
  });

  it('includeFrozen で凍結も出る (v4 に載せ替える前の画面用)', () => {
    const keys = visibleApps({ ...admin, includeFrozen: true }).map((a) => a.key);
    for (const k of ['qsheet', 'techsheet', 'liveops', 'awards']) expect(keys).toContain(k);
  });

  it('準備中は既定で出さない', () => {
    // **`gpm` はもう準備中ではありません**（v4 で7画面つくったので `comingSoon` を外した）。
    // 準備中の印がまだ付いているのは 制作支援 / 素材納品 の2つ
    for (const k of ['assign', 'delivery']) {
      expect(visibleApps(admin).map((a) => a.key)).not.toContain(k);
      expect(visibleApps({ ...admin, includeComingSoon: true }).map((a) => a.key)).toContain(k);
    }
  });

  /**
   * **プロジェクト管理は出す。** モックのトップページに並んでいて、画面も出来ている。
   * ここを固定しておかないと、`comingSoon` を戻したときに黙って一覧から消える
   * （利用者から見ると「アプリが無くなった」）。
   */
  it('プロジェクト管理は既定で出る', () => {
    expect(visibleApps(admin).map((a) => a.key)).toContain('gpm');
  });

  it('ホームは既定で出さない (トップページ自身なので)', () => {
    expect(visibleApps(admin).map((a) => a.key)).not.toContain('home');
    expect(visibleApps({ ...admin, includeHome: true }).map((a) => a.key)).toContain('home');
  });

  it('**権限なしの人には外部リンクだけが残る**', () => {
    expect(visibleApps(nobody).map((a) => a.key)).toEqual(['interactive', 'translate']);
  });

  it('機材だけの人には機材と外部リンクだけ', () => {
    expect(visibleApps(equipmentOnly).map((a) => a.key)).toEqual(['equipment', 'interactive', 'translate']);
  });

  it('営業の人には案件管理と財務管理が出る (カレンダー・設定は出ない)', () => {
    const keys = visibleApps(sales).map((a) => a.key);
    expect(keys).toContain('sales');
    expect(keys).toContain('budget');
    expect(keys).not.toContain('studio');
    expect(keys).not.toContain('admin');
  });

  it('**並び順は登録の順** (画面ごとに並べ替えない)', () => {
    const keys = visibleApps({ ...admin, includeFrozen: true, includeHome: true }).map((a) => a.key);
    const order = APPS.filter((a) => keys.includes(a.key)).map((a) => a.key);
    expect(keys).toEqual(order);
  });
});

describe('appOfPath — URL から現在地を判定', () => {
  it('入口そのものと配下を判定する', () => {
    expect(appOfPath('/sales')?.key).toBe('sales');
    expect(appOfPath('/sales/projects')?.key).toBe('sales');
    expect(appOfPath('/budget/revenues')?.key).toBe('budget');
    expect(appOfPath('/equipment/items')?.key).toBe('equipment');
    expect(appOfPath('/settings/users')?.key).toBe('admin');   // 権限モジュール名は admin のまま
  });

  it('トップページはどのアプリでもない', () => {
    expect(appOfPath('/')).toBeUndefined();
  });

  it('**前方一致で誤爆しない** (/salesman は案件管理ではない)', () => {
    expect(appOfPath('/salesman')).toBeUndefined();
  });

  it('知らない URL は undefined', () => {
    expect(appOfPath('/nope/whatever')).toBeUndefined();
  });
});

describe('isCurrent — 左メニューの現在地', () => {
  it('**末尾のスラッシュを畳む** (これで実際に光らなかった)', () => {
    // 機材管理は Vite の base が `/equipment/` なので、入口を開くと
    // URL が `/equipment/` になる。NavLink の `end` はこれに一致しなかった
    expect(isCurrent('/equipment/', '/equipment', true)).toBe(true);
    expect(isCurrent('/equipment', '/equipment/', true)).toBe(true);
    expect(isCurrent('/', '/', true)).toBe(true);
  });

  it('`end` の項目は配下で光らない (入口だけ)', () => {
    expect(isCurrent('/equipment/items', '/equipment', true)).toBe(false);
    expect(isCurrent('/tasks', '/', true)).toBe(false);
  });

  it('`end` が無い項目は配下でも光る', () => {
    expect(isCurrent('/sales/projects', '/sales/projects')).toBe(true);
    expect(isCurrent('/sales/projects/abc123', '/sales/projects')).toBe(true);
    expect(isCurrent('/sales/projects/', '/sales/projects')).toBe(true);
  });

  it('**前方一致で誤爆しない**', () => {
    // 「案件一覧」を開いているのに「按分グループ」まで光る、が起きないこと
    expect(isCurrent('/sales/project-groups', '/sales/projects')).toBe(false);
    expect(isCurrent('/budget/revenues-old', '/budget/revenues')).toBe(false);
  });
});

describe('currentTo — 光るのは1つだけ', () => {
  // 実際の案件管理のメニュー（v4）の抜粋
  const SECTIONS = [
    { title: '業務', items: [
      { label: 'ダッシュボード', to: '/sales/dashboard' },
      { label: '受付', to: '/sales/inbox' },
      { label: '案件一覧', to: '/sales/projects' },
    ] },
    { title: '全案件', items: [
      { label: 'タスク一覧', to: '/sales/tasks/list' },
      { label: '見積・請求', to: '/sales/billing' },
    ] },
    { title: 'そのほか', collapsible: true, items: [
      { label: '確定案件（スタジオ）', to: '/sales/projects/confirmed/studio' },
      { label: '按分グループ', to: '/sales/project-groups' },
      { label: 'ガントチャート', to: '/sales/tasks/gantt' },
    ] },
  ];

  it('**入れ子の項目は深いほうだけが光る**', () => {
    // `/sales/projects` と `/sales/projects/confirmed/studio` は
    // どちらも isCurrent が true になる。2つ光ると現在地が読めない
    expect(isCurrent('/sales/projects/confirmed/studio', '/sales/projects')).toBe(true);
    expect(currentTo('/sales/projects/confirmed/studio', SECTIONS))
      .toBe('/sales/projects/confirmed/studio');
  });

  it('案件詳細では「案件一覧」が光る', () => {
    expect(currentTo('/sales/projects/abc123', SECTIONS)).toBe('/sales/projects');
  });

  it('前方一致で別の項目に飛び移らない', () => {
    expect(currentTo('/sales/project-groups', SECTIONS)).toBe('/sales/project-groups');
    expect(currentTo('/sales/tasks/gantt', SECTIONS)).toBe('/sales/tasks/gantt');
    expect(currentTo('/sales/tasks/list', SECTIONS)).toBe('/sales/tasks/list');
  });

  it('どれにも当たらなければ null', () => {
    expect(currentTo('/sales/customers', SECTIONS)).toBeNull();
  });
});

/**
 * **上辺バーのパンくずが、左メニューと同じ答えを出す**（レビューでの指摘 #82）
 *
 * 前の版は上辺バーが**絞る前の並び**から名前を引いていたので、
 * ①**権限で消した項目の名前が出る**（メニューには無いのに）
 * ②`?view=lend` のような**絞り込みつきの行き先**は、道が同じ別の項目の名前になる
 * （押した先と違う名前が上辺バーに出る）、という食い違いがありました。
 */
describe('currentTo — 絞り込みつきの行き先（クエリ）', () => {
  const ITEMS = [{
    label: '台帳',
    items: [
      { label: '機材台帳', to: '/equipment/items' },
      { label: '貸出対象の機材', to: '/equipment/items?view=lend' },
    ],
  }];

  it('クエリまで一致する項目を現在地にする', () => {
    expect(currentTo('/equipment/items', ITEMS, '?view=lend')).toBe('/equipment/items?view=lend');
  });

  it('クエリが無いときは、クエリを持たない項目', () => {
    expect(currentTo('/equipment/items', ITEMS, '')).toBe('/equipment/items');
  });

  it('別のクエリのときは、クエリを持たない項目に落ちる（食い違う名前を出さない）', () => {
    expect(currentTo('/equipment/items', ITEMS, '?view=cable')).toBe('/equipment/items');
  });

  it('クエリつきの行き先でも、道の判定は道だけで見る（子の画面）', () => {
    expect(isCurrent('/equipment/items/abc', '/equipment/items?view=lend')).toBe(true);
  });
});

describe('visibleSections — 見えない項目の名前を出さない', () => {
  const SECTIONS = [{
    label: '業務',
    items: [
      { label: 'ダッシュボード', to: '/sales/dashboard', module: 'sales' },
      { label: '取引先', to: '/budget/vendors', module: 'budget' },
      { label: 'システム管理', to: '/settings/system', adminOnly: true },
    ],
  }];

  it('権限が無い項目は落とす（メニューと同じ答え）', () => {
    const v = visibleSections(SECTIONS, { role: 'staff', permissions: { sales: 'reader' } });
    expect(v.flatMap((s) => s.items).map((i) => i.label)).toEqual(['ダッシュボード']);
    // その人にとって「取引先」は現在地になりえない（＝パンくずにも出ない）
    expect(currentTo('/budget/vendors', v)).toBeNull();
  });

  it('system_admin は全部見える', () => {
    const v = visibleSections(SECTIONS, { role: 'system_admin' });
    expect(v.flatMap((s) => s.items)).toHaveLength(3);
  });

  it('スマホで落とす項目は、道の型で照合する（前方一致にしない）', () => {
    const v = visibleSections(SECTIONS, {
      role: 'system_admin', mobile: true, mobileHiddenPaths: ['/settings/system'],
    });
    expect(v.flatMap((s) => s.items).map((i) => i.to)).toEqual(['/sales/dashboard', '/budget/vendors']);
  });
});

describe('スマホの入金の確認は月で切らない（レビューでの指摘 #61）', () => {
  it('月をまたぐ口（`/billing/invoices?state=unpaid`）を引く', () => {
    // 前の版は今月の締め（`/billing/closing?month=`）だったので、
    // **先月以前の未入金がこの画面から丸ごと消えて**いた。
    // いちばん危ないのはその古い未入金（期日超過はそこから出る）で、
    // しかもスマホで入金を記録できるのはこの画面だけ。
    // 実測: 未入金 39 件・期日超過 1 件のとき、前の版は **0 件**
    const src = readFileSync(
      join(__dirname, '..', '..', 'client', 'src', 'contexts', 'finance', 'pages', 'closing', 'MobileCollect.tsx'),
      'utf8',
    );
    expect(src).toMatch(/params: \{ state: 'unpaid' \}/);
    // **注釈は外してから探す**（この製品は前の版の形を説明として残す決めごと）
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/billing\/closing/);
    // 合計もサーバーが絞り込み全体で数えたものを使う（並んだ行を足さない）
    expect(src).toMatch(/const total = q\.data\?\.total_amount \?\?/);
    // 月で切っていないことを画面に書く
    expect(src).toMatch(/月をまたいで全部/);
  });
});
