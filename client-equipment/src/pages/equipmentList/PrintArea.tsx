/**
 * ② 機材台帳 ／ 機材 — 印刷まわり（設定のダイアログ ＋ 紙に出る表）
 *
 * `ItemsPanel.tsx` から切り出したものです。**刷るときの中身は変えていません。**
 *
 * ── なぜ「刷るときだけ」組み立てるか（速さ）────────────────────
 *
 * 紙に出る表（`PrintTable`）は `#eq-print-area-wrapper` の中にあり、
 * `index.css` の `@media screen` が `display: none` にしています。
 * つまり**画面には1ピクセルも出ていない**のに、全件ぶんの行が DOM に作られ、
 * 台帳で何か押すたびに React が描き直していました。
 * 実測（機材 5,000 点）で **`<td>` が 34,200 個**あり、
 * 台帳全体の要素 260,177 個のうち大きな塊を占めていました。
 *
 * ── 刷る道は2つある。**両方を塞がないこと** ────────────────
 *
 *   ① 画面の「印刷」ボタン → 設定のダイアログ → 刷る
 *   ② ブラウザ自身の印刷（Ctrl+P・メニュー・プレビュー）
 *
 * ⚠️ **② を落とすと Ctrl+P で白紙が出ます。** ブラウザは `beforeprint` を
 * **同期で**投げるので、`flushSync` でその場で組み立てないと間に合いません
 * （`setState` だけだと、刷り終わってから表ができます）。
 * Safari は `beforeprint` を投げないことがあるので `matchMedia('print')` も見ます。
 *
 * **一度立てたら下ろしません。** 刷り終わりの合図（`afterprint`）は
 * 取りこぼすことがあり、**2回目の Ctrl+P が空になる**ほうが害が大きいためです。
 */
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { PrintDialog, type PrintSettings } from './PrintDialog';
import { PrintTable } from './PrintTable';
import type { EquipmentRecord } from './types';

const DEFAULT_PRINT: PrintSettings = {
  title: '機材一覧',
  cols: new Set(['eq_code', 'equipment_type', 'name', 'manufacturer_name', 'model_number', 'unit_number', 'location', 'notes']),
  checkbox: true,
};

export function PrintArea({ items, filterLabel, open, onClose }: {
  items: EquipmentRecord[];
  /** 効いている絞り込みの説明。紙の上部に出す */
  filterLabel: string;
  /** 設定のダイアログを開いているか */
  open: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT);
  /** 紙に出る表を組み立ててよいか */
  const [ready, setReady] = useState(false);

  // ① 画面の「印刷」ボタンから来た道
  useEffect(() => { if (open) setReady(true); }, [open]);

  // ② ブラウザ自身の印刷から来た道（同期で組み立てないと間に合わない）
  useEffect(() => {
    if (ready) return;
    const arm = () => flushSync(() => setReady(true));
    const mq = window.matchMedia('print');
    const onMedia = (e: MediaQueryListEvent) => { if (e.matches) arm(); };
    window.addEventListener('beforeprint', arm);
    mq.addEventListener('change', onMedia);
    return () => {
      window.removeEventListener('beforeprint', arm);
      mq.removeEventListener('change', onMedia);
    };
  }, [ready]);

  const doPrint = () => {
    onClose();
    // 描き終わってから印刷を呼ぶ (すぐ呼ぶと出す列の変更が反映されない)
    setTimeout(() => window.print(), 150);
  };

  return (
    <>
      <PrintDialog
        open={open}
        count={items.length}
        value={settings}
        onChange={setSettings}
        onClose={onClose}
        onPrint={doPrint}
      />

      {/*
        入れ物は**常に置く**（`index.css` の `@media print` がこの id を見て、
        画面の中身を隠して代わりにこれを出す）。中身だけ刷るときに組み立てる。
      */}
      <div id="eq-print-area-wrapper">
        {ready && (
          <PrintTable
            items={items}
            printCols={settings.cols}
            printCheckbox={settings.checkbox}
            printTitle={settings.title}
            filterLabel={filterLabel}
          />
        )}
      </div>
    </>
  );
}
