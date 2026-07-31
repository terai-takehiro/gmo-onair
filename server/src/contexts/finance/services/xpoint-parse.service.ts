/**
 * xpoint-parse.service.ts — 精算申請 PDF テキストの解析 (X-Point / 楽楽精算)
 *
 * Box の extracted_text representation で得たプレーンテキストから、
 * 仕入/販管費の登録に必要なフィールドを抽出する純粋関数群。
 *
 * 対応フォーマット:
 *  - X-Point (OBIC 経費申請書): 1 PDF = 1 支払。「ラベル群 → 値群 → 'ver.xxxx' →
 *    申請者情報/承認履歴」の順に出力されるフォーム。
 *  - 楽楽精算 (経費精算 伝票): 1 PDF = 1 伝票 = 複数明細行。明細ごとに税区分
 *    (10%標準/不課税 等) が異なり得るため、(種別 × GLS番号 × 税区分) でグループ化した
 *    「登録単位」に分解する。
 *
 * どちらもレイアウト依存を最小限にしたパターンマッチ中心で抽出し、
 * 曖昧なものは warnings に積んで人間のレビューに委ねる。
 */

import { toExcludedAmount, type TaxCategoryValue } from '../../../shared/services/tax-category.service';

export type { TaxCategoryValue };

export type VoucherFormat = 'xpoint' | 'rakuraku' | 'unknown';

/** 1 回の登録操作に対応する単位 (仕入/販管費 1 レコード分)。楽楽精算は 1 伝票から複数生成され得る */
export interface RegistrationUnit {
  kind: 'purchase' | 'sga' | 'unknown';
  glsNumber: string | null;
  taxCategory: TaxCategoryValue;
  /** この単位に含まれる明細の税込合計 (円) */
  amountInclusive: number;
  /** 税区分で換算した税抜金額 (円) */
  amountExclusive: number;
  description: string | null;
  /** 計上日の候補 (明細の最終日付 / X-Point は経理欄の計上日) */
  recognitionDate: string | null;
  /** 由来した明細 No (楽楽精算のみ) */
  itemNos: number[];
}

/** テキストからフォーマットを判定 */
export function detectVoucherFormat(text: string): VoucherFormat {
  if (/XP\d{6,}/.test(text) || text.includes('OBIC)経費申請書') || text.includes('経費事前申請No')) return 'xpoint';
  if (/伝票No/.test(text) && text.includes('経費精算')) return 'rakuraku';
  return 'unknown';
}

export interface XpointParsed {
  /** X-Point 番号 (例 '177619')。XP0000177619 から先頭ゼロを除去。ファイル名とは一致しないことがある */
  xpNumber: string | null;
  /** 件名の [仕入れ]/[販管費] タグからの分類 */
  kind: 'purchase' | 'sga' | 'unknown';
  /** 件名 (タグ含む全文) */
  subject: string | null;
  /** 件名中の [GLS-B005] 等から抽出した GLS 番号 (大文字正規化) */
  glsNumber: string | null;
  /** 取引先コード (OBIC 側コード。ONAiR の vendors とは別体系なので参考表示) */
  vendorCode: string | null;
  /** 取引先 (支払先) 名 */
  vendorName: string | null;
  /** 支払金額 (税込・円) */
  amountInclusive: number | null;
  /** 支払方法 (銀行振込 等) */
  paymentMethod: string | null;
  /** 適格事業者番号 (T + 13桁) */
  invoiceNumber: string | null;
  /** 適格事業者区分から推定した適格フラグ (課税事業者=true / 免税事業者=false) */
  invoiceQualified: boolean;
  /** 申請日 (YYYY-MM-DD) */
  applicationDate: string | null;
  /** 納期/サービス期間 開始 (YYYY-MM-DD) */
  servicePeriodStart: string | null;
  /** 納期/サービス期間 終了 (YYYY-MM-DD) */
  servicePeriodEnd: string | null;
  /** 支払予定日 (YYYY-MM-DD) */
  paymentDueDate: string | null;
  /** 計上日 (YYYY-MM-DD、経理入力欄) */
  recognitionDate: string | null;
  /** 内容 (詳細) の先頭行 */
  description: string | null;
  /** 摘要・補助などの残り行 (備考向け) */
  detailLines: string[];
  /** 科目コード + 科目名 (例 '7310 賃借料') */
  account: string | null;
  /** 申請者名 */
  applicantName: string | null;
  /** 解析上の注意点 (人間のレビューで確認すべき点) */
  warnings: string[];
}

const DATE_RE = /(\d{4})\/(\d{1,2})\/(\d{1,2})/g;
const PAYMENT_METHODS = ['銀行振込', '口座振替', 'クレジットカード', 'クレジット', '現金', '手形', '振込'];

function toIsoDate(s: string): string {
  const m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return s;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** 税込金額から税抜金額を計算 (四捨五入)。非課税・不課税は据え置き */
export function toExclusiveAmount(inclusive: number, taxCategory: TaxCategoryValue): number {
  return toExcludedAmount(inclusive, taxCategory);
}

export function parseXpointText(text: string): XpointParsed {
  const warnings: string[] = [];
  const allLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // 'ver.YYYY/MM/DD' 行より前 = フォームの入力値、後 = 申請者情報/承認履歴
  let verIdx = allLines.findIndex((l) => /^ver\./i.test(l));
  if (verIdx < 0) {
    verIdx = allLines.length;
    warnings.push('フォームのバージョン行 (ver.xxxx) が見つかりません。テンプレートが変わった可能性があるため全項目を確認してください。');
  }
  const preVer = allLines.slice(0, verIdx);
  const postVer = allLines.slice(verIdx + 1);

  // --- X-Point 番号: XP0000177619 → 177619 (本文優先。ファイル名は当てにしない) ---
  let xpNumber: string | null = null;
  const xpMatch = text.match(/XP0*(\d{3,})/);
  if (xpMatch) {
    xpNumber = xpMatch[1];
  } else {
    warnings.push('X-Point 番号 (XPxxxxxxxxxx) が本文から見つかりません。精算番号を手入力してください。');
  }

  // --- 件名: [仕入れ] / [販管費] で始まる行 ---
  let kind: XpointParsed['kind'] = 'unknown';
  let subject: string | null = null;
  for (const line of preVer) {
    const m = line.match(/^\[(仕入れ?|販管費)\]/);
    if (m) {
      subject = line;
      kind = m[1].startsWith('仕入') ? 'purchase' : 'sga';
      break;
    }
  }
  if (!subject) {
    // タグ無しでも件名らしき行 ([xxx] で始まる行) を拾う
    subject = preVer.find((l) => /^\[.+\]/.test(l)) || null;
    warnings.push('件名の [仕入れ]/[販管費] タグが見つかりません。種別を手動で選択してください。');
  }

  // --- GLS 番号: 件名 (無ければ本文) の [GLS-B005] 等 ---
  let glsNumber: string | null = null;
  const glsSource = subject || text;
  const glsMatch = glsSource.match(/\[(GLS[-A-Za-z0-9]*\d[-A-Za-z0-9]*)\]/i) || text.match(/\[(GLS[-A-Za-z0-9]*\d[-A-Za-z0-9]*)\]/i);
  if (glsMatch) glsNumber = glsMatch[1].toUpperCase();

  // --- 取引先: 5〜7 桁の取引先コード + 名称の行 (フォーム値領域のみ。部門コードや社員番号は ver. 行より後に出る) ---
  let vendorCode: string | null = null;
  let vendorName: string | null = null;
  for (const line of preVer) {
    const m = line.match(/^(\d{5,7})\s+(\S.*)$/);
    if (m) {
      vendorCode = m[1];
      vendorName = m[2].trim();
      break;
    }
  }
  if (!vendorName) warnings.push('取引先 (支払先) が抽出できませんでした。手動で選択してください。');

  // --- 支払金額 (税込) + 支払方法: '120,450 銀行振込 ...' の行 ---
  let amountInclusive: number | null = null;
  let paymentMethod: string | null = null;
  for (const line of preVer) {
    const m = line.match(/^([0-9][0-9,]*)\s+(.+)$/);
    if (!m) continue;
    const rest = m[2];
    const method = PAYMENT_METHODS.find((p) => rest.startsWith(p));
    if (method) {
      amountInclusive = parseInt(m[1].replace(/,/g, ''), 10);
      paymentMethod = method;
      break;
    }
  }
  if (amountInclusive == null) {
    // フォールバック: 数字のみの行の最大値 (TOTAL 行)
    let max = 0;
    for (const line of preVer) {
      if (/^[0-9][0-9,]*$/.test(line)) {
        const v = parseInt(line.replace(/,/g, ''), 10);
        if (v > max) max = v;
      }
    }
    if (max > 0) {
      amountInclusive = max;
      warnings.push('支払金額を支払方法の行から特定できなかったため、本文中の最大金額を採用しました。金額を必ず確認してください。');
    } else {
      warnings.push('支払金額 (税込) が抽出できませんでした。手動で入力してください。');
    }
  }

  // --- 適格事業者番号 / 区分 ---
  const invMatch = text.match(/T\d{13}/);
  const invoiceNumber = invMatch ? invMatch[0] : null;
  const invoiceQualified = text.includes('免税事業者') ? false : true;
  if (!invoiceNumber && kind !== 'unknown') {
    warnings.push('適格事業者番号 (T+13桁) が見つかりません。インボイス区分を確認してください。');
  }

  // --- 日付群 (フォーム値領域のみ): 申請日 → 納期(開始/終了) → 支払予定日 → … → 計上日 ---
  interface FoundDate { iso: string; lineIdx: number; posInLine: number }
  const foundDates: FoundDate[] = [];
  preVer.forEach((line, lineIdx) => {
    let m: RegExpExecArray | null;
    const re = new RegExp(DATE_RE.source, 'g');
    while ((m = re.exec(line)) !== null) {
      foundDates.push({ iso: toIsoDate(m[0]), lineIdx, posInLine: m.index });
    }
  });

  let applicationDate: string | null = null;
  let servicePeriodStart: string | null = null;
  let servicePeriodEnd: string | null = null;
  let paymentDueDate: string | null = null;
  let recognitionDate: string | null = null;
  let paymentDueLineIdx: number | null = null;

  if (foundDates.length > 0) applicationDate = foundDates[0].iso;

  // 納期/サービス期間 = 同一行に日付が 2 つ並ぶ行
  const byLine = new Map<number, FoundDate[]>();
  for (const fd of foundDates) {
    const arr = byLine.get(fd.lineIdx) || [];
    arr.push(fd);
    byLine.set(fd.lineIdx, arr);
  }
  let periodLineIdx: number | null = null;
  for (const [lineIdx, arr] of byLine) {
    if (arr.length >= 2) {
      periodLineIdx = lineIdx;
      servicePeriodStart = arr[0].iso;
      servicePeriodEnd = arr[1].iso;
      break;
    }
  }

  if (periodLineIdx !== null) {
    // 支払予定日 = 納期行の次に現れる単独日付
    const after = foundDates.filter((fd) => fd.lineIdx > periodLineIdx!);
    if (after.length > 0) {
      paymentDueDate = after[0].iso;
      paymentDueLineIdx = after[0].lineIdx;
    }
    // 計上日 (経理入力欄) = フォーム値領域の最後の日付 (支払予定日と別の行にある場合)
    if (after.length >= 2) {
      recognitionDate = after[after.length - 1].iso;
    }
  }
  if (!recognitionDate) {
    warnings.push('計上日 (経理入力欄) が特定できませんでした。計上月を確認してください。');
  }
  if (!paymentDueDate) {
    warnings.push('支払予定日が特定できませんでした。確認してください。');
  }

  // --- 内容 (詳細) / 科目 / 摘要: 支払予定日の行より後 〜 ver. 行の間 ---
  let description: string | null = null;
  let account: string | null = null;
  const detailLines: string[] = [];
  if (paymentDueLineIdx !== null) {
    for (let i = paymentDueLineIdx + 1; i < preVer.length; i++) {
      const line = preVer[i];
      // 日付のみの行 (計上日) はスキップ
      if (/^[\d/\s~～]+$/.test(line)) continue;
      const acctMatch = line.match(/^(\d{3,4})\s+(\S.*)$/);
      if (acctMatch) {
        // 科目/補助/補助内訳のコード行 (例 '3020 買掛金' / '5010 用賀ｽﾀｼﾞｵ')
        if (!account) account = line;
        else detailLines.push(line);
        continue;
      }
      if (!description) description = line;
      else detailLines.push(line);
    }
  }

  // --- 申請者: ver. 行の直後の '社員番号 氏名' 行 ---
  let applicantName: string | null = null;
  for (const line of postVer) {
    const m = line.match(/^(\d{4,7})\s+(\S.*)$/);
    if (m) {
      applicantName = m[2].trim();
      break;
    }
  }

  // --- 追加の妥当性チェック ---
  if (kind === 'purchase' && !glsNumber) {
    warnings.push('仕入ですが件名に GLS 番号が見つかりません。案件を手動で選択してください。');
  }
  if (kind === 'sga' && glsNumber) {
    warnings.push(`販管費ですが GLS 番号 (${glsNumber}) が件名に含まれています。仕入の可能性がないか確認してください。`);
  }
  // X-Point の支払金額は必ず税込表記。税率だけはテキストから確実に特定できないため、常に確認を促す
  warnings.push('X-Point の支払金額は税込表記です。税率 10% を仮定して税抜換算しているため、8%・非課税の場合は税区分を変更してください。');

  return {
    xpNumber, kind, subject, glsNumber, vendorCode, vendorName,
    amountInclusive, paymentMethod, invoiceNumber, invoiceQualified,
    applicationDate, servicePeriodStart, servicePeriodEnd, paymentDueDate, recognitionDate,
    description, detailLines, account, applicantName, warnings,
  };
}

/** X-Point の解析結果を登録単位 (常に 1 件) に変換 */
export function buildXpointUnits(parsed: XpointParsed): RegistrationUnit[] {
  const taxCategory = 'tax10' as const; // 税率はテキストから確定できないため 10% 仮定 (warnings で確認を促す)
  const inclusive = parsed.amountInclusive ?? 0;
  return [{
    kind: parsed.kind,
    glsNumber: parsed.glsNumber,
    taxCategory,
    amountInclusive: inclusive,
    amountExclusive: toExclusiveAmount(inclusive, taxCategory),
    description: parsed.description,
    recognitionDate: parsed.recognitionDate,
    itemNos: [],
  }];
}

// ============================================================
// 楽楽精算 (経費精算 伝票)
// ============================================================

export interface RakurakuItem {
  no: number;
  date: string | null;           // YYYY-MM-DD (利用日)
  taxLabel: string;              // 例 '10%標準' / '不課税'
  taxCategory: TaxCategoryValue;
  body: string;                  // 利用内訳 + 支払方法の生テキスト
  amountInclusive: number;
  usage: string | null;          // 用途行の生テキスト (例 '[仕入れ][GLS-A004]GMOアワード2026_宿泊費')
  kind: 'purchase' | 'sga' | 'unknown';
  glsNumber: string | null;
  description: string | null;    // 用途からタグを除いた本文
}

export interface RakurakuParsed {
  /** 伝票 No (精算番号 楽-XXXXXX に使用) */
  denpyoNumber: string | null;
  /** ヘッダーの長い管理番号 (伝票 No と食い違う場合は警告) */
  headerNumber: string | null;
  applicantName: string | null;
  applicationDate: string | null;
  /** 合計 精算額 (税込) */
  totalInclusive: number | null;
  items: RakurakuItem[];
  warnings: string[];
}

/**
 * 楽楽精算の税区分ラベル → ONAiR の税区分。
 * **不課税と非課税を分ける** (v3.1.5)。税額はどちらも 0 円だが申告では別の区分なので、
 * 片方に寄せると取り込んだあとに分けられない。「不課税」は「課税」を含むので先に見る。
 */
function mapTaxLabel(label: string): TaxCategoryValue | null {
  if (label.includes('10%')) return 'tax10';
  if (label.includes('8%')) return 'tax8';
  if (/不課税|対象外/.test(label)) return 'nontax';
  if (/非課税|免税/.test(label)) return 'exempt';
  return null;
}

export function parseRakurakuText(text: string): RakurakuParsed {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // --- 伝票 No: 本文の「伝票No.011643」を採用 (ヘッダーの長い管理番号は使わず参考表示のみ) ---
  const denpyoMatches = [...text.matchAll(/伝票No\.?\s*(\d+)/g)].map((m) => m[1]);
  const denpyoNumber = denpyoMatches.length > 0 ? denpyoMatches[denpyoMatches.length - 1] : null;
  const headerNumber = lines.find((l) => /^\d{10,}$/.test(l)) || null;
  if (!denpyoNumber) {
    warnings.push('伝票No が見つかりません。精算番号を手入力してください。');
  } else if (new Set(denpyoMatches).size > 1) {
    warnings.push(`本文中の伝票No が複数あります (${[...new Set(denpyoMatches)].join(' / ')})。精算番号を確認してください。`);
  }

  // --- 申請者 / 申請日 ---
  const applicantMatch = text.match(/申請者\s*([^\s(（]+(?:[\s　]+[^\s(（]+)*)[(（]\d+[)）]/);
  const applicantName = applicantMatch ? applicantMatch[1].trim() : null;
  const appDateMatch = text.match(/申請日\s*(\d{4}\/\d{1,2}\/\d{1,2})/);
  const applicationDate = appDateMatch ? toIsoDate(appDateMatch[1]) : null;

  // --- 合計 精算額: 「合計 精算額」ラベルの次に現れる数値ペア行 ---
  let totalInclusive: number | null = null;
  const totalLabelIdx = lines.findIndex((l) => l.includes('合計') && l.includes('精算額'));
  if (totalLabelIdx >= 0) {
    for (let i = totalLabelIdx + 1; i < Math.min(totalLabelIdx + 4, lines.length); i++) {
      const m = lines[i].match(/^([\d,]+)\s+([\d,]+)$/) || lines[i].match(/^([\d,]+)$/);
      if (m) {
        totalInclusive = parseInt((m[2] || m[1]).replace(/,/g, ''), 10);
        break;
      }
    }
  }

  // --- 明細行: 'No 日付 …【税区分】利用内訳 支払方法 金額 ○' + 直後の用途行 '[仕入れ][GLS-A004]…' ---
  const items: RakurakuItem[] = [];
  const ITEM_RE = /^(\d{1,3})\s*(\d{4}\/\d{1,2}\/\d{1,2})(.*?)【(.+?)】(.*?)([\d,]+)\s*○?\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ITEM_RE);
    if (!m) continue;
    const taxLabel = m[4];
    const taxCategory = mapTaxLabel(taxLabel);
    if (taxCategory === null) {
      warnings.push(`明細 ${m[1]} の税区分「${taxLabel}」を判定できません。10% として扱うので確認してください。`);
    }
    // 直後の '[' で始まる行が用途
    let usage: string | null = null;
    if (i + 1 < lines.length && /^\[/.test(lines[i + 1])) usage = lines[i + 1];

    let kind: RakurakuItem['kind'] = 'unknown';
    let glsNumber: string | null = null;
    let description: string | null = null;
    if (usage) {
      const kindMatch = usage.match(/\[(仕入れ?|販管費)\]/);
      if (kindMatch) kind = kindMatch[1].startsWith('仕入') ? 'purchase' : 'sga';
      const glsMatch = usage.match(/\[(GLS[-A-Za-z0-9]*\d[-A-Za-z0-9]*)\]/i);
      if (glsMatch) glsNumber = glsMatch[1].toUpperCase();
      description = usage.replace(/\[[^\]]*\]/g, '').trim() || null;
    }

    items.push({
      no: parseInt(m[1], 10),
      date: toIsoDate(m[2]),
      taxLabel,
      taxCategory: taxCategory ?? 'tax10',
      body: (m[3] + m[5]).trim(),
      amountInclusive: parseInt(m[6].replace(/,/g, ''), 10),
      usage, kind, glsNumber, description,
    });
  }

  if (items.length === 0) {
    warnings.push('明細行を抽出できませんでした。テンプレートが変わった可能性があります。手動で入力してください。');
  } else {
    const sum = items.reduce((a, it) => a + it.amountInclusive, 0);
    if (totalInclusive != null && sum !== totalInclusive) {
      warnings.push(`明細の合計 (${sum.toLocaleString()}円) と伝票の精算額 (${totalInclusive.toLocaleString()}円) が一致しません。抽出漏れの可能性があるため必ず PDF と突き合わせてください。`);
    }
    for (const it of items) {
      if (it.kind === 'unknown') warnings.push(`明細 ${it.no} の用途に [仕入れ]/[販管費] タグが無く種別を判定できません。`);
    }
  }
  warnings.push('楽楽精算の金額は税込表記です。明細の税区分から税抜換算していますが、必ず確認してください。');
  warnings.push('楽楽精算は従業員立替のため PDF に取引先の記載がありません。仕入先/支払先はレビューで選択・入力してください。');

  return { denpyoNumber, headerNumber, applicantName, applicationDate, totalInclusive, items, warnings };
}

/** 楽楽精算の明細を (種別 × GLS番号 × 税区分) でグループ化して登録単位に変換 */
export function buildRakurakuUnits(parsed: RakurakuParsed): RegistrationUnit[] {
  const groups = new Map<string, RegistrationUnit>();
  for (const it of parsed.items) {
    const key = `${it.kind}|${it.glsNumber ?? ''}|${it.taxCategory}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        kind: it.kind,
        glsNumber: it.glsNumber,
        taxCategory: it.taxCategory,
        amountInclusive: 0,
        amountExclusive: 0,
        description: null,
        recognitionDate: null,
        itemNos: [],
      };
      groups.set(key, g);
    }
    g.amountInclusive += it.amountInclusive;
    g.itemNos.push(it.no);
    if (it.date && (!g.recognitionDate || it.date > g.recognitionDate)) g.recognitionDate = it.date;
    if (it.description) {
      const parts = g.description ? g.description.split(' / ') : [];
      if (!parts.includes(it.description)) parts.push(it.description);
      g.description = parts.join(' / ');
    }
  }
  const units = [...groups.values()];
  for (const u of units) {
    u.amountExclusive = toExclusiveAmount(u.amountInclusive, u.taxCategory);
  }
  return units;
}
