/**
 * **溜まっている失注・見送り案件の BOX フォルダをまとめて片づける帯**（migration 248）
 *
 * ユーザー報告「失注や見送りのなった案件について BOX に残り続けてしまう」
 * 「一括処理するボタンが欲しい／過去失注分をまとめて処分する」。
 *
 * これから失注にするものは自動で片づきますが、**すでに溜まっているぶんは
 * 誰かが一度動かさないと残ります**。migration は遡って片づけません
 * （本番の BOX で数百フォルダが人の知らないうちに一斉に動くため）。
 *
 * ── なぜ「1回のリクエストで全部」にしないか ────────────────────
 *
 * フォルダ1件につき BOX を**数回**叩きます（読む → 中身を数える → 動かす）。
 * 数百件を1リクエストでやると**必ずタイムアウトし、途中まで動いたのか
 * 1件も動いていないのかが誰にも分かりません**。
 * そこで**20件ずつ続けて呼び**、画面に進み具合を出します。
 * 途中で止められ、押し直せば続きから進みます（片づいたものは対象から外れる）。
 *
 * ── ⚠️ 終わり方を「残り0件」にしない ───────────────────────────
 *
 * 安全弁で見送った行（親が違う・名前が違う・中身を数え切れない）は、
 * **次に試せば片づくかもしれない**ので印を付けません。つまり残り件数に
 * 残りつづけます。「残り0件まで回す」と**同じ行を永久に叩き続けます**。
 * **1回も進まなかったら止める**のが正しい終わり方です。
 */
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderArchive, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/contexts/platform/AuthContext';

const KEY = ['projects', 'box-cleanup', 'lost'];
/**
 * 1回に触る件数の上限。
 *
 * ⚠️ **本番で 504 になった反省で小さくしてある。** フォルダ1件につき BOX を
 * 十数回叩くので、20 件だと 200〜300 回になり Nginx の 60 秒に当たった
 * （0 件のまま失敗し、押した人には何件進んだか分からなかった）。
 * サーバー側も**時間で区切る**ようにしてあるので、ここは「1往復が長くなりすぎない」
 * ための保険。小さくしても、押したら最後まで進むのは変わらない。
 */
const BATCH = 5;

interface RelinkResult { linked: number; complete: boolean; scanned: number }
/**
 * **触らなかった理由**。⚠️ これを出していなかったので、本番で押した人には
 * 「置き場所か名前か中身か」が分からず次の一手が決められなかった
 * （ユーザー報告「このように出て結局処理されない」）。
 */
interface SkipReason { code: string; label: string; count: number; sample?: string }
interface RunResult {
  processed: number; remaining: number; boxConfigured: boolean;
  relinked?: RelinkResult;
  /** サーバーが時間切れで切り上げたか（残りは続けて呼べば進む） */
  timedOut?: boolean;
  skipped?: SkipReason[];
}

export function BoxCleanupBand() {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  // ⚠️ **API と同じ権限で出す**（manager 以外に出すと「押せるのに 403」になる）
  const canRun = hasPermission('sales', 'manager');

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  /** 押した時点の総数。進み具合を「N / M 件」で出すために覚える */
  const [total, setTotal] = useState(0);
  const [stuck, setStuck] = useState(0);
  /** BOX を調べて結び付け直した結果。**何件見て何件つながったかを必ず出す** */
  const [relink, setRelink] = useState<RelinkResult | null>(null);
  /** 触らなかった理由（多い順）。**件数だけでなく理由まで出す** */
  const [skipped, setSkipped] = useState<SkipReason[]>([]);
  const stopRef = useRef(false);

  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get('/projects/box-cleanup/lost')).data.data as
      { remaining: number; unlinked: number; boxConfigured: boolean; skipped?: SkipReason[] },
    enabled: canRun,
  });

  const runAll = useMutation({
    mutationFn: async () => {
      stopRef.current = false;
      setDone(0);
      setStuck(0);
      setTotal(q.data?.remaining ?? 0);
      setRunning(true);
      let cleaned = 0;
      let last: RunResult | null = null;

      /*
       * **まず「BOX を調べて結び付け直す」だけを1往復。**
       * 古い失注案件は BOX の URL が空で、フォルダは BOX にあるのにアプリが
       * 知らないため片づけの対象に入っていない。
       *
       * ⚠️ **片づけと同じ往復にしないこと。** 本番で 504 になったときは
       * 「名寄せ＋20件の片づけ」を1リクエストでやっていた。
       */
      const head = (await api.post('/projects/box-cleanup/lost', { relink: true })).data.data as RunResult;
      const relinked = head.relinked;
      setTotal(head.remaining);
      qc.setQueryData(KEY, { remaining: head.remaining, unlinked: 0, boxConfigured: head.boxConfigured, skipped: head.skipped });
      last = head;

      while (!stopRef.current && (last?.remaining ?? 0) > 0) {
        const r = (await api.post('/projects/box-cleanup/lost', { limit: BATCH })).data.data as RunResult;
        last = r;
        cleaned += r.processed;
        setDone(cleaned);
        qc.setQueryData(KEY, { remaining: r.remaining, unlinked: 0, boxConfigured: r.boxConfigured, skipped: r.skipped });
        /*
         * **1件も進まなかったら止める**（残り0件を待つと永久に回る）。
         * ⚠️ ただし**時間切れで切り上げたときは続ける** — 「進まなかった」のでは
         * なく「途中で止めた」だけなので、ここで諦めると BOX が遅い日に
         * 1件も片づかないまま終わる。
         */
        if (r.processed === 0 && !r.timedOut) break;
      }
      return {
        cleaned, remaining: last?.remaining ?? 0, stopped: stopRef.current, relinked,
        skipped: last?.skipped ?? [],
      };
    },
    onSuccess: (r) => {
      setRunning(false);
      setStuck(r.remaining);
      setRelink(r.relinked ?? null);
      setSkipped(r.skipped ?? []);
      if (r.stopped) { notifySuccess(`${r.cleaned} 件まで片づけて止めました（残り ${r.remaining} 件）`); return; }
      if (r.cleaned === 0) {
        notifySuccess(
          r.relinked && r.relinked.linked === 0
            ? 'BOX を調べましたが、案件に結び付くフォルダが見つかりませんでした'
            : '片づけられるものがありませんでした（安全のため、確かめられなかったフォルダは触っていません）',
        );
        return;
      }
      notifySuccess(
        r.remaining > 0
          ? `${r.cleaned} 件を片づけました。残り ${r.remaining} 件は確かめられなかったので触っていません`
          : `${r.cleaned} 件をすべて片づけました`,
      );
    },
    onError: (err) => {
      setRunning(false);
      notifyApiError(`BOXフォルダを片づけられませんでした（${done} 件まで進みました）`, err);
    },
    /*
     * ⚠️ **終わったら件数を引き直す。** ループの中では「片づけ待ち（URL のある側）」しか
     * 更新していないので、**結び付かなかったぶん**が帯に残ったままになる。
     * 引き直せば、帯は本当に残っている数を言う（押した数と減った数が食い違わない）。
     */
    onSettled: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });

  const remaining = q.data?.remaining ?? 0;
  const unlinked = q.data?.unlinked ?? 0;
  /*
   * ⚠️ **URL が空の失注案件も数に入れる。** 古い案件は `box_url_*` が空で、
   * フォルダは BOX にあるのにアプリが知らない。ここを `remaining` だけで見ていたため、
   * **片づけ待ちが0件に見えて帯が出ませんでした**（ユーザー報告の正体）。
   */
  const candidates = remaining + unlinked;
  // 押す前は帯が持っている理由、押したあとはその回の理由
  const reasons = skipped.length > 0 ? skipped : (q.data?.skipped ?? []);
  if (!canRun || candidates === 0) return null;

  /*
   * ⚠️ **BOX に繋いでいないときは、押せる形で出さない。**
   * 押しても1件も減らないので、押した人には理由が分かりません
   * （この製品が「押せるのに403」で通った道と同じ）。
   */
  if (q.data?.boxConfigured === false) {
    return (
      <div className="rounded-card border border-border bg-surface-subtle px-3.5 py-3">
        <p className="text-sub flex flex-wrap items-center gap-2 font-bold">
          <FolderArchive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          失注・見送りの案件が {candidates} 件、BOX の現役の場所に残っている可能性があります
        </p>
        <p className="text-note mt-1 text-muted-foreground">
          いまは BOX につないでいないため片づけられません（設定の「外部サービス連携」で確認してください）。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface-subtle px-3.5 py-3">
      <p className="text-sub flex flex-wrap items-center gap-2 font-bold">
        <FolderArchive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        失注・見送りの案件が {candidates} 件、BOX の現役の場所に残っています
      </p>
      <p className="text-note mt-1 text-muted-foreground">
        中身が1つも無いものは削除し、見積書などが入っているものは「99_失注・見送り」へ移します。
        案件を失注から戻すと元に戻ります。
        {unlinked > 0 && (
          <>
            {' '}
            うち <b>{unlinked} 件</b>は BOX のフォルダが案件に結び付いていないので、
            まず BOX を調べて名前から結び付け直します。
          </>
        )}
      </p>

      {running ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sub inline-flex items-center gap-1.5 font-bold">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            片づけています… {done} / {total || candidates} 件
          </span>
          {/* **長い処理には必ず逃げ道を置く。** いま動いている20件ぶんが終わったら止まる */}
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
          onClick={() => runAll.mutate()}
          className="text-sub mt-2 inline-flex min-h-tap items-center gap-1.5 rounded-control border border-border bg-card px-3 font-bold hover:bg-muted lg:min-h-[36px]"
        >
          {candidates} 件をまとめて片づける
        </button>
      )}

      {/* **何件見て何件つながったかを必ず出す** — つながらなかったときに
          「BOX を調べたのか」が読めないと、押した人は次に何をすればよいか分からない */}
      {!running && relink && (
        <p className="text-note mt-1.5 text-muted-foreground">
          BOX のフォルダ {relink.scanned} 件を調べて {relink.linked} 件を案件に結び付けました
          {!relink.complete && '（親フォルダを最後まで見られていません。もう一度押すと続きを調べます）'}。
        </p>
      )}
      {/*
        ⚠️ **触らなかった理由を必ず数えて出す。**
        「置き場所や名前が想定と違うか中身を数え切れなかった」とだけ出していたため、
        本番で押した人は**何を直せば片づくのかが分からない**状態でした
        （ユーザー報告「このように出て結局処理されない」）。理由は最初から
        `box_cleanup_note` に書いてあり、出していなかっただけです。
      */}
      {!running && reasons.length > 0 && (
        <div className="text-note mt-1.5 text-muted-foreground">
          <p>触らなかった {reasons.reduce((n, r) => n + r.count, 0)} 件の内訳:</p>
          <ul className="mt-1 space-y-0.5">
            {reasons.map((r) => (
              <li key={`${r.code}:${r.label}`} className="flex gap-1.5">
                <span className="shrink-0 font-bold tabular-nums">{r.count} 件</span>
                <span className="min-w-0">
                  {r.label}
                  {r.sample && <span className="opacity-80">（例: {r.sample}）</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!running && reasons.length === 0 && stuck > 0 && (
        <p className="text-note mt-1.5 text-muted-foreground">
          残り {stuck} 件は、まだ試していないか中身を数え切れなかったため触っていません
          （案件を開くと BOX フォルダのリンクから確かめられます）。
        </p>
      )}
    </div>
  );
}
