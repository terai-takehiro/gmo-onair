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
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2, Pencil, Trash2 } from 'lucide-react';
import { colDef, type LedgerColKey, type LedgerRow } from './types';
import { LedgerCell } from './LedgerCells';
import { sortMark, type SortState } from './display';
import { inRange, isEditable, type EditableCol, type NamedRow } from './editable';
import { CellEditor } from './CellEditor';
import { cellText } from './ledgerCsv';
import type { LedgerGrid } from './useLedgerGrid';

/** チェックの列・操作の列。**`SLOT_WIDTHS` の段**（この画面だけの幅を作らない） */
const PICK_W = 56;
/** 鉛筆1つぶんの幅（56）＋ 削除アイコンぶん（32＋間4）。**両方出ても行ごとに幅が変わらない**ように、出ない人にも同じ枠を空けておく */
const ACT_W = 92;

export function LedgerTable({
  rows, shown, selected, onToggle, onToggleAll, canEdit, canEditOne, canDelete,
  onDeleteRow, deletingId, sort, onSort, grid, users, customers,
}: {
  rows: LedgerRow[];
  shown: LedgerColKey[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  /** 編集モードのときだけ true（チェックを出す・その場で直せる） */
  canEdit: boolean;
  /**
   * **1件ずつ「直す」画面へ行けるか**（`sales: editor` 以上）。
   * ⚠️ `canEdit`（まとめて直す・升目を書き換える＝ manager ＋ 編集モード）とは別。
   * 一緒にすると、編集モードに入っていない manager から鉛筆が消えます。
   */
  canEditOne: boolean;
  /**
   * **この行を削除できるか**（`sales: manager` 以上）。
   * `canEdit`（編集モード）とは別 — 「直す」画面の削除ボタンと同じく、
   * 押すたびに確認ダイアログを挟むので**升目の一括書き換えとは危うさの質が違う**。
   * 編集モードに入っていない manager からも消せてよい。
   */
  canDelete: boolean;
  /** 押されたときに呼ばれる。確認ダイアログと送信は呼ぶ側（`ProjectLedgerPage`）が持つ */
  onDeleteRow: (row: { id: string; name: string }) => void;
  /** いま削除中の行の id（その行のボタンだけ回す・二度押しを防ぐ） */
  deletingId: string | null;
  sort: SortState;
  onSort: (key: string) => void;
  grid: LedgerGrid;
  users: NamedRow[];
  customers: NamedRow[];
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
    /*
      **キー操作はこの箱が受ける。** `document` に付けると、別の画面の入力欄で
      Ctrl+C を押しただけで表のコピーが走ります。`tabIndex` が要るのは、
      箱が焦点を持てないとキーが届かないため。
    */
    <div
      tabIndex={-1}
      onKeyDown={(e) => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); void grid.copy(); }
        if (e.key === 'Escape') grid.clear();
      }}
      onPaste={(e) => {
        // **編集モードでないときは貼り付けを受けない**（閲覧は読むだけ）
        if (!canEdit || !grid.anchor) return;
        e.preventDefault();
        grid.planPaste(e.clipboardData.getData('text/plain'));
      }}
      className="rounded-card overflow-x-auto border border-border bg-card focus:outline-none"
    >
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
          {rows.map((row, ri) => (
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
              {shown.map((key, ci) => {
                const c = colDef(key);
                // 貼り付ける列の地の色は**行の状態と同じもの**にする
                // （選んだ行だけ名前の欄が白く抜けると、選択が読み取れない）
                const st = stickyOf(key, selected.has(row.id) ? 'bg-primary-surface-weak' : 'bg-card');
                const on = inRange(grid.range, ri, ci);
                const isAnchor = grid.anchor?.row === ri && grid.anchor?.col === ci;
                const nowEditing = canEdit && grid.editing?.row === ri && grid.editing?.col === ci;
                const canCell = canEdit && isEditable(key);
                return (
                  <td
                    key={key}
                    style={st.style}
                    /*
                      ⚠️ **直している最中の升目では選び直さない。** `pick` は
                      いちばん先に `setEditing(null)` をするので、開いている入力欄を
                      押した瞬間に**入力欄ごと消えます**（押し下げは升目まで上がってくる）。
                      プルダウンは「押し下げ → 一覧が開く」の順に動くので、
                      押し下げの時点で消えると**一覧は一度も開けません**
                      （選ぶ・日付を出す・候補を出すの3つとも開けませんでした）。
                    */
                    onMouseDown={(e) => { if (!nowEditing) grid.pick(ri, ci, e.shiftKey); }}
                    /* **その場で直すのは二度押し**（表計算と同じ）。一度押しだと
                       範囲を選ぶだけのつもりで入力欄が開いてしまう */
                    onDoubleClick={() => { if (canCell) grid.setEditing({ row: ri, col: ci }); }}
                    className={`text-sub overflow-hidden px-3 py-2 ${c.numeric ? 'text-right' : ''} ${st.className} ${
                      on ? 'bg-primary-surface' : ''
                    } ${isAnchor ? 'outline outline-2 -outline-offset-2 outline-primary' : ''} ${
                      canCell ? 'cursor-cell' : ''
                    }`}
                  >
                    {nowEditing ? (
                      <CellEditor
                        col={key as EditableCol}
                        initial={cellText(key, row) ?? ''}
                        users={users}
                        customers={customers}
                        onCommit={(raw) => grid.commitCell(row, key as EditableCol, raw)}
                        onCancel={() => grid.setEditing(null)}
                      />
                    ) : (
                      /*
                        **中身は必ず1行に収める。** `td` に直接 `truncate` を書くと
                        表の作り方によっては効かないので、中の箱で切ります
                      */
                      <div className="truncate">
                        <LedgerCell col={key} row={row} />
                      </div>
                    )}
                  </td>
                );
              })}
              {/*
                **1件だけ直す道も残す。** まとめて直せない項目（金額など）は
                「直す」画面から。ここが無いと台帳から編集に辿り着けない。

                ⚠️ **直せる人にだけ出す**（レビューでの指摘 #127）。
                `/sales/projects/:id/edit` のルートは `sales` があれば通す（＝閲覧だけの人も
                開けてしまう）ので、前の版は **`sales: reader` の人にも全行に鉛筆が出て**
                いました。押すと**フォームが開いて中身も打てて、保存して初めて 403**です
                — 打ち込んだものは戻ってきません。**枠（`<td>`）は残します** —
                消すと列の幅が行ごとに変わります。
              */}
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  {canEditOne && (
                    <Link
                      to={`/sales/projects/${row.id}/edit`}
                      aria-label={`${row.name} を編集`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                  {/*
                    **削除も直す画面と同じ絞り方**（`sales: manager`）。押すたびに
                    呼ぶ側（`ProjectLedgerPage`）が確認ダイアログを挟む — ここでは
                    見た目と、押している最中の1行だけを回すことだけを持つ。
                  */}
                  {canDelete && (
                    <button
                      type="button"
                      aria-label={`${row.name} を削除`}
                      title="削除"
                      disabled={deletingId === row.id}
                      onClick={() => onDeleteRow({ id: row.id, name: row.name })}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:bg-destructive-surface hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                    >
                      {deletingId === row.id
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
