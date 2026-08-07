/**
 * 見積を組むときの「どの場所の料金表か」(v4 大③)
 *
 * ── 選ばせるが、決め打ちの理由も出す ────────────────────────
 *
 * 料金表は場所ごとに別なので、**どの表を見ているかが分からないまま金額を積むと、
 * 渋谷の案件に用賀の値段が入ります**。しかも出た金額はそれらしいので気づけません。
 *
 * 案件のスタジオ予約が1つの場所に揃っていればそれを既定にし、
 * **なぜその場所なのかを1行で書きます**。揃っていない（複数拠点・予約なし）
 * ときは推測せず、選んでもらいます。
 */
import { useEffect } from 'react';
import { MapPin, AlertTriangle } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { usePricingLocations, useLocationHint, hintText } from './locations';

export function LocationPicker({
  projectId, value, onChange, enabled = true,
}: {
  projectId?: string | null;
  value: string;
  onChange: (id: string) => void;
  enabled?: boolean;
}) {
  const locations = usePricingLocations();
  const hint = useLocationHint(projectId ?? null, enabled);

  // 既定を1回だけ入れる。**人が選び直したあとに上書きしない**
  useEffect(() => {
    if (value || !hint.data?.location_id) return;
    onChange(hint.data.location_id);
  }, [hint.data, value, onChange]);

  const name = locations.data?.find((l) => l.id === value)?.name;
  const ambiguous = hint.data?.reason === 'ambiguous';
  const empty = !!value && locations.data?.find((l) => l.id === value)?.item_count === 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sub inline-flex items-center gap-1 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />料金表の場所
        </span>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-56"><SelectValue placeholder="場所を選ぶ" /></SelectTrigger>
          <SelectContent>
            {(locations.data ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}{l.item_count === 0 ? '（料金は未定）' : ` — ${l.item_count} 品目`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(ambiguous || empty) && (
        <p className="text-note flex items-start gap-1 text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {ambiguous
            ? 'この案件は複数の拠点に予約があります。どの場所の料金表を使うか選んでください'
            : `${name} にはまだ料金が入っていません。設定の「料金表」で入れるか、別の場所を選んでください`}
        </p>
      )}
      {!ambiguous && !empty && hint.data && (
        <p className="text-note text-muted-foreground">{hintText(hint.data, name)}</p>
      )}
    </div>
  );
}
