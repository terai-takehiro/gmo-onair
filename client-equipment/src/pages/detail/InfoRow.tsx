/** 機材詳細のカードで使う「ラベル｜値」の1行。値が空なら行ごと出さない */
export function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-sub text-muted-foreground">{label}</span>
      <span className="text-sub text-right font-bold text-foreground">{value}</span>
    </div>
  );
}
