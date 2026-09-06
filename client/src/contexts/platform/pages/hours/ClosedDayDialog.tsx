/**
 * 休業日を足す／直す（v4 設定 ⑥）
 *
 * ── 保存する前に「重なる予約」を見せる ──────────────────────
 *
 * モックの指定:「すでに入っている予約は、あとから休業日にしても消えません。
 * 動かす必要がある予約は一覧で確認して個別に連絡してください」
 *
 * だから**消さない**のはもちろんですが、それだけだと
 * 「休業日にしたのに予約が残っている」ことに誰も気づけません。
 * 期間を入れた時点で重なる予約を訊きに行き、**保存する前に**出します。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, CalendarClock, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { AVAILABILITY, type ClosedDay } from './hoursTypes';

interface Affected { id: string; title: string; start_time: string; end_time: string }

interface Props {
  /** null = 新しく足す */
  day: ClosedDay | null;
  locationId: string;
  locationName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ClosedDayDialog({ day, locationId, locationName, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [avail, setAvail] = useState<ClosedDay['availability']>('none');
  const [allSites, setAllSites] = useState(true);
  const [affected, setAffected] = useState<Affected[] | null>(null);

  useEffect(() => {
    if (!open) { setAffected(null); return; }
    setFrom(day?.from_date ?? '');
    setTo(day?.to_date ?? '');
    setName(day?.name ?? '');
    setAvail(day?.availability ?? 'none');
    setAllSites(day ? day.location_id === null : true);
  }, [open, day]);

  // 期間が決まったら、重なる予約を**保存する前に**訊く
  useEffect(() => {
    if (!open || !from) { setAffected(null); return; }
    if (avail === 'open') { setAffected([]); return; } // 営業する日は誰にも影響しない
    let alive = true;
    const params = new URLSearchParams({ from, to: to || from });
    if (!allSites) params.set('location_id', locationId);
    api.get(`/business-hours/closed-days/affected?${params}`)
      .then((r) => { if (alive) setAffected(r.data.data); })
      .catch(() => { if (alive) setAffected(null); });
    return () => { alive = false; };
  }, [open, from, to, allSites, avail, locationId]);

  const save = useMutation({
    mutationFn: async () => (await api.put('/business-hours/closed-days', {
      id: day?.id,
      location_id: allSites ? null : locationId,
      from_date: from, to_date: to || from, name,
      kind: day?.kind ?? (allSites ? 'company' : 'site'),
      availability: avail,
    })).data.data,
    onSuccess: (d: { affected: Affected[] }) => {
      qc.invalidateQueries({ queryKey: ['business-hours'] });
      notifySuccess(day ? '休業日を直しました' : '休業日を足しました', {
        description: d.affected?.length
          ? `この期間に予約が ${d.affected.length} 件あります。消していないので、動かす必要があるものは個別に連絡してください。`
          : undefined,
      });
      onOpenChange(false);
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const bad = !!from && !!to && from > to;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={day ? `${day.name} を編集` : '休業日を追加'}
      // 名前と日付を打つだけのフォームなので Enter で保存できるようにする
      // （送信は `type="submit"` 1か所に寄せる。`onClick` と併用すると二重送信）
      onSubmit={(e) => { e.preventDefault(); if (from && name.trim() && !bad && !save.isPending) save.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button type="submit" disabled={!from || !name.trim() || bad || save.isPending}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            保存する
          </Button>
        </FormDialogFooter>
      }
    >
        <div className="flex flex-col gap-4">
          <p className="text-sub text-muted-foreground">
            ここで閉じた日は、カレンダーで注意が出ます。<strong className="font-bold">予約は止まりません</strong>。
          </p>
          {/*
            **「どこに効かせるか」を先頭に置く。** ここは段1（何にぶら下げるか）で、
            全拠点かこの拠点かで下の欄の意味が変わるうえ、**重なる予約を訊きに行く
            条件そのもの**（`location_id`）でもある。末尾にあったころは、
            期間を入れて出てきた予約の一覧が、あとから拠点を変えると
            黙って入れ替わっていた。
          */}
          <div>
            <Label>どこに効かせるか</Label>
            <div className="mt-1.5 flex gap-1.5">
              {[
                { v: true, l: '全拠点', d: 'どの拠点でも休みになります' },
                { v: false, l: locationName, d: 'この拠点だけ' },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setAllSites(o.v)}
                  className={cn(
                    'rounded-note min-h-tap flex-1 border px-3 py-2 text-left',
                    allSites === o.v ? 'border-primary bg-primary-surface' : 'border-border bg-card',
                  )}
                >
                  <span className="text-list block truncate">{o.l}</span>
                  <span className="text-note block text-muted-foreground">{o.d}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 段2 名前（必須）。**期間より上**に置く — 表の見出しになる欄で、
              必須の欄を任意の期間の後ろに置かない（`_form-order.md` 2-2） */}
          <div>
            <Label htmlFor="cd-name">名前</Label>
            <Input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="夏季休業" />
          </div>

          {/* 段3 いつ（はじまり → おわりの順は動かさない） */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cd-from">はじまり</Label>
              <Input id="cd-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cd-to">おわり</Label>
              <Input id="cd-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <p className="text-note mt-1 text-muted-foreground">1日だけなら同じ日を入れます</p>
            </div>
          </div>
          {bad && (
            <p className="rounded-note text-note border border-destructive-border bg-destructive-surface px-3 py-2 text-destructive">
              おわりがはじまりより前になっています
            </p>
          )}

          <div>
            <Label>この期間の受付</Label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {AVAILABILITY.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAvail(a.value)}
                  className={cn(
                    'text-note min-h-tap rounded-note border px-2.5 font-bold lg:min-h-[32px]',
                    avail === a.value ? `border-transparent ${a.tone}` : 'border-border bg-card text-muted-foreground',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <p className="text-note mt-1.5 text-muted-foreground">
              「営業する」を選ぶと<strong className="font-bold">注意も出ません</strong>
              （祝日を表に並べておくための段です）。
            </p>
          </div>

          {/* 重なる予約は**入れた条件の結果**なので、材料になる欄より下に置く */}
          {affected !== null && affected.length > 0 && (
            <div className="rounded-note overflow-hidden border border-warning-border bg-warning-surface">
              <p className="text-note flex items-center gap-2 px-3.5 py-2.5 font-bold text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                この期間に予約が {affected.length} 件あります（<strong className="font-bold">消しません</strong>）
              </p>
              <ul className="max-h-40 overflow-y-auto bg-card">
                {affected.slice(0, 20).map((b) => (
                  <li key={b.id} className="text-note flex items-center gap-2 border-t border-border-faint px-3.5 py-2">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{b.title}</span>
                    <span className="shrink-0 text-muted-foreground">{b.start_time.slice(5, 16).replace('T', ' ')}</span>
                  </li>
                ))}
                {affected.length > 20 && (
                  <li className="text-note border-t border-border-faint px-3.5 py-2 text-muted-foreground">
                    ほか {affected.length - 20} 件
                  </li>
                )}
              </ul>
              <p className="text-note bg-card px-3.5 py-2.5 text-muted-foreground">
                動かす必要があるものは<strong className="font-bold">個別に連絡してください</strong>。
                休業日にしても予約は残ります。
              </p>
            </div>
          )}
        </div>
    </FormDialog>
  );
}
