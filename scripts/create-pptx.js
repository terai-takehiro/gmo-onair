const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "GMO Global Studio";
pres.title = "GMO ONAiR - プロトタイプ概要";

const C = {
  primary: "005bac",
  primaryDark: "003f77",
  primaryLight: "e6f0fa",
  accent: "00a0e9",
  success: "22c55e",
  warning: "f59e0b",
  danger: "ef4444",
  dark: "1e293b",
  gray: "64748b",
  lightGray: "f1f5f9",
  white: "FFFFFF",
  black: "0f172a",
};

const F = { title: "Arial Black", body: "Arial", mono: "Consolas" };

function addFooter(slide, num) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.25, w: 10, h: 0.375, fill: { color: C.primary } });
  slide.addText("GMO ONAiR  |  Prototype Overview", { x: 0.5, y: 5.25, w: 7, h: 0.375, fontSize: 8, color: C.white, fontFace: F.body });
  slide.addText(`${num}`, { x: 9, y: 5.25, w: 0.7, h: 0.375, fontSize: 8, color: C.white, fontFace: F.body, align: "right" });
}

function addSlideTitle(slide, title, subtitle) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.08, h: 1.2, fill: { color: C.primary } });
  slide.addText(title, { x: 0.4, y: 0.25, w: 9, h: 0.55, fontSize: 28, fontFace: F.title, color: C.primaryDark, bold: true, margin: 0 });
  if (subtitle) {
    slide.addText(subtitle, { x: 0.4, y: 0.8, w: 9, h: 0.3, fontSize: 12, fontFace: F.body, color: C.gray, margin: 0 });
  }
}

function addCard(slide, x, y, w, h, opts = {}) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: opts.fill || C.white },
    shadow: { type: "outer", color: "000000", blur: 4, offset: 1, angle: 135, opacity: 0.1 },
  });
}

function addIconCircle(slide, x, y, label, color) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: 0.4, h: 0.4, fill: { color } });
  slide.addText(label, { x, y, w: 0.4, h: 0.4, fontSize: 14, color: C.white, align: "center", valign: "middle", fontFace: F.body, bold: true });
}

// ===== Slide 1: Title =====
const s1 = pres.addSlide();
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.primaryDark } });
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent } });
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 3.8, w: 10, h: 0.005, fill: { color: C.accent, transparency: 50 } });
s1.addText("GMO ONAiR", { x: 0.8, y: 1.2, w: 8.4, h: 1.2, fontSize: 52, fontFace: F.title, color: C.white, bold: true, margin: 0 });
s1.addText("統合業務管理システム", { x: 0.8, y: 2.3, w: 8.4, h: 0.6, fontSize: 24, fontFace: F.body, color: C.accent, margin: 0 });
s1.addText("プロトタイプ概要資料", { x: 0.8, y: 2.9, w: 8.4, h: 0.5, fontSize: 18, fontFace: F.body, color: "94a3b8", margin: 0 });
s1.addText("GMO Global Studio Inc.", { x: 0.8, y: 4.2, w: 4, h: 0.4, fontSize: 12, fontFace: F.body, color: "94a3b8", margin: 0 });
s1.addText("2026.03", { x: 7, y: 4.2, w: 2.2, h: 0.4, fontSize: 12, fontFace: F.body, color: "94a3b8", align: "right", margin: 0 });

// ===== Slide 2: System Overview =====
const s2 = pres.addSlide();
s2.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s2, "システム概要", "映像制作・スタジオ運営の業務を一元管理");
addFooter(s2, 2);

const overviewItems = [
  ["営業管理", "ヨミ(営業パイプライン)から\n受注・GLS発番まで一気通貫"],
  ["番組管理", "話数単位の予算管理\n発注・請求グルーピング"],
  ["財務管理", "売上・仕入の追跡\n粗利の自動計算"],
  ["スタジオ運営", "カレンダー・料金表\nマスターデータ管理"],
];
overviewItems.forEach((item, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const cx = 0.5 + col * 4.7;
  const cy = 1.4 + row * 1.85;
  addCard(s2, cx, cy, 4.3, 1.6);
  addIconCircle(s2, cx + 0.2, cy + 0.25, String(i + 1), C.primary);
  s2.addText(item[0], { x: cx + 0.75, y: cy + 0.15, w: 3.2, h: 0.4, fontSize: 16, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
  s2.addText(item[1], { x: cx + 0.75, y: cy + 0.6, w: 3.2, h: 0.8, fontSize: 11, fontFace: F.body, color: C.gray, margin: 0 });
});

// ===== Slide 3: ヨミ管理 =====
const s3 = pres.addSlide();
s3.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s3, "ヨミ管理（営業パイプライン）", "ネタ獲得から受注確定・GLS発番まで");
addFooter(s3, 3);

const stages = [
  { label: "ネタ", color: "94a3b8" },
  { label: "D\n仮押さえ", color: "a78bfa" },
  { label: "C\n見積提案", color: "3b82f6" },
  { label: "B\n口頭決定", color: "f59e0b" },
  { label: "A\n受注済", color: "22c55e" },
];
stages.forEach((st, i) => {
  const sx = 0.4 + i * 1.85;
  s3.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: sx, y: 1.35, w: 1.65, h: 0.9, rectRadius: 0.06, fill: { color: st.color } });
  s3.addText(st.label, { x: sx, y: 1.35, w: 1.65, h: 0.9, fontSize: 11, fontFace: F.body, color: C.white, align: "center", valign: "middle", bold: true });
  if (i < 4) {
    s3.addText("\u25B6", { x: sx + 1.65, y: 1.55, w: 0.2, h: 0.5, fontSize: 12, color: C.gray, align: "center", valign: "middle" });
  }
});
s3.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.5, y: 1.55, w: 0.9, h: 0.5, rectRadius: 0.04, fill: { color: C.gray } });
s3.addText("S 完了", { x: 7.5, y: 1.55, w: 0.9, h: 0.5, fontSize: 9, color: C.white, align: "center", valign: "middle", fontFace: F.body });
s3.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.6, y: 1.55, w: 0.9, h: 0.5, rectRadius: 0.04, fill: { color: C.danger } });
s3.addText("E 失注", { x: 8.6, y: 1.55, w: 0.9, h: 0.5, fontSize: 9, color: C.white, align: "center", valign: "middle", fontFace: F.body });

s3.addText("B口頭決定の段階でGLS番号を自動発番 → 欠番なし", { x: 0.5, y: 2.45, w: 9, h: 0.35, fontSize: 11, fontFace: F.body, color: C.primary, bold: true, margin: 0 });

const yomiFeatures = [
  ["案件種類（6種）", "オフライン/ハイブリット/生放送\n収録/GMO案件/その他"],
  ["料金シミュレーション", "7カテゴリ35項目の料金表から\n見積金額を自動算出"],
  ["複数日程管理", "ラベル付き日程の追加\n期間指定・飛び飛び対応"],
];
yomiFeatures.forEach((f, i) => {
  const fx = 0.4 + i * 3.1;
  addCard(s3, fx, 2.95, 2.85, 1.7);
  s3.addText(f[0], { x: fx + 0.15, y: 3.05, w: 2.55, h: 0.35, fontSize: 13, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
  s3.addText(f[1], { x: fx + 0.15, y: 3.45, w: 2.55, h: 1.0, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });
});

// ===== Slide 4: 案件管理 =====
const s4 = pres.addSlide();
s4.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s4, "案件管理（番組管理）", "GLS番号体系 + 話数(エピソード)単位の管理");
addFooter(s4, 4);

addCard(s4, 0.4, 1.3, 4.4, 3.6);
s4.addText("GLS番号体系", { x: 0.6, y: 1.4, w: 4, h: 0.35, fontSize: 15, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
s4.addText([
  { text: "GLS001", options: { fontSize: 22, fontFace: F.mono, color: C.primary, bold: true, breakLine: true } },
  { text: "番組基本コード（グローバル連番）", options: { fontSize: 10, color: C.gray, breakLine: true } },
  { text: "\n", options: { fontSize: 6, breakLine: true } },
  { text: "GLS001-001", options: { fontSize: 18, fontFace: F.mono, color: C.accent, bold: true, breakLine: true } },
  { text: "話数コード（番組コード + 話数番号）", options: { fontSize: 10, color: C.gray } },
], { x: 0.6, y: 1.85, w: 4, h: 2.0, margin: 0 });

addCard(s4, 5.2, 1.3, 4.4, 1.65);
s4.addText("発注バッチ + 売上按分", { x: 5.4, y: 1.4, w: 4, h: 0.35, fontSize: 14, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
s4.addText([
  { text: "「12話一括発注」→ 売上合計を均等按分", options: { fontSize: 10, color: C.dark, breakLine: true } },
  { text: "各話の売上は後から個別調整可能", options: { fontSize: 10, color: C.dark, breakLine: true } },
  { text: "仕入は各話ごとに個別登録", options: { fontSize: 10, color: C.dark } },
], { x: 5.4, y: 1.85, w: 4, h: 0.9, margin: 0 });

addCard(s4, 5.2, 3.15, 4.4, 1.75);
s4.addText("請求グループ", { x: 5.4, y: 3.25, w: 4, h: 0.35, fontSize: 14, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
s4.addText([
  { text: "話数を自由にグループ化して請求単位を作成", options: { fontSize: 10, color: C.dark, breakLine: true } },
  { text: "例: #1〜#4を第1Q請求、#5〜#8を第2Q請求", options: { fontSize: 10, color: C.dark, breakLine: true } },
  { text: "ステータス管理: 下書き → 送付済 → 入金済", options: { fontSize: 10, color: C.dark } },
], { x: 5.4, y: 3.65, w: 4, h: 1.0, margin: 0 });

// ===== Slide 5: 案件グループ =====
const s5 = pres.addSlide();
s5.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s5, "案件グループ（親案件）", "複数GLS案件の統括と共通仕入の按分");
addFooter(s5, 5);

addCard(s5, 0.4, 1.35, 9.2, 2.0);
s5.addText("ユースケース: グループ株主総会", { x: 0.6, y: 1.45, w: 8.8, h: 0.35, fontSize: 14, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });

const groupItems = [
  { gls: "GLS009", name: "A社 株主総会", rev: "¥3M" },
  { gls: "GLS010", name: "B社 株主総会", rev: "¥2M" },
  { gls: "GLS011", name: "C社 株主総会", rev: "¥5M" },
];
s5.addText("GLS", { x: 0.7, y: 1.9, w: 1, h: 0.25, fontSize: 9, fontFace: F.body, color: C.gray, bold: true, margin: 0 });
s5.addText("案件名", { x: 1.7, y: 1.9, w: 2, h: 0.25, fontSize: 9, fontFace: F.body, color: C.gray, bold: true, margin: 0 });
s5.addText("売上", { x: 3.7, y: 1.9, w: 1, h: 0.25, fontSize: 9, fontFace: F.body, color: C.gray, bold: true, margin: 0 });
groupItems.forEach((item, i) => {
  const gy = 2.2 + i * 0.3;
  s5.addText(item.gls, { x: 0.7, y: gy, w: 1, h: 0.25, fontSize: 10, fontFace: F.mono, color: C.primary, margin: 0 });
  s5.addText(item.name, { x: 1.7, y: gy, w: 2, h: 0.25, fontSize: 10, fontFace: F.body, color: C.dark, margin: 0 });
  s5.addText(item.rev, { x: 3.7, y: gy, w: 1, h: 0.25, fontSize: 10, fontFace: F.mono, color: C.dark, margin: 0 });
});

s5.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.9, w: 0.01, h: 1.3, fill: { color: "cbd5e1" } });
s5.addText("共通仕入", { x: 5.5, y: 1.9, w: 2, h: 0.25, fontSize: 9, fontFace: F.body, color: C.gray, bold: true, margin: 0 });
s5.addText([
  { text: "スタジオ技術  ¥5,000,000", options: { fontSize: 10, breakLine: true } },
  { text: "配信システム  ¥3,000,000", options: { fontSize: 10, breakLine: true } },
  { text: "\n", options: { fontSize: 4, breakLine: true } },
  { text: "→ 10社に均等按分", options: { fontSize: 10, color: C.primary, bold: true } },
], { x: 5.5, y: 2.2, w: 3.5, h: 1.0, fontFace: F.body, color: C.dark, margin: 0 });

addCard(s5, 0.4, 3.6, 4.4, 1.3);
s5.addText("均等按分", { x: 0.6, y: 3.7, w: 4, h: 0.3, fontSize: 13, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
s5.addText("仕入額 ÷ 子案件数で自動配分\nボタン1つで一括按分実行", { x: 0.6, y: 4.05, w: 4, h: 0.7, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });

addCard(s5, 5.2, 3.6, 4.4, 1.3);
s5.addText("個別調整", { x: 5.4, y: 3.7, w: 4, h: 0.3, fontSize: 13, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
s5.addText("按分後に各案件の金額を手動調整\n合計が仕入額と一致するよう管理", { x: 5.4, y: 4.05, w: 4, h: 0.7, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });

// ===== Slide 6: 料金表マスター =====
const s6 = pres.addSlide();
s6.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s6, "料金表マスター", "7カテゴリ・35項目の料金データベース");
addFooter(s6, 6);

const categories = [
  { name: "基本料金", count: "7項目", types: "日数/時間/固定" },
  { name: "控室利用料金", count: "5項目", types: "日数" },
  { name: "機材費", count: "4項目", types: "台数×日数" },
  { name: "技術人件費", count: "10項目", types: "人数×日数" },
  { name: "技術運用費", count: "2項目", types: "日数" },
  { name: "追加演出", count: "4項目", types: "有無" },
  { name: "その他", count: "1項目", types: "有無" },
];
categories.forEach((cat, i) => {
  const row = Math.floor(i / 4);
  const col = i % 4;
  const cx = 0.4 + col * 2.35;
  const cy = 1.35 + row * 1.5;
  addCard(s6, cx, cy, 2.15, 1.25);
  s6.addText(cat.name, { x: cx + 0.1, y: cy + 0.1, w: 1.95, h: 0.3, fontSize: 12, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
  s6.addText(cat.count, { x: cx + 0.1, y: cy + 0.45, w: 1.95, h: 0.25, fontSize: 10, fontFace: F.body, color: C.dark, margin: 0 });
  s6.addText(cat.types, { x: cx + 0.1, y: cy + 0.75, w: 1.95, h: 0.25, fontSize: 9, fontFace: F.body, color: C.primary, margin: 0 });
});

s6.addText("計算タイプ: 日数×単価 / 時間×単価 / 固定 / 台数×日数×単価 / 人数×日数×単価 / 有無×単価", { x: 0.5, y: 4.5, w: 9, h: 0.4, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });

// ===== Slide 7: ダッシュボード =====
const s7 = pres.addSlide();
s7.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s7, "ダッシュボード", "KPI + グラフ + アラートで業務を一望");
addFooter(s7, 7);

const kpis = [
  { label: "今月売上", value: "¥20.2M", color: C.primary },
  { label: "粗利率", value: "74.9%", color: C.success },
  { label: "進行中案件", value: "6件", color: C.accent },
  { label: "アクティブヨミ", value: "9件", color: C.warning },
];
kpis.forEach((kpi, i) => {
  const kx = 0.4 + i * 2.35;
  addCard(s7, kx, 1.3, 2.15, 0.95);
  s7.addText(kpi.label, { x: kx + 0.15, y: 1.35, w: 1.85, h: 0.25, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });
  s7.addText(kpi.value, { x: kx + 0.15, y: 1.65, w: 1.85, h: 0.45, fontSize: 22, fontFace: F.mono, color: kpi.color, bold: true, margin: 0 });
});

addCard(s7, 0.4, 2.5, 4.4, 2.2);
s7.addText("月次推移グラフ", { x: 0.6, y: 2.6, w: 4, h: 0.3, fontSize: 13, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
s7.addText("過去12ヶ月の売上(棒) / 仕入(棒) / 粗利(線)\nrechartsによるインタラクティブチャート", { x: 0.6, y: 3.0, w: 4, h: 0.8, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });

addCard(s7, 5.2, 2.5, 4.4, 2.2);
s7.addText("ヨミパイプライン", { x: 5.4, y: 2.6, w: 4, h: 0.3, fontSize: 13, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
s7.addText("ステージ別のヨミ件数・金額を\n横棒チャートで可視化", { x: 5.4, y: 3.0, w: 4, h: 0.8, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });

// ===== Slide 8: カレンダー =====
const s8 = pres.addSlide();
s8.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s8, "スタジオカレンダー", "FullCalendar によるスケジュール管理");
addFooter(s8, 8);

addCard(s8, 0.4, 1.35, 9.2, 3.5);
const calItems = [
  { label: "本番日", color: C.primary, desc: "プロジェクトのイベント本番日" },
  { label: "リハーサル", color: C.warning, desc: "リハーサル日程" },
  { label: "収録", color: "8b5cf6", desc: "各話の収録日（紫）" },
  { label: "放送", color: "06b6d4", desc: "各話の放送日（シアン）" },
];
calItems.forEach((item, i) => {
  const iy = 1.6 + i * 0.7;
  s8.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.8, y: iy, w: 1.2, h: 0.4, rectRadius: 0.04, fill: { color: item.color } });
  s8.addText(item.label, { x: 0.8, y: iy, w: 1.2, h: 0.4, fontSize: 11, color: C.white, align: "center", valign: "middle", fontFace: F.body, bold: true });
  s8.addText(item.desc, { x: 2.2, y: iy, w: 3, h: 0.4, fontSize: 11, fontFace: F.body, color: C.dark, valign: "middle", margin: 0 });
});

s8.addText([
  { text: "月・週・日ビュー対応", options: { fontSize: 11, breakLine: true } },
  { text: "プロジェクトステータス別の色分け", options: { fontSize: 11, breakLine: true } },
  { text: "クリックで案件詳細に遷移", options: { fontSize: 11, breakLine: true } },
  { text: "話数の収録日/放送日も自動表示", options: { fontSize: 11 } },
], { x: 5.5, y: 1.6, w: 3.8, h: 2.5, fontFace: F.body, color: C.gray, margin: 0 });

// ===== Slide 9: 帳票・レポート =====
const s9 = pres.addSlide();
s9.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s9, "帳票・レポート", "見積書・請求書・実績レポート・仕入先集計");
addFooter(s9, 9);

const reports = [
  { title: "見積書", desc: "シミュレーション結果をHTML帳票に\nブラウザ印刷でPDF出力対応", format: "HTML/PDF" },
  { title: "請求書", desc: "請求グループ単位の帳票\n話数・金額の明細付き", format: "HTML/PDF" },
  { title: "実績レポート", desc: "案件ごとの売上・仕入・粗利\nエピソード単位のCSV出力", format: "CSV" },
  { title: "仕入先集計", desc: "期間指定で仕入先別に集計\n構成比(%)+CSV出力", format: "画面+CSV" },
];
reports.forEach((r, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const rx = 0.4 + col * 4.7;
  const ry = 1.35 + row * 1.85;
  addCard(s9, rx, ry, 4.3, 1.6);
  s9.addText(r.title, { x: rx + 0.2, y: ry + 0.1, w: 2.5, h: 0.35, fontSize: 15, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
  s9.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: rx + 3.0, y: ry + 0.15, w: 1.0, h: 0.25, rectRadius: 0.04, fill: { color: C.primary } });
  s9.addText(r.format, { x: rx + 3.0, y: ry + 0.15, w: 1.0, h: 0.25, fontSize: 8, color: C.white, align: "center", valign: "middle", fontFace: F.body });
  s9.addText(r.desc, { x: rx + 0.2, y: ry + 0.55, w: 3.9, h: 0.9, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });
});

// ===== Slide 10: その他機能 =====
const s10 = pres.addSlide();
s10.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.lightGray } });
addSlideTitle(s10, "その他の機能", "業務を支える基盤機能");
addFooter(s10, 10);

const otherFeatures = [
  ["全画面横断検索", "ヘッダーの検索バーからヨミ・案件・顧客・仕入先を横断検索"],
  ["売上・仕入一覧", "全案件横断のフィルタ付き一覧。エピソード紐付け対応"],
  ["顧客マスター", "顧客情報のCRUD管理。略称・メモ対応"],
  ["仕入先マスター", "仕入先情報+インボイス登録番号管理"],
  ["パートナーマスター", "外部スタッフ管理。専門分野タグ対応"],
  ["ユーザー管理", "4ロール(管理者/担当者/閲覧者/外部)の権限管理"],
];
otherFeatures.forEach((f, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const fx = 0.4 + col * 4.7;
  const fy = 1.35 + row * 1.25;
  addCard(s10, fx, fy, 4.3, 1.0);
  s10.addText(f[0], { x: fx + 0.2, y: fy + 0.1, w: 3.9, h: 0.3, fontSize: 13, fontFace: F.body, color: C.primaryDark, bold: true, margin: 0 });
  s10.addText(f[1], { x: fx + 0.2, y: fy + 0.45, w: 3.9, h: 0.4, fontSize: 10, fontFace: F.body, color: C.gray, margin: 0 });
});

// ===== Slide 11: 技術スタック =====
const s11 = pres.addSlide();
s11.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.primaryDark } });
s11.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.accent } });
s11.addText("技術スタック", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: F.title, color: C.white, bold: true, margin: 0 });
addFooter(s11, 11);

const stacks = [
  { layer: "Frontend", items: "React 18 + TypeScript + Vite\nTailwind CSS + shadcn/ui\nTanStack Query + Zustand\nrecharts + FullCalendar", color: C.accent },
  { layer: "Backend", items: "Node.js + Express\nTypeScript\nsql.js (SQLite)\nREST API", color: C.success },
  { layer: "Infrastructure", items: "npm workspaces (monorepo)\nRender (PaaS)\nGitHub (VCS)", color: C.warning },
];
stacks.forEach((st, i) => {
  const sx = 0.5 + i * 3.15;
  s11.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: sx, y: 1.2, w: 2.85, h: 3.2, rectRadius: 0.08, fill: { color: "1e3a5f" } });
  s11.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: sx, y: 1.2, w: 2.85, h: 0.5, rectRadius: 0.08, fill: { color: st.color } });
  s11.addShape(pres.shapes.RECTANGLE, { x: sx, y: 1.5, w: 2.85, h: 0.2, fill: { color: st.color } });
  s11.addText(st.layer, { x: sx, y: 1.2, w: 2.85, h: 0.5, fontSize: 14, fontFace: F.body, color: C.white, align: "center", valign: "middle", bold: true });
  s11.addText(st.items, { x: sx + 0.2, y: 1.9, w: 2.45, h: 2.3, fontSize: 12, fontFace: F.body, color: "cbd5e1", margin: 0 });
});

// ===== Slide 12: 今後の展望 =====
const s12 = pres.addSlide();
s12.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.primaryDark } });
s12.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: C.accent } });
s12.addText("今後の展望", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: F.title, color: C.white, bold: true, margin: 0 });
addFooter(s12, 12);

const futureItems = [
  { title: "本番認証", desc: "OAuth/SSO連携による\nセキュアな認証基盤", phase: "Phase 2" },
  { title: "PostgreSQL移行", desc: "SQLite→PostgreSQLへの\n本番環境対応", phase: "Phase 2" },
  { title: "通知機能", desc: "リハ日・入金期限等の\nリマインダー通知", phase: "Phase 2" },
  { title: "ファイル添付", desc: "案件への資料・契約書の\nアップロード管理", phase: "Phase 3" },
  { title: "監査ログ", desc: "全操作履歴の記録と\nトレーサビリティ", phase: "Phase 3" },
];
futureItems.forEach((item, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const ix = 0.5 + col * 3.15;
  const iy = 1.2 + row * 2.0;
  s12.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: ix, y: iy, w: 2.85, h: 1.7, rectRadius: 0.08, fill: { color: "1e3a5f" } });
  s12.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: ix + 1.8, y: iy + 0.1, w: 0.9, h: 0.25, rectRadius: 0.04, fill: { color: row === 0 ? C.accent : C.warning } });
  s12.addText(item.phase, { x: ix + 1.8, y: iy + 0.1, w: 0.9, h: 0.25, fontSize: 8, color: C.white, align: "center", valign: "middle", fontFace: F.body });
  s12.addText(item.title, { x: ix + 0.15, y: iy + 0.1, w: 1.6, h: 0.3, fontSize: 14, fontFace: F.body, color: C.white, bold: true, margin: 0 });
  s12.addText(item.desc, { x: ix + 0.15, y: iy + 0.55, w: 2.55, h: 0.9, fontSize: 10, fontFace: F.body, color: "94a3b8", margin: 0 });
});

const outputPath = "C:/Users/usr0106232/Desktop/GMO_ONAiR_プロトタイプ概要.pptx";
pres.writeFile({ fileName: outputPath }).then(() => {
  console.log("Created: " + outputPath);
}).catch(err => {
  console.error("Error:", err);
});
