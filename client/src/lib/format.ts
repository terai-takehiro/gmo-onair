export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "¥0";
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "0.0%";
  return `${value.toFixed(1)}%`;
}
