/**
 * ONAiR のアプリ登録 — **ここが唯一の正**
 *
 * ── なぜ1つにするか (v4 着手時に数えた) ──────────────────────
 *
 * 同じ「アプリの一覧」が **4か所**にあり、**すでに食い違っていました**:
 *
 *   `AppSwitcher.tsx` の `ONAIR_APPS`        (ヘッダーのアプリ切替)
 *   `appNav.ts` の `ALL_APPS`                (左メニュー下部の「他のアプリ」)
 *   `AuthContext.tsx` の `BLOCK_APPS`        (トップページのカード)
 *   `client/components/layout/Sidebar.tsx`   (同じ一覧をその場で手書き)
 *
 * 食い違っていた箇所 (実測):
 *
 *   | キー | 食い違い | ここで決めた正 | 根拠 |
 *   | --- | --- | --- | --- |
 *   | `studio` | 「スタジオ予約」(appNav) / 「カレンダー」(他3つ) | **カレンダー** | 3対1。モックとルート CLAUDE.md も「カレンダー」 |
 *   | `sales` のアイコン | `Briefcase`(appNav) / `FolderKanban`(他) | **FolderKanban** | モックの案件管理が `folder-kanban` |
 *   | `techsheet` のアイコン | `Wrench`(appNav/Switcher) / `BookOpen`(BLOCK_APPS/Sidebar) | **Wrench** | モックでの出現数 `wrench` 6 対 `book-open` 1 |
 *   | `liveops` のアイコン | `Radio`(appNav) / `Timer`(他) | **Timer** | 「計時」なので |
 *   | `sales` の入口 | `/`(appNav) / `/sales`(他) | `/sales` | `/` はトップページ |
 *   | `budget` の入口 | `/budget/revenues`(appNav) / `/budget`(他) | `/budget` | `App.tsx` が `/budget` → ダッシュボードへ転送済み |
 *   | `studio` の入口 | `/studio/calendar`(appNav) / `/studio`(他) | `/studio` | 同上 |
 *   | 色 | Tailwind クラス(`bg-blue-500`) と hex(`#2563eb`) の2系統 | **hex 1本** | 2つ持つと必ず片方だけ変わる |
 *
 * ── **呼び名は勝手に変えていない** ──────────────────────────
 *
 * 上の表にあるのは「**4か所で食い違っていたので、どれかに決めた**」ものだけです。
 * 4か所で一致していた名前はそのまま残しました。v4 の文書では別の呼び方を
 * しているものがあり、変えるかどうかは**利用者に確認してから**にします:
 *
 *   `qsheet` いまは「Qシート」/ v4 の文書は「制作資料」
 *   `admin`  いまは「システム管理」/ v4 の文書は「設定」(URL も /settings へ改名予定)
 *
 * ── 凍結の印 ────────────────────────────────────────────────
 *
 * `frozen: true` の4アプリ (Qシート / 技術資料 / 計時LIVE / リアルタイムCG) は
 * **v4.0.0 では作り直しません**。URL は生かしたまま、**v4 の共通シェルの
 * アプリ切替と「他のアプリ」からだけ外します** (`visibleApps()`)。
 * 旧トップページ・旧シェルは Phase 2 以降で作り直すまで今までどおり全部出します
 * (ここで消すと、まだ v4 になっていない画面から凍結アプリへ行けなくなる)。
 *
 * ── 権限モデル単純化（`permissionModule` を `sales` に統合した回）───────
 *
 * `gpm` / `budget` / `studio` / `admin`（=設定）の4アプリは、`key` / `path` /
 * `label` は今までどおり別々の入口のまま、`permissionModule` だけ `sales` に
 * 揃えた。理由は権限モデルの単純化（区画をブロックアプリ単位に統合し、
 * 「型」だけで管理する方針に変更）。詳細は
 * `docs/reviews/permission-model-simplification-plan.md`。
 * **`admin`（設定）の入口だけは元々ここに権限を掛けない設計だった**
 * （`App.tsx` の「v4 設定トップは案内板なので権限を掛けない」参照）ので、
 * `permissionModule: 'sales'` にしたことで、いままで「管理者」型の人しか
 * 見えていなかった設定タイルが、フルアクセスの全員に見えるようになる
 * （実際に開けるサブページの権限は個別のルートが引き続き見る）。
 */
import {
  Home,
  FolderKanban,
  PiggyBank,
  Calendar,
  FileText,
  Package,
  Sparkles,
  Wrench,
  Users,
  Timer,
  Tv,
  ClipboardList,
  Languages,
  Truck,
  Settings,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

/**
 * アプリのキー。多くは `permissionModule` と同じにしてあるが、
 * `gpm` / `budget` / `studio` / `admin` は権限モデル単純化で
 * `permissionModule: 'sales'` に統合済み（上のコメント参照）。
 */
export type AppKey =
  | 'home'
  | 'sales'
  | 'budget'
  | 'studio'
  | 'gpm'
  | 'qsheet'
  | 'equipment'
  | 'techsheet'
  | 'liveops'
  | 'awards'
  | 'dailyops'
  | 'admin'
  | 'interactive'
  | 'translate'
  | 'assign'
  | 'delivery';

export interface AppDef {
  key: AppKey;
  /** 画面に出す名前。**ここ以外に書かない** */
  label: string;
  /** トップページのカードに出す1行説明 */
  description: string;
  /** lucide のコンポーネント。**名前の文字列にしない** — 名前→部品の対応表が各アプリに増えるため */
  icon: LucideIcon;
  /** アイコンの下地の色 (hex)。**トークン外**なのは承知の上 (v4 のシェルは中立色を使う) */
  color: string;
  /** 入口の URL */
  path: string;
  /**
   * 必要な権限モジュール。省略すると**権限なしでも出る**。
   * 多くは `key` と同じだが、`home` のように権限を持たないものがある。
   */
  permissionModule?: string;
  /** 外部 URL (別タブで開く)。権限は見ない */
  external?: string;
  /** v4.0.0 では作り直さない。**v4 のシェルの一覧から外す** */
  frozen?: boolean;
  /** まだ無いアプリ。押せない状態で出す */
  comingSoon?: boolean;
  /** メニューの一覧に出さない (入口が別にあるもの) */
  hidden?: boolean;
}

/**
 * 全アプリ。**並び順がそのまま画面の並び順**。
 *
 * v4 で作り直す3アプリ (案件管理 = `sales`/`budget`/`studio`/`admin` /
 * 日常業務 / 機材管理) を先に、凍結を後ろに、外部リンクを最後に置いてある。
 */
export const APPS: AppDef[] = [
  { key: 'home',        label: 'ホーム',             description: 'ONAiR のトップページ',                  icon: Home,          color: '#475569', path: '/' },
  { key: 'sales',       label: '案件管理',           description: '案件パイプライン・顧客・見積',          icon: FolderKanban,  color: '#2563eb', path: '/sales',      permissionModule: 'sales' },
  /**
   * **案件管理の隣に置く**（ご指示）。旧来の呼び方では
   * **案件管理 = GLS-A ／ プロジェクト管理 = GLS-B** で、この2つは対になる。
   * 間に財務管理が入っていると対に見えない。
   * ⚠️ **並び順はここが唯一の正** — トップのタイル・上辺バーのアプリ切替の
   * どちらも `APPS` の順で描くので、動かすときはここだけを動かす。
   */
  { key: 'gpm',         label: 'プロジェクト管理',   description: '自社構築・グループ受託の工程管理',      icon: LayoutGrid,    color: '#4338ca', path: '/gpm',        permissionModule: 'sales' },
  { key: 'budget',      label: '財務管理',           description: '売上・仕入・販管費・損益',              icon: PiggyBank,     color: '#059669', path: '/budget',     permissionModule: 'sales' },
  { key: 'studio',      label: 'カレンダー',         description: 'スタジオカレンダー・ブッキング',        icon: Calendar,      color: '#7c3aed', path: '/studio',     permissionModule: 'sales' },
  { key: 'dailyops',    label: '日常業務',           description: 'AI 週次活動報告・業界ニュース収集',     icon: ClipboardList, color: '#0d9488', path: '/daily',      permissionModule: 'dailyops' },
  { key: 'equipment',   label: '機材管理',           description: '機材台帳・貸出・メンテナンス',          icon: Package,       color: '#d97706', path: '/equipment',  permissionModule: 'equipment' },
  { key: 'admin',       label: '設定',               description: '権限・ユーザー・データ・バックアップ',  icon: Settings,      color: '#475569', path: '/settings',   permissionModule: 'sales' },

  /* ── 凍結 (v4.0.0 では作り直さない。URL は生きている) ────────────── */
  { key: 'qsheet',      label: '制作資料',           description: '台本づくりと本番進行 (Qシート)',        icon: FileText,      color: '#e11d48', path: '/qsheet',     permissionModule: 'qsheet',    frozen: true },
  { key: 'techsheet',   label: '技術資料',           description: 'カメラ・映像・音声技術仕様書',          icon: Wrench,        color: '#0891b2', path: '/techsheet',  permissionModule: 'techsheet', frozen: true },
  { key: 'liveops',     label: '計時LIVE',           description: 'カウントダウン・視聴者カウンター',      icon: Timer,         color: '#ef4444', path: '/live',       permissionModule: 'liveops',   frozen: true },
  { key: 'awards',      label: 'リアルタイムCG',     description: 'リアルタイム放送CG演出・送出管理',      icon: Tv,            color: '#f59e0b', path: '/awards',     permissionModule: 'awards',    frozen: true },

  /* ── 外部リンク (別 VPS・別タブ。権限は見ない) ─────────────────── */
  { key: 'interactive', label: 'インタラクティブ',   description: 'スタンプ・リアルタイム演出支援 (外部)', icon: Sparkles,      color: '#db2777', path: 'https://interactive.gmo-onair.jp/', external: 'https://interactive.gmo-onair.jp/' },
  { key: 'translate',   label: '翻訳',               description: 'GMO 翻訳ツール (外部)',                 icon: Languages,     color: '#16a34a', path: 'https://gmo-translate.jp/',         external: 'https://gmo-translate.jp/' },

  /* ── まだ無いもの ─────────────────────────────────────────── */
  { key: 'assign',      label: '制作支援',           description: 'スケジュール・スタッフ配置',            icon: Users,         color: '#ea580c', path: '/prodsheet',                               comingSoon: true },
  { key: 'delivery',    label: '素材納品',           description: 'VTR・素材の納品管理',                   icon: Truck,         color: '#14b8a6', path: '/delivery',                                comingSoon: true },
];

/** キーで引く */
export const APP_BY_KEY: Record<string, AppDef> = Object.fromEntries(APPS.map((a) => [a.key, a]));

/** 画面に出す名前だけの対応表 (権限の画面などラベルしか要らない場所で使う) */
export const APP_LABELS: Record<string, string> = Object.fromEntries(APPS.map((a) => [a.key, a.label]));

export interface AppAccess {
  role?: string;
  /** モジュール → アクセスレベル。無い = 権限なし */
  permissions?: Record<string, string> | null;
}

/** そのユーザーが開けるか。**外部リンクと権限を持たないアプリは常に開ける** */
export function canOpenApp(app: AppDef, { role, permissions }: AppAccess): boolean {
  if (app.external) return true;
  if (!app.permissionModule) return true;
  if (role === 'system_admin') return true;
  return !!permissions?.[app.permissionModule];
}

export interface VisibleAppsOptions extends AppAccess {
  /** いま開いているアプリ (一覧から外す) */
  current?: string;
  /** 凍結アプリも出す。**v4 のシェルでは false のまま**にすること */
  includeFrozen?: boolean;
  /** 準備中のアプリも出す (トップページは出す・シェルの切替では出さない) */
  includeComingSoon?: boolean;
  /** ホームも一覧に出す */
  includeHome?: boolean;
}

/**
 * メニューに出すアプリ。**権限で消えるので、ここが壊れると
 * 利用者から黙ってメニュー項目が消える** — レビューでは絶対に見つからない壊れ方なので
 * `shared/tests/apps.test.ts` で固定してある。
 */
export function visibleApps(opts: VisibleAppsOptions = {}): AppDef[] {
  const { current, includeFrozen = false, includeComingSoon = false, includeHome = false } = opts;
  return APPS.filter((app) => {
    if (app.hidden) return false;
    if (app.key === current) return false;
    if (app.key === 'home' && !includeHome) return false;
    if (app.frozen && !includeFrozen) return false;
    if (app.comingSoon && !includeComingSoon) return false;
    return canOpenApp(app, opts);
  });
}

/** URL から「いまどのアプリにいるか」を判定する。**長い path から先に見る** */
export function appOfPath(pathname: string): AppDef | undefined {
  return [...APPS]
    .filter((a) => !a.external && a.path !== '/')
    .sort((a, b) => b.path.length - a.path.length)
    .find((a) => pathname === a.path || pathname.startsWith(`${a.path}/`));
}
