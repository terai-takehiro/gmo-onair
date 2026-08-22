/**
 * 収録設定の表（PC）の桁を決める1か所。
 *
 * ⚠️ **なぜ定数にしたか**（監査 2026-08-22）
 * 以前は素の `<table>` で、`<thead>` が7列なのに控えの `<tbody>` だけ
 * 行末に「HD Plus」の `<td>` を足していて**8列**あった。列数が違うので
 * ブラウザが幅を勝手に配り直し、**本線と控えで桁が揃わない**表になっていた。
 * 見出しと行が**同じ `gridTemplateColumns` を読む**形にすれば、
 * 列を足し引きしてもずれようがない。
 */

/** 選択 / デッキ・呼び名 / 解像度 / コーデック / 音声ch / 収録先 / ファイル名 / 使わない */
export const DECK_GRID_COLS = '20px 150px 160px 132px 78px 126px minmax(120px,1fr) 96px';

/** 表全体の最小幅。これより狭いときは囲みの中だけ横スクロールする（本文は動かさない） */
export const DECK_GRID_MIN_W = 'min-w-[1010px]';

/** セル（入力欄）の見た目。未入力は**橙**（赤にしない ＝ 空欄は不正ではなく「現地の値を変えない」） */
export const cellBase =
  'h-9 w-full min-w-0 rounded-control border px-2 text-sub tabular-nums ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const cellFilled = 'border-input bg-background text-foreground';
export const cellEmpty =
  'border-warning-border bg-warning-surface font-bold text-warning placeholder:text-warning';

export const cellCls = (empty: boolean) => `${cellBase} ${empty ? cellEmpty : cellFilled}`;
