/**
 * スマホの一覧（モック Mobile.dc.html:119-128）。タップで下シートが開く。
 *
 * ⚠️ **以前どうなっていたか**（監査 2026-08-22）
 * ・**呼び名も状態も出ていなかった**ので、「REC5」だけ見ても何の台か・
 *   埋まっているのかが分からず、12台を1枚ずつ開いて確かめるしかなかった。
 * ・幅に入りきらない文字を `transform: scaleX(0.94)` で潰していた（長体つぶし）。
 *   フォントが崩れるので、省略記号（truncate）に変えた。
 */
import { ChevronRight } from 'lucide-react';
import { deckState } from '@/lib/deviceSettingsShared';
import type { Deck } from '@/lib/deviceSettingsApi';

const BADGE = {
  ready: { label: '準備完了', cls: 'bg-success-surface text-success' },
  partial: { label: '一部だけ', cls: 'bg-warning-surface text-warning' },
  blank: { label: '未入力', cls: 'bg-muted text-muted-foreground' },
  skip: { label: '使わない', cls: 'bg-muted text-muted-foreground' },
} as const;

export default function DeckMobileList({ decks, onPick }: { decks: Deck[]; onPick: (d: Deck) => void }) {
  return (
    <div className="space-y-2 sm:hidden">
      {decks.map((d) => {
        const st = deckState(d);
        const badge = BADGE[st];
        const parts = [d.videoFormat, d.codec, d.audioChannels != null ? `${d.audioChannels}ch` : '', d.slot].filter(Boolean);
        return (
          <button
            key={d.deckId}
            type="button"
            onClick={() => onPick(d)}
            className={`flex min-h-tap w-full items-center gap-3 rounded-card border border-border bg-card px-3 py-2.5 text-left ${d.skip ? 'opacity-60' : ''}`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="shrink-0 text-list tabular-nums">{d.deckId}</span>
                <span className="truncate text-sub text-muted-foreground">{d.label ?? '表示名なし'}</span>
              </span>
              <span className={`truncate text-sub-sm ${parts.length ? 'text-muted-foreground' : 'text-warning'}`}>
                {parts.length ? parts.join('・') : 'まだ何も決めていません'}
              </span>
            </span>
            <span className={`shrink-0 rounded-control px-2 py-1 text-badge ${badge.cls}`}>{badge.label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
