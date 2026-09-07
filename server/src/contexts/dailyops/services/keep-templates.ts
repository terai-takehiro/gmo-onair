/**
 * 資料のテンプレ（スライドの骨組み）— **server 側の写し**。
 *
 * 正は `shared/src/keepReport/templates.ts`（画面のプレビューと pptx が同じ位置・同じ部品で描くための1か所）。
 * ⚠️ **server は `shared/` を import できません**（`rootDir` が `server/src`）ので、ここに写しを持ちます。
 * `shared/tests/keepReportDeckParity.test.ts` が **両方を deep-equal で照合**しています（1文字違っても落ちる）。
 * **正を直したら、このファイルも同じに直すこと。**
 */
import type { SlideTemplateKey } from './keep-deck.types';

/** フォーマットの色（pptx と画面の両方で使う。CSS トークンではなく資料の色） */
export const FORMAT_COLORS = {
  title: '0B62C8',        // 題の青
  tableHead: '2B5AA8',    // 表の紺
  band: '1F4E9C',         // 案件ページの帯
  positive: '0B62C8',
  negative: 'D1202A',
  marker: 'FFF200',
  kgi: '7CFC00',
  kpi: 'FFF200',
  talkBlue: 'DBE8F6',
  talkGreen: 'DCEFD8',
  text: '111111',
  muted: '5D6470',
  line: '9FB3D6',
} as const;

/** フォーマットの文字の大きさ（pt）。目安。 */
export const FORMAT_FONT = {
  family: 'Noto Sans JP',
  title: 36,
  subheading: 28,
  body: 24,
  table: 18,
  tableDense: 12,
  footer: 9,
} as const;

export const FORMAT_FOOTER = {
  logo: 'GMO INTERNET GROUP',
  tag: 'GMO流会議フォーマットVer.2.5（適用開始：2025/10/24）',
  confidential: 'Strictly confidential for internal use only',
} as const;

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

/** 帯の下から始まる本文の上端（%）。題だけのときは上に詰める。 */
export const BODY_TOP = { bands: 22, title: 12, none: 0 } as const;

const R = (type: TemplateRegion['type'], binding: string | null, x: number, y: number, w: number, h: number, editable: boolean, label: string): TemplateRegion =>
  ({ type, binding, x, y, w, h, editable, label });

export const SLIDE_TEMPLATES: Record<SlideTemplateKey, SlideTemplate> = {
  cover: { key: 'cover', label: '表紙', header: 'none', defaultTitle: 'GMOサムライスタジオ 隔週キープ', auto: true, regions: [
    R('text', '$meeting_title', 8, 30, 84, 18, true, '会議名'),
    R('text', '$meeting_date', 8, 50, 84, 10, false, '開催日'),
  ] },
  checklist: { key: 'checklist', label: '0. 利用方法チェックリスト', header: 'title', defaultTitle: '0. 会議フォーマット　利用方法チェックリスト', auto: false, regions: [
    R('bullets', null, 4, 14, 92, 76, true, 'チェック項目'),
  ] },
  slogan: { key: 'slogan', label: '1. 会議スローガン', header: 'bands-owner', defaultTitle: '1．会議スローガン', auto: false, regions: [
    R('text', null, 8, 26, 84, 50, true, 'スローガン'),
  ] },
  summary: { key: 'summary', label: '2. 情報サマリ', header: 'bands-owner', defaultTitle: '2．情報サマリ', auto: false, regions: [
    R('table', null, 4, 24, 92, 66, true, '会議名・目的・責任者・進行・頻度・共有ツール'),
  ] },
  org: { key: 'org', label: '3. 責任者＆組織図', header: 'bands-owner', defaultTitle: '3．責任者＆組織図（役割）', auto: false, regions: [
    R('image', null, 4, 24, 92, 66, true, '組織図'),
  ] },
  attendance: { key: 'attendance', label: '4. 参加者＆欠席者', header: 'bands-owner', defaultTitle: '4．参加者＆欠席者', auto: true, regions: [
    R('table', 'inputs.attendance', 4, 24, 92, 60, true, '参加者・参加率・未済者'),
  ] },
  prev_minutes: { key: 'prev_minutes', label: '5. 前回議事録サマリ', header: 'bands-owner', defaultTitle: '5．前回議事録サマリ', auto: true, regions: [
    R('bullets', 'minutes', 4, 24, 92, 66, true, '前回の決定事項・領域別サマリ'),
  ] },
  todo: { key: 'todo', label: '6. ToDoリスト', header: 'bands-owner', defaultTitle: '6．ToDoリスト', auto: true, regions: [
    R('table', 'todo', 2, 24, 96, 66, true, 'ToDo'),
  ] },
  schedule: { key: 'schedule', label: '7. 全体スケジュール', header: 'bands-owner', defaultTitle: '7．全体スケジュール', auto: false, regions: [
    R('image', null, 2, 24, 96, 68, true, '年間スケジュール'),
  ] },
  kpi_tree: { key: 'kpi_tree', label: '8. KPIツリー', header: 'bands-owner', defaultTitle: '8．KPIツリー', auto: false, regions: [
    R('image', null, 2, 24, 96, 68, true, 'KPIツリー'),
  ] },
  progress_charts: { key: 'progress_charts', label: '9. 進捗状況（グラフ）', header: 'bands-owner', defaultTitle: '9．進捗状況（定量・定性・KPI）', auto: true, regions: [
    R('chart', 'trend.revenue', 2, 26, 47, 66, false, '売上高と稼働件数'),
    R('chart', 'trend.utilization', 51, 26, 47, 66, false, 'スタジオ稼働率の推移'),
  ] },
  agenda: { key: 'agenda', label: '10. アジェンダ', header: 'bands-owner', defaultTitle: '10．アジェンダ', auto: true, regions: [
    R('bullets', '$agenda', 4, 26, 92, 66, true, '①〜⑦ の見出し'),
  ] },
  pl_table: { key: 'pl_table', label: '①数値報告（表）', header: 'bands-report', defaultTitle: '①数値報告・営業進捗【報告｜3×3｜5分】', auto: true, regions: [
    R('text', '$pl_heading', 6, 23, 40, 6, false, '見出し（8月 着地 など）'),
    R('text', '単位：千円', 70, 23, 24, 6, false, '単位'),
    R('table', 'landing.all', 2, 31, 80, 52, false, '目標／着地／判定／対目標比／対目標'),
    R('text', null, 83, 40, 15, 30, true, '注記（未確定の売上など）'),
  ] },
  pipeline_table: { key: 'pipeline_table', label: '①ヨミ表', header: 'title', defaultTitle: '①数値報告・営業進捗【報告｜3×3｜5分】', auto: true, regions: [
    R('text', '提案進行外部案件 ヨミ表', 2, 12, 60, 6, true, '小見出し'),
    R('table', 'pipeline.external', 2, 19, 96, 76, false, 'ヨミ表'),
  ] },
  project_page: { key: 'project_page', label: '案件ページ', header: 'title', defaultTitle: '①数値報告・営業進捗【報告｜3×3｜5分】', auto: true, regions: [
    R('text', 'project.band', 2, 12, 96, 6, false, '帯（お客様／イベント名／日付）'),
    R('text', 'project.confidence', 90, 1, 9, 9, false, '確度'),
    R('photos', 'project.photos', 2, 20, 36, 34, true, '写真'),
    R('bullets', 'project.summary_lines', 40, 19, 58, 34, true, '概要'),
    R('table', 'project.schedule', 2, 56, 52, 40, true, '進行表'),
    R('text', 'project.key_dates', 56, 57, 42, 16, false, 'チェック／リハ／本番'),
    R('text', 'project.intake_channel', 76, 74, 22, 6, false, '経路'),
    R('table', 'project.money', 64, 80, 34, 16, false, '売上／粗利'),
  ] },
  utilization_calendar: { key: 'utilization_calendar', label: '稼働カレンダー', header: 'title', defaultTitle: '①数値報告・営業進捗【報告｜3×3｜5分】', auto: true, regions: [
    R('calendar', 'calendars[0]', 2, 13, 47, 82, false, '当月'),
    R('calendar', 'calendars[1]', 51, 13, 47, 82, false, '翌月'),
  ] },
  event_report: { key: 'event_report', label: '②案件実施報告', header: 'bands-report', defaultTitle: '②案件実施報告【報告｜3×3｜5分】', auto: true, regions: [
    R('text', 'report.band', 2, 24, 96, 6, false, '帯（日付・案件名）'),
    R('photos', 'report.photos', 2, 32, 30, 64, true, '写真'),
    R('bullets', 'report.highlights', 34, 32, 62, 40, true, '成果の箇条書き'),
    R('table', 'report.money', 64, 80, 34, 16, false, '売上／粗利'),
  ] },
  inview: { key: 'inview', label: '③新規案件獲得（内覧会）', header: 'title', defaultTitle: '③新規案件獲得【報告｜3×3｜2分】', auto: true, regions: [
    R('bullets', 'inview.summary', 2, 14, 62, 30, true, '開催日・参加・満足度・所感'),
    R('table', 'inview.by_category', 12, 46, 46, 50, false, '来場者の分類'),
    R('photos', 'inview.photos', 66, 14, 32, 82, true, '写真'),
  ] },
  free: { key: 'free', label: '自由（文と写真）', header: 'title', defaultTitle: '【報告｜2×2｜1分】', auto: false, regions: [
    R('text', null, 2, 14, 96, 82, true, '本文'),
  ] },
  next_meeting: { key: 'next_meeting', label: '11. ToDo＆次回開催日', header: 'bands-owner', defaultTitle: '11．ToDo＆次回開催日', auto: true, regions: [
    R('bullets', 'todo.new', 2, 24, 96, 36, true, '今日決まった ToDo'),
    R('text', 'minutes.next_meeting_date', 2, 62, 60, 12, true, '次回開催日'),
  ] },
  appendix: { key: 'appendix', label: 'Appendix（区切り）', header: 'none', defaultTitle: 'Appendix', auto: false, regions: [
    R('text', 'Appendix', 4, 40, 60, 20, false, '見出し'),
  ] },
  copied: { key: 'copied', label: '前回から写したページ', header: 'title', defaultTitle: '', auto: false, regions: [
    R('image', null, 0, 10, 100, 88, true, '前回のページ（画像）'),
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
];
