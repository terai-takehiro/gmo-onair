/**
 * 案件台帳の表（表頭 ＋ 本文）
 *
 * ── 表頭と本文を別々に書かない ──────────────────────────────
 *
 * どちらも **`shown`（出す列を出す順に並べたもの）を回して**作ります。
 * 2か所に列を並べると、列を1つ足したときに**片方だけ増えて全部の行がずれます**。
 *
 * ── ⚠️ `table-layout: fixed` にしている理由（実測で直した）──
 *
 * 前は既定（`auto`）で、**列に書いた幅はただの目安**でした。ブラウザが中身に
 * 合わせて広げるので、1440px の画面で表が **1376px** になり、
 * **いちばん右の列（最後の動き）が黙って画面の外**に出ていました
 * （囲みは横スクロールしますが、見えないので誰も動かしません）。
 *
 * `fixed` にすると**書いた幅がそのまま効き**、切り詰めも効きます。
 * そのために **`COL_DEFS` の全部の列が幅を持ちます**（伸びる列を作らない）。
 *
 * ── 横スクロールはここだけ ──────────────────────────────────
 *
 * 列は出し入れできるので幅は設定で変わります。**枠の外に漏らさない**ように
 * `overflow-x-auto` はこの部品が持ちます（ページ側に書くと、上のツールバーまで
 * 一緒に流れます）。**表頭は上に貼り付けます** — 100 行あるので、
 * 下のほうまで見ると何の列か分からなくなります。
 *
 * ── 選択は「見えている行だけ」 ───────────────────────────────
 *
 * 表頭のチェックは**いま出ている 100 行**を選びます。**絞り込み全体を選ばせません** —
 * 見ていない行までまとめて書き換えると、何を変えたのか誰も確かめられません。
 */
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil } from 'lucide-react';
import { colDef, type LedgerColKey, type LedgerRow } from './types';
import { LedgerCell } from './LedgerCells';
import { sortMark, type SortState } from './display';

/** チェックの列・操作の列。**`SLOT_WIDTHS` の段**（この画面だけの幅を作らない） */
const PICK_W = 56;
const ACT_W = 56;

export function LedgerTable({
  rows, shown, selected, onToggle, onToggleAll, canEdit, sort, onSort,
}: {
  rows: LedgerRow[];
  shown: LedgerColKey[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  /** 編集モードのときだけ true（チェックを出す） */
  canEdit: boolean;
  sort: SortState;
  onSort: (key: string) => void;
}) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));

  /**
   * ⚠️ **表の幅を自分で出して渡すこと**（実測で直した）。`table-layout: fixed`
   * でも**表の幅が `auto` のままだと、ブラウザは列の幅を比で割り振り直します** —
   * 128px と書いた GLS番号 が 89px になり、**書いた幅が1つも効いていませんでした**。
   * 合計を渡して初めて、`<colgroup>` の幅がそのまま出ます。
   */
  const totalW = (canEdit ? PICK_W : 0)
    + shown.reduce((a, k) => a + colDef(k).width, 0)
    + ACT_W;

  /**
   * **案件名の列は左に貼り付ける**（Excel のウィンドウ枠の固定と同じ）。
   * 20 列出すと表は 3 画面ぶんになり、右のほうを見ているときに
   * **どの案件の行を見ているのか分からなくなります**。
   * 貼り付ける位置は、その左にある列の幅の合計（出し入れと並べ替えで変わる）。
   */
  const nameAt = shown.indexOf('name' as LedgerColKey);
  const nameLeft = nameAt < 0 ? null
    : (canEdit ? PICK_W : 0) + shown.slice(0, nameAt).reduce((a, k) => a + colDef(k).width, 0);

  /** 貼り付ける列に当てるもの。**地の色が要る** — 無いと下の行が透けます */
  const stickyOf = (key: LedgerColKey, bg: string) => (
    key === 'name' && nameLeft !== null
      ? { className: `sticky z-[1] ${bg}`, style: { left: nameLeft } }
      : { className: '', style: undefined }
  );

  return (
    <div className="rounded-card overflow-x-auto border border-border bg-card">
      {/*
        ⚠️ **`min-w-max` を付けないこと。** 付けると表は必ず中身いっぱいまで
        広がり、`table-layout: fixed` の意味が無くなります。
        幅は下の `<colgroup>` と `totalW` が決めます。
      */}
      <table className="border-collapse" style={{ tableLayout: 'fixed', width: totalW }}>
        {/*
          **幅は `<colgroup>` で1回だけ決める。** `th` と `td` の両方に書くと、
          片方だけ直したときに表頭と本文がずれます。
        */}
        <colgroup>
          {canEdit && <col style={{ width: PICK_W }} />}
          {shown.map((key) => <col key={key} style={{ width: colDef(key).width }} />)}
          <col style={{ width: ACT_W }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-border bg-muted">
            {canEdit && (
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="この画面の行をすべて選ぶ"
                  checked={allOn}
                  onChange={onToggleAll}
                  className="h-[18px] w-[18px] align-middle"
                />
              </th>
            )}
            {shown.map((key) => {
              const c = colDef(key);
              const mark = sortMark(sort, c.sort ?? '');
              const st = stickyOf(key, 'bg-muted');
              return (
                <th
                  key={key}
                  aria-sort={mark === 'asc' ? 'ascending' : mark === 'desc' ? 'descending' : 'none'}
                  style={st.style}
                  className={`text-th px-3 py-2 font-bold text-muted-foreground ${c.numeric ? 'text-right' : 'text-left'} ${st.className}`}
                >
                  {/*
                    **並べ替えられない列は押せる形にしない。** ボタンに見えて
                    押しても何も起きないのがいちばん困ります
                    （サーバーが並べ替えられる列だけ `sort` を持っています）。
                  */}
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.sort as string)}
                      title={`${c.label}で並べ替える`}
                      className={`group -mx-1 flex w-full items-center gap-1 rounded-control px-1 py-0.5 hover:bg-border-faint ${
                        c.numeric ? 'justify-end' : ''
                      } ${mark ? 'text-primary' : ''}`}
                    >
                      <span className="truncate">{c.label}</span>
                      {/*
                        ⚠️ **並べ替えていないときの印は、指を乗せたときだけ出す**
                        （実測で直した）。常に出すと**表頭ごとに 16px 取られ**、
                        96px の列で「最後の動き」が「最後の…」に切れていました。
                        押せることは指を乗せれば分かります（`title` も出ます）。
                      */}
                      {mark === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                        : mark === 'desc' ? <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                          : (
                            <ChevronsUpDown
                              className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40"
                              aria-hidden="true"
                            />
                          )}
                    </button>
                  ) : (
                    <span className="block truncate">{c.label}</span>
                  )}
                </th>
              );
            })}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-row
              className={`border-b border-border-faint last:border-b-0 hover:bg-muted/40 ${
                selected.has(row.id) ? 'bg-primary-surface-weak' : ''
              }`}
            >
              {canEdit && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`${row.name} を選ぶ`}
                    checked={selected.has(row.id)}
                    onChange={() => onToggle(row.id)}
                    className="h-[18px] w-[18px] align-middle"
                  />
                </td>
              )}
              {shown.map((key) => {
                const c = colDef(key);
                // 貼り付ける列の地の色は**行の状態と同じもの**にする
                // （選んだ行だけ名前の欄が白く抜けると、選択が読み取れない）
                const st = stickyOf(key, selected.has(row.id) ? 'bg-primary-surface-weak' : 'bg-card');
                return (
                  <td
                    key={key}
                    style={st.style}
                    className={`text-sub overflow-hidden px-3 py-2 ${c.numeric ? 'text-right' : ''} ${st.className}`}
                  >
                    {/*
                      **中身は必ず1行に収める。** `td` に直接 `truncate` を書くと
                      表の作り方によっては効かないので、中の箱で切ります
                    */}
                    <div className="truncate">
                      <LedgerCell col={key} row={row} />
                    </div>
                  </td>
                );
              })}
              {/* **1件だけ直す道も残す。** まとめて直せない項目（金額など）は
                  「直す」画面から。ここが無いと台帳から編集に辿り着けない */}
              <td className="px-3 py-2">
                <Link
                  to={`/sales/projects/${row.id}/edit`}
                  aria-label={`${row.name} を直す`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
