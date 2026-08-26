/**
 * トップページの挨拶（「おはようございます、寺井さん」）
 *
 * ── 姓だけ（モック `v4-live`）──────────────────────────────
 *
 * フルネームは名刺の情報で、毎朝いちばん上に出す言葉ではありません。
 * 空白（半角・全角）で切った先頭を使い、**空白が無い人はそのまま**出します —
 * 適当な位置で切ると別人の名前になります。
 *
 * ── 数えられた件数だけを書く ──────────────────────────────
 *
 * `sales` も `dailyops` も無い人に「0件です」と書くと、
 * **見えていないだけなのに「無い」と言い切る**ことになります。その1行ごと出しません。
 */
import { CountUp } from './Reveal';

/**
 * 挨拶に出す名前。**姓だけ**。
 * `HomePage` からも使えるよう export してある（呼ぶ側で試せるように）。
 */
export function familyName(fullName?: string | null): string {
  const s = (fullName ?? '').trim();
  if (!s) return '';
  const head = s.split(/[\s　]+/)[0];
  return head || s;
}

/** 「最終更新 07/31 08:04」（モック）。**数字の出どころは取得の時刻** */
export function updatedAt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function Greeting({
  greeting, userName, mobile, canCount, waitingTotal, myOverdue, lastLoaded,
  onWaiting, onOverdue,
}: {
  greeting: string;
  userName?: string | null;
  mobile: boolean;
  /** 件数を数えられる権限があるか。無いときは件数の行ごと出さない */
  canCount: boolean;
  waitingTotal: number;
  myOverdue: number;
  /**
   * 数字を押したときの動き。**開けない人には渡さない**（`undefined`）で、
   * そのときは押せない字で出します。
   * ⚠️ ここで行き先を決め打ちにすると、`dailyops` だけの人は押した先が
   * 「権限がありません」になります（レビューでの指摘）。**行き先を知っているのは
   * 呼ぶ側**（`HomePage`）で、この部品は見た目だけを持ちます。
   */
  onWaiting?: () => void;
  onOverdue?: () => void;
  /** 数字を取ってきた時刻（0 = まだ取れていない） */
  lastLoaded: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {/* **スマホでは名前を出さない**（M7）。自分の端末なので誰かは分かっており、
            「おはようございます、○○ さん」は 390px で2行になって 140px 使っていた */}
        <h1 className="text-h1">{greeting}{mobile ? '' : `、${familyName(userName)}さん`}</h1>
        {canCount && (
          waitingTotal === 0 && myOverdue === 0 ? (
            <p className="text-sub mt-1 text-secondary-foreground">
              受信箱は空です。期限を過ぎたものもありません。
            </p>
          ) : mobile ? (
            /**
             * **スマホはチップ**（モックは `お待たせ 3件 ・ 期限切れ 2件`。
             * 「お待たせ中」の廃止＝受信箱への改名で1語目だけ変えた —
             * 根源整理 Phase 1・`docs/v4-mock-deviations.md` に記録済み）。
             * 文章にすると 375px で2行になり、挨拶の下が読み飛ばされる。
             * **押せるようにしてある** — 件数を見た人が次にやるのは「開く」なので、
             * 数字を読んでからメニューを探し直すのは1手だけ無駄
             */
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {waitingTotal > 0 && (
                <CountChip label="受信箱" n={waitingTotal} onClick={onWaiting} />
              )}
              {myOverdue > 0 && (
                <CountChip label="期限切れ" n={myOverdue} onClick={onOverdue} />
              )}
            </div>
          ) : (
            /**
             * **PC は文章**（モックの形のまま、言葉だけ受信箱に合わせた:
             * 「受信箱に届いているものが 3件、自分の期限を過ぎたものが 2件
             * あります。」）。幅があるので1行に収まり、**チップより何の件数かが
             * はっきりする**。数字は押せる（行き先はチップと同じ）
             */
            <p className="text-sub mt-1 text-secondary-foreground">
              {waitingTotal > 0 && (
                <>
                  受信箱に届いているものが{' '}
                  <CountLink n={waitingTotal} onClick={onWaiting} />
                </>
              )}
              {waitingTotal > 0 && myOverdue > 0 && '、'}
              {myOverdue > 0 && (
                <>
                  自分の期限を過ぎたものが{' '}
                  <CountLink n={myOverdue} onClick={onOverdue} />
                </>
              )}
              {' '}あります。
            </p>
          )
        )}
      </div>
      {/* **いつの数字かを書く**（モック右上）。取得できていないうちは出さない。
          **スマホには出さない** — 375px では挨拶の下に1行まるごと足すことになり、
          モックのスマホにも無い（PC は右端の空きに収まる） */}
      {!mobile && lastLoaded > 0 && (
        <span className="text-sub shrink-0 text-muted-foreground">最終更新 {updatedAt(lastLoaded)}</span>
      )}
    </div>
  );
}

/**
 * 挨拶の下の件数（PC の文章の中）。**赤くして押せるようにする**。
 * 0 件のときは呼び出し側が出さない — 「0件」を赤で出すと目を引くだけで何も起きない。
 */
/** ⚠️ **行き先が無いときは押せない字にする**（押して「権限がありません」に送らない） */
function CountLink({ n, onClick }: { n: number; onClick?: () => void }) {
  if (!onClick) {
    return <span className="font-number font-bold text-destructive"><CountUp n={n} />件</span>;
  }
  return (
    <button type="button" onClick={onClick} className="font-number font-bold text-destructive hover:underline">
      <CountUp n={n} />件
    </button>
  );
}

/** 挨拶の下の件数チップ（スマホ。モックの `お待たせ 3件 ・ 期限切れ 2件`） */
function CountChip({ label, n, onClick }: { label: string; n: number; onClick?: () => void }) {
  const cls = 'rounded-badge min-h-tap inline-flex items-center gap-1.5 border border-destructive-border bg-destructive-surface px-2.5 py-1 text-sub text-destructive lg:min-h-0';
  const body = (
    <>
      {label}
      <span className="font-number font-bold"><CountUp n={n} />件</span>
    </>
  );
  // 行き先が無いときは押せない札にする（消さない — 件数は読ませたい）
  if (!onClick) return <span className={cls}>{body}</span>;
  return (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}
