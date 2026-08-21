// 収録設定: デッキ1台ぶんの行（PC の表）。
// ⚠️ この画面は useState のローカル状態（updateData / applyDataUpdate を通らない）ので、
// 素の <input> で構わない（impl doc §5-2）。ただし将来 updateData 経由に変えたら
// その瞬間に BufferedInput が必須になる（素のままだと IME 変換中の文字が二重に入る）。
import { videoFormatOptions, codecOptions, audioChannelOptions, slotOptions, isHdPlus } from './deckOptions';
import type { Deck } from '@/lib/deviceSettingsApi';

const cellCls =
  'h-8 w-full min-w-0 rounded-[9px] border border-input bg-background px-2 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const emptyCls = 'bg-orange-50 border-orange-200'; // #fff7ed / #fed7aa 相当。未入力=橙（赤にしない）

export default function DeckRow({
  deck,
  onChange,
  onCopyFromMain,
}: {
  deck: Deck;
  onChange: (next: Deck) => void;
  /** 控え(-P)行だけ: 対応する本線の設定を写す */
  onCopyFromMain?: () => void;
}) {
  const hdPlus = isHdPlus(deck.deckId);
  const set = <K extends keyof Deck>(key: K, value: Deck[K]) => onChange({ ...deck, [key]: value });

  return (
    <tr className={deck.skip ? 'opacity-50' : undefined}>
      <td className="whitespace-nowrap px-2 py-1.5 text-sm font-medium">
        {deck.deckId}
        {onCopyFromMain && (
          <button
            type="button"
            onClick={onCopyFromMain}
            className="ml-2 text-xs text-primary underline underline-offset-2"
          >
            本線から写す
          </button>
        )}
      </td>
      <td className="px-2 py-1.5">
        <select
          className={`${cellCls} ${!deck.videoFormat ? emptyCls : ''}`}
          value={deck.videoFormat ?? ''}
          onChange={(e) => set('videoFormat', e.target.value || undefined)}
        >
          <option value="">（現地の値を変えない）</option>
          {videoFormatOptions(deck.deckId).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          className={`${cellCls} ${!deck.codec ? emptyCls : ''}`}
          value={deck.codec ?? ''}
          onChange={(e) => set('codec', e.target.value || undefined)}
        >
          <option value="">（現地の値を変えない）</option>
          {codecOptions(deck.deckId).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          className={`${cellCls} ${deck.audioChannels == null ? emptyCls : ''}`}
          value={deck.audioChannels ?? ''}
          onChange={(e) => set('audioChannels', e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">—</option>
          {audioChannelOptions(deck.deckId).map((v) => (
            <option key={v} value={v}>{v}ch</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          className={`${cellCls} ${!deck.slot ? emptyCls : ''}`}
          value={deck.slot ?? ''}
          onChange={(e) => set('slot', e.target.value || undefined)}
        >
          <option value="">（現地の値を変えない）</option>
          {slotOptions(deck.deckId).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          className={`${cellCls} ${!deck.filePrefix ? emptyCls : ''}`}
          value={deck.filePrefix ?? ''}
          onChange={(e) => set('filePrefix', e.target.value || undefined)}
          placeholder="GLS002-003_PGM"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <label className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={!!deck.skip}
            onChange={(e) => set('skip', e.target.checked || undefined)}
          />
          使わない
        </label>
      </td>
      {hdPlus && <td className="px-1 py-1.5 text-[10px] text-muted-foreground">HD Plus</td>}
    </tr>
  );
}
