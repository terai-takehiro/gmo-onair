// 収録設定: デッキ1台ぶんの行（PC の表）。見出しと同じ `DECK_GRID_COLS` を読む。
// ⚠️ この画面は useState のローカル状態（updateData / applyDataUpdate を通らない）ので、
// 素の <input> で構わない（impl doc §5-2）。ただし将来 updateData 経由に変えたら
// その瞬間に BufferedInput が必須になる（素のままだと IME 変換中の文字が二重に入る）。
import { Copy } from 'lucide-react';
import { audioChannelOptions, isHdPlus } from './deckOptions';
import { DECK_GRID_COLS, cellCls } from './deckGrid';
import { listIdOf } from './DeckDatalists';
import type { Deck } from '@/lib/deviceSettingsApi';

export default function DeckRow({
  deck,
  onChange,
  selected,
  onToggleSelect,
  onCopyFromMain,
  mainDeckId,
}: {
  deck: Deck;
  onChange: (next: Deck) => void;
  selected: boolean;
  onToggleSelect: () => void;
  /** 控え(-P)行だけ: 対応する本線の設定を写す */
  onCopyFromMain?: () => void;
  mainDeckId?: string;
}) {
  const set = <K extends keyof Deck>(key: K, value: Deck[K]) => onChange({ ...deck, [key]: value });
  const hdPlus = isHdPlus(deck.deckId);

  // ⚠️ いま入っている値が候補に無くても**必ず出す**。以前は候補外の値を持つ
  //    controlled <select> が「空欄」に見えるのに保存値には残っていた。
  const chOptions = audioChannelOptions(deck.deckId);
  const chAll = deck.audioChannels != null && !chOptions.includes(deck.audioChannels)
    ? [...chOptions, deck.audioChannels].sort((a, b) => a - b)
    : chOptions;

  return (
    <div
      className={`grid items-center gap-2 border-b border-border px-4 py-1.5 hover:bg-muted/40 ${deck.skip ? 'opacity-50' : ''}`}
      style={{ gridTemplateColumns: DECK_GRID_COLS }}
    >
      {/* まとめて変えるための選択。行末の「使わない」とは**別のもの**なので、
          四角い塗りつぶし（選択）と文字つきのチェック（使わない）で見た目を変える */}
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer accent-primary"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`${deck.deckId} をまとめて変える対象に選ぶ`}
      />

      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <span className="text-sub font-bold tabular-nums">{deck.deckId}</span>
          {onCopyFromMain && (
            <button
              type="button"
              onClick={onCopyFromMain}
              title={`${mainDeckId} の設定を複製（機種が持たない値は落とします）`}
              aria-label={`${mainDeckId} の設定を ${deck.deckId} に複製`}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* 呼び名。⚠️ 型にも Excel の設計にもある欄なのに画面が持っておらず、
            唯一 label に触るコードが「複製するときに消す」だけだった */}
        <input
          className="h-7 w-full min-w-0 rounded-control border border-input bg-background px-1.5 text-sub-sm"
          value={deck.label ?? ''}
          onChange={(e) => set('label', e.target.value || undefined)}
          placeholder="表示名（任意）"
          aria-label={`${deck.deckId} の表示名`}
        />
      </div>

      {/* 解像度・コーデック・収録先は datalist。候補は出すが自由入力も許す
          （弾くのは現地の仕事・deckOptions.ts 冒頭） */}
      <input
        className={cellCls(!deck.videoFormat)}
        list={listIdOf('videoFormat', hdPlus)}
        value={deck.videoFormat ?? ''}
        onChange={(e) => set('videoFormat', e.target.value || undefined)}
        placeholder="未入力"
        aria-label={`${deck.deckId} の解像度`}
      />
      <input
        className={cellCls(!deck.codec)}
        list={listIdOf('codec', hdPlus)}
        value={deck.codec ?? ''}
        onChange={(e) => set('codec', e.target.value || undefined)}
        placeholder="未入力"
        aria-label={`${deck.deckId} のコーデック`}
      />
      <select
        className={cellCls(deck.audioChannels == null)}
        value={deck.audioChannels ?? ''}
        onChange={(e) => set('audioChannels', e.target.value ? Number(e.target.value) : undefined)}
        aria-label={`${deck.deckId} の音声ch`}
      >
        <option value="">未入力</option>
        {chAll.map((v) => <option key={v} value={v}>{v}ch</option>)}
      </select>
      <input
        className={cellCls(!deck.slot)}
        list={listIdOf('slot', hdPlus)}
        value={deck.slot ?? ''}
        onChange={(e) => set('slot', e.target.value || undefined)}
        placeholder="未入力"
        aria-label={`${deck.deckId} の収録先`}
      />
      <input
        className={cellCls(!deck.filePrefix)}
        value={deck.filePrefix ?? ''}
        onChange={(e) => set('filePrefix', e.target.value || undefined)}
        placeholder="未入力"
        aria-label={`${deck.deckId} のファイル名`}
      />

      <label className="flex items-center justify-end gap-1.5 text-sub-sm text-muted-foreground">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={!!deck.skip}
          onChange={(e) => set('skip', e.target.checked || undefined)}
        />
        使わない
      </label>
    </div>
  );
}
