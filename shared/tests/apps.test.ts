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
import { APPS, APP_BY_KEY, APP_LABELS, canOpenApp, visibleApps, appOfPath } from '../src/client/apps';

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
    // 4か所で一致していた名前は**勝手に変えない** (v4 の文書は別の呼び方だが、
    // 変えるかどうかは利用者に確認してから)
    expect(APP_LABELS.qsheet).toBe('Qシート');
    expect(APP_LABELS.admin).toBe('システム管理');
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
    expect(visibleApps(admin).map((a) => a.key)).not.toContain('gpm');
    expect(visibleApps({ ...admin, includeComingSoon: true }).map((a) => a.key)).toContain('gpm');
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
    expect(appOfPath('/admin/users')?.key).toBe('admin');
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
