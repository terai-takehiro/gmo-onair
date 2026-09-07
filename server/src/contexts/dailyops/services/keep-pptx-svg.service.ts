/**
 * pptxgenjs が作った pptx に、フォーマットの絵の**元の SVG**を結びつける後処理。
 *
 * pptxgenjs は Node では SVG の代替 PNG を作れず「壊れた画像」を入れる（dist の `isSvgPng` → `IMG_BROKEN`）ので、
 * 出力では PNG（`keep-format-assets.ts`）で置いておき、ここで実物のテンプレと同じ形
 * （`<a:blip r:embed=PNG><a:extLst><asvg:svgBlip r:embed=SVG/>`）に直す。PowerPoint 2016 以降・LibreOffice は
 * SVG を、それ以外（Keynote・Google スライド・古い版）は PNG を読む。印は `addFormatImage` が altText（descr）に
 * 入れた `gmo-format:<key>`。
 *
 * ⚠️ XML は文字列として直す（DOM で往復させると名前空間の接頭辞が書き換わって開けなくなることがある）。
 * 触るのは印の付いた `<p:pic>` の `<a:blip>` と、そのスライドの .rels・追加する media だけ。
 * 何かが読めなければ**その図は PNG のまま**にして先へ進む（出力を止めない）。
 */
import JSZip from 'jszip';
import { FORMAT_IMAGE_MARK } from './keep-pptx-chrome.service';
import { formatAssetSvgBuffer, type FormatAssetKey } from './keep-format-assets';

const SVG_EXT_URI = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const KEYS: readonly FormatAssetKey[] = ['wordmark', 'tagline', 'talkIcon'];
const isKey = (v: string): v is FormatAssetKey => (KEYS as readonly string[]).includes(v);

export const svgMediaName = (key: FormatAssetKey): string => `gmo-format-${key}.svg`;
export const svgRelId = (key: FormatAssetKey): string => `rIdSvg${key}`;

/** 1 枚のスライド XML と .rels を直す。返り値は結びつけた図の数 */
export function attachSvgToSlideXml(xml: string, rels: string): { xml: string; rels: string; attached: number; keys: Set<FormatAssetKey> } {
  let attached = 0;
  const keys = new Set<FormatAssetKey>();
  let outRels = rels;
  const outXml = xml.replace(/<p:pic>([\s\S]*?)<\/p:pic>/g, (pic) => {
    const mark = new RegExp(`descr="${FORMAT_IMAGE_MARK}([A-Za-z]+)"`).exec(pic);
    if (!mark || !isKey(mark[1])) return pic;
    const key = mark[1];
    // pptxgenjs の blip は <a:blip r:embed="rIdN"/>（透過を付けると子要素を持つ）。どちらでも extLst を足す
    const blip = /<a:blip r:embed="(rId\d+)"(\s*\/>|>([\s\S]*?)<\/a:blip>)/.exec(pic);
    if (!blip) return pic;
    const relId = svgRelId(key);
    if (!outRels.includes(`Id="${relId}"`)) {
      outRels = outRels.replace('</Relationships>', `<Relationship Id="${relId}" Type="${REL_IMAGE}" Target="../media/${svgMediaName(key)}"/></Relationships>`);
    }
    const ext = `<a:ext uri="${SVG_EXT_URI}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${relId}"/></a:ext>`;
    const inner = blip[3] ?? '';
    const body = inner.includes('<a:extLst>') ? inner.replace('</a:extLst>', `${ext}</a:extLst>`) : `${inner}<a:extLst>${ext}</a:extLst>`;
    attached++;
    keys.add(key);
    return pic.replace(blip[0], `<a:blip r:embed="${blip[1]}">${body}</a:blip>`);
  });
  return { xml: outXml, rels: outRels, attached, keys };
}

export async function attachFormatSvgs(pptx: Buffer): Promise<{ buffer: Buffer; attached: number }> {
  const zip = await JSZip.loadAsync(pptx);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  let attached = 0;
  const used = new Set<FormatAssetKey>();
  for (const file of slides) {
    const relsPath = file.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const slideFile = zip.file(file);
    const relsFile = zip.file(relsPath);
    if (!slideFile || !relsFile) continue;
    const r = attachSvgToSlideXml(await slideFile.async('string'), await relsFile.async('string'));
    if (r.attached === 0) continue;
    zip.file(file, r.xml);
    zip.file(relsPath, r.rels);
    attached += r.attached;
    for (const k of r.keys) used.add(k);
  }
  for (const key of used) zip.file(`ppt/media/${svgMediaName(key)}`, formatAssetSvgBuffer(key));
  // [Content_Types].xml — pptxgenjs は svg の Default を常に書くが、無ければ足す（無いと PowerPoint が修復を求める）
  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    const ct = await ctFile.async('string');
    if (!/Extension="svg"/.test(ct)) zip.file('[Content_Types].xml', ct.replace('</Types>', '<Default Extension="svg" ContentType="image/svg+xml"/></Types>'));
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, attached };
}
