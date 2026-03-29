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

// 会社情報（ハードコード）
const COMPANY_INFO = {
  name: 'GMOメディア株式会社',
  department: 'ONAiR事業部',
  zipCode: '150-8512',
  address: '東京都渋谷区桜丘町26番1号 セルリアンタワー',
  tel: '03-5456-2555',
  registrationNumber: 'T9011001046041',
};

interface PdfRevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface PdfRevenueData {
  billing_key: string;
  subtitle: string | null;
  customer_name: string;
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
  return '¥' + n.toLocaleString('ja-JP');
}

function formatDateJP(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function getTaxRate(taxCategory: string): number {
  if (taxCategory === 'tax8') return 0.08;
  if (taxCategory === 'exempt') return 0;
  return 0.10;
}

function getTaxLabel(taxCategory: string): string {
  if (taxCategory === 'tax8') return '消費税(8%)';
  if (taxCategory === 'exempt') return '';
  return '消費税(10%)';
}

export async function generateEstimatePdf(data: PdfRevenueData): Promise<Buffer> {
  const isEstimate = data.status === 'estimate';
  const docTitle = isEstimate ? '御 見 積 書' : '請 求 書';
  const docDate = data.billing_date || data.recognition_date || new Date().toISOString().slice(0, 10);
  const taxRate = getTaxRate(data.tax_category);
  const taxLabel = getTaxLabel(data.tax_category);

  // 小計・税額・合計
  const subtotal = data.items.reduce((sum, it) => sum + it.amount, 0);
  const taxAmount = data.tax_category === 'exempt' ? 0 : Math.floor(subtotal * taxRate);
  const totalAmount = subtotal + taxAmount;

  // 明細テーブル
  const itemRows: any[][] = data.items.map((item, i) => [
    { text: String(i + 1), alignment: 'center' },
    { text: item.description || '' },
    { text: String(item.quantity), alignment: 'right' },
    { text: formatCurrency(item.unit_price), alignment: 'right' },
    { text: formatCurrency(item.amount), alignment: 'right' },
  ]);

  const content: any[] = [
    // タイトル
    { text: docTitle, style: 'title', alignment: 'center', margin: [0, 0, 0, 20] },

    // 上部情報（宛先 + 発行者）
    {
      columns: [
        // 左: 宛先
        {
          width: '50%',
          stack: [
            { text: `${data.customer_name} 御中`, style: 'customerName', margin: [0, 0, 0, 4] },
            { text: `案件: ${data.gls_number || ''} ${data.project_name}`, style: 'small', margin: [0, 0, 0, 2] },
            ...(data.subtitle ? [{ text: `件名: ${data.subtitle}`, style: 'small', margin: [0, 0, 0, 2] }] : []),
            { text: ' ', margin: [0, 0, 0, 8] },
            // 合計金額を目立たせる
            {
              table: {
                widths: ['*'],
                body: [
                  [{ text: `合計金額: ${formatCurrency(totalAmount)}（税込）`, style: 'totalHighlight', alignment: 'center', margin: [8, 6, 8, 6] }],
                ],
              },
              layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => '#333333',
                vLineColor: () => '#333333',
              },
            },
          ],
        },
        // 右: 発行者情報
        {
          width: '45%',
          stack: [
            { text: `発行日: ${formatDateJP(docDate)}`, style: 'small', alignment: 'right', margin: [0, 0, 0, 2] },
            { text: `No. ${data.billing_key}`, style: 'small', alignment: 'right', margin: [0, 0, 0, 10] },
            { text: COMPANY_INFO.name, style: 'companyName', alignment: 'right', margin: [0, 0, 0, 1] },
            { text: COMPANY_INFO.department, style: 'small', alignment: 'right', margin: [0, 0, 0, 1] },
            { text: `〒${COMPANY_INFO.zipCode}`, style: 'small', alignment: 'right', margin: [0, 0, 0, 1] },
            { text: COMPANY_INFO.address, style: 'small', alignment: 'right', margin: [0, 0, 0, 1] },
            { text: `TEL: ${COMPANY_INFO.tel}`, style: 'small', alignment: 'right', margin: [0, 0, 0, 1] },
            { text: `登録番号: ${COMPANY_INFO.registrationNumber}`, style: 'small', alignment: 'right', margin: [0, 0, 0, 0] },
          ],
        },
      ],
      columnGap: 20,
      margin: [0, 0, 0, 20],
    },

    // 明細テーブル
    {
      table: {
        headerRows: 1,
        widths: [30, '*', 50, 80, 80],
        body: [
          // ヘッダー
          [
            { text: 'No.', style: 'tableHeader', alignment: 'center' },
            { text: '項目', style: 'tableHeader' },
            { text: '数量', style: 'tableHeader', alignment: 'right' },
            { text: '単価', style: 'tableHeader', alignment: 'right' },
            { text: '金額', style: 'tableHeader', alignment: 'right' },
          ],
          ...itemRows,
        ],
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
        vLineWidth: () => 0.5,
        hLineColor: (i: number) => i <= 1 ? '#333333' : '#cccccc',
        vLineColor: () => '#cccccc',
        paddingTop: () => 4,
        paddingBottom: () => 4,
        paddingLeft: () => 6,
        paddingRight: () => 6,
      },
      margin: [0, 0, 0, 10],
    },

    // 小計・税額・合計
    {
      columns: [
        { width: '*', text: '' },
        {
          width: 250,
          table: {
            widths: ['*', 100],
            body: [
              [
                { text: '小計', alignment: 'right', border: [false, false, false, false] },
                { text: formatCurrency(subtotal), alignment: 'right', border: [false, false, false, true] },
              ],
              ...(taxLabel ? [[
                { text: taxLabel, alignment: 'right', border: [false, false, false, false] },
                { text: formatCurrency(taxAmount), alignment: 'right', border: [false, false, false, true] },
              ]] : []),
              [
                { text: '合計（税込）', alignment: 'right', bold: true, border: [false, false, false, false] },
                { text: formatCurrency(totalAmount), alignment: 'right', bold: true, border: [false, true, false, true] },
              ],
            ],
          },
          layout: {
            hLineWidth: (i: number) => (i === 0) ? 0 : 0.5,
            vLineWidth: () => 0,
            hLineColor: () => '#999999',
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingRight: () => 4,
          },
        },
      ],
      margin: [0, 0, 0, 20],
    },
  ];

  // 支払期日
  if (data.payment_due_date) {
    content.push({
      text: `お支払期日: ${formatDateJP(data.payment_due_date)}`,
      style: 'small',
      margin: [0, 0, 0, 4],
    });
  }

  // 備考
  if (data.notes) {
    content.push(
      { text: '備考', style: 'sectionLabel', margin: [0, 10, 0, 4] },
      { text: data.notes, style: 'small', margin: [0, 0, 0, 0] },
    );
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    defaultStyle: {
      font: 'NotoSansJP',
      fontSize: 9,
    },
    styles: {
      title: { fontSize: 18, bold: true },
      customerName: { fontSize: 13, bold: true, decoration: 'underline' },
      companyName: { fontSize: 10, bold: true },
      small: { fontSize: 8 },
      tableHeader: { fontSize: 8, bold: true, fillColor: '#f0f0f0' },
      totalHighlight: { fontSize: 12, bold: true },
      sectionLabel: { fontSize: 9, bold: true },
    },
    content,
  };

  const pdf = pdfmake.createPdf(docDefinition);
  return pdf.getBuffer() as Promise<Buffer>;
}
