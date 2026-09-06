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
      'project_pages[1].band', 'project_pages[1].confidence', 'project_pages[1].photos', 'project_pages[1].summary_lines',
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

  it('同じ構成で組み直しても何も変わらない（冪等）', () => {
    const once = composeDeckPages(reordered, pack);
    expect(composeDeckPages(once, pack)).toEqual(once);
  });
});

describe('binding の解決（resolveBinding）', () => {
  const pages = buildStandardPages(pack);
  const partOf = (pageId: string, i: number): [SlidePage, SlidePart] => { const p = find(pages, pageId); return [p, p.parts[i]]; };
  const value = (pageId: string, i: number) => { const [p, x] = partOf(pageId, i); const r = resolveBinding(pack, p, x, ctx); return r.ok ? r.value : r; };

  it('パスと配列の添字', () => {
    expect(value('pl_table:landing:all', 2)).toBe(pack.landing.all);
    expect(value('pipeline_table:samurai', 1)).toBe(pack.pipeline.samurai);
    expect(value('project_page:prj-docl', 3)).toEqual(pack.project_pages[0].summary_lines);
    expect(value('utilization_calendar', 1)).toBe(pack.calendars[1]);
  });

  it('仮想の葉: money / confidence / trend.* / inview.summary', () => {
    expect(value('project_page:prj-docl', 7)).toEqual({ revenue: 4_457_680, gross_profit: 1_890_000, gross_margin: 42.4 });
    expect(value('project_page:prj-docl', 1)).toEqual({ letter: 'B', label: '正式申込待' });
    const rev = value('progress_charts', 0) as Array<{ year_month: string; internal: number; external: number; count: number }>;
    expect(rev[rev.length - 1]).toEqual({ year_month: '2026-08', internal: 1_289_293, external: 473_000, count: 2 });
    const util = value('progress_charts', 1) as Array<{ utilization: number | null }>;
    expect(util[util.length - 1].utilization).toBe(45);
    expect(value('inview', 0)).toEqual(['開催日: 2026/8/26（水）', '参加: 50組 65名', '満足度: 3.9 / 4.0', 'ヨミ化: 2件', '次回: 2026/9/17（木）・申込 38組']);
  });

  it('資料の設定（$）と固定文', () => {
    expect(value('cover', 1)).toBe('2026-09-16');
    expect(value('cover', 0)).toBe('GMOサムライスタジオ 隔週キープ');
    expect(value('pl_table:landing:all', 0)).toBe('8月 着地');
    expect(value('pl_table:forecast:by_entity', 0)).toBe('9月 着地見込（計上会社別）');
    expect(value('pl_table:landing:all', 1)).toBe('単位：千円');
    expect(value('appendix', 0)).toBe('Appendix');
    const [p, x] = partOf('agenda', 0);
    expect(resolveBinding(pack, p, x, { ...ctx, agenda: deckAgenda(pages) })).toMatchObject({ ok: true, value: ['①数値報告・営業進捗【報告｜3×3｜5分】', '②案件実施報告【報告｜3×3｜5分】', '③新規案件獲得【報告｜3×3｜2分】'] });
  });

  it('無いものは投げずに ok:false（理由とラベル付き）', () => {
    expect(value('inview', 2)).toEqual({ ok: false, reason: 'not_found', label: '写真' });          // inview.photos はパックに無い
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
