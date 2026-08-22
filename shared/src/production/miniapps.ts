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
 * ── なぜ `client-qsheet/` に置かないか ──────────────────────────
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
 */
import type { JourneyStage } from './journey';

/** ミニアプリのキー。URL・API・集計キーに出る安定キー。**あとから変えない** */
export type MiniAppKey = 'sheet' | 'schedule' | 'recording' | 'streaming' | 'rental';

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
 * `/qsheet/schedules` が存在するようになったため、左メニュー・「＋新しく作る」に出してよい。
 */
export const MINI_APPS: MiniAppDef[] = [
  {
    kind: 'document',
    key: 'sheet',
    label: '進行台本',
    docPrefix: 'SB',
    docNoSeq: 'prod_doc_sb',
    table: 'qsheet_documents',
    listPath: '/qsheet/sheets',
    docPath: '/qsheet/editor/:id',
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
    listPath: '/qsheet/schedules',
    docPath: '/qsheet/schedules/:id',
    stages: ['day'],
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'recording',
    label: '収録設定',
    path: '/qsheet/recording/:ownerKey',
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'streaming',
    label: '配信設定',
    path: '/qsheet/streaming/:ownerKey',
    enabled: true,
  },
  {
    kind: 'panel',
    key: 'rental',
    label: 'レンタル機材検索',
    path: '/qsheet/rental/:ownerKey',
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
