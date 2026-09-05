/**
 * スマホの棚卸しで押した印を**端末に溜めて後で送る**ところ（⑨ 現場で）
 *
 * 画面（`MobileScanSession`）から切り出してあります。**送れたか／送れていないか**は
 * 画面の見た目ではなく列の状態で決まるので、混ぜると読み解けなくなります。
 *
 * ── ここで守っていること ────────────────────────────────────
 *
 * ・**押した瞬間に画面を進める**（送信を待たない）。待つと「押したのに変わらない」で
 *   何度も読むことになります
 * ・**終わった棚卸しには積まない**（レビューでの指摘 #61）。サーバーも断りますが、
 *   溜めてから断られると気づくのが遅れます
 * ・**断られたものは列から外す。** 残すと「まだ送れていません」が永久に消えず、
 *   現場がこの表示を信じなくなります。外したら**理由を画面に出す**
 */
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createQueue, flushQueue } from '@gmo-onair/shared/src/client-v4/offlineQueue';
import api from '@/lib/api';
import type { CheckItem } from './CheckDetail';

export interface CheckDetailData {
  id: string; title: string; check_date: string; status: string; items: CheckItem[];
}

export interface ScanMessage { tone: 'ok' | 'ng'; text: string }

/** 溜める中身。**送るのに要るものだけ**（画面の状態は入れない） */
interface MarkOp {
  checkId: string;
  itemId: string;
  found: number;
  actual_location: string | null;
  condition: string | null;
  note: string | null;
}

const queue = createQueue<MarkOp>('gmo_onair_inv_queue');

/** サーバーが返した日本語の理由（無ければ `undefined`）。技術用語は出さない */
function serverMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message;
}

export function useScanQueue(
  checkId: string,
  closed: boolean,
  onMessage: (m: ScanMessage) => void,
) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(() => queue.pending());

  /** 溜まっているものを送る。**失敗しても止めない**（列に残って次の機会に出る） */
  const flush = useCallback(async () => {
    if (queue.pending() === 0) return;
    const r = await flushQueue(
      queue,
      async (op) => {
        await api.put(`/equipment/inventory-checks/${op.checkId}/items/${op.itemId}`, {
          found: op.found,
          actual_location: op.actual_location,
          condition: op.condition,
          note: op.note,
        });
      },
      {
        /*
         * **断られたもの（4xx）は列から外す。**
         * ⚠️ 電波が無いときの失敗（レスポンスそのものが無い）は外さないこと。
         * 408 / 429 も待てば通るので残します。
         */
        drop: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          return typeof status === 'number' && status >= 400 && status < 500
            && status !== 408 && status !== 429;
        },
      },
    );
    setPending(queue.pending());
    if (r.dropped > 0) {
      onMessage({
        tone: 'ng',
        text: serverMessage(r.dropErrors[0]) ?? `送れなかった印が ${r.dropped} 件あります`,
      });
    }
    if (r.sent > 0) qc.invalidateQueries({ queryKey: ['inventory-check', checkId] });
  }, [qc, checkId, onMessage]);

  // 電波が戻ったら送る。**開いたときにも1回送る**（前回の現場ぶんが残っている）
  useEffect(() => {
    flush();
    const on = () => { flush(); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [flush]);

  /**
   * 確認を記録する。**端末に溜めてから画面を先に変える**。
   * 送信は待ちません（待つと「押したのに変わらない」ので何度も読むことになる）。
   */
  const mark = useCallback((item: CheckItem, found: number) => {
    if (closed) {
      onMessage({
        tone: 'ng',
        text: 'この棚卸しは終わっています。PC の棚卸し画面で「もう一度開く」を押してください',
      });
      return;
    }
    queue.push(`${checkId}:${item.id}`, {
      checkId, itemId: item.id, found,
      actual_location: item.actual_location, condition: item.condition, note: item.note,
    }, Date.now());
    setPending(queue.pending());
    // 画面の見た目を先に進める（送れたら問い合わせが上書きする）
    qc.setQueryData(['inventory-check', checkId], (old: CheckDetailData | undefined) =>
      old ? { ...old, items: old.items.map((i) => (i.id === item.id ? { ...i, found } : i)) } : old);
    flush();
  }, [checkId, qc, flush, closed, onMessage]);

  return { pending, flush, mark };
}
