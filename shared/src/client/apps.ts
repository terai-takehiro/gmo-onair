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
 *   | `calendar` | 「スタジオ予約」(appNav) / 「カレンダー」(他3つ) | **カレンダー** | 3対1。モックとルート CLAUDE.md も「カレンダー」 |
 *   | `sales` のアイコン | `Briefcase`(appNav) / `FolderKanban`(他) | **FolderKanban** | モックの案件管理が `folder-kanban` |
 *   | `liveops` のアイコン | `Radio`(appNav) / `Timer`(他) | **Timer** | 「計時」なので |
 *   | `sales` の入口 | `/`(appNav) / `/sales`(他) | `/sales` | `/` はトップページ |
 *   | `budget` の入口 | `/budget/revenues`(appNav) / `/budget`(他) | `/budget` | `App.tsx` が `/budget` → ダッシュボードへ転送済み |
 *   | `calendar` の入口 | `/studio/calendar`(appNav) / `/studio`(他) | `/studio` | 同上 |
 *   | 色 | Tailwind クラス(`bg-blue-500`) と hex(`#2563eb`) の2系統 | **hex 1本** | 2つ持つと必ず片方だけ変わる |
 *
 * ── **呼び名は勝手に変えていない** ──────────────────────────
 *
 * 上の表にあるのは「**4か所で食い違っていたので、どれかに決めた**」ものだけです。
 * 4か所で一致していた名前はそのまま残しました。v4 の文書では別の呼び方を
 * しているものがあり、変えるかどうかは**利用者に確認してから**にします:
 *
 *   `techops`（旧 `qsheet`。AppKey/URL は Phase 2・2026-08-22 に改名。下の
 *   「制作技術支援の `AppKey`/URL は…」参照）は表示名も「制作資料」→「制作技術支援」に
 *   改名済み (下の APPS。「Qシート」は中のミニアプリの名前として残す。2026-08-22 に
 *   ご指示で再改名・プロジェクト管理と財務管理の間へ格上げ)
 *   `admin`  いまは「システム管理」/ v4 の文書は「設定」(URL も /settings へ改名予定)
 *
 * ── 凍結の印 ────────────────────────────────────────────────
 *
 * `frozen: true` は **v4.0.0 では作り直さない**アプリの印。URL は生かしたまま、
 * **v4 の共通シェルのアプリ切替と「他のアプリ」からだけ外す** (`visibleApps()`)。
 * 旧トップページ・旧シェルは Phase 2 以降で作り直すまで今までどおり全部出す
 * (ここで消すと、まだ v4 になっていない画面から凍結アプリへ行けなくなる)。
 *
 * **制作技術支援 (Qシート・旧「制作資料」) は v4.1 で凍結を解いた。** `frozen` は落とし、
 * v4 共通シェルにも載せ替え済み。`apps.ts` の一覧・アプリ切替には出るようになる。
 *
 * **計時LIVE（現・計時・視聴者）も段9（`docs/design/v4/qsheet-v4-coding/impl/09-live-timer-impl.md`）
 * で凍結を解いた。** `frozen` は落とし、v4 共通シェル・v4トークンにも載せ替え済み
 * （本番の出力画面 `/live/display/:timerId` は無傷のまま）。
 * **改名（「計時LIVE」→「計時・視聴者」）は 2026-08-22、
 * `docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` のフェーズ1・PR-B
 * （ミニアプリとしての導線追加と同じPR）で実施済み。** 表示名だけを変え、
 * ディレクトリ名 `client-live/`・ベースパス `/live/`・DBのテーブル名・
 * Socket.IO 名前空間・`localStorage` キー・`MiniAppKey`/`AppKey` の値 `'liveops'` 等の
 * 内部識別子は一切変えていない（対応表は `client-live/CLAUDE.md` に残す）。
 * ⚠️ **`permissionModule` だけは例外。** 計時・視聴者のミニアプリ化フェーズ2の着手に
 * あたり、権限区画 `liveops` を `qsheet` へ統合した（migration 232・
 * 12-live-timer-decision.md §9 の未決事項に対する決定）。`permissionModule` は
 * 権限モジュール文字列であって上記の「変えない」識別子ではないため、
 * `'liveops'` → `'qsheet'` に変更している（`key: 'liveops'` 自体はアプリ識別子
 * なので変えていない）。
 *
 * **残る `frozen: true` はリアルタイムCG（`awards`）だけ。** `awards` は 2026-09-06 の段F で
 * **廃止**した（後継＝制作技術支援のミニアプリ「テロップCG」。移行は完了済み）。
 * `frozen: true` は**「一覧・アプリ切替に出さない印」として据え置いている**だけで、
 * 凍結（据え置き）の意味ではない。`/awards/*` は配信・API・Socket.IO を外してあり
 * 直打ちでも開けない（`/awards/images/*` の読み取り専用配信だけが残る。
 * `client-awards/CLAUDE.md`・`docs/v4-plan.md` の「用語」）。
 *
 * **カレンダーの `AppKey`/URL は 2026-08-22 に `studio` → `calendar` へ改名した。**
 * 表示名「カレンダー」は S1 の統合時点（上の比較表）から変わっていない —
 * アプリ名を「カレンダー」に決めたあとも内部識別子だけ `studio` のまま放置されていた
 * 食い違いを直した回で、`key: 'studio'` → `'calendar'`、`path: '/studio'` → `'/calendar'`
 * にしただけ。**スタジオ「ブッキング」というドメイン概念には一切触れていない** —
 * DB の `studio_bookings`/`studio_locations` テーブル、サーバーの `studio.routes.ts`・
 * `studio-booking.service.ts`、カレンダー自身のレイヤー機能が持つ `CalLayer` の
 * `'studio'` という絞り込み値、そして実在するスタジオ（部屋）という物理的な概念は、
 * 引き続き「studio」を名乗ってよい（このアプリ識別子の修正とは無関係）。
 * 旧 `/studio/*` の URL は `client/src/App.tsx` に後方互換のリダイレクトを置いてあるので、
 * 既存のブックマーク・共有リンクは壊れない。
 *
 * **制作技術支援の `AppKey`/URL は qsheet→techops 移行の Phase 2（2026-08-22）で
 * `qsheet` → `techops` へ改名した。** 表示名「制作技術支援」は前段
 * （2026-08-22 の再改名・プロジェクト管理と財務管理の間への格上げ）から変わっていない —
 * アプリ名を決めたあとも内部識別子だけ `qsheet` のまま残っていた食い違いを直した回で、
 * `key: 'qsheet'` → `'techops'`、`path: '/qsheet'` → `'/techops'` にしただけ。
 * **`permissionModule` はここでは変えていない（意図的に `'qsheet'` のまま）** —
 * 上のカレンダー（`studio`→`calendar`）の回と同じ「アプリ識別子と権限モジュール文字列は
 * 別物」という判断軸だが、こちらは`permissionModule` 自体は動かしていない。理由は
 * 既存利用者の権限 JSON が `permissionModule` の文字列（`'qsheet'`）をキーとして
 * 保存済みだから — ここを一緒に変えると、移行の migration を用意しない限り
 * 全利用者の権限が消えたように見える。計時・視聴者の `permissionModule: 'liveops'` →
 * `'qsheet'` 統合（上のコメント）とは逆に、今回は `key` だけ動かして
 * `permissionModule` は据え置く判断をしている。
 * 旧 `/qsheet/*` の URL は `client-techops/src/App.tsx` の `RedirectQsheetToTechops`
 * コンポーネントが後方互換のリダイレクトを行う（クエリ文字列を保ったまま転送）ので、
 * 既存のブックマーク・共有リンクは壊れない。
 *
 * ── 権限モデル単純化（`permissionModule` を `sales` に統合した回）───────
 *
 * `gpm` / `budget` / `calendar` / `admin`（=設定）の4アプリは、`key` / `path` /
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
 * `gpm` / `budget` / `calendar` / `admin` は権限モデル単純化で
 * `permissionModule: 'sales'` に統合済み（上のコメント参照）。
 */
export type AppKey =
  | 'home'
  | 'sales'
  | 'budget'
  | 'calendar'
  | 'gpm'
  | 'techops'
  | 'equipment'
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
 * v4 で作り直す3アプリ (案件管理 = `sales`/`budget`/`calendar`/`admin` /
 * 日常業務 / 機材管理) を先に、凍結を後ろに、外部リンクを最後に置いてある。
 */
export const APPS: AppDef[] = [
  { key: 'home',        label: 'ホーム',             description: 'アプリを選ぶ',                                            icon: Home,          color: '#475569', path: '/' },
  { key: 'sales',       label: '案件管理',           description: '案件パイプライン・顧客・見積',          icon: FolderKanban,  color: '#2563eb', path: '/sales',      permissionModule: 'sales' },
  /**
   * **案件管理の隣に置く**（ご指示）。旧来の呼び方では
   * **案件管理 = GLS-A ／ プロジェクト管理 = GLS-B** で、この2つは対になる。
   * 間に財務管理が入っていると対に見えない。
   * ⚠️ **並び順はここが唯一の正** — トップのタイル・上辺バーのアプリ切替の
   * どちらも `APPS` の順で描くので、動かすときはここだけを動かす。
   */
  { key: 'gpm',         label: 'プロジェクト管理',   description: '自社構築・グループ受託の工程管理',      icon: LayoutGrid,    color: '#4338ca', path: '/gpm',        permissionModule: 'sales' },
  /* 制作技術支援は v4.1 で凍結を解き、v4 共通シェルにも載せ替え済み。
     プロジェクト管理と財務管理の間に格上げ（ご指示・2026-08-22） */
  { key: 'techops',     label: '制作技術支援',       description: '台本・スケジュール・収録配信・本番送出',        icon: FileText,      color: '#e11d48', path: '/techops',    permissionModule: 'qsheet' },
  { key: 'budget',      label: '財務管理',           description: '売上・仕入・販管費・損益',              icon: PiggyBank,     color: '#059669', path: '/budget',     permissionModule: 'sales' },
  { key: 'calendar',    label: 'カレンダー',         description: 'スタジオカレンダー・ブッキング',        icon: Calendar,      color: '#7c3aed', path: '/calendar',   permissionModule: 'sales' },
  { key: 'dailyops',    label: '日常業務',           description: '週報・ニュース・内覧会・受領書類',        icon: ClipboardList, color: '#0d9488', path: '/daily',      permissionModule: 'dailyops' },
  { key: 'equipment',   label: '機材管理',           description: '機材台帳・貸出・メンテナンス',          icon: Package,       color: '#d97706', path: '/equipment',  permissionModule: 'equipment' },
  { key: 'admin',       label: '設定',               description: '権限・ユーザー・データ・バックアップ',  icon: Settings,      color: '#475569', path: '/settings',   permissionModule: 'sales' },

  /**
   * 計時LIVE も段9で凍結を解いた (見た目が動いたのは表示画面だけ。運用画面は今までどおり)。
   * ⚠️ **2026-08 のリリース準備で `hidden: true` にした。** 運用画面（ダッシュボード・
   * タイマー管理・番組設定）は制作技術支援のミニアプリ（`/techops/live/:ownerKey` 等）へ
   * 移植済みで、単独の入口として出す旧UIはもう無い（`client-live/CLAUDE.md`
   * 「ミニアプリ化フェーズ2」参照）。トップのタイル・アプリ切替・左メニュー・⌘K からは
   * 消えるが、**エントリ自体は消さない** — `/live/display/:timerId`（放送出力・認証無し）と
   * `/live/open?project=` を経由するミニアプリ導線・旧URLの転送はそのまま生きているため、
   * `appOfPath()` がこの定義を引けなくなると壊れる。
   */
  { key: 'liveops',     label: '計時・視聴者',       description: '本番の残り時間と同時視聴者数を大画面に表示',      icon: Timer,         color: '#ef4444', path: '/live',       permissionModule: 'qsheet',    hidden: true },

  /* ── 廃止 (後継＝制作技術支援＞テロップCG。段F・2026-09-06。コードは保存のみ・URL到達不可) ── */
  { key: 'awards',      label: 'リアルタイムCG',     description: '制作技術支援＞テロップCGへ移行済み（廃止）', icon: Tv,            color: '#f59e0b', path: '/awards',     permissionModule: 'awards',    frozen: true },

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

interface AppAccess {
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

interface VisibleAppsOptions extends AppAccess {
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
