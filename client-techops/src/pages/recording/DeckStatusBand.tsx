/**
 * 状態の帯（モック Main.dc.html:227-232）。
 *
 * ⚠️ **以前どうなっていたか**（監査 2026-08-22）
 * 帯は「使用中 N/12 台」と「未入力 N 台」の2つしか出しておらず、
 * モックの **準備完了 / 一部だけ / 未入力 / ネットワーク収録** とは別物だった。
 * 「一部だけ」が見えないのがいちばん困る — 4欄のうち3欄だけ入った台は
 * 「使用中」に数えられ、**書き出すまで穴に気づけなかった**。
 * 数え方は `countDecks()`（サーバーの preflight と同じ判定）に寄せている。
 */
import { countDecks } from '@/lib/deviceSettingsShared';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import type { Deck } from '@/lib/deviceSettingsApi';

export default function DeckStatusBand({
  decks,
  lastExportName,
  lastExportedAt,
}: {
  decks: Deck[];
  lastExportName: string | null;
  lastExportedAt: string | null;
}) {
  const c = countDecks(decks);
  const items: { label: string; value: number; dot: string; fg: string }[] = [
    { label: '準備完了', value: c.ready, dot: 'bg-success', fg: 'text-success' },
    { label: '一部だけ', value: c.partial, dot: 'bg-warning', fg: 'text-warning' },
    { label: '未入力', value: c.blank, dot: 'bg-border', fg: 'text-muted-foreground' },
    { label: 'ネットワーク収録', value: c.network, dot: 'bg-info', fg: 'text-info' },
  ];
  // 「使わない」は 0 台のことが多いので、あるときだけ出す（無い列を見せても読み手の負担になる）
  if (c.skip > 0) items.push({ label: '使わない', value: c.skip, dot: 'bg-muted-foreground', fg: 'text-muted-foreground' });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-border bg-card px-4 py-3">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-2 whitespace-nowrap">
          <span className={`h-2 w-2 shrink-0 rounded-full ${it.dot}`} aria-hidden="true" />
          <span className="text-sub-sm text-muted-foreground">{it.label}</span>
          <span className={`text-list tabular-nums ${it.fg}`}>{it.value}台</span>
        </span>
      ))}
      <span className="hidden flex-1 sm:block" />
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-sub-sm text-muted-foreground">最後に書き出したファイル</span>
        <span className="truncate text-sub-sm font-bold text-foreground">
          {lastExportName ? `${lastExportName}（${formatRelativeTime(lastExportedAt)}）` : 'まだありません'}
        </span>
      </span>
    </div>
  );
}
