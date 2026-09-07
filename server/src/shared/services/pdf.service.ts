import PDFDocument from 'pdfkit';
import { registerNotoFonts } from '../utils/pdf-fonts';
import { jstDate } from '../utils/jst';

interface PdfRevenueItem {
  description:  string;
  quantity:     number;
  unit_price:   number;
  amount:       number;
  period_start: string | null;
  period_end:   string | null;
  item_notes:   string | null;
  category:     string | null;
  /**
   * 数量の単位（人・時間・日・式 など）。**任意** — 見積の明細だけが持つ
   * （`estimate_items.unit`。migration 138 で既にあった列だが、紙には出していなかった）。
   * 呼び出し元（`revenues.routes.ts` 等）は渡さなくてよい（未指定は「単位なし」= 従来どおり数量だけ）。
   */
  unit?:        string | null;
}

interface PdfRevenueData {
  billing_key:      string;
  /**
   * 発行者ブロック（右上の「発行元」欄）。**2026年10月の事業再編**で会社ごとの
   * 発行者情報を出すようになった（`legal-entity.service.ts` の `resolveIssuer`）。
   * 住所・登録番号は会社によって未設定のことがある（GJV は設定画面から入力するまで
   * 空欄・GMO はそもそも請求書を出さない）ので、どちらも `null` 可。
   */
  issuer: { name: string; address1: string | null; address2: string | null; regNo: string | null };
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
  /**
   * 見積の有効期限。**入っているときだけ日付で書く**。
   * 無ければ従来どおり「提出後１ヶ月」と書く（決めていない期限を作らない）。
   */
  valid_until?:     string | null;
  /**
   * 請求書番号 (`INV-2026-0001`)。**発行済みのものにしか入らない** (migration 163)。
   * 入っていれば請求書にはこちらを出す（`billing_key` は社内の請求KEY）。
   */
  invoice_no?:      string | null;
  /**
   * 元見積のコード（`GLS-A018-v3` 形式・`estimate-pdf.service.ts` と同じ組み立て）。
   * **検収書の「見積書コード」はこちらを優先して出す**（依頼: 見積書コードと
   * 検収書内の見積書コードを一致させる）。元見積が無い（見積を経ずに直接登録した
   * 売上）ときは `null`——そのときは `billing_key`（社内の請求KEY）へ従来どおり
   * フォールバックする。
   */
  estimate_code?:   string | null;
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

export function generateEstimatePdf(data: PdfRevenueData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const isEstimate   = data.status === 'estimate';
      const isInspection = data.status === 'inspection'; // 検収書 (金額を伏せ 数量・単位のみ)
      const showMoney    = !isInspection;
      // 検収書は「発行した日」を表す書類なので、常に発行時点の日付を出す
      // （請求日・計上日にフォールバックすると、後日発行したときに過去の日付が出てしまう）
      const docDate    = isInspection ? jstDate() : (data.billing_date || data.recognition_date || jstDate());
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

      const { regular: R, bold: B } = registerNotoFonts(doc, { regular: 'R', bold: 'B' });

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
      txt(data.issuer.name, xR, yR, { sz: 10, f: B, c: '#000000', w: colR, align: 'right' }); yR += 14;
      // 住所・登録番号は会社によって未設定のことがある（GJV は設定画面から入力するまで
      // 空欄）。無い行は出さない — 空文字や "null" を印字すると帳票として破綻する
      if (data.issuer.address1) { txt(data.issuer.address1, xR, yR, { sz: 8, c: '#333333', w: colR, align: 'right' }); yR += 12; }
      if (data.issuer.address2) { txt(data.issuer.address2, xR, yR, { sz: 8, c: '#333333', w: colR, align: 'right' }); yR += 12; }
      if (data.issuer.regNo) { txt(`登録番号: ${data.issuer.regNo}`, xR, yR, { sz: 8, c: '#333333', w: colR, align: 'right' }); }

      y = Math.max(yL, yR) + 14;

      // ── ③ タイトル ────────────────────────────────────────────
      const docTitle = isInspection ? '検　収　書' : isEstimate ? '御見積書' : '請　求　書';
      txt(docTitle, ML, y, { sz: 22, f: B }); y += 30;
      if (isInspection) {
        txt('下記の役務に関し、検収致しました。', ML, y, { sz: 9, c: '#333333', w: PW }); y += 16;
      }

      // ── ④ 案件名 ──────────────────────────────────────────────
      txt(projectLabel, ML, y, { sz: 10, w: PW }); y += 16;
      if (data.subtitle) { txt(data.subtitle, ML, y, { sz: 8, c: '#666666', w: PW }); y += 14; }

      // ── ④' 検収書: 担当者/検収日 欄 (記入用) ───────────────────
      if (isInspection) {
        txt(`担当者：${'　'.repeat(12)}　　検収日：${'　'.repeat(10)}`, ML, y, { sz: 9, w: PW }); y += 18;
      }

      // ── ⑤ 3列サマリーボックス (検収書は金額を伏せるため非表示) ──
      if (showMoney) {
      const s0 = PW - 60 - 68 - 80;
      const [s1, s2, s3] = [60, 68, 80];
      const [xS1, xS2, xS3] = [ML + s0, ML + s0 + s1, ML + s0 + s1 + s2];
      const [sHH, sDH] = [18, 20];

      rect(xS1, y, s1, sHH, '#f5f5f5', '#cccccc');
      rect(xS2, y, s2, sHH, '#f5f5f5', '#cccccc');
      rect(xS3, y, s3, sHH, '#f5f5f5', '#cccccc');
      txt('定価',       xS1, y + 5, { sz: 7, f: B, w: s1, align: 'center' });
      txt('割引額',     xS2, y + 5, { sz: 7, f: B, w: s2, align: 'center' });
      // 請求書に「お見積金額」と印字されていたのを直した（相手に渡す紙なので言葉を合わせる）
      txt(isEstimate ? 'お見積金額' : 'ご請求金額', xS3, y + 5, { sz: 7, f: B, w: s3, align: 'center' });
      y += sHH;

      rect(xS1, y, s1, sDH, undefined, '#cccccc');
      rect(xS2, y, s2, sDH, undefined, '#cccccc');
      rect(xS3, y, s3, sDH, undefined, '#cccccc');
      txt(money(listPrice), xS1 + 4, y + 6, { sz: 9, w: s1 - 8, align: 'right' });
      txt(discountTotal < 0 ? money(discountTotal) : '−', xS2 + 4, y + 6, { sz: 9, c: '#d97706', w: s2 - 8, align: 'right' });
      txt(money(quoteTotal), xS3 + 4, y + 5, { sz: 10, f: B, w: s3 - 8, align: 'right' });
      y += sDH + 8;
      } // showMoney

      // ── ⑥ コード＋注記 ───────────────────────────────────────
      //
      // **請求書には請求書番号を出す。** これまでは3種とも「見積コード」と書いて
      // `billing_key`（社内の請求KEY）を出していたので、相手に渡す請求書に
      // 「見積コード：GLS001-001-1」と印字されていた。番号は発行時にだけ採るので
      // (migration 163)、まだ無いものは今までどおり請求KEYを出す。
      //
      // **検収書の「見積書コード」は元見積のコード（`estimate_code`）を優先する。**
      // 以前は検収書もここで `billing_key`（案件の売上連番＋税区分から作る
      // 社内の請求KEY。例 `GLS-A018-003-1`）を出していたため、見積書 PDF に
      // 印字されるコード（`estimate-pdf.service.ts` の `GLS-A018-v3` 形式）と
      // 値が食い違っていた（依頼: 「見積書コードと検収書内の見積書コードを一致させる」）。
      // `estimate_code` は呼び出し側（`revenues.routes.ts`）が同じ組み立てで
      // 作って渡す。見積を経ずに直接登録した売上には元見積が無いので、
      // そのときだけ従来どおり請求KEYへフォールバックする。
      const codeLabel = isInspection ? '見積書コード' : isEstimate ? '見積コード' : '請求書番号';
      const codeValue = isInspection
        ? (data.estimate_code || data.billing_key || '')
        : (!isEstimate && data.invoice_no) || data.billing_key || '';
      txt(`${codeLabel}　：　${codeValue}`, ML, y, { sz: 8 }); y += 14;
      if (isEstimate) {
        // 有効期限を決めてあるなら**その日付**を書く。決めていなければ従来の一文
        const validity = data.valid_until
          ? `＊本見積書の有効期限：${dateJP(data.valid_until)}`
          : '＊御見積有効期間：本見積書提出後１ヶ月';
        txt(`${validity}　　＊本見積書には消費税等は含まれておりません。`,
            ML, y, { sz: 7, c: '#444444', w: PW }); y += 16;
      } else if (isInspection) {
        txt('＊本書は上記役務の検収を確認するものです。金額は当初見積および別途発行の請求書に準じます。',
            ML, y, { sz: 7, c: '#444444', w: PW }); y += 16;
      } else {
        y += 4;
      }

      // ── ⑦ 明細テーブル（カテゴリ別 / 複数ページ対応） ──────────
      const PAGE_BOTTOM = 800; // A4 高さ 842 − 下余白
      const VPAD = 5;
      const HDR_H = 20;
      // 列: (通常) 商品名/備考 | 数量 | 単価 | 金額(税別) / (検収書) 商品名/備考 | 数量 | 単位
      const wQty = 46, wUnit = 82, wAmt = 86;
      const wUnitCol = 60; // 検収書の「単位」列幅
      const wDesc = showMoney ? PW - wQty - wUnit - wAmt : PW - wQty - wUnitCol;
      const xDesc = ML, xQty = ML + wDesc, xUnit = xQty + wQty, xAmt = xUnit + wUnit;
      const xUnitColX = xQty + wQty; // 検収書の単位列 x

      const drawTableHeader = () => {
        rect(xDesc, y, wDesc, HDR_H, '#f0f0f0', '#333333');
        rect(xQty,  y, wQty,  HDR_H, '#f0f0f0', '#333333');
        txt('商品名 / 備考', xDesc + 3, y + 5, { sz: 7, f: B, w: wDesc - 6 });
        txt('数量',          xQty + 3,  y + 5, { sz: 7, f: B, w: wQty - 6, align: 'right' });
        if (showMoney) {
          rect(xUnit, y, wUnit, HDR_H, '#f0f0f0', '#333333');
          rect(xAmt,  y, wAmt,  HDR_H, '#f0f0f0', '#333333');
          txt('単価',       xUnit + 3, y + 5, { sz: 7, f: B, w: wUnit - 6, align: 'right' });
          txt('金額(税別)', xAmt + 3,  y + 5, { sz: 7, f: B, w: wAmt - 6, align: 'right' });
        } else {
          rect(xUnitColX, y, wUnitCol, HDR_H, '#f0f0f0', '#333333');
          txt('単位', xUnitColX + 3, y + 5, { sz: 7, f: B, w: wUnitCol - 6, align: 'center' });
        }
        y += HDR_H;
      };

      // 必要な高さが確保できなければ改ページしてヘッダーを描き直す
      const ensureSpace = (h: number) => {
        if (y + h > PAGE_BOTTOM) {
          doc.addPage();
          y = 40;
          drawTableHeader();
        }
      };

      drawTableHeader();

      // カテゴリ別にグループ化（初出順を保持。カテゴリ無しは「未分類」を最後に）
      const hasCategories = items.some((it) => (it.category || '').trim());
      const groupOrder: string[] = [];
      const groupMap = new Map<string, PdfRevenueItem[]>();
      for (const it of items) {
        const cat = hasCategories ? ((it.category || '').trim() || '（未分類）') : '';
        if (!groupMap.has(cat)) { groupMap.set(cat, []); groupOrder.push(cat); }
        groupMap.get(cat)!.push(it);
      }

      for (const cat of groupOrder) {
        const groupItems = groupMap.get(cat)!;

        // カテゴリ見出し帯
        if (hasCategories) {
          ensureSpace(18 + 24);
          rect(xDesc, y, PW, 18, '#e8eef5', '#333333');
          txt(cat, xDesc + 5, y + 5, { sz: 8, f: B, w: PW - 10 });
          y += 18;
        }

        for (const it of groupItems) {
          const isDisc  = (it.amount || 0) < 0;
          const itColor = isDisc ? '#d97706' : '#000000';
          // **値引きの行には期間を出さない。** 期間を書いていない明細は案件の実施日で
          // 補うが、値引きは期間にわたって提供する役務ではないので、補うと
          // 「9/1〜9/2 のお値引き」という読めない行になる（実際に紙で見つけた）
          const pS = isDisc ? it.period_start : (it.period_start || data.project_start);
          const pE = isDisc ? it.period_end   : (it.period_end   || data.project_end);
          const periodStr = (pS || pE) ? `期間: ${dateSlash(pS)}${pE ? ' 〜 ' + dateSlash(pE) : ''}` : '';

          const descH   = textH(it.description || '', R, 8, wDesc - 6);
          const periodH = periodStr ? 10 : 0;
          const notesH  = it.item_notes ? textH(it.item_notes, R, 7, wDesc - 6) : 0;
          const rh = Math.max(VPAD + descH + (periodH ? 2 + periodH : 0) + (notesH ? 2 + notesH : 0) + VPAD, 24);

          ensureSpace(rh);

          rect(xDesc, y, wDesc, rh, undefined, '#cccccc');
          rect(xQty,  y, wQty,  rh, undefined, '#cccccc');

          cell(xDesc, y, wDesc, rh, () => {
            txt(it.description || '', xDesc + 3, y + VPAD, { sz: 8, c: itColor, w: wDesc - 6, wrap: true });
            let yy = y + VPAD + descH;
            if (periodStr) { txt(periodStr, xDesc + 3, yy + 2, { sz: 7, c: '#444444', w: wDesc - 6 }); yy += 2 + periodH; }
            if (it.item_notes) { txt(it.item_notes, xDesc + 3, yy + 2, { sz: 7, c: '#555555', w: wDesc - 6, wrap: true }); }
          });
          cell(xQty, y, wQty, rh, () => {
            // **数量のあとに単位を続けて出す**（「3 式」のように）。単位が無い行は
            // 今までどおり数量だけ（`unit` は見積の明細だけが持つ・任意の列）
            const qtyStr = `${it.quantity ?? 1}${it.unit ? ` ${it.unit}` : ''}`;
            txt(qtyStr, xQty + 3, y + VPAD, { sz: 8, c: itColor, w: wQty - 6, align: 'right' });
          });
          if (showMoney) {
            // 数量 × 単価 = 金額 が項目ごとに分かるように 3 列で表示
            rect(xUnit, y, wUnit, rh, undefined, '#cccccc');
            rect(xAmt,  y, wAmt,  rh, undefined, '#cccccc');
            cell(xUnit, y, wUnit, rh, () => {
              txt(money(it.unit_price || 0), xUnit + 3, y + VPAD, { sz: 8, c: itColor, w: wUnit - 6, align: 'right' });
            });
            cell(xAmt, y, wAmt, rh, () => {
              txt(money(it.amount || 0), xAmt + 3, y + VPAD, { sz: 8, c: itColor, w: wAmt - 6, align: 'right' });
            });
          } else {
            // 検収書: 単位「式」
            rect(xUnitColX, y, wUnitCol, rh, undefined, '#cccccc');
            cell(xUnitColX, y, wUnitCol, rh, () => {
              txt('式', xUnitColX + 3, y + VPAD, { sz: 8, c: itColor, w: wUnitCol - 6, align: 'center' });
            });
          }

          y += rh;
        }

        // カテゴリ小計 (検収書は金額を伏せるため出さない)
        if (hasCategories && showMoney) {
          const sub = groupItems.reduce((s, it) => s + (it.amount || 0), 0);
          ensureSpace(18);
          rect(xDesc, y, wDesc + wQty + wUnit, 18, '#fafafa', '#cccccc');
          rect(xAmt,  y, wAmt, 18, '#fafafa', '#cccccc');
          txt(`小計（${cat}）`, xDesc + 3, y + 5, { sz: 7, f: B, w: wDesc + wQty + wUnit - 6, align: 'right' });
          txt(money(sub), xAmt + 3, y + 5, { sz: 8, f: B, w: wAmt - 6, align: 'right' });
          y += 18;
        }
      }

      // テーブル下罫線
      doc.moveTo(xDesc, y).lineTo(xDesc + PW, y).strokeColor('#333333').lineWidth(1).stroke();
      y += 16;

      // ── ⑧ 備考ボックス ────────────────────────────────────────
      if (data.notes) {
        const noteH = VPAD + textH(data.notes, R, 8, PW - 18) + VPAD + 16;
        ensureSpace(noteH + 8);
        rect(ML, y, PW, noteH, undefined, '#888888');
        txt('備考', ML + 6, y + 6, { sz: 9, f: B });
        txt(data.notes, ML + 6, y + 18, { sz: 8, w: PW - 12, wrap: true });
        y += noteH + 8;
      }

      // ── ⑨ 支払期日（請求書モード） ────────────────────────────
      if (!isEstimate && !isInspection && data.payment_due_date) {
        ensureSpace(20);
        txt(`お支払期日：${dateJP(data.payment_due_date)}`, ML, y, { sz: 8 });
      }

      // ── ⑨' 検収書: 当日追加対応の注記 ─────────────────────────
      if (isInspection) {
        ensureSpace(28);
        txt('当日追加対応が発生した場合は、別途請求書に基づくものも含め検収対象といたします。',
            ML, y, { sz: 8, c: '#333333', w: PW, wrap: true });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
