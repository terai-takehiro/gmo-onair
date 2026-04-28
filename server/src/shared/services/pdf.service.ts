import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';

const fontsDir = path.resolve(__dirname, '../../../fonts');
const FONT_REGULAR = path.join(fontsDir, 'NotoSansJP-Regular.ttf');
const FONT_BOLD    = path.join(fontsDir, 'NotoSansJP-Bold.ttf');

const COMPANY_INFO = {
  name:               'GMOグローバルスタジオ株式会社',
  address1:           '東京都世田谷区用賀四丁目10番1号',
  address2:           'GMOインターネットTOWER 27F',
  registrationNumber: 'T9011001046041',
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
  items:            PdfRevenueItem[];
}

function fmtMoney(n: number): string {
  const prefix = n < 0 ? '-\xA5' : '\xA5';
  return prefix + Math.abs(n).toLocaleString('ja-JP');
}

function fmtDateSlash(d: string | null | undefined): string {
  if (!d) return '';
  const p = d.split('-');
  if (p.length < 3) return d;
  return `${parseInt(p[0])}/${parseInt(p[1])}/${parseInt(p[2])}`;
}

function fmtDateJP(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

function fmtItemCode(i: number): string {
  return 'M' + String(10000 * 1000 + i + 1).padStart(11, '0');
}

export function generateEstimatePdf(data: PdfRevenueData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const isEstimate = data.status === 'estimate';
      const docDate   = data.billing_date || data.recognition_date || new Date().toISOString().slice(0, 10);
      const safeItems = Array.isArray(data.items) ? data.items : [];

      const listPrice    = safeItems.reduce((s, it) => s + Math.max(0, it.amount || 0), 0);
      const discountTotal = safeItems.reduce((s, it) => s + Math.min(0, it.amount || 0), 0);
      const quoteTotal   = listPrice + discountTotal;

      const projectLabel = data.gls_number
        ? `${data.gls_number}　${data.project_name || ''}`
        : (data.project_name || '');

      // ── PDF setup ──────────────────────────────────────────────
      const doc = new PDFDocument({ size: 'A4', margin: 0 });

      const chunks: Buffer[] = [];
      doc.on('data',  (chunk) => chunks.push(chunk));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Fonts
      const hasRegular = fs.existsSync(FONT_REGULAR);
      const hasBold    = fs.existsSync(FONT_BOLD);
      if (hasRegular) doc.registerFont('R', FONT_REGULAR);
      if (hasBold)    doc.registerFont('B', FONT_BOLD);
      const R = hasRegular ? 'R' : 'Helvetica';
      const B = hasBold    ? 'B' : 'Helvetica-Bold';

      const ML = 40;   // left margin
      const MT = 40;   // top margin
      const PW = 515;  // printable width (A4 = 595, margins = 80)
      let y = MT;

      // ── helpers ────────────────────────────────────────────────
      type TextOpts = { fontSize?: number; font?: string; color?: string; width?: number; align?: string; lineBreak?: boolean };
      const textAt = (text: string, x: number, yPos: number, opts: TextOpts = {}) => {
        const { fontSize = 9, font = R, color = '#000000', ...rest } = opts;
        doc.font(font).fontSize(fontSize).fillColor(color).text(text, x, yPos, { lineBreak: false, ...rest } as any);
      };

      const drawRect = (x: number, yPos: number, w: number, h: number, fill?: string, stroke?: string) => {
        if (fill && stroke) {
          doc.rect(x, yPos, w, h).fillAndStroke(fill, stroke);
        } else if (fill) {
          doc.rect(x, yPos, w, h).fill(fill);
        } else if (stroke) {
          doc.rect(x, yPos, w, h).stroke(stroke);
        }
      };

      // ── ① Date (right) ─────────────────────────────────────────
      textAt(fmtDateSlash(docDate), ML, y, { fontSize: 8, width: PW, align: 'right' });
      y += 18;

      // ── ② Address (left) + Issuer (right) ─────────────────────
      const yBlock = y;
      let yL = yBlock;
      const colLW = Math.floor(PW * 0.55);
      const colRW = PW - colLW;
      const xR    = ML + colLW;

      // Left: address lines
      if (data.customer_address) {
        for (const line of data.customer_address.split('\n')) {
          if (line.trim()) {
            textAt(line.trim(), ML, yL, { fontSize: 9, width: colLW });
            yL += 14;
          }
        }
      }
      textAt(data.customer_name || '', ML, yL, { fontSize: 11, font: B, width: colLW });
      yL += 16;
      textAt(data.customer_contact ? `${data.customer_contact} 様` : 'ご担当者 様', ML, yL, { fontSize: 9, width: colLW });
      yL += 14;

      // Right: issuer
      let yR = yBlock;
      textAt(COMPANY_INFO.name, xR, yR, { fontSize: 10, font: B, width: colRW, align: 'right' });
      yR += 14;
      textAt(COMPANY_INFO.address1, xR, yR, { fontSize: 8, color: '#333333', width: colRW, align: 'right' });
      yR += 12;
      textAt(COMPANY_INFO.address2, xR, yR, { fontSize: 8, color: '#333333', width: colRW, align: 'right' });
      yR += 12;
      textAt(`登録番号: ${COMPANY_INFO.registrationNumber}`, xR, yR, { fontSize: 8, color: '#333333', width: colRW, align: 'right' });

      y = Math.max(yL, yR) + 14;

      // ── ③ Title ────────────────────────────────────────────────
      textAt(isEstimate ? '御見積書' : '請　求　書', ML, y, { fontSize: 22, font: B });
      y += 32;

      // ── ④ Project name ─────────────────────────────────────────
      textAt(projectLabel, ML, y, { fontSize: 10, width: PW });
      y += 16;
      if (data.subtitle) {
        textAt(data.subtitle, ML, y, { fontSize: 8, color: '#666666', width: PW });
        y += 14;
      }

      // ── ⑤ Summary box ──────────────────────────────────────────
      const s0 = PW - 60 - 68 - 80; // spacer
      const s1 = 60, s2 = 68, s3 = 80;
      const xS1 = ML + s0, xS2 = xS1 + s1, xS3 = xS2 + s2;
      const sumHH = 18, sumDH = 20;

      // Header cells
      drawRect(xS1, y, s1, sumHH, '#f5f5f5', '#cccccc');
      drawRect(xS2, y, s2, sumHH, '#f5f5f5', '#cccccc');
      drawRect(xS3, y, s3, sumHH, '#f5f5f5', '#cccccc');
      textAt('定価',      xS1, y + 5, { fontSize: 7, font: B, width: s1, align: 'center' });
      textAt('割引額',    xS2, y + 5, { fontSize: 7, font: B, width: s2, align: 'center' });
      textAt('お見積金額', xS3, y + 5, { fontSize: 7, font: B, width: s3, align: 'center' });
      y += sumHH;

      // Data cells
      drawRect(xS1, y, s1, sumDH, undefined, '#cccccc');
      drawRect(xS2, y, s2, sumDH, undefined, '#cccccc');
      drawRect(xS3, y, s3, sumDH, undefined, '#cccccc');
      textAt(fmtMoney(listPrice), xS1 + 4, y + 6, { fontSize: 9, width: s1 - 8, align: 'right' });
      textAt(
        discountTotal < 0 ? fmtMoney(discountTotal) : '−',
        xS2 + 4, y + 6,
        { fontSize: 9, color: '#d97706', width: s2 - 8, align: 'right' }
      );
      textAt(fmtMoney(quoteTotal), xS3 + 4, y + 5, { fontSize: 10, font: B, width: s3 - 8, align: 'right' });
      y += sumDH + 8;

      // ── ⑥ Quote code + note ────────────────────────────────────
      textAt(`見積コード　：　${data.billing_key || ''}`, ML, y, { fontSize: 8 });
      y += 14;
      textAt(
        '＊御見積有効期間：本見積書提出後１ヶ月　　＊本見積書には消費税等は含まれておりません。',
        ML, y, { fontSize: 7, color: '#444444', width: PW }
      );
      y += 16;

      // ── ⑦ Items table ──────────────────────────────────────────
      const tCode = 72, tAmt = 78, tDesc = PW - tCode - tAmt;
      const xCode = ML, xDesc = ML + tCode, xAmt = ML + tCode + tDesc;
      const tHH = 20;

      // Header
      drawRect(xCode, y, tCode, tHH, '#f0f0f0', '#333333');
      drawRect(xDesc, y, tDesc, tHH, '#f0f0f0', '#333333');
      drawRect(xAmt,  y, tAmt,  tHH, '#f0f0f0', '#333333');
      textAt('明細番号/期間', xCode + 3, y + 4, { fontSize: 7, font: B, width: tCode - 6 });
      textAt('商品名/備考',   xDesc + 3, y + 4, { fontSize: 7, font: B, width: tDesc - 6 });
      textAt('税別金額',      xAmt  + 3, y + 4, { fontSize: 7, font: B, width: tAmt  - 6, align: 'right' });
      y += tHH;

      // Rows
      for (let i = 0; i < safeItems.length; i++) {
        const item = safeItems[i];
        const isDiscount = (item.amount || 0) < 0;
        const itemColor  = isDiscount ? '#d97706' : '#000000';

        // Estimate row height
        let rh = 22;
        if (item.period_start || item.period_end) rh = Math.max(rh, 32);
        if (item.item_notes) {
          const noteLineCount = item.item_notes.split('\n').filter(l => l.trim()).length;
          rh = Math.max(rh, 22 + noteLineCount * 10);
        }

        drawRect(xCode, y, tCode, rh, undefined, '#cccccc');
        drawRect(xDesc, y, tDesc, rh, undefined, '#cccccc');
        drawRect(xAmt,  y, tAmt,  rh, undefined, '#cccccc');

        // Left: item code + period
        textAt(fmtItemCode(i), xCode + 3, y + 4, { fontSize: 7, color: itemColor, width: tCode - 6 });
        if (item.period_start || item.period_end) {
          textAt(
            `${fmtDateSlash(item.period_start)} 〜 ${fmtDateSlash(item.period_end)}`,
            xCode + 3, y + 14,
            { fontSize: 7, color: '#444444', width: tCode - 6 }
          );
        }

        // Middle: description + notes
        textAt(item.description || '', xDesc + 3, y + 5, { fontSize: 8, color: itemColor, width: tDesc - 6 });
        if (item.item_notes) {
          let ny = y + 17;
          for (const line of item.item_notes.split('\n')) {
            if (line.trim()) {
              textAt(line.trim(), xDesc + 3, ny, { fontSize: 7, color: '#555555', width: tDesc - 6 });
              ny += 10;
            }
          }
        }

        // Right: amount
        textAt(fmtMoney(item.amount || 0), xAmt + 3, y + 7, { fontSize: 8, color: itemColor, width: tAmt - 6, align: 'right' });

        y += rh;
      }

      // Bottom border
      doc.moveTo(xCode, y).lineTo(xCode + PW, y).strokeColor('#333333').stroke();
      y += 16;

      // ── ⑧ Notes box ────────────────────────────────────────────
      if (data.notes) {
        const noteLines = data.notes.split('\n');
        const notesH = 20 + noteLines.length * 13;
        drawRect(ML, y, PW, notesH, undefined, '#888888');
        textAt('備考', ML + 6, y + 6, { fontSize: 9, font: B });
        let ny = y + 18;
        for (const line of noteLines) {
          textAt(line.trim() || ' ', ML + 6, ny, { fontSize: 8, width: PW - 12 });
          ny += 13;
        }
        y += notesH + 8;
      }

      // ── ⑨ Payment due date (invoice) ───────────────────────────
      if (!isEstimate && data.payment_due_date) {
        textAt(`お支払期日：${fmtDateJP(data.payment_due_date)}`, ML, y, { fontSize: 8 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
