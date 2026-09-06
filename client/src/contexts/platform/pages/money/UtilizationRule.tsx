/**
 * 稼働率の数え方 — お金のルール ⑤ の下（隔週キープの「9. 進捗状況」の材料）
 *
 * ── 決めごと（`docs/design/v4/keep-report.md` §5.4・2026-09-06 ご判断）──
 *
 *   稼働率 ＝ スタジオ利用があった日数 ÷ 営業日数 × 100
 *
 * 内覧を含め、何かしらの利用があった日は数える。メンテナンスは除く。
 * 同じ日に複数の予定があっても1日と数え、部屋数は掛けない。営業日は土日祝を除く。
 * **資料の 10月 36.1% はどの決まりでも合わなかった**（半日か仮押さえの扱い）ので、
 * 定義を画面に出して人が選べるようにする — 決め打ちにすると、数字が合わない月に
 * 誰も理由を説明できない。
 *
 * ── 種別の名前は予約の正から引く ────────────────────────────
 *
 * `BOOKING_TYPE_OPTIONS`（カレンダーの予約種別）をそのまま並べる。
 * ここに写しを作ると、種別を足したときに片方だけ古くなる。
 *
 * ── 変えられるのは管理者だけ ────────────────────────────────
 *
 * 数え方を変えると過去の月の稼働率まで変わる（凍結した版は動かない）。
 * サーバーも `sales: manager` で止めるので、それより緩く出さない（押せるのに 403 になる）。
 */
import { useEffect, useState } from 'react';
import { Activity, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { UtilizationSettings } from '@gmo-onair/shared/src/keepReport/types';
import { BOOKING_TYPE_OPTIONS } from '@/contexts/production/components/schedule/scheduleShared';
import { useUtilizationSettings, useSaveUtilizationSettings } from '@/lib/keepApi';

/** 迷いやすい種別だけ一言添える（ほかは名前で足りる） */
const TYPE_NOTE: Record<string, string> = {
  hold: 'まだ利用ではない予定。見込みの月に数えたいときだけ',
  maintenance: '利用ではないので、ふつうは数えない',
  tour: '内覧も利用として数える（ご判断）',
};

function same(a: UtilizationSettings, b: UtilizationSettings): boolean {
  return a.count_saturday === b.count_saturday
    && [...a.counted_types].sort().join(',') === [...b.counted_types].sort().join(',');
}

export function UtilizationRule({ canManage }: { canManage: boolean }) {
  const q = useUtilizationSettings();
  const save = useSaveUtilizationSettings();
  const [draft, setDraft] = useState<UtilizationSettings | null>(null);

  useEffect(() => {
    if (q.data) setDraft({ counted_types: [...q.data.counted_types], count_saturday: !!q.data.count_saturday });
  }, [q.data]);

  const dirty = !!draft && !!q.data && !same(draft, q.data);
  const toggleType = (t: string, on: boolean) => setDraft((d) => d && ({
    ...d,
    counted_types: on ? [...new Set([...d.counted_types, t])] : d.counted_types.filter((x) => x !== t),
  }));

  const submit = () => {
    if (!draft) return;
    save.mutate(draft, {
      onSuccess: () => notifySuccess('稼働率の数え方を保存しました', {
        description: '隔週キープの稼働率と稼働カレンダーに、次に開いたときから効きます。凍結した版は変わりません。',
      }),
      onError: (e) => notifyApiError('保存できませんでした', e),
    });
  };

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-faint px-4 py-3">
        <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-primary-surface">
          <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
        <span className="text-cardtitle shrink-0">稼働率の数え方</span>
        <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
          隔週キープの稼働率・稼働カレンダーで、どの予定を「利用」と数えるか
        </span>
      </div>

      {q.isError ? (
        <div className="p-4">
          <ErrorPanel title="稼働率の数え方を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : !draft ? (
        <div className="p-4"><Delayed><SkeletonRows rows={4} /></Delayed></div>
      ) : (
        <div className="flex flex-col gap-3.5 px-4 py-3">
          <p className="text-sub">
            稼働率 ＝ <strong className="font-bold">利用があった日数 ÷ 営業日数 × 100</strong>。
            同じ日に複数の予定があっても 1 日と数え、部屋数は掛けません。
          </p>

          <div>
            <p className="text-note mb-1.5 text-muted-foreground">利用として数える予定の種別</p>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {BOOKING_TYPE_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="text-sub flex min-h-tap items-start gap-2 py-1.5 lg:min-h-[36px]"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={draft.counted_types.includes(o.value)}
                    disabled={!canManage || save.isPending}
                    onCheckedChange={(v) => toggleType(o.value, v === true)}
                  />
                  <span className="min-w-0">
                    <span className="block">{o.label}</span>
                    {TYPE_NOTE[o.value] && (
                      <span className="text-note block text-muted-foreground">{TYPE_NOTE[o.value]}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border-faint pt-3">
            <Switch
              id="util-saturday"
              checked={draft.count_saturday}
              disabled={!canManage || save.isPending}
              onCheckedChange={(v) => setDraft((d) => d && ({ ...d, count_saturday: !!v }))}
            />
            <label htmlFor="util-saturday" className="text-sub min-w-0 flex-1">
              土曜を営業日に数える
              <span className="text-note block text-muted-foreground">日曜・祝日はいつも除きます</span>
            </label>
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-faint pt-3">
              <Button type="button" disabled={!dirty || save.isPending} onClick={submit}>
                {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                保存する
              </Button>
              {dirty && <span className="text-note text-muted-foreground">保存していない直しがあります</span>}
            </div>
          ) : (
            <p className="text-note flex items-center gap-2 border-t border-border-faint pt-3 text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              変えられるのは<strong className="font-bold">案件管理の管理者</strong>だけです。中身は見られます。
            </p>
          )}
        </div>
      )}

      <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
        変えると<strong className="font-bold">過去の月の稼働率も同じ決まりで数え直します</strong>
        （週報の確定で凍結した版はそのままです）。
      </p>
    </div>
  );
}
