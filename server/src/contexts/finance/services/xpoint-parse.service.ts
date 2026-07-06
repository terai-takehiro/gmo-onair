/**
 * xpoint-parse.service.ts — X-Point (OBIC 経費申請書) PDF テキストの解析
 *
 * Box の extracted_text representation で得たプレーンテキストから、
 * 仕入/販管費の登録に必要なフィールドを抽出する純粋関数。
 *
 * PDF はフォーム (ver.2025/12/18 テンプレート) のため、テキストは
 * 「ラベル群 → 値群 → 'ver.xxxx' → 申請者情報/承認履歴」の順に出力される。
 * 値の並び順はフォームのバージョンで変わり得るため、位置依存を最小限にした
 * パターンマッチ中心で抽出し、曖昧なものは warnings に積んで人間のレビューに委ねる。
 */

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

/** 税込金額から税抜金額を計算 (四捨五入)。exempt は据え置き */
export function toExclusiveAmount(inclusive: number, taxCategory: 'tax10' | 'tax8' | 'exempt'): number {
  if (taxCategory === 'tax10') return Math.round(inclusive / 1.1);
  if (taxCategory === 'tax8') return Math.round(inclusive / 1.08);
  return inclusive;
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
