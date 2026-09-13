/**
 * 制作資料 v4 — ミニアプリのレジストリ（唯一の正）
 *
 * 「制作資料」というブロックアプリの中には、性質の違う道具が複数入る
 * （進行台本＝Qシート・スケジュール表＝香盤表・収録設定・配信設定…）。
 * この表がその一覧で、名前・置き場所・URL をここに書けば、
 * 一覧・件数・作成メニュー・MCP の対象が全部そこから決まる。
 *
 * ── なぜここに置くか（`shared/src/client/` ではない） ─────────────
 * `shared/src/production/` は、どのアプリの Tailwind `content` にも入っていない。
 * つまりクラス名を1つも書かない純データ・純関数である限り、
 * ここに置いても凍結アプリの CSS には1バイトも影響しない。
 *
 * ── なぜ `client-techops/` に置かないか ──────────────────────────
 * `docPrefix` / `docNoSeq` は**サーバーが採番に使う**（`docNo.service.ts`）。
 * client にしか無いと、サーバーが同じ文字列を書き写すことになり、
 * 必ず片方だけ変わる。MCP（サーバー側）からも参照するため。
 *
 * ── サーバー側との複製 ──────────────────────────────────────────
 * サーバーは `server/src/` の外を import できないため、
 * `server/src/shared/production/miniapps.ts` に**意図的に複製**してある。
 * `scripts/check-collab-parity.mjs` の `PAIRS` が一致を検査する
 * （コメントの差は許容し、実装が1行でも違えば止める）。
 *
 * ── `AppTiles.tsx` の `MINI_APPS` とは別物 ──────────────────────
 * `client/src/contexts/platform/pages/home/AppTiles.tsx:79` に同名の
 * 定数が既にあるが、あちらは「日常業務のタイル内リンク」で無関係。
 * `grep MINI_APPS` が2件返すことを承知の上で、レジストリ側の名前は動かさない
 * （01 §3-2 と 05-mcp.md が参照するため）。
 *
 * ── `kind` 判別子（08・収録設定/配信設定で追加） ─────────────────
 * 01 §3-2 が定義した当初の `MiniAppDef`（`docPrefix`/`docNoSeq`/`table`/`docPath` が
 * 全部必須）は「資料が複数ある道具」（進行台本・スケジュール表）しか表せない。
 * 収録設定・配信設定は**案件に1セットだけ持つ道具**で、資料番号も一覧も
 * 個別 URL も持たない（`impl/08-recording-streaming-impl.md` §10-2）。
 * そこで `kind: 'document' | 'panel'` を足し、`MiniAppDef` を判別可能な union にした。
 * `kind: 'panel'` のときは `docPrefix` 以下を**持たせない**（型で強制する）。
 *
 * ── `kind: 'external'` は廃止した（計時・視聴者のミニアプリ化フェーズ2） ─────
 * 12-live-timer-decision.md §2 で、計時・視聴者（`liveops`）が**別の Vite バンドル**
 * （`client-live`・`base: '/live/'`）への遷移だったため一時的に `kind: 'external'`
 * （`crossBundle: true` を型に持たせ `<a href>` を強制する `ExternalMiniAppLink`）を
 * 追加していたが、計時・視聴者の運用画面を `client-techops` バンドル内
 * （`/techops/live/:ownerKey`）へ移植したことで「別バンドルへの本物の遷移」という前提
 * 自体が無くなった。収録設定・配信設定と同じ `kind: 'panel'` へ統合し、
 * `MiniAppExternalDef`・`externalPathOf`・`MiniAppKind` の `'external'` はすべて削除した
 * （他に使うミニアプリが無いことを確認済み）。
 */
import type { JourneyStage } from './journey';

/** ミニアプリのキー。URL・API・集計キーに出る安定キー。**あとから変えない** */
export type MiniAppKey = 'sheet' | 'schedule' | 'manual' | 'recording' | 'streaming' | 'rental' | 'liveops' | 'graphics' | 'venue';

export type MiniAppKind = 'document' | 'panel';

interface MiniAppBase {
  key: MiniAppKey;
  /** 画面と帳票に出す名前。**ここ以外に書かない**。`Qシート` / `qsheet` は内部識別子のみに残す */
  label: string;
  /** 一覧画面の名前（省略時は label） */
  listLabel?: string;
  /** `false` の間はレジストリ由来の導線に出さない（押すと 404 になる項目を作らない） */
  enabled: boolean;
}

/** 資料が複数ある道具（進行台本・スケジュール表）。案件配下に1件でも0件でも複数件でも持てる */
export interface MiniAppDocumentDef extends MiniAppBase {
  kind: 'document';
  /** 資料番号の接頭辞。**重複禁止・変えない**（配った番号が意味を失う） */
  docPrefix: string;
  /** `sequences.seq_name`。**重複禁止・変えない**（連番が飛ぶ） */
  docNoSeq: string;
  /** 資料を入れる表（`doc_no` 列を持つこと） */
  table: string;
  /** 一覧の URL */
  listPath: string;
  /** 資料1件の URL のひな形（`:id` を置換する） */
  docPath: string;
  /** 主に効くジャーニーの段 */
  stages: JourneyStage[];
}

/** 案件に1セットだけ持つ道具（収録設定・配信設定）。資料番号も一覧も個別URLも持たない */
export interface MiniAppPanelDef extends MiniAppBase {
  kind: 'panel';
  /** 画面の URL のひな形。`:ownerKey` を置換して使う */
  path: string;
}

export type MiniAppDef = MiniAppDocumentDef | MiniAppPanelDef;

/**
 * 初期値。**増やすときは1件ずつ**。
 *
 * `schedule` は段4（`02-schedule.md` の実装）で `true` にした。`qsheet_schedules` と
 * `/techops/schedules` が存在するようになったため、左メニュー・「＋新しく作る」に出してよい。
 *
 * `manual`（運営マニュアル）は段A（`production-manual.md` §9）で `true` にした。
 * 資料番号は `OM`、表は `qsheet_manuals`（migration 297）。§10 の決まったことに沿い、
 * `docPrefix`/`docNoSeq` はあとから変えない。段Aは器（一覧・空の冊子・ページ追加/並べ替え）
 * だけで、紙面のブロック編集（`kind: 'document'` の外側の話）は段B/Cで作る。
 */
export const MINI_APPS: MiniAppDef[] = [
  {
    kind: 'document',
    key: 'sheet',
    label: '進行台本',
    docPrefix: 'SB',
    docNoSeq: 'prod_doc_sb',
    table: 'qsheet_documents',
    listPath: '/techops/sheets',
    docPath: '/techops/editor/:id',
    stages: ['flow', 'script'],
    enabled: true,
  },
  {
    kind: 'document',
    key: 'schedule',
    label: 'スケジュール表',
    docPrefix: 'SD',
    docNoSeq: 'prod_doc_sd',
    table: 'qsheet_schedules',
    listPath: '/techops/schedules',
    docPath: '/techops/schedules/:id',
    stages: ['day'],
    enabled: true,
  },
  {
    kind: 'document',
    key: 'manual',
    label: '運営マニュアル',
    docPrefix: 'OM',
    docNoSeq: 'prod_doc_om',
    table: 'qsheet_manuals',
    listPath: '/techops/manuals',
    docPath: '/techops/manuals/:id',
    stages: ['day'],
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'recording',
    label: '収録設定',
    path: '/techops/recording/:ownerKey',
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'streaming',
    label: '配信設定',
    path: '/techops/streaming/:ownerKey',
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'rental',
    label: 'レンタル機材検索',
    path: '/techops/rental/:ownerKey',
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'liveops',
    label: '計時・視聴者',
    path: '/techops/live/:ownerKey',
    // 権限区画の統合（migration 232）で 'liveops' → 'qsheet' に変更した。
    // 計時・視聴者のミニアプリ化フェーズ2で運用画面を client-techops バンドルへ移植し
    // kind: 'panel' に統合した。
    //
    // ⚠️ `MiniAppBase.permissionModule`（ハブの区画と別区画のミニアプリだけ明示する
    // フィールド）は、権限区画の統合で liveops も 'qsheet' になり、他の panel 系
    // ミニアプリ（収録設定・配信設定など）と区画が揃ったことで**フィールドごと不要に
    // なった**ため削除した（v4.1 段2 レビュー対応 — フィールドが定義されているだけで
    // どこからも読まれていないことを確認済み。フェーズ1で追加した二重防御
    // 〔`ExternalMiniAppLink` の `hasPermission` チェック〕はミニアプリ化フェーズ2で
    // 既に削除済み）。
    //
    // ⚠️ レビュー対応（v4.1 段2）: 当初は resolve-by-project 自体が常に
    // 'qsheet'/'manager' を要求しており、reader/editor は既存セッションの閲覧すら
    // 常に 403 になっていた（上記の二重防御を外した直後に踏んだ回帰）。
    // resolve-by-project 側を「既存があれば reader で返す・無いときだけ manager で
    // 作成」の2段構えに直したことで、他の panel 系ミニアプリ（GET は reader で通る）
    // と同じ基準になった。ハブ自体の qsheet 権限ゲート（reader 以上）が唯一の防御でも
    // 安全 — タイル自体を隠す二重防御はもう要らない。残るのは「その案件で初めて開く
    // （program がまだ無い）ときは manager が要る」という他アプリにも共通の
    // 「作成には上の権限が要る」形の差だけ（気になる別の不具合ではあるが直すのは
    // このステージのスコープ外 — GROUND_RULES §6）。
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'graphics',
    // 旧「リアルタイムCG」（client-awards）の後継。番組を問わず使える汎用テロップ・CG を
    // techops のミニアプリとして作り直す（docs/design/v4/graphics.md §1）。
    // 単独アプリとしては再登場させない — 導線はハブ（JourneyPage）のタイルだけ。
    label: 'テロップCG',
    path: '/techops/graphics/:ownerKey',
    enabled: true,
  },
  {
    kind: 'document',
    key: 'venue',
    label: '会場図面',
    docPrefix: 'VL',
    docNoSeq: 'prod_doc_vl',
    table: 'qsheet_venue_layouts',
    listPath: '/techops/venue-layouts',
    docPath: '/techops/venue-layouts/:id',
    stages: ['day'],
    enabled: true,
  },
];

/** キーで引く */
export const MINI_APP_BY_KEY: Record<MiniAppKey, MiniAppDef> = MINI_APPS.reduce(
  (acc, app) => ({ ...acc, [app.key]: app }),
  {} as Record<MiniAppKey, MiniAppDef>,
);

/** `docPath` のひな形から `:id` を置換した実 URL を作る（`kind: 'document'` 専用） */
export function docPathOf(key: MiniAppKey, id: string): string {
  const app = MINI_APP_BY_KEY[key];
  if (app.kind !== 'document') {
    throw new Error(`docPathOf: '${key}' は document ではありません（kind=${app.kind}）`);
  }
  return app.docPath.replace(':id', id);
}

/** `path` のひな形に owner キーを埋める（`kind: 'panel'` 専用） */
export function panelPathOf(key: MiniAppKey, ownerKey: string): string {
  const app = MINI_APP_BY_KEY[key];
  if (app.kind !== 'panel') {
    throw new Error(`panelPathOf: '${key}' は panel ではありません（kind=${app.kind}）`);
  }
  return app.path.replace(':ownerKey', encodeURIComponent(ownerKey));
}

/** URL のひな形から、パラメータより前の固定部分だけを取り出す（前方一致に使う） */
function pathPrefix(path: string): string {
  const idx = path.search(/:[A-Za-z]+/);
  return idx >= 0 ? path.slice(0, idx) : path;
}

/**
 * URL からミニアプリを判定する。`apps.ts` の `appOfPath` と同じ作法で
 * **長い path から先に見る**（短い prefix が先に一致して誤判定するのを防ぐ）。
 */
export function miniAppOfPath(pathname: string): MiniAppDef | undefined {
  const candidates: { app: MiniAppDef; prefix: string }[] = [];
  for (const app of MINI_APPS) {
    if (app.kind === 'document') {
      candidates.push({ app, prefix: app.listPath }, { app, prefix: pathPrefix(app.docPath) });
    } else {
      candidates.push({ app, prefix: pathPrefix(app.path) });
    }
  }
  return candidates
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix))
    ?.app;
}

/** `enabled: true` のミニアプリだけ（左メニュー・「＋新しく作る」など導線に出す一覧） */
export function enabledMiniApps(): MiniAppDef[] {
  return MINI_APPS.filter((a) => a.enabled);
}
