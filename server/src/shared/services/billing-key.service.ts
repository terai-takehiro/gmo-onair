// billing_key 自動生成サービス
//
// 税枝番は **tax-category.service に1本化** (v3.1.5)。
// ここだけ `tax8→2 / それ以外→1` で、非課税の売上が入口によって `-1` と `-0` に
// 分かれていた (他の3か所は exempt→0)。billing_key は請求キーで PDF のファイル名にも
// 使うため、入口ごとに違う値が出ないようにする。
import { taxBillingSuffix } from './tax-category.service';

// 売上・仕入: エピソードコード + 税枝番
// 例: GLS001-001-1 (10%), GLS001-001-2 (8%), GLS001-001-0 (非課税), GLS001-001-3 (不課税)
export function generateBillingKey(episodeCode: string, taxCategory: string): string {
  return `${episodeCode}-${taxBillingSuffix(taxCategory)}`;
}

// 販管費: 発生年月日 + 税枝番
// 例: 20260228-1 (10%), 20260228-2 (8%)
export function generateSgaBillingKey(recognitionDate: string, taxCategory: string): string {
  const dateStr = recognitionDate.replace(/-/g, '');
  return `${dateStr}-${taxBillingSuffix(taxCategory)}`;
}

// 精算番号フォーマット (表示用)
export function formatSettlementNumber(method: string | null, number: string | null): string {
  if (!number || number === 'pending') return '未定';
  if (method === 'xpoint') return `X-${number}`;
  if (method === 'rakuraku') return `楽-${number}`;
  return number;
}
