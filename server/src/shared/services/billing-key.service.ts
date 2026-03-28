// billing_key 自動生成サービス

// 売上・仕入: エピソードコード + 税枝番
// 例: GLS001-001-1 (10%), GLS001-001-2 (8%)
export function generateBillingKey(episodeCode: string, taxCategory: string): string {
  const suffix = taxCategory === 'tax8' ? '2' : '1';
  return `${episodeCode}-${suffix}`;
}

// 販管費: 発生年月日 + 税枝番
// 例: 20260228-1 (10%), 20260228-2 (8%)
export function generateSgaBillingKey(recognitionDate: string, taxCategory: string): string {
  const suffix = taxCategory === 'tax8' ? '2' : '1';
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
