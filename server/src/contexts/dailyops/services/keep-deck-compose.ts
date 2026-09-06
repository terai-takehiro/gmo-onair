/**
 * 資料の構成（ページの並び）を組む — **前回の構成 ＋ 新しいパック → 今回の構成**。
 *
 * ── 2つの入口 ────────────────────────────────────────────────
 * - `buildStandardPages(pack)` … 標準の構成（`STANDARD_DECK_ORDER`）から組む。会議日の資料を初めて作るとき
 * - `composeDeckPages(prevPages, pack)` … 前回（または今の版）の構成を写し、`auto: true` のページだけ
 *   新しいパックで組み直す。**人が足したページ・上書きした文・並び順・消した印は引き継ぐ**
 *   （docs/design/v4/keep-report.md §6.1）。組み直しは「開くたび」も「前回から写す」も同じ関数
 *
 * ── id の決め方（組み直しても同じページが同じ id になるように）──────────
 *   固定ページ … テンプレの名前（`cover` / `agenda` …）
 *   数値報告   … `pl_table:<mode>:<entity>`（`pl_table:landing:all` …。entity は all / GJV / GSS / GMO / by_entity）
 *   ヨミ表     … `pipeline_table:<list>`
 *   案件ページ … `project_page:<project_id>`、実施報告 … `event_report:<project_id>`
 *   部品       … `<page id>:p<番号>`（テンプレの regions の順）
 * 同じ案件は次の会議でも同じ id になるので、人が直した概要・写真の選び方が翌回の初期値になる。
 * 人が足したページの id は画面が付ける（uuid。ここでは触らない）。
 *
 * ── 相対パスの書き換え ──────────────────────────────────────
 * テンプレの `project.*` / `report.*` は、ここで `project_pages[i].*` / `event_reports[i].*` に書き換える
 * （`resolveBinding` は絶対パスしか読まない）。数値報告の表は `options.mode` / `options.entity` から
 * `landing.all` / `forecast.GSS` / `forecast`（計上会社別＝by_entity のときはまとまりごと）に、ヨミ表は `pipeline.external` / `pipeline.samurai` に決める。
 *
 * ⚠️ **これは server 側の写しです**（正は `shared/src/keepReport/buildStandardDeck.ts`）。
 * server は `shared/` を import できないため、同じ関数をここにも置きます。
 * `shared/tests/keepReportDeckParity.test.ts` が同じ材料で同じ答えになることを固定しています。
 */
import type { KeepReportPack, SlidePage, SlidePart, SlideTemplateKey } from './keep-deck.types';
import { SLIDE_TEMPLATES, STANDARD_DECK_ORDER, type TemplateRegion } from './keep-templates';

/** 題の書式【カテゴリ｜緊急×重要｜時間】を読む。合わなければ null（固定ページ） */
export function parseAgendaTitle(title: string): SlidePage['agenda'] {
  const m = /【([^｜|】]+)[｜|]([^｜|】]+)[｜|](\d+)分】/.exec(title);
  return m ? { category: m[1].trim(), priority: m[2].trim(), minutes: Number(m[3]) } : null;
}

function partFromRegion(pageId: string, i: number, r: TemplateRegion, binding: string | null, extra?: Record<string, unknown>): SlidePart {
  return {
    id: `${pageId}:p${i}`, type: r.type, binding,
    x: r.x, y: r.y, w: r.w, h: r.h, text_override: null,
    options: { label: r.label, ...(extra ?? {}) },
  };
}

export interface NewPageOptions {
  /** 相対パスの置き換え先（`project_pages[3]` / `event_reports[0]`） */
  source?: string;
  /** 数値報告: mode / entity、ヨミ表: list */
  options?: Record<string, unknown>;
  title?: string;
  auto?: boolean;
}

/** テンプレから1ページ作る。人がページを足すときも画面がこれを使う（id は呼ぶ側が決める） */
export function newPage(template: SlideTemplateKey, id: string, o: NewPageOptions = {}): SlidePage {
  const t = SLIDE_TEMPLATES[template];
  const opts = o.options ?? {};
  const parts = t.regions.map((r, i) => {
    let binding = r.binding;
    if (binding && o.source) binding = binding.replace(/^(project|report)\./, `${o.source}.`);
    if (template === 'pl_table' && r.type === 'table') {
      const mode = opts.mode === 'forecast' ? 'forecast' : 'landing';
      const entity = String(opts.entity ?? 'all');
      binding = entity === 'by_entity' ? mode : `${mode}.${entity}`;
      return partFromRegion(id, i, r, binding, { mode, entity });
    }
    if (template === 'pipeline_table') {
      const list = opts.list === 'samurai' ? 'samurai' : 'external';
      if (r.type === 'table') return partFromRegion(id, i, r, `pipeline.${list}`, { list });
      if (r.type === 'text') return partFromRegion(id, i, r, list === 'samurai' ? 'サムライ関連案件 ヨミ表' : '提案進行外部案件 ヨミ表');
    }
    return partFromRegion(id, i, r, binding);
  });
  const title = o.title ?? t.defaultTitle;
  return {
    id, template, title, auto: o.auto ?? t.auto, parts, removed: false, notes: null,
    agenda: parseAgendaTitle(title),
  };
}

/** 標準の構成。`repeat` はパックの件数ぶん展開する（パックが無ければ 0 ページ） */
export function buildStandardPages(pack: KeepReportPack | null): SlidePage[] {
  const pages: SlidePage[] = [];
  for (const entry of STANDARD_DECK_ORDER) {
    const { template, repeat, options } = entry;
    if (repeat === 'project_pages' || repeat === 'event_reports') {
      const items = pack?.[repeat] ?? [];
      items.forEach((item, i) => {
        pages.push(newPage(template, `${template}:${item.project_id}`, { source: `${repeat}[${i}]` }));
      });
      continue;
    }
    let id: string = template;
    if (template === 'pl_table') id = `pl_table:${options?.mode ?? 'landing'}:${options?.entity ?? 'all'}`;
    if (template === 'pipeline_table') id = `pipeline_table:${options?.list ?? 'external'}`;
    pages.push(newPage(template, id, { options }));
  }
  return pages;
}

/** 自動ページを組み直したうえで、前の版の人の直しを乗せる */
function carryOver(fresh: SlidePage, prev: SlidePage): SlidePage {
  const parts = fresh.parts.map((fp) => {
    const pp = prev.parts.find((x) => x.id === fp.id);
    if (!pp) return fp;
    // 人が付けた options（写真の選び方など）は残し、テンプレ由来の鍵（label / mode / entity / list）は今の値にする
    return { ...fp, text_override: pp.text_override, options: { ...(pp.options ?? {}), ...(fp.options ?? {}) } };
  });
  for (const pp of prev.parts) if (!fresh.parts.some((x) => x.id === pp.id)) parts.push({ ...pp }); // 人が足した部品
  return {
    ...fresh, parts, title: prev.title, notes: prev.notes, removed: prev.removed,
    agenda: prev.agenda === undefined ? fresh.agenda : prev.agenda,
  };
}

/**
 * 前の構成（前回の会議、または今の版）を写して、自動ページを新しいパックで組み直す。
 * - `auto: true` で今のパックに材料が無くなったページ（載せる印を外した案件など）は消える
 * - 新しく増えた自動ページは、標準の並びで直前にあるページの後ろに入る
 * - `auto: false`（人が足した・前回から写した）はそのまま
 */
export function composeDeckPages(prevPages: SlidePage[] | null, pack: KeepReportPack | null): SlidePage[] {
  const fresh = buildStandardPages(pack);
  if (!prevPages) return fresh;
  const freshById = new Map(fresh.map((p) => [p.id, p]));
  const merged: SlidePage[] = [];
  const seen = new Set<string>();
  for (const p of prevPages) {
    if (seen.has(p.id)) continue;
    if (p.auto) {
      const f = freshById.get(p.id);
      if (!f) continue;
      merged.push(carryOver(f, p));
    } else {
      merged.push({ ...p, parts: p.parts.map((x) => ({ ...x })) });
    }
    seen.add(p.id);
  }
  fresh.forEach((f, i) => {
    if (seen.has(f.id)) return;
    let at = -1;
    for (let j = i - 1; j >= 0 && at < 0; j--) at = merged.findIndex((m) => m.id === fresh[j].id);
    merged.splice(at + 1, 0, f);
    seen.add(f.id);
  });
  return merged;
}
