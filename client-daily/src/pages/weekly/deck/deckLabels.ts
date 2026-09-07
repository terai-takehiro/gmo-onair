/**
 * 資料ビルダーの言葉 — ページの種類の札・一覧に出す短い題・会議日の書式
 *
 * 画面の3つの枠（ページ一覧・キャンバス・部品）が同じ言葉で同じページを指すように、
 * 題と札の決め方をここ1か所に置く（片方だけ直すと「一覧の名前とキャンバスの名前が違う」になる）。
 */
import { SLIDE_TEMPLATES } from '@gmo-onair/shared/src/keepReport/templates';
import {
  BUSINESS_ENTITY_LABELS,
  type KeepDeck, type KeepReportPack, type ProjectPageData, type SlidePage, type SlidePart, type SlideTemplateKey,
} from '@gmo-onair/shared/src/keepReport/types';

/** ページの種類の札（モック `Builder.dc.html` の5種） */
export type PageKind = '自動' | '固定' | '前回' | '手' | '自動＋手';

export const KIND_CLASS: Record<PageKind, string> = {
  '自動': 'bg-primary-surface text-primary',
  '自動＋手': 'bg-primary-surface text-primary',
  '固定': 'bg-muted text-muted-foreground',
  '前回': 'bg-muted text-muted-foreground',
  '手': 'bg-warning-surface text-warning',
};

/** 会議フォーマットの固定ページ（数字を持たず、人が足したものでもない）。`free` だけは「手」 */
const FIXED_TEMPLATES = new Set<SlideTemplateKey>(
  (Object.keys(SLIDE_TEMPLATES) as SlideTemplateKey[]).filter((k) => !SLIDE_TEMPLATES[k].auto && k !== 'free'),
);

/** 一覧で畳む先頭の並び（モック「1〜8 表紙・会議フォーマット」） */
export const LEAD_TEMPLATES = new Set<SlideTemplateKey>([
  'cover', 'checklist', 'slogan', 'summary', 'org', 'attendance', 'prev_minutes', 'todo',
]);

export function hasOverride(part: SlidePart): boolean {
  return part.text_override !== null && part.text_override !== undefined && part.text_override !== '';
}

export function pageHumanEdits(page: SlidePage): number {
  return page.parts.filter(hasOverride).length + (page.removed ? 1 : 0);
}

export function pageKind(page: SlidePage): PageKind {
  if (page.template === 'copied') return '前回';
  if (page.template === 'free') return '手';
  const edited = page.parts.some(hasOverride);
  if (SLIDE_TEMPLATES[page.template]?.auto) return edited ? '自動＋手' : '自動';
  if (FIXED_TEMPLATES.has(page.template)) return '固定';
  return page.auto ? '自動' : '手';
}

/** 「人が直した N か所」= 消したページ ＋ 人が足したページ ＋ 上書きした部品 */
export function humanEditCount(deck: KeepDeck | null): number {
  if (!deck) return 0;
  let n = 0;
  for (const p of deck.pages) {
    if (p.removed) n += 1;
    if (!p.removed && !p.auto && !FIXED_TEMPLATES.has(p.template) && p.template !== 'copied') n += 1;
    n += p.parts.filter(hasOverride).length;
  }
  return n;
}

export function templateLabel(key: SlideTemplateKey): string {
  return SLIDE_TEMPLATES[key]?.label ?? key;
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
export function circled(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return n >= 1 && n <= 20 ? CIRCLED[n - 1] : `(${n})`;
}

/** 'YYYY-MM' → '8'（月の数字だけ） */
export function monthOf(ym: string | null | undefined): string {
  if (!ym || ym.length < 7) return '';
  return String(Number(ym.slice(5, 7)));
}

export type PlMode = 'landing' | 'forecast';
/** 数値報告の表の計上会社（`options.entity`）。`by_entity` は会社ごとの表を並べる */
export type PlEntity = 'all' | 'GJV' | 'GSS' | 'GMO' | 'by_entity';

export function plOptions(part: Pick<SlidePart, 'binding' | 'options'> | null | undefined): { mode: PlMode; entity: PlEntity } {
  const o = (part?.options ?? {}) as { mode?: string; entity?: string };
  const b = part?.binding ?? '';
  const mode: PlMode = o.mode === 'forecast' || b.startsWith('forecast') ? 'forecast' : 'landing';
  const fromBinding = b.split('.')[1];
  const raw = o.entity ?? fromBinding ?? 'all';
  const entity: PlEntity = (['all', 'GJV', 'GSS', 'GMO', 'by_entity'] as const).includes(raw as PlEntity) ? (raw as PlEntity) : 'all';
  return { mode, entity };
}

/**
 * 数値報告の表の binding。`options.mode` / `options.entity` と**必ず一緒に**変える —
 * 描画（画面のプレビューも pptx も）は binding で表を引くので、options だけ変えると
 * セレクタは新しい会社を指しているのに表は前のままになる。
 * 計上会社別（by_entity）は `landing` / `forecast` そのもの（PlByEntity のまとまり）、1社は `landing.GSS` のように点で繋ぐ
 */
export function plBinding(mode: PlMode, entity: PlEntity): string {
  return entity === 'by_entity' ? mode : `${mode}.${entity}`;
}

export function entityShort(entity: PlEntity): string {
  if (entity === 'all') return '全社';
  if (entity === 'by_entity') return '計上会社別';
  return BUSINESS_ENTITY_LABELS[entity];
}

/** 「8月 着地」「9月 着地見込」— 表の上の見出しと一覧の題の両方で使う */
export function plHeading(pack: KeepReportPack | null, part: Pick<SlidePart, 'binding' | 'options'> | null): string {
  const { mode, entity } = plOptions(part);
  const table = pack ? pack[mode].all : null;
  const ym = (part?.options?.year_month as string | undefined) ?? table?.year_month;
  const m = monthOf(ym);
  const head = `${m ? `${m}月 ` : ''}${mode === 'forecast' ? '着地見込' : '着地'}`;
  return entity === 'all' ? head : `${head} ${entityShort(entity)}`;
}

/** `project_pages[i]` / `event_reports[i]` を指す部品から、ページの案件を引く */
export function pageProject(pack: KeepReportPack | null, page: SlidePage): { data: ProjectPageData; role: 'project' | 'report' } | null {
  if (!pack) return null;
  for (const part of page.parts) {
    const pid = part.options?.project_id as string | undefined;
    if (pid) {
      const pp = pack.project_pages.find((p) => p.project_id === pid);
      if (pp) return { data: pp, role: 'project' };
      const er = pack.event_reports.find((p) => p.project_id === pid);
      if (er) return { data: er, role: 'report' };
    }
    const m = (part.binding ?? '').match(/^(project_pages|event_reports)\[(\d+)\]/);
    if (m) {
      const list = m[1] === 'project_pages' ? pack.project_pages : pack.event_reports;
      const d = list[Number(m[2])];
      if (d) return { data: d, role: m[1] === 'project_pages' ? 'project' : 'report' };
    }
  }
  return null;
}

/** 題から【カテゴリ｜緊急×重要｜時間】を落とした短い形 */
export function stripAgenda(title: string): string {
  return title.replace(/【[^】]*】\s*$/, '').trim();
}

/** ページ一覧・キャンバスの見出しに出す短い題（モックの並び） */
export function pageListTitle(page: SlidePage, pack: KeepReportPack | null): string {
  switch (page.template) {
    case 'pl_table': {
      const t = page.parts.find((p) => p.type === 'table') ?? null;
      return `①数値報告 ${plHeading(pack, t)}`;
    }
    case 'pipeline_table':
      return `①ヨミ表（${pipelineList(page) === 'samurai' ? 'サムライ関連' : '外部案件'}）`;
    case 'project_page': {
      const pj = pageProject(pack, page);
      return pj ? `案件${circled(pj.data.ordinal)} ${pj.data.band.customer_short}` : '案件ページ';
    }
    case 'event_report': {
      const pj = pageProject(pack, page);
      return pj ? `②実施報告${circled(pj.data.ordinal)} ${pj.data.band.customer_short}` : '②案件実施報告';
    }
    case 'utilization_calendar': {
      const months = (pack?.calendars ?? []).map((c) => `${monthOf(c.year_month)}月`).join('・');
      return `稼働カレンダー${months ? ` ${months}` : ''}`;
    }
    case 'inview':
      return '③新規案件獲得 内覧会';
    default: {
      const t = stripAgenda(page.title);
      return t || templateLabel(page.template);
    }
  }
}

/** ヨミ表ページの一覧の種類（`options.list`。部品の binding からも読む） */
export function pipelineList(page: SlidePage): 'external' | 'samurai' {
  const t = page.parts.find((p) => p.type === 'table');
  const fromOpt = t?.options?.list as string | undefined;
  if (fromOpt === 'samurai' || (t?.binding ?? '').includes('samurai')) return 'samurai';
  return 'external';
}

/** 部品の呼び名（テンプレの領域の名前があればそれ。無ければ種類） */
export function partLabel(part: SlidePart, page: SlidePage): string {
  // サーバーが組んだ部品はテンプレの領域の名前を `options.label` に持つ（`buildStandardDeck`）
  if (typeof part.options?.label === 'string' && part.options.label) return part.options.label;
  const region = SLIDE_TEMPLATES[page.template]?.regions.find((r) => r.binding === part.binding && r.type === part.type);
  if (region) return region.label;
  const byType: Record<SlidePart['type'], string> = {
    table: '表', chart: 'グラフ', image: '画像', text: '文', kpi: '数字', calendar: 'カレンダー', photos: '写真', bullets: '箇条書き',
  };
  return byType[part.type];
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

/** '2026-09-16' → '2026/9/16（水）' */
export function formatMeetingDate(iso: string | null | undefined): string {
  if (!iso) return '未定';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY[d.getDay()]}）`;
}

/** '2026-09-04' → '9/4' */
export function shortMd(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * その週の会議日。**次回の開催日が週の月曜以降ならそれ**、無ければ週の水曜を仮に置く
 * （docs/design/v4/keep-report.md §3「その週に開催日がある隔週キープ。無ければ次の開催日」。
 * 開催日が分からないときは人が上の日付で直す）。
 */
export function defaultMeetingDate(periodKey: string | null | undefined, nextMeeting: string | null | undefined): string | null {
  if (!periodKey || !/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return null;
  if (nextMeeting && nextMeeting >= periodKey) return nextMeeting;
  return addDays(periodKey, 2);
}
