/**
 * 解像度・コーデック・収録先の候補（`<datalist>`）を画面に1組だけ置く。
 *
 * ⚠️ **なぜ `<select>` をやめたか**（監査 2026-08-22）
 * 候補は「よく使うもの」であって唯一の正ではない（本当の正は機器の capabilities）。
 * `<select>` だと **候補に無い値は打てず、しかも入っていても表示されない**。
 * `<input list>` なら候補から選べて、現場が使う見慣れない値も打てる。
 *
 * 機種で候補が違うので、本線（4K Pro）と控え（HD Plus）の2組を出す。
 * PC の表とスマホの下シートが同じ id を参照する（だから画面の根に置く）。
 */
import { videoFormatOptions, codecOptions, slotOptions, type DeckFieldKey } from './deckOptions';

type ListKey = Extract<DeckFieldKey, 'videoFormat' | 'codec' | 'slot'>;

export function listIdOf(key: ListKey, hdPlus: boolean): string {
  return `rec-${key}-${hdPlus ? 'hdplus' : 'pro'}`;
}

/** 代表のデッキ id。候補は機種ごとに決まるので、どれか1台を渡せばよい */
const SAMPLE = { pro: 'REC1', hdplus: 'REC1-P' };

export default function DeckDatalists() {
  return (
    <>
      {(['pro', 'hdplus'] as const).map((model) => {
        const id = SAMPLE[model];
        const hdPlus = model === 'hdplus';
        return (
          <div key={model} hidden>
            <datalist id={listIdOf('videoFormat', hdPlus)}>
              {videoFormatOptions(id).map((v) => <option key={v} value={v} />)}
            </datalist>
            <datalist id={listIdOf('codec', hdPlus)}>
              {codecOptions(id).map((v) => <option key={v} value={v} />)}
            </datalist>
            <datalist id={listIdOf('slot', hdPlus)}>
              {slotOptions(id).map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
        );
      })}
    </>
  );
}
