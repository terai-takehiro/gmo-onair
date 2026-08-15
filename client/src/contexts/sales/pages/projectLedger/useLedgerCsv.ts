/**
 * 案件台帳の書き出し（CSV）— 引くところと、落とすところ
 *
 * **絞り込みに当たるものを全ページ引きます。** 画面に並んでいる行だけを
 * 書き出すと、**101 件目からが黙って落ちます**（1ページ 100 件がサーバーの上限）。
 * 落ちたことは書き出したファイルには出ないので、Excel で数えて
 * 「これで全部だ」と読まれます — 整合性を確かめるためのファイルでそれをやると、
 * 確認そのものが嘘になります。理由の続きは `ledgerCsv.ts` の冒頭。
 *
 * ⚠️ **新しい口は作りません。** 引くのは表と同じ `GET /projects` で、
 * ページを送るだけです。書き出し専用の口を作ると、**表と書き出しで違う数**が出て、
 * どちらが正しいのか誰にも分かりません（この画面が `GET /projects` を
 * そのまま使っているのと同じ理由）。
 */
import { useCallback, useState } from 'react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { LedgerColKey, LedgerResponse, LedgerRow } from './types';
import { buildLedgerCsv } from './ledgerCsv';
import { csvFileName, CSV_MAX_ROWS } from './csv';
import { PAGE_SIZE } from './useLedgerState';

/** その日の日付（ファイル名用）。時計を読むのはここ1か所だけ */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function useLedgerCsv() {
  const [busy, setBusy] = useState(false);

  const download = useCallback(async (
    params: Record<string, unknown>,
    shown: LedgerColKey[],
    /** 整合性チェックの鍵。ファイル名に入れる（**日本語は使えない** — `csv.ts`） */
    issueKey: string | null,
  ) => {
    setBusy(true);
    try {
      const rows: LedgerRow[] = [];
      let total = 0;
      let page = 1;
      /**
       * **上限に届くまでページを送る。** 1万件を一度に引くと画面が固まるので
       * 止めますが、**止めたことは必ず画面に出します**（下の帯）。
       */
      for (;;) {
        const res = await api.get('/projects', {
          params: { ...params, page, limit: PAGE_SIZE },
        });
        const body = res.data as LedgerResponse;
        total = body.pagination?.total ?? rows.length;
        rows.push(...(body.data ?? []));
        const more = rows.length < total && rows.length < CSV_MAX_ROWS
          && (body.data ?? []).length > 0;
        if (!more) break;
        page += 1;
      }

      const cut = rows.length < total;
      const csv = buildLedgerCsv(rows, shown);
      /**
       * ⚠️ **BOM を付ける。** 付けないと Excel が Shift_JIS として開き、
       * **日本語がすべて文字化けします**（開いた人には「壊れたファイル」に見える）。
       */
      const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = csvFileName(issueKey, today());
      // 画面に足してから押す（浮かせたままの `<a>` を押さない古い環境がある）
      document.body.appendChild(a);
      a.click();
      a.remove();
      /**
       * ⚠️ **すぐ捨てないこと。** 落とし始めるのは押したあとなので、
       * その場で `revokeObjectURL` すると**中身が空のファイル**になることがあります。
       */
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      notifySuccess(`${rows.length} 件を書き出しました`, {
        description: cut
          // **切ったことを必ず言う。** 言わないと「これで全部だ」と読まれる
          ? `絞り込みに当たるのは ${total} 件ですが、一度に書き出せるのは ${CSV_MAX_ROWS} 件までです。絞り込んでから出し直してください。`
          : `出したのは、いま画面に出している ${shown.length} 列だけです。`,
      });
    } catch (e) {
      notifyApiError('書き出せませんでした', e);
    } finally {
      setBusy(false);
    }
  }, []);

  return { download, busy };
}
