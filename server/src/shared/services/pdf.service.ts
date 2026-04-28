import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';

const fontsDir  = path.resolve(__dirname, '../../../fonts');
const FONT_REG  = path.join(fontsDir, 'NotoSansJP-Regular.ttf');
const FONT_BOLD = path.join(fontsDir, 'NotoSansJP-Bold.ttf');

const COMPANY = {
  name:   'GMOグローバルスタジオ株式会社',
  addr1:  '東京都世田谷区用賀四丁目10番1号',
  addr2:  'GMOインターネットTOWER 27F',
  regNo:  'T9011001046041',
};

interface PdfRevenueItem {
  description:  string;
  quantity:     number;
  unit_price:   number;
  amount:       number;
  period_start: string | null;
  period_end:   string | null;
  item_notes:   string | null;
}

interface PdfRevenueData {
  billing_key:      string;
  subtitle:         string | null;
  customer_name:    string;
  customer_address: string | null;
  customer_contact: string | null;
  project_name:     string;
  gls_number:       string | null;
  tax_category:     string;
  amount:           number;
  recognition_date: string | null;
  billing_date:     string | null;
  payment_due_date: string | null;
  notes:            string | null;
  status:           string;
  project_start:    string | null;
  project_end:      string | null;
  items:            PdfRevenueItem[];
}

function money(n: number): string {
  return (n < 0 ? '-\xA5' : '\xA5') + Math.abs(n).toLocaleString('ja-JP');
}

function dateSlash(d: string | null | undefined): string {
  if (!d) return '';
  const p = d.split('-');
  return p.length >= 3 ? `${parseInt(p[0])}/${parseInt(p[1])}/${parseInt(p[2])}` : d;
}

function dateJP(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

function itemCode(i: number): string {
  return 'M' + String(10000 * 1000 + i + 1).padStart(11, '0');
}

export function generateEstimatePdf(data: PdfRevenueData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const isEstimate = data.status === 'estimate';
      const docDate    = data.billing_date || data.recognition_date || new Date().toISOString().slice(0, 10);
      const items      = Array.isArray(data.items) ? data.items : [];

      const listPrice     = items.reduce((s, it) => s + Math.max(0, it.amount || 0), 0);
      const discountTotal = items.reduce((s, it) => s + Math.min(0, it.amount || 0), 0);
      const quoteTotal    = listPrice + discountTotal;
      const projectLabel  = data.gls_number
        ? `${data.gls_number}　${data.project_name || ''}`
        : (data.project_name || '');

      // ── PDF / font setup ──────────────────────────────────────
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data',  c => chunks.push(c));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (fs.existsSync(FONT_REG))  doc.registerFont('R', FONT_REG);
      if (fs.existsSync(FONT_BOLD)) doc.registerFont('B', FONT_BOLD);
      const R = fs.existsSync(FONT_REG)  ? 'R' : 'Helvetica';
      const B = fs.existsSync(FONT_BOLD) ? 'B' : 'Helvetica-Bold';

      const ML = 40, PW = 515;
      let y = 40;

      // ── Helpers ───────────────────────────────────────────────
      type TOpts = { sz?: number; f?: string; c?: string; w?: number; align?: string; wrap?: boolean };

      /** テキストを指定座標に描画。wrap:true のとき折り返し許可 */
      const txt = (s: string, x: number, yp: number, o: TOpts = {}) => {
        doc.font(o.f ?? R).fontSize(o.sz ?? 9).fillColor(o.c ?? '#000000')
           .text(s, x, yp, { lineBreak: o.wrap ?? false, width: o.w, align: o.align } as any);
      };

      /** テキストが占める高さを返す（フォント・サイズを一時的にセット） */
      const textH = (s: string, fnt: string, sz: number, w: number): number =>
        doc.font(fnt).fontSize(sz).heightOfString(s, { width: w });

      /** 矩形を描画（fill/stroke オプション） */
      const rect = (x: number, yp: number, w: number, h: number, fill?: string, stroke?: string) => {
        if (fill && stroke) doc.rect(x, yp, w, h).fillAndStroke(fill, stroke);
        else if (fill)      doc.rect(x, yp, w, h).fill(fill);
        else if (stroke)    doc.rect(x, yp, w, h).stroke(stroke);
      };

      /**
       * セル領域をクリッピングしてコンテンツを描画。
       * はみ出しを確実に防ぐ。
       */
      const cell = (cx: number, cy: number, cw: number, ch: number, draw: () => void) => {
        doc.save();
        doc.rect(cx, cy, cw, ch).clip();
        draw();
        doc.restore();
      };

      // ── ① 発行日（右上） ──────────────────────────────────────
      txt(dateSlash(docDate), ML, y, { sz: 8, w: PW, align: 'right' });
      y += 18;

      // ── ② 宛先（左）＋ 発行者（右） ──────────────────────────
      const yBlock = y;
      let yL = yBlock;
      const colL = Math.floor(PW * 0.55), colR = PW - Math.floor(PW * 0.55);
      const xR = ML + colL;

      if (data.customer_address) {
        for (const line of data.customer_address.split('\n')) {
          if (line.trim()) { txt(line.trim(), ML, yL, { sz: 9, w: colL }); yL += 14; }
        }
      }
      txt(data.customer_name || '', ML, yL, { sz: 11, f: B, w: colL }); yL += 16;
      txt(data.customer_contact ? `${data.customer_contact} 様` : 'ご担当者 様', ML, yL, { sz: 9, w: colL }); yL += 14;

      let yR = yBlock;
      txt(COMPANY.name,  xR, yR, { sz: 10, f: B, c: '#000000', w: colR, align: 'right' }); yR += 14;
      txt(COMPANY.addr1, xR, yR, { sz: 8,  c: '#333333',       w: colR, align: 'right' }); yR += 12;
      txt(COMPANY.addr2, xR, yR, { sz: 8,  c: '#333333',       w: colR, align: 'right' }); yR += 12;
      txt(`登録番号: ${COMPANY.regNo}`, xR, yR, { sz: 8, c: '#333333', w: colR, align: 'right' });

      y = Math.max(yL, yR) + 14;

      // ── ③ タイトル ────────────────────────────────────────────
      txt(isEstimate ? '御見積書' : '請　求　書', ML, y, { sz: 22, f: B }); y += 32;

      // ── ④ 案件名 ──────────────────────────────────────────────
      txt(projectLabel, ML, y, { sz: 10, w: PW }); y += 16;
      if (data.subtitle) { txt(data.subtitle, ML, y, { sz: 8, c: '#666666', w: PW }); y += 14; }

      // ── ⑤ 3列サマリーボックス ─────────────────────────────────
      const s0 = PW - 60 - 68 - 80;
      const [s1, s2, s3] = [60, 68, 80];
      const [xS1, xS2, xS3] = [ML + s0, ML + s0 + s1, ML + s0 + s1 + s2];
      const [sHH, sDH] = [18, 20];

      rect(xS1, y, s1, sHH, '#f5f5f5', '#cccccc');
      rect(xS2, y, s2, sHH, '#f5f5f5', '#cccccc');
      rect(xS3, y, s3, sHH, '#f5f5f5', '#cccccc');
      txt('定価',       xS1, y + 5, { sz: 7, f: B, w: s1, align: 'center' });
      txt('割引額',     xS2, y + 5, { sz: 7, f: B, w: s2, align: 'center' });
      txt('お見積金額', xS3, y + 5, { sz: 7, f: B, w: s3, align: 'center' });
      y += sHH;

      rect(xS1, y, s1, sDH, undefined, '#cccccc');
      rect(xS2, y, s2, sDH, undefined, '#cccccc');
      rect(xS3, y, s3, sDH, undefined, '#cccccc');
      txt(money(listPrice), xS1 + 4, y + 6, { sz: 9, w: s1 - 8, align: 'right' });
      txt(discountTotal < 0 ? money(discountTotal) : '−', xS2 + 4, y + 6, { sz: 9, c: '#d97706', w: s2 - 8, align: 'right' });
      txt(money(quoteTotal), xS3 + 4, y + 5, { sz: 10, f: B, w: s3 - 8, align: 'right' });
      y += sDH + 8;

      // ── ⑥ 見積コード＋注記 ───────────────────────────────────
      txt(`見積コード　：　${data.billing_key || ''}`, ML, y, { sz: 8 }); y += 14;
      txt('＊御見積有効期間：本見積書提出後１ヶ月　　＊本見積書には消費税等は含まれておりません。',
          ML, y, { sz: 7, c: '#444444', w: PW }); y += 16;

      // ── ⑦ 明細テーブル ───────────────────────────────────────
      // 期間を2行（開始/終了）で表示するため左列を90ptに拡張
      const TC = 90, TA = 78, TD = PW - TC - TA;
      const xC = ML, xD = ML + TC, xA = ML + TC + TD;
      const HDR_H = 20;
      const VPAD  = 5;   // 上下パディング

      // ヘッダー行
      rect(xC, y, TC, HDR_H, '#f0f0f0', '#333333');
      rect(xD, y, TD, HDR_H, '#f0f0f0', '#333333');
      rect(xA, y, TA, HDR_H, '#f0f0f0', '#333333');
      txt('明細番号/期間', xC + 3, y + 4, { sz: 7, f: B, w: TC - 6 });
      txt('商品名/備考',   xD + 3, y + 4, { sz: 7, f: B, w: TD - 6 });
      txt('税別金額',      xA + 3, y + 4, { sz: 7, f: B, w: TA - 6, align: 'right' });
      y += HDR_H;

      // 明細行
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const isDisc  = (it.amount || 0) < 0;
        const itColor = isDisc ? '#d97706' : '#000000';

        // 期間（item個別 → なければプロジェクト期間で補完）
        const pS = it.period_start || data.project_start;
        const pE = it.period_end   || data.project_end;

        // ── 行の高さを事前計算 ─────────────────────────────────
        // 左列: コード(1行) + 期間2行（開始/終了）
        const leftLines = 1 + (pS ? 1 : 0) + (pE ? 1 : 0);
        const leftH = VPAD + leftLines * 11 + VPAD;

        // 中列: 商品名（折り返し可） + 備考（折り返し可）
        const descH  = textH(it.description || '', R, 8, TD - 6);
        const notesH = it.item_notes ? textH(it.item_notes, R, 7, TD - 6) : 0;
        const midH   = VPAD + descH + (notesH > 0 ? 4 + notesH : 0) + VPAD;

        const rh = Math.max(leftH, midH, 28); // 最低28pt

        // ── 枠線描画 ───────────────────────────────────────────
        rect(xC, y, TC, rh, undefined, '#cccccc');
        rect(xD, y, TD, rh, undefined, '#cccccc');
        rect(xA, y, TA, rh, undefined, '#cccccc');

        // ── 左列（明細番号＋期間）─────────────────────────────
        cell(xC, y, TC, rh, () => {
          txt(itemCode(i), xC + 3, y + VPAD, { sz: 7, c: itColor });
          if (pS) txt(dateSlash(pS),       xC + 3, y + VPAD + 12, { sz: 7, c: '#444444' });
          if (pE) txt(`〜 ${dateSlash(pE)}`, xC + 3, y + VPAD + 23, { sz: 7, c: '#444444' });
        });

        // ── 中列（商品名＋備考）───────────────────────────────
        cell(xD, y, TD, rh, () => {
          txt(it.description || '', xD + 3, y + VPAD, { sz: 8, c: itColor, w: TD - 6, wrap: true });
          if (it.item_notes) {
            txt(it.item_notes, xD + 3, y + VPAD + descH + 4, { sz: 7, c: '#555555', w: TD - 6, wrap: true });
          }
        });

        // ── 右列（金額）───────────────────────────────────────
        cell(xA, y, TA, rh, () => {
          txt(money(it.amount || 0), xA + 3, y + VPAD, { sz: 8, c: itColor, w: TA - 6, align: 'right' });
        });

        y += rh;
      }

      // テーブル下罫線
      doc.moveTo(xC, y).lineTo(xC + PW, y).strokeColor('#333333').lineWidth(1).stroke();
      y += 16;

      // ── ⑧ 備考ボックス ────────────────────────────────────────
      if (data.notes) {
        const noteH = VPAD + textH(data.notes, R, 8, PW - 18) + VPAD + 16;
        rect(ML, y, PW, noteH, undefined, '#888888');
        txt('備考', ML + 6, y + 6, { sz: 9, f: B });
        txt(data.notes, ML + 6, y + 18, { sz: 8, w: PW - 12, wrap: true });
        y += noteH + 8;
      }

      // ── ⑨ 支払期日（請求書モード） ────────────────────────────
      if (!isEstimate && data.payment_due_date) {
        txt(`お支払期日：${dateJP(data.payment_due_date)}`, ML, y, { sz: 8 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
