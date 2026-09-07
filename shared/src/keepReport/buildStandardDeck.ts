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
 * ⚠️ **server は `shared/` を import できません**。写しが
 * `server/src/contexts/dailyops/services/keep-deck-compose.ts` にあり、
 * `shared/tests/keepReportDeckParity.test.ts` が同じ材料で同じ答えになることを固定しています。
 */
import type { KeepReportPack, SlidePage, SlidePart, SlideTemplateKey } from './types';
import { SLIDE_TEMPLATES, STANDARD_DECK_ORDER, type TemplateRegion } from './templates';

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

/**
 * テンプレの部品の位置と大きさ。人が右の「このページ」で直したもの（`options.moved`）だけ前の版の値を残し、
 * それ以外は**テンプレの今の値**にする — 前は無条件に前の版の値を引き継いでいたため、テンプレを直しても
 * （帯を実物の高さにしても）次の会議の資料が古い位置のまま組まれ、題と見出しが帯の下に潜った（2026-09-07 の実測）
 */
function boxOf(pp: SlidePart, fp: SlidePart): Pick<SlidePart, 'x' | 'y' | 'w' | 'h'> {
  return pp.options?.moved === true ? { x: pp.x, y: pp.y, w: pp.w, h: pp.h } : { x: fp.x, y: fp.y, w: fp.w, h: fp.h };
}

/**
 * binding から「何番目の案件・実施報告か」の接頭辞（`project_pages[2].` 等）を外したもの。
 * 案件ページ・実施報告ページの binding は `newPage` が案件の**配列内の位置**から絶対パスに
 * 書き換える（`project.photos` → `project_pages[2].photos`）ため、前の回とくらべて手前の案件が
 * 1件消えるだけで後続の全案件の binding 文字列が変わる（`project_pages[2]` → `project_pages[1]`）。
 * ページ自体の id は案件IDで固定なので同じページと分かるのに、中の binding は完全一致しなくなる
 * （Codex 指摘・fresh evidence）。**部品が何を映すか**を見るには接頭辞を外した形で比べればよい。
 */
function bindingKey(binding: string | null): string | null {
  return binding ? binding.replace(/^(?:project_pages|event_reports)\[\d+\]\./, '') : null;
}

/**
 * テンプレの region から機械的に作られた部品の id か（`<pageId>:p<region index>`。`partFromRegion` 参照）。
 * 人が右の「このページ」から足した部品は `newId('part')`（`client-daily/.../deckState.ts`）で
 * `part_xxxxxxxx` の形になり、この形にはならない。
 */
function isGeneratedPartId(pageId: string, id: string): boolean {
  return new RegExp(`^${pageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:p\\d+$`).test(id);
}

/**
 * 前の版の部品を今回のどの部品に対応させるか。
 * ⚠️ id（`pageId:p<region index>`）だけで揃えると、テンプレの regions の**並びや数を変えた回**に
 * 別の部品の中身が引き継がれる — 2026-09 のデザイン刷新（確度の枠を廃止・内覧会の並び替え）で
 * 実際に「写真の選び方が総括カードに乗る」「総括の上書きが進行表に乗る」「消したはずの確度の枠が
 * 余分な部品として残る」が起きた（Codex 指摘）。**binding（何の値を映す部品か）は region の並びを
 * 変えても同じ**なので、まず binding（案件の配列内の位置を外した形。上記 `bindingKey`）で揃え、
 * binding が無い部品（自由記入など）だけ id で揃える。
 */
function carryOver(fresh: SlidePage, prev: SlidePage): SlidePage {
  const used = new Set<SlidePart>();
  const findPrev = (fp: SlidePart): SlidePart | undefined => {
    // binding がある部品は binding だけで揃える。前の版に同じ binding が無ければ
    // 「対応する部品は無い」が正しい答え — ここで id にフォールバックすると、たまたま同じ
    // region 番号にいた別の binding の部品を拾ってしまう（Codex 指摘・fresh evidence）。
    // id フォールバックは、そもそも binding で見分けようが無い部品（自由記入など）専用
    if (fp.binding) {
      const fk = bindingKey(fp.binding);
      return prev.parts.find((x) => bindingKey(x.binding) === fk && !used.has(x));
    }
    return prev.parts.find((x) => x.id === fp.id && !used.has(x));
  };
  const parts = fresh.parts.map((fp) => {
    const pp = findPrev(fp);
    if (!pp) return fp;
    used.add(pp);
    // 人が付けた options（写真の選び方・文字の大きさなど）と上書きの文は残し、テンプレ由来の鍵（label / mode / entity / list）は今の値にする
    return { ...fp, ...boxOf(pp, fp), text_override: pp.text_override, options: { ...(pp.options ?? {}), ...(fp.options ?? {}) } };
  });
  // 残った前の版の部品: 人が足した部品（id が `newId('part')` の形）だけ残す。
  // テンプレの region から作られた部品（id が `<pageId>:p<N>` の形）で対応先が見つからなかったものは、
  // 「今のテンプレにはもう無い region」＝廃止された枠なので捨てる。捨てずに残すと、id がテンプレの
  // 並びから再び振られる新しい部品と衝突し（同じ id の部品が2つになる）、画面の選択・削除や pptx の
  // 出力が両方の部品を区別できなくなる（Codex 指摘・fresh evidence）
  for (const pp of prev.parts) if (!used.has(pp) && !isGeneratedPartId(fresh.id, pp.id)) parts.push({ ...pp });
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
    const f = freshById.get(p.id);
    if (p.auto) {
      if (!f) continue;
      merged.push(carryOver(f, p));
    } else {
      // 固定ページ（人が中身を書く）は中身をそのまま写す。テンプレの部品の位置だけは今のテンプレに揃える（人が足した部品はそのまま）
      merged.push({ ...p, parts: p.parts.map((x) => { const fp = f?.parts.find((y) => y.id === x.id); return fp ? { ...x, ...boxOf(x, fp) } : { ...x }; }) });
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
