// 収録設定: スマホ用の下から出るシート（1台ずつ直す）。
// ⚠️ 素の <input> で構わない（DeckRow.tsx と同じ理由。impl doc §5-2）。
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { videoFormatOptions, codecOptions, audioChannelOptions, slotOptions } from './deckOptions';
import type { Deck } from '@/lib/deviceSettingsApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const fieldCls =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function DeckSheet({
  deck,
  onChange,
  onClose,
}: {
  deck: Deck | null;
  onChange: (next: Deck) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!deck} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog-bottom-sheet max-h-[90vh] overflow-y-auto p-4" aria-describedby={undefined}>
        {deck && (
          <>
            <DialogHeader>
              <DialogTitle>{deck.deckId}</DialogTitle>
            </DialogHeader>
            <DeckSheetBody deck={deck} onChange={onChange} />
            <Button className="mt-6 h-[52px] w-full text-base" onClick={onClose}>
              閉じる
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">まとめて変えるのは PC で。</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeckSheetBody({ deck, onChange }: { deck: Deck; onChange: (next: Deck) => void }) {
  const set = <K extends keyof Deck>(key: K, value: Deck[K]) => onChange({ ...deck, [key]: value });
  return (
    <div className="space-y-4">
      <div>
        <Label>解像度</Label>
        <select className={fieldCls} value={deck.videoFormat ?? ''} onChange={(e) => set('videoFormat', e.target.value || undefined)}>
          <option value="">（現地の値を変えない）</option>
          {videoFormatOptions(deck.deckId).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <Label>コーデック</Label>
        <select className={fieldCls} value={deck.codec ?? ''} onChange={(e) => set('codec', e.target.value || undefined)}>
          <option value="">（現地の値を変えない）</option>
          {codecOptions(deck.deckId).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <Label>音声ch</Label>
        <select className={fieldCls} value={deck.audioChannels ?? ''} onChange={(e) => set('audioChannels', e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">—</option>
          {audioChannelOptions(deck.deckId).map((v) => <option key={v} value={v}>{v}ch</option>)}
        </select>
      </div>
      <div>
        <Label>収録先</Label>
        <select className={fieldCls} value={deck.slot ?? ''} onChange={(e) => set('slot', e.target.value || undefined)}>
          <option value="">（現地の値を変えない）</option>
          {slotOptions(deck.deckId).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <Label>ファイル名</Label>
        <input className={fieldCls} value={deck.filePrefix ?? ''} onChange={(e) => set('filePrefix', e.target.value || undefined)} placeholder="GLS002-003_PGM" />
      </div>
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={!!deck.skip} onChange={(e) => set('skip', e.target.checked || undefined)} />
        使わないと決めた台（Excel には出しません）
      </label>
    </div>
  );
}
