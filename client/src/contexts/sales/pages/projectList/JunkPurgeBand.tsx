/**
 * **ゴミになった案件を案件台帳から外す帯**
 *
 * ユーザー依頼（2026-08-31）:
 * 「合わせて失注やネタ見送りなどゴミになった案件は案件台帳等からも抹消したい
 *   (DBから削除したい)」
 *
 * ご相談のうえ決めたこと:
 *   - **論理削除**（`projects.deleted_at`）— 台帳・検索・集計・グラフから完全に
 *     消えるが、行は残るので**間違えても戻せる**
 *   - 対象は **失注すべて ＋ 放置ネタ**（90日動いていないネタ）
 *   - **見積だけなら消す。売上・仕入が付いているものは残す**
 *
 * 物理削除にしなかった理由（法定保存・失注は機械も付ける取り消せる状態・
 * 失注分析の材料）はサーバー側 `project-purge.service.ts` の冒頭に書いてある。
 *
 * ── ⚠️ 出す数字の決めごと ──────────────────────────────────
 *
 * **消さなかったものの件数と理由を必ず出す。** 消えていないことに人は気づけない。
 * 「売上があるので残した N 件」「BOX のフォルダを片づけられなかった M 件」の
 * 2つは、押した人が次の一手を決めるために要る。
 */
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';

const KEY = ['projects', 'purge', 'junk'];
/**
 * 1往復で外す件数の上限。**外す直前に BOX を触る**ので、片づけの帯と同じく
 * 小さめにしてある（サーバー側も 20 秒で切る）。
 */
const BATCH = 10;

interface PurgeCount {
  total: number; lost: number; staleNeta: number; keptForMoney: number; staleDays: number;
  /** 一緒に落とす見込み売上の件数。**押す前に必ず見せる** */
  unbilledRevenues: number;
}
interface PurgeResult {
  processed: number; remaining: number; boxLeft: number; timedOut: boolean;
  revenuesDropped: number;
}

export function JunkPurgeBand() {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  // ⚠️ **API と同じ権限で出す**（manager 以外に出すと「押せるのに 403」になる）
  const canRun = hasPermission('sales', 'manager');

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [boxLeft, setBoxLeft] = useState(0);
  const stopRef = useRef(false);

  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get('/projects/purge/junk')).data.data as PurgeCount,
    enabled: canRun,
  });

  const runAll = useMutation({
    mutationFn: async () => {
      stopRef.current = false;
      setDone(0);
      setBoxLeft(0);
      setTotal(q.data?.total ?? 0);
      setRunning(true);
      let removed = 0;
      let strayFolders = 0;
      let droppedRevenues = 0;
      let last: PurgeResult | null = null;

      while (!stopRef.current && (last === null || last.remaining > 0)) {
        const r = (await api.post('/projects/purge/junk', { limit: BATCH })).data.data as PurgeResult;
        last = r;
        removed += r.processed;
        strayFolders += r.boxLeft;
        droppedRevenues += r.revenuesDropped;
        setDone(removed);
        setBoxLeft(strayFolders);
        /*
         * **1件も外せなかったら止める。** 時間切れ（`timedOut`）は「進まなかった」の
         * ではなく「途中で止めた」だけなので続ける — 片づけの帯と同じ決めごと
         * （混同すると、BOX が遅い日に1件も進まないまま終わる）。
         */
        if (r.processed === 0 && !r.timedOut) break;
      }
      return {
        removed, strayFolders, droppedRevenues,
        remaining: last?.remaining ?? 0, stopped: stopRef.current,
      };
    },
    onSuccess: (r) => {
      setRunning(false);
      if (r.removed === 0) { notifySuccess('台帳から外せるものがありませんでした'); return; }
      // **落としたお金の行は必ず言う。** 黙って消えるのが一番困る
      const money = r.droppedRevenues > 0 ? `見込み売上 ${r.droppedRevenues} 件も落としました。` : '';
      const tail = r.strayFolders > 0
        ? `（うち ${r.strayFolders} 件は BOX のフォルダを片づけられませんでした）` : '';
      notifySuccess(
        r.stopped
          ? `${r.removed} 件を台帳から外して止めました（残り ${r.remaining} 件）${tail}${money}`
          : `${r.removed} 件を台帳から外しました${tail}${money}`,
      );
    },
    onError: (err) => {
      setRunning(false);
      notifyApiError(`案件を台帳から外せませんでした（${done} 件まで進みました）`, err);
    },
    onSettled: () => {
      setRunning(false);
      // 案件一覧そのものも引き直す（外したのに一覧に残っていると信用できない）
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const d = q.data;
  if (!canRun || !d || d.total === 0) return null;

  return (
    <div className="rounded-card border border-border bg-surface-subtle px-3.5 py-3">
      <p className="text-sub flex flex-wrap items-center gap-2 font-bold">
        <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        案件台帳に、ゴミになった案件が {d.total} 件たまっています
      </p>
      <p className="text-note mt-1 text-muted-foreground">
        失注 {d.lost} 件と、{d.staleDays} 日動いていないネタ {d.staleNeta} 件です。
        台帳・検索・集計から消えますが、<b>行は残るので戻せます</b>（戻すにはシステム管理者の操作が要ります）。
        {/* ⚠️ **消さなかったものを必ず書く。** 消えていないことに人は気づけない */}
        {d.keptForMoney > 0 && (
          <>
            {' '}
            {/*
              ⚠️ **「売上」とだけ書くと、見込みの金額でも残ると誤解される。**
              ユーザー依頼「見積もりを入れているものも削除してほしい」を受けて、
              残すのは**請求書を出した売上**と**実際の仕入**だけにした。
            */}
            <b>請求書を出した売上</b>か<b>仕入</b>がある <b>{d.keptForMoney} 件</b>は残します
            （見積や、請求前の見込み売上だけなら消します）。
            {/*
              ⚠️ **仕入が付いた失注は「正しいお金」ではなく異常の合図。**
              ご指摘「失注になった案件で仕入れが発生することは理論上あり得ません。
              万が一そういった案件がある場合は何かしら処理が間違っている可能性が
              あるので削除しないでください」。外すと異常ごと画面から消える。
            */}
            <b>失注した案件に仕入が付いているのは、本来あり得ません</b> —
            見つかったら台帳から外さずに残すので、中身をご確認ください。
          </>
        )}
      </p>
      {/*
        ⚠️ **落とすお金の行は、押す前に必ず見せる。**
        案件だけでなく見込み売上も消えるので、押したあとで初めて分かるのは
        取り返しの付かない驚きになる（ご依頼「見込み売上を落とした上で削除したい」）。
      */}
      {d.unbilledRevenues > 0 && (
        <p className="text-note mt-1 text-muted-foreground">
          あわせて、これらの案件にぶら下がった<b>請求前の見込み売上 {d.unbilledRevenues} 件</b>も落とします
          （売上台帳と集計から消えます。こちらも戻せます）。
          費用を分け合うグループで他の案件にも配っている売上は、落としません。
        </p>
      )}

      {running ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sub inline-flex items-center gap-1.5 font-bold">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            台帳から外しています… {done} / {total || d.total} 件
          </span>
          {/* **長い処理には必ず逃げ道を置く** */}
          <button
            type="button"
            onClick={() => { stopRef.current = true; }}
            className="text-sub inline-flex min-h-tap items-center rounded-control border border-border bg-card px-3 font-bold hover:bg-muted lg:min-h-[36px]"
          >
            止める
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={async () => {
            if (!(await confirmAction({
              title: `${d.total} 件を案件台帳から外しますか？`,
              description:
                '台帳・検索・集計から消えます。行は残るので戻せますが、'
                + '戻すにはシステム管理者の操作が要ります。'
                + '請求書を出した売上か仕入がある案件は外しません'
                + '（見積や、請求前の見込み売上だけなら外します）。'
                + (d.unbilledRevenues > 0
                  ? `あわせて請求前の見込み売上 ${d.unbilledRevenues} 件も売上台帳から落とします。`
                  : ''),
              confirmLabel: '台帳から外す', tone: 'danger',
            }))) return;
            runAll.mutate();
          }}
          className="text-sub mt-2 inline-flex min-h-tap items-center gap-1.5 rounded-control border border-border bg-card px-3 font-bold hover:bg-muted lg:min-h-[36px]"
        >
          {d.total} 件を台帳から外す
        </button>
      )}

      {/* ⚠️ **BOX のフォルダを置き去りにしたら必ず書く。**
          台帳から外すと、その案件のフォルダは片づけの対象に選ばれなくなる */}
      {!running && boxLeft > 0 && (
        <p className="text-note mt-1.5 text-muted-foreground">
          外した案件のうち {boxLeft} 件は、BOX のフォルダを片づけられませんでした
          （現役の場所に残ります。上の帯の理由を見てください）。
        </p>
      )}
    </div>
  );
}
