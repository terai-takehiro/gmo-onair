/**
 * 資料のテンプレ（スライドの骨組み）— **server 側の写し**。
 *
 * 正は `shared/src/keepReport/templates.ts`（画面のプレビューと pptx が同じ位置・同じ部品で描くための1か所）。
 * ⚠️ **server は `shared/` を import できません**（`rootDir` が `server/src`）ので、ここに写しを持ちます。
 * `shared/tests/keepReportDeckParity.test.ts` が **両方を deep-equal で照合**しています（1文字違っても落ちる）。
 * **正を直したら、このファイルも同じに直すこと。**
 */
import type { SlideTemplateKey } from './keep-deck.types';

/**
 * フォーマットの色（pptx と画面の両方で使う。CSS トークンではなく資料の色）。
 * **実物**（`GMO流会議フォーマット_Ver_2_5.pptx`）から読んだ値: 題 #005BAC（マスターの titleStyle）・
 * メイン（ポジ情報）#005AAC・アクセント（ネガ情報）#D62825・マーカー #FFFF00（マスター脇の色見本）・
 * 帯の青 ＝ テーマの accent1 #0047C0 に lumMod 20%／lumOff 80% を掛けたもの（HSL で #BFD7FF）・帯の緑 #D2ECD8・
 * 本文 #262626（色見本「本文24pt」）・ページ番号 ＝ bg1 の lumMod 50%（#808080）。
 * 表の紺・案件ページの帯・罫線は ONAiR 側の決め（docs/design/v4/keep-report.md §6.3「変えてよいもの」）。
 */
export const FORMAT_COLORS = {
  title: '005BAC',        // 題の青
  tableHead: '2B5AA8',    // 表の紺（ONAiR）
  band: '1F4E9C',         // 案件ページの帯（ONAiR）
  positive: '005AAC',     // メイン（ポジ情報）・フッターのタグ
  negative: 'D62825',     // アクセント（ネガ情報）・帯の注記・上書きの赤
  confidential: 'C00000', // フッターの Strictly confidential
  marker: 'FFFF00',
  kgi: '7CFC00',
  kpi: 'FFFF00',
  talkBlue: 'BFD7FF',     // 帯（進行担当／発表者）
  talkGreen: 'D2ECD8',    // 帯（会議オーナー／全員）
  positiveLight: 'CCDEEE',
  negativeLight: 'F7D4D3',
  text: '262626',
  muted: '5D6470',
  pageNo: '808080',
  line: '9FB3D6',
} as const;

/** フォーマットの文字の大きさ（pt）。題・帯・フッター・表紙・Appendix は実物の値、本文系は目安。 */
export const FORMAT_FONT = {
  family: 'Noto Sans JP',
  title: 36,          // 題（レイアウトの lstStyle。マスターは 28 だがレイアウトが 36 に上書き）
  subheading: 28,
  body: 24,
  band: 18,           // トークスクリプトの帯（otherStyle の既定 18pt）
  table: 18,
  tableDense: 12,
  footerTag: 10,      // フッターのタグ
  confidential: 12,   // Strictly confidential
  pageNo: 24,         // ページ番号（太字）
  coverTitle: 72,     // 表紙の会議名（太字）
  coverSub: 40,       // 表紙の部署・プロジェクト名と日付
  coverNote: 24,      // 表紙の青い箱
  coverGuide: 20,     // 表紙の注意書き
  appendix: 54,
} as const;

export const FORMAT_FOOTER = {
  /** ワードマーク（画像・`formatAssets.ts` の wordmark）の代替文 */
  logo: 'GMO INTERNET GROUP',
  tag: 'GMO流会議フォーマットVer.2.5（適用開始：2025/10/24）',
  confidential: 'Strictly confidential for internal use only',
} as const;

/** 表紙の固定文（実物の表紙そのまま）。青い箱は 2 行・注意書きは 3 行。部品の binding に固定文として入る */
export const COVER_TEXT = {
  orgName: 'GMOサムライスタジオ',
  versionNote: '※この資料はGMO流会議フォーマットVer.2.5を使用\n適用開始：2025/10/24(フッター記載)　更新期限：2025/11/7',
  guide: '※パワポ全画面表示を投影する\n※進行担当・発表者は、青枠トークスクリプト通りに読み進める（タイトルは読まない）\n　タイトルを読む時間=約1分でも、会議数×会議参加人数分の時間の節約につながる',
} as const;

/** 締めのページの絵（`formatAssets.ts` の tagline）を指す binding */
export const TAGLINE_BINDING = '$format_tagline';

/** スライドの実寸（インチ・16:9 の LAYOUT_WIDE ＝ 12192000×6858000 EMU）。% ⇄ インチの換算はこれで */
export const SLIDE_IN = { w: 13.333, h: 7.5 } as const;

export interface InchBox { x: number; y: number; w: number; h: number }

/**
 * ヘッダー・フッターの寸法（インチ）。**実物の pptx の XML から読んだ値**（EMU ÷ 914400・小数 3 桁）。
 * 題 ＝ レイアウト「8．アジェンダ」の title placeholder／帯とアイコン ＝ 報告ページ（slide15）／
 * フッターのロゴ・Strictly confidential・ページ番号 ＝ スライドマスター／タグ ＝ 各ページの「コンテンツ プレースホルダー 2」／
 * 表紙・Appendix・締め ＝ それぞれの実物の位置。pptx はこのインチをそのまま使い、画面は `pctBox` で % にして描く。
 */
export const FORMAT_CHROME = {
  title: { x: 0.234, y: 0.124, w: 9.817, h: 0.707 },
  /** 帯は 2 本。角丸は roundRect の既定（短辺の 16.67%） */
  band: { x: 0.234, w: 13.003, h: 0.449, top: [0.86, 1.422], radius: 0.075 },
  /** 帯の左端のスピーカー（帯の中で縦中央） */
  bandIcon: { x: 0.379, size: 0.396 },
  /** 帯の注記（赤）は帯の右寄せ。ここから帯の右端の内側まで */
  bandNoteX: 7.4,
  /** 本文の上端（帯あり ＝ 報告ページの content placeholder の上端／題だけ ＝ レイアウトの body placeholder） */
  bodyTop: { bands: 1.983, title: 0.841 },
  footer: {
    logo: { x: 0.256, y: 7.166, w: 2.647, h: 0.166 },
    tag: { x: 2.988, y: 7.149, w: 3.952, h: 0.204 },
    confidential: { x: 9.234, y: 7.099, w: 3.442, h: 0.303 },
    pageNo: { x: 12.427, y: 7.046, w: 0.677, h: 0.404 },
  },
  cover: {
    title: { x: 0, y: 1.5, w: 13.333, h: 1.142 },
    /** 部署・プロジェクト名と日付の箱。上下 2 段に割って使う */
    sub: { x: 0, y: 2.898, w: 13.333, h: 1.453 },
    versionNote: { x: 1.559, y: 4.717, w: 10.215, h: 0.968 },
    guide: { x: 0.87, y: 5.947, w: 12.14, h: 1.01 },
  },
  appendix: { x: 0.367, y: 3.12, w: 12.385, h: 1.01 },
  closing: { x: 2.461, y: 2.548, w: 8.412, h: 2.403 },
} as const;

/** インチの箱 → キャンバスの %（部品の座標系）。小数 2 桁 */
export function pctBox(b: InchBox): { x: number; y: number; w: number; h: number } {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x: r((b.x / SLIDE_IN.w) * 100), y: r((b.y / SLIDE_IN.h) * 100), w: r((b.w / SLIDE_IN.w) * 100), h: r((b.h / SLIDE_IN.h) * 100) };
}

/** トークスクリプトの帯の文言。報告ページの既定。 */
export const TALK_BANDS = {
  report: [
    { tone: 'blue' as const, text: '発表者：おつかれさまです！' },
    { tone: 'green' as const, text: '全員：おつかれさまです！', note: '※全員で挨拶をしてから発表を始める' },
  ],
  owner: [
    { tone: 'blue' as const, text: '進行担当：ご確認ください' },
    { tone: 'green' as const, text: '会議オーナー：了解', note: '※オーナーの発言を合図に次のページへ進む' },
  ],
} as const;

export interface TemplateRegion {
  /** 部品の種類（SlidePart.type と同じ語彙） */
  type: 'table' | 'chart' | 'image' | 'text' | 'kpi' | 'calendar' | 'photos' | 'bullets';
  /** パックのどこを読むか（'$' で始まるものは資料の設定: $meeting_date など） */
  binding: string | null;
  x: number; y: number; w: number; h: number; // %
  /** 人が直せるか */
  editable: boolean;
  label: string;
}

export interface SlideTemplate {
  key: SlideTemplateKey;
  label: string;
  /** ヘッダーの形: title = 題だけ / bands = 題＋帯（report/owner の文言） / none = 表紙など */
  header: 'title' | 'bands-report' | 'bands-owner' | 'none';
  /** 題の既定（【】の書式は agenda から組む） */
  defaultTitle: string;
  regions: TemplateRegion[];
  /** 数字を持つページ（開くたびに最新の数字で組み直す） */
  auto: boolean;
}

/**
 * 帯の下から始まる本文の上端（%）。題だけのときは上に詰める。
 * 実物では帯の下の content placeholder が 1.983in（26.4%）から始まる（`FORMAT_CHROME.bodyTop`）。
 * フッターは 7.046in（94%）から始まるので、部品の下端は 93% までに収める。
 */
export const BODY_TOP = { bands: 27, title: 12, none: 0 } as const;

const R = (type: TemplateRegion['type'], binding: string | null, x: number, y: number, w: number, h: number, editable: boolean, label: string): TemplateRegion =>
  ({ type, binding, x, y, w, h, editable, label });
/** 実物の位置（インチ）から部品を置く */
const RB = (type: TemplateRegion['type'], binding: string | null, box: InchBox, editable: boolean, label: string): TemplateRegion => {
  const b = pctBox(box);
  return R(type, binding, b.x, b.y, b.w, b.h, editable, label);
};
const CV = FORMAT_CHROME.cover;

export const SLIDE_TEMPLATES: Record<SlideTemplateKey, SlideTemplate> = {
  // 表紙は実物のレイアウト「タイトルページ」そのまま: 会議名（72pt）／部署・プロジェクト名と日付（40pt）／
  // 青い箱（フォーマットの版）／注意書き。日付の部品を 2 番目に置くのは前からの並び（テストが index で見る）
  cover: { key: 'cover', label: '表紙', header: 'none', defaultTitle: 'GMOサムライスタジオ 隔週キープ', auto: true, regions: [
    RB('text', '$meeting_title', CV.title, true, '会議名'),
    RB('text', '$meeting_date', { x: CV.sub.x, y: CV.sub.y + CV.sub.h / 2, w: CV.sub.w, h: CV.sub.h / 2 }, false, '開催日'),
    RB('text', COVER_TEXT.orgName, { x: CV.sub.x, y: CV.sub.y, w: CV.sub.w, h: CV.sub.h / 2 }, true, '部署・プロジェクト名'),
    RB('text', COVER_TEXT.versionNote, CV.versionNote, true, 'フォーマットの版（青い箱）'),
    RB('text', COVER_TEXT.guide, CV.guide, true, '進行の注意書き'),
  ] },
  checklist: { key: 'checklist', label: '0. 利用方法チェックリスト', header: 'title', defaultTitle: '0. 会議フォーマット　利用方法チェックリスト', auto: false, regions: [
    R('bullets', null, 4, 14, 92, 76, true, 'チェック項目'),
  ] },
  slogan: { key: 'slogan', label: '1. 会議スローガン', header: 'bands-owner', defaultTitle: '1．会議スローガン', auto: false, regions: [
    R('text', null, 8, 28, 84, 48, true, 'スローガン'),
  ] },
  summary: { key: 'summary', label: '2. 情報サマリ', header: 'bands-owner', defaultTitle: '2．情報サマリ', auto: false, regions: [
    R('table', null, 4, 27, 92, 63, true, '会議名・目的・責任者・進行・頻度・共有ツール'),
  ] },
  org: { key: 'org', label: '3. 責任者＆組織図', header: 'bands-owner', defaultTitle: '3．責任者＆組織図（役割）', auto: false, regions: [
    R('image', null, 4, 27, 92, 63, true, '組織図'),
  ] },
  attendance: { key: 'attendance', label: '4. 参加者＆欠席者', header: 'bands-owner', defaultTitle: '4．参加者＆欠席者', auto: true, regions: [
    R('table', 'inputs.attendance', 4, 27, 92, 57, true, '参加者・参加率・未済者'),
  ] },
  prev_minutes: { key: 'prev_minutes', label: '5. 前回議事録サマリ', header: 'bands-owner', defaultTitle: '5．前回議事録サマリ', auto: true, regions: [
    R('bullets', 'minutes', 4, 27, 92, 63, true, '前回の決定事項・領域別サマリ'),
  ] },
  todo: { key: 'todo', label: '6. ToDoリスト', header: 'bands-owner', defaultTitle: '6．ToDoリスト', auto: true, regions: [
    R('table', 'todo', 2, 27, 96, 63, true, 'ToDo'),
  ] },
  schedule: { key: 'schedule', label: '7. 全体スケジュール', header: 'bands-owner', defaultTitle: '7．全体スケジュール', auto: false, regions: [
    R('image', null, 2, 27, 96, 65, true, '年間スケジュール'),
  ] },
  kpi_tree: { key: 'kpi_tree', label: '8. KPIツリー', header: 'bands-owner', defaultTitle: '8．KPIツリー', auto: false, regions: [
    R('image', null, 2, 27, 96, 65, true, 'KPIツリー'),
  ] },
  progress_charts: { key: 'progress_charts', label: '9. 進捗状況（グラフ）', header: 'bands-owner', defaultTitle: '9．進捗状況（定量・定性・KPI）', auto: true, regions: [
    R('chart', 'trend.revenue', 2, 27, 47, 65, false, '売上高と稼働件数'),
    R('chart', 'trend.utilization', 51, 27, 47, 65, false, 'スタジオ稼働率の推移'),
  ] },
  agenda: { key: 'agenda', label: '10. アジェンダ', header: 'bands-owner', defaultTitle: '10．アジェンダ', auto: true, regions: [
    R('bullets', '$agenda', 4, 27, 92, 65, true, '①〜⑦ の見出し'),
  ] },
  pl_table: { key: 'pl_table', label: '①数値報告（表）', header: 'bands-report', defaultTitle: '①数値報告・営業進捗【報告｜3×3｜5分】', auto: true, regions: [
    R('text', '$pl_heading', 6, 27, 40, 6, false, '見出し（8月 着地 など）'),
    R('text', '単位：千円', 70, 27, 24, 6, false, '単位'),
    R('table', 'landing.all', 2, 34, 80, 50, false, '目標／着地／判定／対目標比／対目標'),
    R('text', null, 83, 42, 15, 28, true, '注記（未確定の売上など）'),
  ] },
  pipeline_table: { key: 'pipeline_table', label: '①ヨミ表', header: 'title', defaultTitle: '①数値報告・営業進捗【報告｜3×3｜5分】', auto: true, regions: [
    R('text', '提案進行外部案件 ヨミ表', 2, 12, 60, 6, true, '小見出し'),
    R('table', 'pipeline.external', 2, 19, 96, 74, false, 'ヨミ表'),
  ] },
  project_page: { key: 'project_page', label: '案件ページ', header: 'title', defaultTitle: '①数値報告・営業進捗【報告｜3×3｜5分】', auto: true, regions: [
    R('text', 'project.band', 2, 12, 96, 6, false, '帯（お客様／イベント名／日付）'),
    R('text', 'project.confidence', 90, 1, 9, 9, false, '確度'),
    R('photos', 'project.photos', 2, 20, 36, 34, true, '写真'),
    R('bullets', 'project.summary_lines', 40, 19, 58, 34, true, '概要'),
    R('table', 'project.schedule', 2, 56, 52, 37, true, '進行表'),
    R('text', 'project.key_dates', 56, 57, 42, 16, false, 'チェック／リハ／本番'),
    R('text', 'project.intake_channel', 76, 74, 22, 6, false, '経路'),
    R('table', 'project.money', 64, 80, 34, 13, false, '売上／粗利'),
  ] },
  utilization_calendar: { key: 'utilization_calendar', label: '稼働カレンダー', header: 'title', defaultTitle: '①数値報告・営業進捗【報告｜3×3｜5分】', auto: true, regions: [
    R('calendar', 'calendars[0]', 2, 13, 47, 80, false, '当月'),
    R('calendar', 'calendars[1]', 51, 13, 47, 80, false, '翌月'),
  ] },
  event_report: { key: 'event_report', label: '②案件実施報告', header: 'bands-report', defaultTitle: '②案件実施報告【報告｜3×3｜5分】', auto: true, regions: [
    R('text', 'report.band', 2, 27, 96, 6, false, '帯（日付・案件名）'),
    R('photos', 'report.photos', 2, 35, 30, 58, true, '写真'),
    R('bullets', 'report.highlights', 34, 35, 62, 38, true, '成果の箇条書き'),
    R('table', 'report.money', 64, 80, 34, 13, false, '売上／粗利'),
  ] },
  inview: { key: 'inview', label: '③新規案件獲得（内覧会）', header: 'title', defaultTitle: '③新規案件獲得【報告｜3×3｜2分】', auto: true, regions: [
    R('bullets', 'inview.summary', 2, 14, 62, 30, true, '開催日・参加・満足度・所感'),
    R('table', 'inview.by_category', 12, 46, 46, 47, false, '来場者の分類'),
    R('photos', 'inview.photos', 66, 14, 32, 79, true, '写真'),
  ] },
  free: { key: 'free', label: '自由（文と写真）', header: 'title', defaultTitle: '【報告｜2×2｜1分】', auto: false, regions: [
    R('text', null, 2, 14, 96, 79, true, '本文'),
  ] },
  next_meeting: { key: 'next_meeting', label: '11. ToDo＆次回開催日', header: 'bands-owner', defaultTitle: '11．ToDo＆次回開催日', auto: true, regions: [
    R('bullets', 'todo.new', 2, 27, 96, 33, true, '今日決まった ToDo'),
    R('text', 'minutes.next_meeting_date', 2, 62, 60, 12, true, '次回開催日'),
  ] },
  appendix: { key: 'appendix', label: 'Appendix（区切り）', header: 'none', defaultTitle: 'Appendix', auto: false, regions: [
    RB('text', 'Appendix', FORMAT_CHROME.appendix, false, '見出し'),
  ] },
  // 実物のレイアウト「すべての人にインターネット」（締めの 1 枚）。絵は `formatAssets.ts` の tagline
  closing: { key: 'closing', label: '締め（すべての人にインターネット）', header: 'none', defaultTitle: 'すべての人にインターネット', auto: false, regions: [
    RB('image', TAGLINE_BINDING, FORMAT_CHROME.closing, false, 'GMO のタグライン'),
  ] },
  copied: { key: 'copied', label: '前回から写したページ', header: 'title', defaultTitle: '', auto: false, regions: [
    R('image', null, 0, 12, 100, 81, true, '前回のページ（画像）'),
  ] },
};

/** 標準の構成（260904 の資料の並び）。会議日の資料を初めて作るときはこれを使う。 */
export const STANDARD_DECK_ORDER: Array<{ template: SlideTemplateKey; repeat?: 'project_pages' | 'event_reports'; options?: Record<string, unknown> }> = [
  { template: 'cover' }, { template: 'checklist' }, { template: 'slogan' }, { template: 'summary' }, { template: 'org' },
  { template: 'attendance' }, { template: 'prev_minutes' }, { template: 'todo' }, { template: 'schedule' }, { template: 'kpi_tree' },
  { template: 'progress_charts' }, { template: 'agenda' },
  { template: 'pl_table', options: { mode: 'landing', entity: 'all' } },
  { template: 'pl_table', options: { mode: 'landing', entity: 'by_entity' } },
  { template: 'pl_table', options: { mode: 'forecast', entity: 'all' } },
  { template: 'pl_table', options: { mode: 'forecast', entity: 'by_entity' } },
  { template: 'pipeline_table', options: { list: 'external' } },
  { template: 'pipeline_table', options: { list: 'samurai' } },
  { template: 'project_page', repeat: 'project_pages' },
  { template: 'utilization_calendar' },
  { template: 'event_report', repeat: 'event_reports' },
  { template: 'inview' },
  { template: 'next_meeting' },
  { template: 'appendix' },
  { template: 'closing' },
];
