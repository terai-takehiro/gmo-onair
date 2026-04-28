import path from 'path';
import fs from 'fs';

// pdfmake v0.3.x: singleton instance with .fonts and .createPdf()
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfmake = require('pdfmake');

// フォント登録（pdfmake v0.3.x はファイルパスを要求）
const fontsDir = path.resolve(__dirname, '../../../assets/fonts');
const fontPath = path.join(fontsDir, 'NotoSansJP.ttf');

pdfmake.fonts = {
  NotoSansJP: {
    normal: fontPath,
    bold: fontPath,
    italics: fontPath,
    bolditalics: fontPath,
  },
};

// 発行者情報（ハードコード）
const COMPANY_INFO = {
  name: 'GMOグローバルスタジオ株式会社',
  address: '東京都世田谷区用賀四丁目10番1号\nGMOインターネットTOWER 27F',
  tel: '03-5456-2555',
  registrationNumber: 'T9011001046041',
};

interface PdfRevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  period_start: string | null;
  period_end: string | null;
  item_notes: string | null;
}

interface PdfRevenueData {
  billing_key: string;
  subtitle: string | null;
  customer_name: string;
  customer_address: string | null;
  customer_contact: string | null;
  project_name: string;
  gls_number: string | null;
  tax_category: string;
  amount: number;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  status: string;
  items: PdfRevenueItem[];
}

function formatCurrency(n: number): string {
  const prefix = n < 0 ? '-¥' : '¥';
  return prefix + Math.abs(n).toLocaleString('ja-JP');
}

function formatDateSlash(d: string | null): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length < 3) return d;
  return `${parseInt(parts[0])}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function formatDateJP(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// M00010000001 形式（M + 11桁ゼロパッド）
function formatItemCode(index: number): string {
  return 'M' + String(10000 * 1000 + index + 1).padStart(11, '0');
}

export async function generateEstimatePdf(data: PdfRevenueData): Promise<Buffer> {
  const isEstimate = data.status === 'estimate';
  const docDate = data.billing_date || data.recognition_date || new Date().toISOString().slice(0, 10);

  // 定価（正の明細合計）/ 割引額（負の明細合計）/ お見積金額（全合計）
  const listPrice = data.items.reduce((s, it) => s + Math.max(0, it.amount), 0);
  const discountTotal = data.items.reduce((s, it) => s + Math.min(0, it.amount), 0);
  const quoteTotal = listPrice + discountTotal;

  // 宛先アドレス行（address フィールドを改行で分割）
  const addressLines: any[] = [];
  if (data.customer_address) {
    data.customer_address.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed) {
        addressLines.push({ text: trimmed, style: 'addressLine', margin: [0, 0, 0, 1] });
      }
    });
  }
  // 会社名
  addressLines.push({ text: data.customer_name, style: 'addressCompany', margin: [0, 2, 0, 1] });
  // 担当者
  const contactLabel = data.customer_contact ? `${data.customer_contact} 様` : 'ご担当者 様';
  addressLines.push({ text: contactLabel, style: 'addressLine', margin: [0, 0, 0, 0] });

  // 明細テーブル body
  const itemTableBody: any[][] = [
    // ヘッダー行
    [
      { text: '明細番号\n期間', style: 'tableHeader', fontSize: 7 },
      { text: '商品名\n備考', style: 'tableHeader', fontSize: 7 },
      { text: '税別金額', style: 'tableHeader', fontSize: 7, alignment: 'right' },
    ],
  ];

  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const code = formatItemCode(i);
    const isDiscount = item.amount < 0;
    const itemColor = isDiscount ? '#d97706' : '#000000';

    // 期間文字列
    const periodLines: any[] = [];
    if (item.period_start || item.period_end) {
      periodLines.push({
        text: formatDateSlash(item.period_start),
        fontSize: 7,
        color: '#444444',
        margin: [0, 2, 0, 0],
      });
      periodLines.push({
        text: `〜${formatDateSlash(item.period_end)}`,
        fontSize: 7,
        color: '#444444',
      });
    }

    // 左列: 明細番号 + 期間
    const leftCell: any = {
      stack: [
        { text: code, fontSize: 7, color: itemColor },
        ...periodLines,
      ],
      margin: [3, 3, 3, 3],
    };

    // 中列: 商品名 + 備考
    const noteLines: any[] = [];
    if (item.item_notes) {
      item.item_notes.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) {
          noteLines.push({
            text: trimmed,
            fontSize: 7,
            color: '#555555',
            margin: [0, 1, 0, 0],
          });
        }
      });
    }
    const middleCell: any = {
      stack: [
        { text: item.description || '', fontSize: 8, color: itemColor },
        ...noteLines,
      ],
      margin: [3, 3, 3, 3],
    };

    // 右列: 税別金額
    const rightCell: any = {
      text: formatCurrency(item.amount),
      fontSize: 8,
      alignment: 'right',
      color: itemColor,
      margin: [3, 3, 3, 3],
    };

    itemTableBody.push([leftCell, middleCell, rightCell]);
  }

  const content: any[] = [
    // ① 発行日（右上）
    {
      columns: [
        { width: '*', text: '' },
        {
          width: 'auto',
          text: formatDateSlash(docDate),
          style: 'small',
          alignment: 'right',
        },
      ],
      margin: [0, 0, 0, 8],
    },

    // ② 宛先（左）＋ 発行者（右）
    {
      columns: [
        {
          width: '55%',
          stack: addressLines,
        },
        {
          width: '45%',
          stack: [
            { text: COMPANY_INFO.name, style: 'companyName', alignment: 'right', margin: [0, 0, 0, 2] },
            ...COMPANY_INFO.address.split('\n').map((line) => ({
              text: line,
              style: 'small',
              alignment: 'right' as const,
              margin: [0, 0, 0, 1],
            })),
            { text: `登録番号: ${COMPANY_INFO.registrationNumber}`, style: 'small', alignment: 'right', margin: [0, 1, 0, 0] },
          ],
        },
      ],
      columnGap: 16,
      margin: [0, 0, 0, 20],
    },

    // ③ タイトル「御見積書」
    {
      text: isEstimate ? '御見積書' : '請　求　書',
      style: 'title',
      margin: [0, 0, 0, 12],
    },

    // ④ 案件名 ＋ 3列サマリーボックス
    {
      columns: [
        {
          width: '*',
          stack: [
            {
              canvas: [
                { type: 'line', x1: 0, y1: 10, x2: 300, y2: 10, lineWidth: 0.5, lineColor: '#888888' },
              ],
              margin: [0, 0, 0, 2],
            },
            {
              text: [
                data.gls_number ? { text: `${data.gls_number}　`, color: '#666666', fontSize: 9 } : '',
                { text: data.project_name || '', fontSize: 10 },
              ],
            },
            ...(data.subtitle ? [{ text: data.subtitle, fontSize: 8, color: '#666666', margin: [0, 2, 0, 0] }] : []),
          ],
        },
        {
          width: 'auto',
          table: {
            widths: [58, 68, 80],
            body: [
              [
                { text: '定価', style: 'summaryHeader', alignment: 'center' },
                { text: '割引額', style: 'summaryHeader', alignment: 'center' },
                { text: 'お見積金額', style: 'summaryHeader', alignment: 'center' },
              ],
              [
                { text: formatCurrency(listPrice), fontSize: 9, alignment: 'right', margin: [4, 2, 4, 2] },
                {
                  text: discountTotal < 0 ? formatCurrency(discountTotal) : '−',
                  fontSize: 9,
                  alignment: 'right',
                  color: '#d97706',
                  margin: [4, 2, 4, 2],
                },
                { text: formatCurrency(quoteTotal), fontSize: 10, bold: true, alignment: 'right', margin: [4, 2, 4, 2] },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cccccc',
            vLineColor: () => '#cccccc',
            paddingTop: () => 0,
            paddingBottom: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
          },
        },
      ],
      columnGap: 12,
      margin: [0, 0, 0, 6],
    },

    // ⑤ 見積コード
    {
      text: `見積コード　：　${data.billing_key}`,
      style: 'small',
      margin: [0, 0, 0, 2],
    },

    // ⑥ 注記（見積有効期間・税別表示）
    {
      columns: [
        {
          text: '＊御見積有効期間：本見積書提出後１ヶ月',
          style: 'noteText',
        },
        {
          text: '＊本見積書には消費税等は含まれておりません。',
          style: 'noteText',
          alignment: 'right',
        },
      ],
      margin: [0, 0, 0, 10],
    },

    // ⑦ 明細テーブル
    {
      table: {
        headerRows: 1,
        widths: [72, '*', 78],
        body: itemTableBody,
      },
      layout: {
        hLineWidth: (i: number, node: any) =>
          i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
        vLineWidth: () => 0.5,
        hLineColor: (i: number) => (i <= 1 ? '#333333' : '#cccccc'),
        vLineColor: () => '#cccccc',
        paddingTop: () => 0,
        paddingBottom: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
      },
      margin: [0, 0, 0, 16],
    },

    // ⑧ 備考ボックス
    ...(data.notes ? [
      {
        table: {
          widths: ['*'],
          body: [[
            {
              stack: [
                { text: '備考', style: 'sectionLabel', margin: [0, 0, 0, 4] },
                ...data.notes.split('\n').map((line) => ({
                  text: line.trim() || ' ',
                  style: 'small',
                  margin: [0, 0, 0, 2],
                })),
              ],
              margin: [6, 6, 6, 6],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#888888',
          vLineColor: () => '#888888',
        },
        margin: [0, 0, 0, 0],
      },
    ] : []),

    // 請求書モード: 支払期日
    ...((!isEstimate && data.payment_due_date) ? [
      {
        text: `お支払期日：${formatDateJP(data.payment_due_date)}`,
        style: 'small',
        margin: [0, 10, 0, 0],
      },
    ] : []),
  ];

  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: {
      font: 'NotoSansJP',
      fontSize: 9,
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount} ページ`,
      alignment: 'right',
      fontSize: 8,
      margin: [0, 10, 40, 0],
      color: '#666666',
    }),
    styles: {
      title: { fontSize: 22, bold: true },
      addressLine: { fontSize: 9 },
      addressCompany: { fontSize: 11, bold: true },
      companyName: { fontSize: 10, bold: true },
      summaryHeader: { fontSize: 7, bold: true, fillColor: '#f5f5f5' },
      tableHeader: { fontSize: 7, bold: true, fillColor: '#f0f0f0' },
      sectionLabel: { fontSize: 9, bold: true },
      small: { fontSize: 8 },
      noteText: { fontSize: 7, color: '#444444' },
    },
    content,
  };

  const pdf = pdfmake.createPdf(docDefinition);
  return pdf.getBuffer() as Promise<Buffer>;
}
