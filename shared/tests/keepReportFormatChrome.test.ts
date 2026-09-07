/**
 * GMO流会議フォーマット Ver.2.5 の枠（**実物の pptx から読んだ寸法**）と、部品の置き場・取り出した絵が矛盾しないこと。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 * ヘッダー（題・トークスクリプトの帯）とフッターはフォーマットの「守るもの」（docs/design/v4/keep-report.md §6.3）。
 * 位置は `FORMAT_CHROME`（インチ）が正で、pptx はそのまま・画面は % に換算して描く。部品の位置（%）は
 * 別の表（`SLIDE_TEMPLATES`）にあるので、帯を実物の高さにしたときに部品が帯の下に潜っても型検査では出ない。
 * ここで「枠はスライドの中」「帯は題の下・本文は帯の下・フッターは本文の下」「部品は枠に重ならない」を固定する。
 * 絵（SVG）は base64 で持っているので、中身が SVG であること・viewBox が申告と合うこと・箱と同じ縦横比であることも見る。
 * pptx の後処理（PNG に元の SVG を結びつける）は文字列の置換なので、形の違う blip でも壊さないことを見る。
 */
import { describe, it, expect } from 'vitest';
import {
  BODY_TOP, COVER_TEXT, FORMAT_CHROME, SLIDE_IN, SLIDE_TEMPLATES, STANDARD_DECK_ORDER, TAGLINE_BINDING, pctBox, type InchBox,
} from '../src/keepReport/templates';
import { FORMAT_ASSETS, formatAssetDataUri, type FormatAssetKey } from '../src/keepReport/formatAssets';
import { attachSvgToSlideXml, svgMediaName, svgRelId } from '../../server/src/contexts/dailyops/services/keep-pptx-svg.service';

const inside = (b: InchBox) => b.x >= 0 && b.y >= 0 && b.x + b.w <= SLIDE_IN.w + 1e-9 && b.y + b.h <= SLIDE_IN.h + 1e-9;
const pctY = (inch: number) => pctBox({ x: 0, y: inch, w: 1, h: 0 }).y;

function chromeBoxes(): Array<[string, InchBox]> {
  const C = FORMAT_CHROME;
  return [
    ['title', C.title],
    ...C.band.top.map((y, i): [string, InchBox] => [`band[${i}]`, { x: C.band.x, y, w: C.band.w, h: C.band.h }]),
    ['footer.logo', C.footer.logo], ['footer.tag', C.footer.tag], ['footer.confidential', C.footer.confidential], ['footer.pageNo', C.footer.pageNo],
    ['cover.title', C.cover.title], ['cover.sub', C.cover.sub], ['cover.versionNote', C.cover.versionNote], ['cover.guide', C.cover.guide],
    ['appendix', C.appendix], ['closing', C.closing],
  ];
}

describe('GMO流会議フォーマットの枠（実物の寸法）', () => {
  it('枠はすべてスライド（13.333in × 7.5in）の中にある', () => {
    for (const [name, b] of chromeBoxes()) expect(inside(b), name).toBe(true);
  });

  it('帯は題の下・本文は帯の下・フッターは本文の下（重ならない）', () => {
    const B = FORMAT_CHROME.band;
    const titleBottom = FORMAT_CHROME.title.y + FORMAT_CHROME.title.h;
    expect(B.top[0]).toBeGreaterThanOrEqual(titleBottom);
    expect(B.top[1]).toBeGreaterThanOrEqual(B.top[0] + B.h);
    expect(FORMAT_CHROME.bodyTop.bands).toBeGreaterThanOrEqual(B.top[1] + B.h);
    expect(FORMAT_CHROME.bodyTop.title).toBeGreaterThanOrEqual(titleBottom);
    // 帯の左端のアイコンは帯の中に収まる
    expect(FORMAT_CHROME.bandIcon.x).toBeGreaterThanOrEqual(B.x);
    expect(FORMAT_CHROME.bandIcon.size).toBeLessThanOrEqual(B.h);
    // % の本文上端（部品の座標系）はインチの枠から出した値以上
    expect(BODY_TOP.bands).toBeGreaterThanOrEqual(pctY(B.top[1] + B.h));
    expect(BODY_TOP.title).toBeGreaterThanOrEqual(pctY(titleBottom));
  });

  it('pctBox はインチを %（小数 2 桁）にする', () => {
    expect(pctBox({ x: 0, y: 0, w: SLIDE_IN.w, h: SLIDE_IN.h })).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(pctBox(FORMAT_CHROME.title)).toEqual({ x: 1.76, y: 1.65, w: 73.63, h: 9.43 });
  });

  it('部品はヘッダー（題・帯）とフッターに重ならず、スライドの中にある', () => {
    const title = pctBox(FORMAT_CHROME.title);
    const bandsBottom = pctY(FORMAT_CHROME.band.top[1] + FORMAT_CHROME.band.h);
    const footerTop = pctY(Math.min(...Object.values(FORMAT_CHROME.footer).map((f) => f.y)));
    let count = 0;
    for (const tpl of Object.values(SLIDE_TEMPLATES)) {
      for (const r of tpl.regions) {
        const name = `${tpl.key}／${r.label}`;
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 100, name).toBe(true);
        expect(r.y + r.h, name).toBeLessThanOrEqual(footerTop);
        count++;
        if (tpl.header === 'none') continue;
        // 題の箱と重ならない（下にあるか、右にあるか。案件ページの確度は右上に置く）
        expect(r.y >= title.y + title.h || r.x >= title.x + title.w, name).toBe(true);
        if (tpl.header !== 'title') expect(r.y, name).toBeGreaterThanOrEqual(bandsBottom);
      }
    }
    expect(count).toBeGreaterThan(40);
  });

  it('標準の構成は表紙で始まり Appendix・締め（タグライン）で終わる。表紙は実物の 5 つの箱', () => {
    expect(STANDARD_DECK_ORDER[0].template).toBe('cover');
    expect(STANDARD_DECK_ORDER.slice(-2).map((e) => e.template)).toEqual(['appendix', 'closing']);
    expect(SLIDE_TEMPLATES.closing.header).toBe('none');
    expect(SLIDE_TEMPLATES.closing.regions).toHaveLength(1);
    expect(SLIDE_TEMPLATES.closing.regions[0]).toMatchObject({ type: 'image', binding: TAGLINE_BINDING, editable: false });
    expect(SLIDE_TEMPLATES.cover.regions.map((r) => r.binding))
      .toEqual(['$meeting_title', '$meeting_date', COVER_TEXT.orgName, COVER_TEXT.versionNote, COVER_TEXT.guide]);
  });
});

describe('フォーマットの絵（実物から取り出した SVG）', () => {
  const keys = Object.keys(FORMAT_ASSETS) as FormatAssetKey[];

  it('3 つとも中身は SVG で、viewBox が申告と合う。data URI は <img src> にそのまま渡せる形', () => {
    expect(keys.sort()).toEqual(['tagline', 'talkIcon', 'wordmark']);
    for (const key of keys) {
      const a = FORMAT_ASSETS[key];
      const svg = Buffer.from(a.svgBase64, 'base64').toString('utf8');
      expect(svg.startsWith('<svg'), key).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>'), key).toBe(true);
      const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      expect(vb, key).not.toBeNull();
      expect([Number(vb![1]), Number(vb![2])], key).toEqual([a.viewBox[0], a.viewBox[1]]);
      expect(formatAssetDataUri(key).startsWith('data:image/svg+xml;base64,'), key).toBe(true);
    }
  });

  it('絵を置く箱は SVG と同じ縦横比（潰れない）: フッターのワードマーク・締めのタグライン・帯のアイコン', () => {
    const ratio = (b: { w: number; h: number }) => b.w / b.h;
    const vb = (key: FormatAssetKey) => FORMAT_ASSETS[key].viewBox[0] / FORMAT_ASSETS[key].viewBox[1];
    expect(Math.abs(ratio(FORMAT_CHROME.footer.logo) / vb('wordmark') - 1)).toBeLessThan(0.01);
    expect(Math.abs(ratio(FORMAT_CHROME.closing) / vb('tagline') - 1)).toBeLessThan(0.01);
    expect(vb('talkIcon')).toBe(1);
  });
});

describe('pptx の後処理: フォーマットの絵（PNG）に元の SVG を結びつける', () => {
  const pic = (descr: string, blip: string) =>
    `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture 3" descr="${descr}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>`
    + `<p:blipFill>${blip}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr/></p:pic>`;
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image-1.png"/></Relationships>';
  const EXT = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';

  it('印（gmo-format:<key>）の付いた図だけに svgBlip を足し、.rels には同じ絵の SVG を 1 つだけ足す', () => {
    const xml = `<p:spTree>${pic('gmo-format:talkIcon', '<a:blip r:embed="rId2"/>')}${pic('gmo-format:talkIcon', '<a:blip r:embed="rId3"/>')}${pic('写真', '<a:blip r:embed="rId4"/>')}</p:spTree>`;
    const r = attachSvgToSlideXml(xml, rels);
    expect(r.attached).toBe(2);
    expect([...r.keys]).toEqual(['talkIcon']);
    expect(r.xml.match(/asvg:svgBlip/g)?.length).toBe(2);
    expect(r.xml).toContain(
      `<a:blip r:embed="rId2"><a:extLst><a:ext uri="${EXT}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svgRelId('talkIcon')}"/></a:ext></a:extLst></a:blip>`,
    );
    expect(r.xml).toContain('<a:blip r:embed="rId4"/>'); // 印の無い図（写真）はそのまま
    expect(r.rels.match(new RegExp(svgMediaName('talkIcon'), 'g'))?.length).toBe(1);
    expect(r.rels).toContain(`Id="${svgRelId('talkIcon')}"`);
    expect(r.rels).toContain('Target="../media/image-1.png"'); // 元の PNG の関係は残る
  });

  it('blip が子要素を持つ形でも extLst を足す。知らない印・印の無い図は触らない', () => {
    const xml = pic('gmo-format:wordmark', '<a:blip r:embed="rId2"><a:alphaModFix amt="80000"/></a:blip>') + pic('gmo-format:unknown', '<a:blip r:embed="rId3"/>');
    const r = attachSvgToSlideXml(xml, rels);
    expect(r.attached).toBe(1);
    expect([...r.keys]).toEqual(['wordmark']);
    expect(r.xml).toContain('<a:alphaModFix amt="80000"/><a:extLst>');
    expect(r.xml).toContain('<a:blip r:embed="rId3"/>');
  });

  it('何も結びつけなかったら XML も .rels も変えない', () => {
    const xml = pic('写真', '<a:blip r:embed="rId2"/>');
    const r = attachSvgToSlideXml(xml, rels);
    expect(r.attached).toBe(0);
    expect(r.xml).toBe(xml);
    expect(r.rels).toBe(rels);
  });
});
