/**
 * 資料の構成を組む（`buildStandardDeck.ts`）と binding の解決（`binding.ts`）。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 * - 前回の構成から組み直したとき、**人の直し（並び・上書き・消した印）が消えると誰も気づけない**
 *   （次回の会議で「先週直したのにまた元に戻っている」になる）
 * - binding は画面と pptx が同じ関数で読む。パスの読み違いは「画面では出るのに資料では空」になる
 */
import { describe, it, expect } from 'vitest';
import { buildStandardPages, composeDeckPages, newPage, parseAgendaTitle } from '../src/keepReport/buildStandardDeck';
import { resolveBinding, deckAgenda, dateLabel, monthLabel } from '../src/keepReport/binding';
import { STANDARD_DECK_ORDER } from '../src/keepReport/templates';
import type { KeepReportPack, SlidePage, SlidePart } from '../src/keepReport/types';
import sample from '../../server/src/contexts/dailyops/services/__fixtures__/keep-pack.sample.json';

const pack = sample as unknown as KeepReportPack;
const ctx = { meeting_date: pack.meeting_date };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const find = (pages: SlidePage[], id: string) => pages.find((p) => p.id === id)!;

describe('標準の構成（buildStandardPages）', () => {
  const pages = buildStandardPages(pack);

  it('repeat を展開し、案件ごとに同じ id が付く', () => {
    const fixed = STANDARD_DECK_ORDER.filter((e) => !e.repeat).length;
    expect(pages.length).toBe(fixed + pack.project_pages.length + pack.event_reports.length);
    expect(pages.map((p) => p.id)).toContain('project_page:prj-docl');
    expect(pages.map((p) => p.id)).toContain('event_report:prj-tbs');
    expect(new Set(pages.map((p) => p.id)).size).toBe(pages.length);
  });

  it('案件ページの相対パスは絶対パスに書き換わる', () => {
    const p = find(pages, 'project_page:prj-emb'); // 2件目
    expect(p.parts.map((x) => x.binding)).toEqual([
      'project_pages[1].band', 'project_pages[1].photos', 'project_pages[1].summary_lines',
      'project_pages[1].schedule', 'project_pages[1].key_dates', 'project_pages[1].intake_channel', 'project_pages[1].money',
    ]);
    expect(p.auto).toBe(true);
    expect(p.parts[0].id).toBe('project_page:prj-emb:p0');
  });

  it('数値報告は options から binding を決める（計上会社別はまとまりごと）', () => {
    expect(find(pages, 'pl_table:landing:all').parts.find((x) => x.type === 'table')!.binding).toBe('landing.all');
    expect(find(pages, 'pl_table:forecast:by_entity').parts.find((x) => x.type === 'table')).toMatchObject({ binding: 'forecast', options: { mode: 'forecast', entity: 'by_entity' } });
    expect(find(pages, 'pipeline_table:samurai').parts.map((x) => x.binding)).toEqual(['サムライ関連案件 ヨミ表', 'pipeline.samurai']);
  });

  it('題の書式【カテゴリ｜緊急×重要｜時間】を agenda に読む。固定ページは null', () => {
    expect(parseAgendaTitle('①数値報告・営業進捗【報告｜3×3｜5分】')).toEqual({ category: '報告', priority: '3×3', minutes: 5 });
    expect(find(pages, 'pl_table:landing:all').agenda).toEqual({ category: '報告', priority: '3×3', minutes: 5 });
    expect(find(pages, 'agenda').agenda).toBeNull();
  });

  it('パックが無くても組める（案件ページは 0 件）', () => {
    const empty = buildStandardPages(null);
    expect(empty.some((p) => p.template === 'project_page')).toBe(false);
    expect(empty.some((p) => p.id === 'pl_table:landing:all')).toBe(true);
  });
});

describe('前回の構成から組み直す（composeDeckPages）', () => {
  const prev = buildStandardPages(pack);
  // 人の直し: 題・注記・消す・上書き・並べ替え・人が足したページ
  const edited = clone(prev);
  find(edited, 'pl_table:landing:all').title = '①数値報告【報告｜3×3｜10分】';
  find(edited, 'pl_table:landing:all').parts[3].text_override = '注記を直した';
  find(edited, 'pl_table:landing:all').parts[3].options = { label: '注記', color: 'red' };
  find(edited, 'checklist').removed = true;
  find(edited, 'project_page:prj-docl').notes = '発表者メモ';
  const human = newPage('free', 'human-1', { title: '④施設の報告【報告｜2×2｜1分】', auto: false });
  const idx = edited.findIndex((p) => p.id === 'inview');
  edited.splice(idx, 0, human);
  const [cover, ...rest] = edited;
  const reordered = [...rest.slice(0, 2), cover, ...rest.slice(2)]; // 表紙を3番目へ

  it('人の直しが残り、自動ページは新しいパックで組み直される', () => {
    const next = composeDeckPages(reordered, pack);
    expect(find(next, 'pl_table:landing:all').title).toBe('①数値報告【報告｜3×3｜10分】');
    expect(find(next, 'pl_table:landing:all').parts[3].text_override).toBe('注記を直した');
    expect(find(next, 'pl_table:landing:all').parts[3].options).toEqual({ label: '注記（未確定の売上など）', color: 'red' }); // テンプレの label は今の値
    expect(find(next, 'checklist').removed).toBe(true);
    expect(find(next, 'project_page:prj-docl').notes).toBe('発表者メモ');
    expect(find(next, 'human-1')).toMatchObject({ template: 'free', auto: false, title: '④施設の報告【報告｜2×2｜1分】' });
    expect(next.map((p) => p.id).slice(0, 3)).toEqual(['checklist', 'slogan', 'cover']);
  });

  it('材料が無くなった自動ページは消え、増えた自動ページは標準の並びの位置に入る', () => {
    const smaller = clone(pack);
    smaller.project_pages = smaller.project_pages.filter((p) => p.project_id !== 'prj-emb');
    smaller.event_reports.push({ ...clone(pack.event_reports[0]), project_id: 'prj-new' });
    const next = composeDeckPages(reordered, smaller);
    const ids = next.map((p) => p.id);
    expect(ids).not.toContain('project_page:prj-emb');
    expect(ids.indexOf('event_report:prj-new')).toBe(ids.indexOf('event_report:prj-sp20') + 1);
    // 新しい案件ページは 1 件目（index の詰め直し）を指す
    expect(find(next, 'project_page:prj-27h').parts[0].binding).toBe('project_pages[1].band');
  });

  it('人が直した位置と大きさ（options.moved）は組み直しても残る。直していない部品はテンプレの今の位置に揃う', () => {
    const moved = clone(reordered);
    const page = find(moved, 'pl_table:landing:all');
    // 右の「このページ」で位置を直した部品（画面が options.moved を付ける）
    Object.assign(page.parts[3], { x: 5, y: 60, w: 90, h: 30, options: { ...(page.parts[3].options ?? {}), moved: true } });
    // 前の版のテンプレの位置が残っているだけの部品（印が無い）— テンプレを直したら今の位置に揃わないといけない
    Object.assign(page.parts[0], { x: 6, y: 23, w: 40, h: 6 });
    const next = composeDeckPages(moved, pack);
    expect(find(next, 'pl_table:landing:all').parts[3]).toMatchObject({ x: 5, y: 60, w: 90, h: 30, options: expect.objectContaining({ moved: true }) });
    const tpl = find(prev, 'pl_table:landing:all');
    expect(find(next, 'pl_table:landing:all').parts[0]).toMatchObject({ x: tpl.parts[0].x, y: tpl.parts[0].y, w: tpl.parts[0].w, h: tpl.parts[0].h });
    expect(find(next, 'pl_table:landing:all').parts[2]).toMatchObject({ x: tpl.parts[2].x, y: tpl.parts[2].y, w: tpl.parts[2].w, h: tpl.parts[2].h });
  });

  it('固定ページ（auto: false）でも、テンプレの部品の位置は今のテンプレに揃う。人が足した部品と中身はそのまま', () => {
    const stale = clone(reordered);
    const appendix = find(stale, 'appendix');
    expect(appendix.auto).toBe(false);
    Object.assign(appendix.parts[0], { x: 4, y: 40, w: 60, h: 20, text_override: '付録' }); // 前のテンプレの位置が残っているだけ
    appendix.parts.push({ id: 'human-part', type: 'text', binding: null, x: 10, y: 70, w: 50, h: 10, text_override: '人の文' });
    const next = composeDeckPages(stale, pack);
    const tpl = find(prev, 'appendix').parts[0];
    expect(find(next, 'appendix').parts[0]).toMatchObject({ x: tpl.x, y: tpl.y, w: tpl.w, h: tpl.h, text_override: '付録' });
    expect(find(next, 'appendix').parts[1]).toMatchObject({ id: 'human-part', x: 10, y: 70, w: 50, h: 10, text_override: '人の文' });
  });

  it('同じ構成で組み直しても何も変わらない（冪等）', () => {
    const once = composeDeckPages(reordered, pack);
    expect(composeDeckPages(once, pack)).toEqual(once);
  });

  it('前回の版でテンプレの region の並び・数が変わっていても、id ではなく binding で部品を揃える（テンプレ改修の回帰）', () => {
    // 2026-09 のデザイン刷新前（確度の枠が band の次の p1 にあった・現行の並びとは1つずれる）を模す。
    // 昔の carryOver は id（`pageId:p<region index>`）だけで揃えていたため、このパックを開き直すと
    // 「写真の選び方が総括カードに乗る」「総括の上書きが進行表に乗る」等、別の部品の中身が誤って引き継がれていた。
    const page = find(clone(prev), 'project_page:prj-docl');
    const [band, photos, summary, schedule, keyDates, intake, money] = page.parts;
    const stalePrev = clone(prev);
    const stalePage = find(stalePrev, 'project_page:prj-docl');
    stalePage.parts = [
      { ...band, id: `${page.id}:p0` },
      { id: `${page.id}:p1`, type: 'text', binding: 'project_pages[0].confidence', x: 90, y: 1, w: 9, h: 9, text_override: null, options: { label: '確度' } },
      { ...photos, id: `${page.id}:p2`, options: { ...photos.options, selected: ['old-photo'] } },
      { ...summary, id: `${page.id}:p3`, text_override: '旧概要' },
      { ...schedule, id: `${page.id}:p4` },
      { ...keyDates, id: `${page.id}:p5` },
      { ...intake, id: `${page.id}:p6` },
      { ...money, id: `${page.id}:p7`, options: { ...money.options, noted: true } },
    ];
    const next = composeDeckPages(stalePrev, pack);
    const np = find(next, 'project_page:prj-docl');
    const byBinding = (b: string) => np.parts.find((x) => x.binding === `project_pages[0].${b}`);
    expect(byBinding('photos')).toMatchObject({ type: 'photos', options: expect.objectContaining({ selected: ['old-photo'] }) });
    expect(byBinding('summary_lines')).toMatchObject({ type: 'bullets', text_override: '旧概要' });
    expect(byBinding('schedule')).toMatchObject({ type: 'table', text_override: null }); // 総括の上書きに巻き込まれていない
    expect(byBinding('money')).toMatchObject({ type: 'table', options: expect.objectContaining({ noted: true }) });
    // money はちょうど1つ（旧テンプレの p7 が別の余分な部品として二重に残っていない）
    expect(np.parts.filter((x) => x.binding === 'project_pages[0].money').length).toBe(1);
    // 廃止済みの確度の枠（テンプレの region から作られた id `…:p1`）は、対応先が無いのでそのまま捨てられる
    // （id を残したまま「人が足した部品」として復活させると、テンプレの並びから新しく振られる部品と
    // id が衝突する。下の id 一意性の検査が本体）
    expect(np.parts.filter((x) => x.binding === 'project_pages[0].confidence').length).toBe(0);
    expect(new Set(np.parts.map((x) => x.id)).size).toBe(np.parts.length); // id はちょうど1つずつ
  });

  it('手前の案件が消えて配列の位置がずれ、binding の絶対パスの番号が変わっても、同じ案件ページの部品は正しく対応する（Codex 指摘の追加ケース）', () => {
    // prj-27h は今は project_pages[2]（3件目）。手前の prj-emb を消すと project_pages[1] になり、
    // 中身は同じでも binding の絶対パスの文字列が変わる — 完全一致の binding 比較だけでは
    // また id（region 順）にフォールバックしてしまい、テンプレ改修と重なると取り違えが起きる。
    const page = find(clone(prev), 'project_page:prj-27h');
    const [band, photos, summary, schedule, keyDates, intake, money] = page.parts;
    const stalePrev = clone(prev);
    const stalePage = find(stalePrev, 'project_page:prj-27h');
    stalePage.parts = [
      { ...band, id: `${page.id}:p0` },
      { id: `${page.id}:p1`, type: 'text', binding: 'project_pages[2].confidence', x: 90, y: 1, w: 9, h: 9, text_override: null, options: { label: '確度' } },
      { ...photos, id: `${page.id}:p2`, options: { ...photos.options, selected: ['old-photo-27h'] } },
      { ...summary, id: `${page.id}:p3`, text_override: '旧概要27h' },
      { ...schedule, id: `${page.id}:p4` },
      { ...keyDates, id: `${page.id}:p5` },
      { ...intake, id: `${page.id}:p6` },
      { ...money, id: `${page.id}:p7`, options: { ...money.options, noted: true } },
    ];
    const smaller = clone(pack);
    smaller.project_pages = smaller.project_pages.filter((p) => p.project_id !== 'prj-emb'); // prj-27h が 2 → 1 番目に詰まる
    const next = composeDeckPages(stalePrev, smaller);
    const np = find(next, 'project_page:prj-27h');
    const byBinding = (b: string) => np.parts.find((x) => x.binding === `project_pages[1].${b}`); // 詰まった後の絶対パス
    expect(byBinding('photos')).toMatchObject({ type: 'photos', options: expect.objectContaining({ selected: ['old-photo-27h'] }) });
    expect(byBinding('summary_lines')).toMatchObject({ type: 'bullets', text_override: '旧概要27h' });
    expect(byBinding('schedule')).toMatchObject({ type: 'table', text_override: null });
    expect(byBinding('money')).toMatchObject({ type: 'table', options: expect.objectContaining({ noted: true }) });
    expect(np.parts.filter((x) => x.binding === 'project_pages[1].money').length).toBe(1);
    expect(np.parts.filter((x) => x.binding === 'project_pages[1].confidence').length).toBe(0); // 廃止済みの枠は捨てる
    expect(new Set(np.parts.map((x) => x.id)).size).toBe(np.parts.length); // id はちょうど1つずつ
  });

  it('人が足した部品（id が region 由来の形をしていない）は、対応先が見つからなくてもそのまま残る', () => {
    const stalePrev = clone(prev);
    const page = find(stalePrev, 'project_page:prj-docl');
    page.parts.push({ id: 'part_userAdded1', type: 'text', binding: null, x: 4, y: 90, w: 40, h: 6, text_override: '人が足したメモ' });
    const next = composeDeckPages(stalePrev, pack);
    const np = find(next, 'project_page:prj-docl');
    expect(np.parts.find((x) => x.id === 'part_userAdded1')).toMatchObject({ text_override: '人が足したメモ' });
  });
});

describe('binding の解決（resolveBinding）', () => {
  const pages = buildStandardPages(pack);
  const partOf = (pageId: string, i: number): [SlidePage, SlidePart] => { const p = find(pages, pageId); return [p, p.parts[i]]; };
  const value = (pageId: string, i: number) => { const [p, x] = partOf(pageId, i); const r = resolveBinding(pack, p, x, ctx); return r.ok ? r.value : r; };

  it('パスと配列の添字', () => {
    expect(value('pl_table:landing:all', 2)).toBe(pack.landing.all);
    expect(value('pipeline_table:samurai', 1)).toBe(pack.pipeline.samurai);
    expect(value('project_page:prj-docl', 2)).toEqual(pack.project_pages[0].summary_lines);
    expect(value('utilization_calendar', 1)).toBe(pack.calendars[1]);
  });

  it('仮想の葉: money / confidence / trend.* / inview.summary', () => {
    // money は band から confidence の枠（2026-09 刷新で廃止）が抜けた分、添字が7→6にずれる
    expect(value('project_page:prj-docl', 6)).toEqual({ revenue: 4_457_680, gross_profit: 1_890_000, gross_margin: 42.4 });
    // confidence は帯の右のバッジに統合され単独の部品では無くなったが、仮想の葉そのもの（`step()`）は生きている
    const bandPart: SlidePart = { id: 'x', type: 'text', binding: 'project_pages[0].confidence', x: 0, y: 0, w: 1, h: 1, text_override: null };
    expect(resolveBinding(pack, find(pages, 'project_page:prj-docl'), bandPart, ctx)).toMatchObject({ ok: true, value: { letter: 'B', label: '正式申込待' } });
    const rev = value('progress_charts', 0) as Array<{ year_month: string; internal: number; external: number; count: number }>;
    expect(rev[rev.length - 1]).toEqual({ year_month: '2026-08', internal: 1_289_293, external: 473_000, count: 2 });
    const util = value('progress_charts', 1) as Array<{ utilization: number | null }>;
    expect(util[util.length - 1].utilization).toBe(45);
    // inview.summary は 2026-09 刷新で InviewSummary そのもの（帯＋数字カードで組む。文字列の並びはやめた）
    expect(value('inview', 1)).toMatchObject({ session_date: '2026-08-26', groups: 50, people: 65, satisfaction: 3.9, promoted_projects: 2 });
  });

  it('資料の設定（$）と固定文', () => {
    expect(value('cover', 1)).toBe('2026-09-16');
    expect(value('cover', 0)).toBe('GMOサムライスタジオ 隔週キープ');
    expect(value('pl_table:landing:all', 0)).toBe('8月 着地');
    expect(value('pl_table:forecast:by_entity', 0)).toBe('9月 着地見込（計上会社別）');
    expect(value('pl_table:landing:all', 1)).toBe('単位：千円');
    expect(value('appendix', 0)).toBe('Appendix');
    const [p, x] = partOf('agenda', 0);
    expect(resolveBinding(pack, p, x, { ...ctx, agenda: deckAgenda(pages) })).toMatchObject({ ok: true, value: ['①数値報告・営業進捗【報告｜3×3｜5分】', '②案件実施報告【報告｜3×3｜5分】', '③内覧会報告【報告｜3×3｜2分】'] });
  });

  it('無いものは投げずに ok:false（理由とラベル付き）', () => {
    expect(value('inview', 0)).toEqual({ ok: false, reason: 'not_found', label: '写真' });          // inview.photos はパックに無い
    expect(value('next_meeting', 0)).toEqual({ ok: false, reason: 'not_found', label: '今日決まった ToDo' });
    expect(value('checklist', 0)).toEqual({ ok: false, reason: 'no_binding', label: 'チェック項目' });
    const [p, x] = partOf('pl_table:landing:all', 2);
    expect(resolveBinding(null, p, x, ctx)).toEqual({ ok: false, reason: 'no_pack', label: '目標／着地／判定／対目標比／対目標' });
    expect(resolveBinding(pack, p, { ...x, binding: 'project_pages[9].band' }, ctx)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(resolveBinding(pack, p, { ...x, binding: 'project.band' }, ctx)).toMatchObject({ ok: false, reason: 'not_found' }); // 書き換え前の相対パス
  });

  it('上書きが最優先。手入力は inputs から', () => {
    const [p, x] = partOf('pl_table:landing:all', 2);
    expect(resolveBinding(pack, p, { ...x, text_override: '人の文' }, ctx)).toEqual({ ok: true, value: '人の文', overridden: true });
    const [ap, ax] = partOf('attendance', 0);
    expect(resolveBinding(pack, ap, ax, ctx)).toMatchObject({ ok: false, reason: 'not_found' });
    expect(resolveBinding(pack, ap, ax, { ...ctx, inputs: { attendance: [['寺井', '○']] } })).toEqual({ ok: true, value: [['寺井', '○']], overridden: false });
  });

  it('日付・月の表示', () => {
    expect(dateLabel('2026-09-16')).toBe('2026/9/16（水）');
    expect(dateLabel(null)).toBe('');
    expect(monthLabel('2026-08')).toBe('8月');
  });
});
