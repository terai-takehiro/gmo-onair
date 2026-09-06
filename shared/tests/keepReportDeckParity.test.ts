/**
 * 資料ビルダーの純粋関数の **shared と server の写しが同じ答えを出すこと**。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 * server は `shared/` を import できない（`server/tsconfig.json` の `rootDir`）ので、
 * テンプレ・構成を組む関数・差分・binding の解決を **server にも写して**持っている
 * （`server/src/contexts/dailyops/services/keep-templates.ts` / `keep-deck-compose.ts` /
 * `keep-deck-diff.ts` / `keep-binding.ts`）。片方だけ直すと、
 *   - 画面のプレビューと pptx で部品の位置・文言が違う
 *   - 画面で見た構成と、サーバーが保存・組み直した構成が違う（人の直しが消える）
 *   - 画面で読めた binding が資料では灰色の枠になる
 * のに、型検査にも lint にも出ない。同じ材料を両方に通して突き合わせる（`financeDocChainParity` と同じ形）。
 */
import { describe, it, expect } from 'vitest';
import * as sharedTemplates from '../src/keepReport/templates';
import * as serverTemplates from '../../server/src/contexts/dailyops/services/keep-templates';
import { buildStandardPages as sharedBuild, composeDeckPages as sharedCompose, newPage as sharedNewPage } from '../src/keepReport/buildStandardDeck';
import { buildStandardPages as serverBuild, composeDeckPages as serverCompose } from '../../server/src/contexts/dailyops/services/keep-deck-compose';
import { diffDecks as sharedDiff } from '../src/keepReport/deckDiff';
import { diffDecks as serverDiff } from '../../server/src/contexts/dailyops/services/keep-deck-diff';
import { resolveBinding as sharedResolve, deckAgenda as sharedAgenda } from '../src/keepReport/binding';
import { resolveBinding as serverResolve, deckAgenda as serverAgenda } from '../../server/src/contexts/dailyops/services/keep-binding';
import type { KeepReportPack, SlidePage } from '../src/keepReport/types';
import sample from '../../server/src/contexts/dailyops/services/__fixtures__/keep-pack.sample.json';

const pack = sample as unknown as KeepReportPack;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('shared と server の写しの一致（隔週キープの資料ビルダー）', () => {
  it('テンプレ・標準の構成・色・書体・帯の文言が同じ', () => {
    expect(serverTemplates.SLIDE_TEMPLATES).toEqual(sharedTemplates.SLIDE_TEMPLATES);
    expect(serverTemplates.STANDARD_DECK_ORDER).toEqual(sharedTemplates.STANDARD_DECK_ORDER);
    expect(serverTemplates.FORMAT_COLORS).toEqual(sharedTemplates.FORMAT_COLORS);
    expect(serverTemplates.FORMAT_FONT).toEqual(sharedTemplates.FORMAT_FONT);
    expect(serverTemplates.FORMAT_FOOTER).toEqual(sharedTemplates.FORMAT_FOOTER);
    expect(serverTemplates.TALK_BANDS).toEqual(sharedTemplates.TALK_BANDS);
    expect(serverTemplates.BODY_TOP).toEqual(sharedTemplates.BODY_TOP);
  });

  const prev: SlidePage[] = sharedBuild(pack);
  const edited = clone(prev);
  edited[3].title = '直した題【報告｜3×3｜5分】';
  edited[3].parts[0].text_override = '人の文';
  edited[5].removed = true;
  edited.splice(10, 0, sharedNewPage('free', 'human-1', { title: '④施設【報告｜2×2｜1分】', auto: false }));
  const swapped = [edited[1], edited[0], ...edited.slice(2)];
  const smaller = clone(pack);
  smaller.project_pages.pop();

  it('標準の構成・組み直し（パックあり・無し）が同じ', () => {
    expect(serverBuild(pack)).toEqual(prev);
    expect(serverBuild(null)).toEqual(sharedBuild(null));
    expect(serverCompose(swapped, smaller)).toEqual(sharedCompose(swapped, smaller));
    expect(serverCompose(null, pack)).toEqual(sharedCompose(null, pack));
  });

  it('差分が同じ', () => {
    const a = sharedDiff(prev, swapped);
    expect(a.length).toBeGreaterThan(3);
    expect(serverDiff(prev, swapped)).toEqual(a);
  });

  it('全部品の binding の解決が同じ（アジェンダ・手入力・パック無しも）', () => {
    const ctx = { meeting_date: pack.meeting_date, agenda: sharedAgenda(prev), inputs: { attendance: [['寺井', '○']] } };
    expect(serverAgenda(swapped)).toEqual(sharedAgenda(swapped));
    let count = 0;
    for (const page of swapped) {
      for (const part of page.parts) {
        expect(serverResolve(pack, page, part, ctx)).toEqual(sharedResolve(pack, page, part, ctx));
        expect(serverResolve(null, page, part, ctx)).toEqual(sharedResolve(null, page, part, ctx));
        count++;
      }
    }
    expect(count).toBeGreaterThan(50);
  });
});
