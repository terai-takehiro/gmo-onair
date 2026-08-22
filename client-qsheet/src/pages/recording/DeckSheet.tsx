// 収録設定: スマホ用の下から出るシート（1台ずつ直す）。
// ⚠️ 素の <input> で構わない（DeckRow.tsx と同じ理由。impl doc §5-2）。
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { audioChannelOptions, isHdPlus } from './deckOptions';
import { listIdOf } from './DeckDatalists';
import type { Deck } from '@/lib/deviceSettingsApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const fieldCls =
  'h-11 w-full rounded-control-lg border border-input bg-background px-3 text-sub ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
// 未入力は橙（赤にしない ＝ 空欄は不正ではなく「現地の値を変えない」の意味）
const emptyCls = 'border-warning-border bg-warning-surface font-bold text-warning placeholder:text-warning';
const cls = (empty: boolean) => `${fieldCls} ${empty ? emptyCls : ''}`;

export default function DeckSheet({
  deck,
  onChange,
  onClose,
  readOnly = false,
}: {
  deck: Deck | null;
  onChange: (next: Deck) => void;
  onClose: () => void;
  /** 閲覧だけの人。中身は見せるが直せない（RecordingPage.tsx の理由を参照） */
  readOnly?: boolean;
}) {
  return (
    <Dialog open={!!deck} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="dialog-bottom-sheet max-h-[90vh] overflow-y-auto p-4" aria-describedby={undefined}>
        {deck && (
          <>
            <DialogHeader>
              <DialogTitle>
                <span className="tabular-nums">{deck.deckId}</span>
                {deck.label && <span className="ml-2 text-sub font-normal text-muted-foreground">{deck.label}</span>}
              </DialogTitle>
            </DialogHeader>
            {/* ⚠️ シートは portal で本文の外に出るので、呼び出し側の <fieldset disabled> が
                届かない。ここで自前に包む（`contents` なので見た目は変わらない） */}
            <fieldset disabled={readOnly} className="contents">
              <DeckSheetBody deck={deck} onChange={onChange} />
            </fieldset>
            {readOnly && (
              <p className="mt-3 rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-note text-foreground">
                閲覧のみの権限です。直すには編集権限が要ります。
              </p>
            )}
            <Button className="mt-6 h-[52px] w-full text-base" onClick={onClose}>
              閉じる
            </Button>
            {/* PC には一括変更があるので、この案内はそのまま残す（モック Mobile.dc.html:131） */}
            <p className="mt-2 text-center text-sub-sm text-muted-foreground">まとめて変えるのは PC で。</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeckSheetBody({ deck, onChange }: { deck: Deck; onChange: (next: Deck) => void }) {
  const set = <K extends keyof Deck>(key: K, value: Deck[K]) => onChange({ ...deck, [key]: value });
  const hdPlus = isHdPlus(deck.deckId);

  // ⚠️ いま入っている値が候補に無くても必ず出す（候補外の値が「空欄」に見える不具合の再発防止）
  const chOptions = audioChannelOptions(deck.deckId);
  const chAll = deck.audioChannels != null && !chOptions.includes(deck.audioChannels)
    ? [...chOptions, deck.audioChannels].sort((a, b) => a - b)
    : chOptions;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="deck-label">呼び名</Label>
        <input
          id="deck-label"
          className={fieldCls}
          value={deck.label ?? ''}
          onChange={(e) => set('label', e.target.value || undefined)}
          placeholder="本線 PGM"
        />
      </div>
      <div>
        <Label htmlFor="deck-format">解像度</Label>
        <input
          id="deck-format"
          className={cls(!deck.videoFormat)}
          list={listIdOf('videoFormat', hdPlus)}
          value={deck.videoFormat ?? ''}
          onChange={(e) => set('videoFormat', e.target.value || undefined)}
          placeholder="未入力（現地の値を変えない）"
        />
      </div>
      <div>
        <Label htmlFor="deck-codec">コーデック</Label>
        <input
          id="deck-codec"
          className={cls(!deck.codec)}
          list={listIdOf('codec', hdPlus)}
          value={deck.codec ?? ''}
          onChange={(e) => set('codec', e.target.value || undefined)}
          placeholder="未入力（現地の値を変えない）"
        />
      </div>
      <div>
        <Label htmlFor="deck-ch">音声ch</Label>
        <select
          id="deck-ch"
          className={cls(deck.audioChannels == null)}
          value={deck.audioChannels ?? ''}
          onChange={(e) => set('audioChannels', e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">未入力（現地の値を変えない）</option>
          {chAll.map((v) => <option key={v} value={v}>{v}ch</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="deck-slot">収録先</Label>
        <input
          id="deck-slot"
          className={cls(!deck.slot)}
          list={listIdOf('slot', hdPlus)}
          value={deck.slot ?? ''}
          onChange={(e) => set('slot', e.target.value || undefined)}
          placeholder="未入力（現地の値を変えない）"
        />
      </div>
      <div>
        <Label htmlFor="deck-prefix">ファイル名</Label>
        <input
          id="deck-prefix"
          className={cls(!deck.filePrefix)}
          value={deck.filePrefix ?? ''}
          onChange={(e) => set('filePrefix', e.target.value || undefined)}
          placeholder="GLS002-003_PGM"
        />
      </div>
      <label className="flex min-h-tap items-center gap-2 text-sub">
        <input type="checkbox" className="h-5 w-5" checked={!!deck.skip} onChange={(e) => set('skip', e.target.checked || undefined)} />
        使わないと決めた台（Excel には出しません）
      </label>
    </div>
  );
}
