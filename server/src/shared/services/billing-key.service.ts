// billing_key 自動生成サービス
import { taxBillingSuffix } from './tax-category.service';

// 売上・仕入: エピソードコード + 税枝番
// 例: GLS001-001-1 (10%), GLS001-001-2 (8%)
export function generateBillingKey(episodeCode: string, taxCategory: string): string {
  // 以前はここだけ非課税を '1' にしており、同じ非課税の売上が作った入口によって
  // `...-1` と `...-0` に分かれていた。税枝番の決定は tax-category.service に寄せる。
  const suffix = taxBillingSuffix(taxCategory);
  return `${episodeCode}-${suffix}`;
}

// 販管費: 発生年月日 + 税枝番
// 例: 20260228-1 (10%), 20260228-2 (8%)
export function generateSgaBillingKey(recognitionDate: string, taxCategory: string): string {
  const suffix = taxBillingSuffix(taxCategory);
  const dateStr = recognitionDate.replace(/-/g, '');
  return `${dateStr}-${suffix}`;
}

// 精算番号フォーマット (表示用)
export function formatSettlementNumber(method: string | null, number: string | null): string {
  if (!number || number === 'pending') return '未定';
  if (method === 'xpoint') return `X-${number}`;
  if (method === 'rakuraku') return `楽-${number}`;
  return number;
}
