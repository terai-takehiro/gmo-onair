export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return "¥0";
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (isNaN(num)) return "¥0";
  return `¥${num.toLocaleString("ja-JP")}`;
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

export function formatPercent(value: number | string | null | undefined): string {
  if (value == null) return "0.0%";
  const num = typeof value === 'string' ? Number(value) : value;
  if (isNaN(num)) return "0.0%";
  return `${num.toFixed(1)}%`;
}
