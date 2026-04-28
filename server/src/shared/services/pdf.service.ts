import path from 'path';

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
  address1: '東京都世田谷区用賀四丁目10番1号',
  address2: 'GMOインターネットTOWER 27F',
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
  const prefix = n < 0 ? '-\xA5' : '\xA5';
  return prefix + Math.abs(n).toLocaleString('ja-JP');
}

function formatDateSlash(d: string | null | undefined): string {
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
  const safeItems = Array.isArray(data.items) ? data.items : [];

  // 定価（正の明細合計）/ 割引額（負の明細合計）/ お見積金額（全合計）
  const listPrice = safeItems.reduce((s, it) => s + Math.max(0, it.amount || 0), 0);
  const discountTotal = safeItems.reduce((s, it) => s + Math.min(0, it.amount || 0), 0);
  const quoteTotal = listPrice + discountTotal;

  // 宛先アドレス行（address フィールドを改行で分割して各行を積む）
  const addressStack: any[] = [];
  if (data.customer_address) {
    const lines = data.customer_address.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (t) addressStack.push({ text: t, style: 'addressLine' });
    }
  }
  addressStack.push({ text: data.customer_name || '', style: 'addressCompany' });
  const contactLabel = data.customer_contact ? `${data.customer_contact} 様` : 'ご担当者 様';
  addressStack.push({ text: contactLabel, style: 'addressLine' });

  // 明細テーブル body
  const itemTableBody: any[][] = [
    [
      { text: '明細番号\n期間', style: 'tableHeader', fontSize: 7 },
      { text: '商品名\n備考', style: 'tableHeader', fontSize: 7 },
      { text: '税別金額', style: 'tableHeader', fontSize: 7, alignment: 'right' },
    ],
  ];

  for (let i = 0; i < safeItems.length; i++) {
    const item = safeItems[i];
    const code = formatItemCode(i);
    const isDiscount = (item.amount || 0) < 0;
    const itemColor = isDiscount ? '#d97706' : '#000000';

    // 左列スタック: 明細番号 + 期間
    const leftStack: any[] = [
      { text: code, fontSize: 7, color: itemColor },
    ];
    if (item.period_start || item.period_end) {
      leftStack.push({ text: formatDateSlash(item.period_start), fontSize: 7, color: '#444444' });
      leftStack.push({ text: `〜${formatDateSlash(item.period_end)}`, fontSize: 7, color: '#444444' });
    }

    // 中列スタック: 商品名 + 備考行
    const middleStack: any[] = [
      { text: item.description || '', fontSize: 8, color: itemColor },
    ];
    if (item.item_notes) {
      const noteLines = item.item_notes.split('\n');
      for (const line of noteLines) {
        const t = line.trim();
        if (t) middleStack.push({ text: t, fontSize: 7, color: '#555555' });
      }
    }

    itemTableBody.push([
      { stack: leftStack, margin: [3, 3, 3, 3] },
      { stack: middleStack, margin: [3, 3, 3, 3] },
      { text: formatCurrency(item.amount || 0), fontSize: 8, alignment: 'right', color: itemColor, margin: [3, 3, 3, 3] },
    ]);
  }

  // 案件名テキスト
  const projectLabel = data.gls_number
    ? `${data.gls_number}　${data.project_name || ''}`
    : (data.project_name || '');

  const content: any[] = [
    // ① 発行日（右上）
    {
      text: formatDateSlash(docDate),
      fontSize: 8,
      alignment: 'right',
      margin: [0, 0, 0, 8],
    },

    // ② 宛先（左）＋ 発行者（右）
    {
      columns: [
        {
          width: '55%',
          stack: addressStack,
        },
        {
          width: '45%',
          stack: [
            { text: COMPANY_INFO.name, style: 'companyName', alignment: 'right' },
            { text: COMPANY_INFO.address1, style: 'small', alignment: 'right' },
            { text: COMPANY_INFO.address2, style: 'small', alignment: 'right' },
            { text: `登録番号: ${COMPANY_INFO.registrationNumber}`, style: 'small', alignment: 'right' },
          ],
        },
      ],
      columnGap: 16,
      margin: [0, 0, 0, 20],
    },

    // ③ タイトル
    {
      text: isEstimate ? '御見積書' : '請　求　書',
      style: 'title',
      margin: [0, 0, 0, 12],
    },

    // ④ 案件名
    {
      text: projectLabel,
      fontSize: 10,
      margin: [0, 0, 0, 4],
    },
    ...(data.subtitle ? [{ text: data.subtitle, fontSize: 8, color: '#666666', margin: [0, 0, 0, 4] }] : []),

    // ⑤ 3列サマリーボックス
    {
      table: {
        widths: ['*', 60, 68, 80],
        body: [
          [
            { text: '', border: [false, false, false, false] },
            { text: '定価', style: 'summaryHeaderCell', alignment: 'center' },
            { text: '割引額', style: 'summaryHeaderCell', alignment: 'center' },
            { text: 'お見積金額', style: 'summaryHeaderCell', alignment: 'center' },
          ],
          [
            { text: '', border: [false, false, false, false] },
            { text: formatCurrency(listPrice), fontSize: 9, alignment: 'right', border: [true, false, true, true] },
            {
              text: discountTotal < 0 ? formatCurrency(discountTotal) : '−',
              fontSize: 9,
              alignment: 'right',
              color: '#d97706',
              border: [true, false, true, true],
            },
            { text: formatCurrency(quoteTotal), fontSize: 10, bold: true, alignment: 'right', border: [true, false, true, true] },
          ],
        ],
      },
      layout: {
        hLineWidth: (i: number) => (i === 0 || i === 2 ? 0.5 : 0),
        vLineWidth: (i: number) => (i > 1 ? 0.5 : 0),
        hLineColor: () => '#cccccc',
        vLineColor: () => '#cccccc',
        paddingTop: () => 3,
        paddingBottom: () => 3,
        paddingLeft: () => 5,
        paddingRight: () => 5,
      },
      margin: [0, 0, 0, 6],
    },

    // ⑥ 見積コード
    {
      text: `見積コード　：　${data.billing_key || ''}`,
      style: 'small',
      margin: [0, 0, 0, 2],
    },

    // ⑦ 注記
    {
      text: '＊御見積有効期間：本見積書提出後１ヶ月　　＊本見積書には消費税等は含まれておりません。',
      style: 'noteText',
      margin: [0, 0, 0, 10],
    },

    // ⑧ 明細テーブル
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

    // ⑨ 備考ボックス
    ...(data.notes
      ? [
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      { text: '備考', style: 'sectionLabel', margin: [0, 0, 0, 4] },
                      ...data.notes.split('\n').map((line: string) => ({
                        text: line.trim() || ' ',
                        style: 'small',
                        margin: [0, 0, 0, 2],
                      })),
                    ],
                    margin: [6, 6, 6, 6],
                  },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => '#888888',
              vLineColor: () => '#888888',
            },
            margin: [0, 0, 0, 8],
          },
        ]
      : []),

    // ⑩ 支払期日（請求書モードのみ）
    ...((!isEstimate && data.payment_due_date)
      ? [{ text: `お支払期日：${formatDateJP(data.payment_due_date)}`, style: 'small', margin: [0, 0, 0, 0] }]
      : []),
  ];

  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    defaultStyle: {
      font: 'NotoSansJP',
      fontSize: 9,
    },
    styles: {
      title: { fontSize: 22, bold: true },
      addressLine: { fontSize: 9 },
      addressCompany: { fontSize: 11, bold: true },
      companyName: { fontSize: 10, bold: true },
      summaryHeaderCell: { fontSize: 7, bold: true, fillColor: '#f5f5f5' },
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
