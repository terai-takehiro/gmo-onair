/**
 * 見積タブの「売上・請求」ペイン（v4・モックの3カード設計に置き換え）
 *
 * ── なぜ作り直したか ──────────────────────────────────────
 *
 * 従来はレガシー `BusinessProjectView`（2,042行・KPIカード＋月次ユニット＋
 * PDF/Excel出力＋明細のインライン編集を持つフル機能コンソール）をそのまま
 * 呼んでいた。最新モック（`v4-live-sales.dc.html` の `det.isRevPane`）は
 * **売上／請求／仕入（原価）の3枚のカードだけ**の、ずっと単純な読み取り中心の
 * 設計だったので、そちらに合わせて作り直した（`docs/v4-mock-deviations.md` 参照）。
 *
 * ── 何を残し、何を畳んだか ─────────────────────────────────
 *
 * このペインは**読むだけ**（モックどおり、行を押しても編集は開かない）。
 * 金額を直す・月次ユニットを作るといった編集は、
 * 既存の財務台帳（`/budget/revenues` `/budget/purchases`）と
 * ⑤ 見積・請求（全案件）にすでにある。同じ `revenues`/`purchases` を
 * 2か所で編集できるようにすると、片方だけ直された行ができる
 * （財務の台帳3画面の決めごとと同じ理由）。
 *
 * ── 帳票の発行だけは残す（ご指摘で戻したもの）──────────────
 *
 * **請求書・検収書の PDF はここから出せます。** これは「読むだけ」に反しません —
 * 数字を1つも書き換えず、いま見えている売上をそのまま紙にするだけだからです。
 * v4 でこのペインに置き換えたとき、旧 `BusinessProjectView` が持っていた
 * 3つのボタン（見積書・請求書・検収書）ごと落ちてしまい、**案件から帳票を
 * 出す道がどこにも無くなっていました**。
 *
 * **見積書はここに置きません。** v4 の見積は `estimates`（版が残る表）が持ち、
 * 左の「見積」から版ごとに出せます。売上からも出せるようにすると、
 * 同じ案件の見積書が2種類（版のあるもの・売上に変換したあとのもの）できて、
 * どちらを相手に出したのかが分からなくなります。
 *
 * ── データの出どころ ───────────────────────────────────────
 *
 * `GET /revenues?project_id=` と `GET /purchases?project_id=`（`budget` 権限。
 * レガシー版も同じ口を呼んでいたので権限の要件は変えていない）。
 * 「請求」カードは `invoice_issued` が立っている行だけを見せる —
 * 売上に計上されただけの見込み行と、実際に請求書を出した行は別物のため。
 *
 * ── スマホはカード積み（v4ネイティブUI監査・この回） ───────────
 *
 * 3枚とも `Row`（`stackOnMobile`）の表縮小のままだったので、`mobile` を
 * 受け取ってカード積みに切り替えた。呼び手（`EstimateTab.tsx`）は
 * PC専用ゲートの内側にあるが、「それでもこのまま開く」を選んだ人のために
 * 中身は作り込んである。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { DocPdfButton } from '@/contexts/shared/components/DocPdfButton';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { Revenue, Purchase } from '@gmo-onair/shared/src/types';

/**
 * 帳票を出すボタン2つ（請求書・検収書）。
 *
 * **見積書はここに出さない** — 版を持つ「見積」から出す（冒頭のコメント参照）。
 */
function DocButtons({ revenueId }: { revenueId: string }) {
  return (
    <RowSlot w={96} align="right" className="gap-1">
      {(['invoice', 'inspection'] as const).map((type) => (
        <DocPdfButton key={type} path={`/revenues/${revenueId}/pdf`} kind={type} params={{ type }} />
      ))}
    </RowSlot>
  );
}

const REV_STATUS_LABEL: Record<string, string> = { estimate: '見込み', confirmed: '確定' };
const REV_STATUS_TONE: Record<string, string> = {
  estimate: 'border-transparent bg-muted text-muted-foreground',
  confirmed: 'border-transparent bg-success-surface text-success',
};

function invoiceState(r: Revenue): { label: string; tone: string } {
  return r.paid_date
    ? { label: '入金済み', tone: 'border-transparent bg-success-surface text-success' }
    : { label: '未収', tone: 'border-transparent bg-warning-surface text-warning' };
}

/**
 * 一覧の応答。**合計はサーバーが出したものを使います**（レビューでの指摘 #87）。
 *
 * ⚠️ **行を足し算しないこと。** ①分け合う請求（グループ）の `amount` は
 * **グループ全体の額**なので、そのまま足すと**1案件の粗利が他案件のぶんだけ
 * 膨らみます**。②行は 100 件で切っているので、**101 件目からは合計に入りません**。
 * どちらも画面を見ても気づけません（それらしい数字が出るだけ）。
 */
interface ListResponse<T> {
  data: T[];
  /** 件数は `pagination.total`（`paginatedResponse` の形） */
  pagination?: { total?: number };
  /** 分け合うぶんを配分額で足した合計（案件で絞ったときだけ返る） */
  total_allocated_amount?: number;
  /** 同上・確定した売上だけ */
  confirmed_allocated_amount?: number;
}

/**
 * **切ったことを書く。** 行は 100 件までしか出しません（全部出すと画面が固まる）。
 * 黙って切ると「これで全部」と読まれます。**合計には入っています**（サーバーが出す）。
 */
function MoreNote({ n }: { n: number }) {
  return (
    <p className="text-note border-t border-border-subtle px-4 py-2.5 text-muted-foreground">
      ほか {n} 件（多いのでここには出していません。合計には入っています。財務管理の台帳で全部見られます）
    </p>
  );
}

export function RevenueBillingPane({ projectId, mobile }: { projectId: string; mobile?: boolean }) {
  const revenues = useQuery<ListResponse<Revenue>>({
    queryKey: ['revenues', 'project', projectId],
    queryFn: async () => (await api.get('/revenues', { params: { project_id: projectId, limit: 100 } })).data,
  });
  const purchases = useQuery<ListResponse<Purchase>>({
    queryKey: ['purchases', 'project', projectId],
    queryFn: async () => (await api.get('/purchases', { params: { project_id: projectId, limit: 100 } })).data,
  });

  if (revenues.isLoading || purchases.isLoading) {
    return <Delayed><SkeletonRows rows={4} /></Delayed>;
  }

  const revenueRows = revenues.data?.data ?? [];
  const invoiceRows = revenueRows.filter((r) => r.invoice_issued);
  const purchaseRows = purchases.data?.data ?? [];

  // **合計はサーバーが出したものを使う**（上の注意書き）。古い応答が返ってきた
  // ときだけ、今までどおり行を足す（数字が消えるより、多少ずれても出すほうがまし）
  const confirmedRevenue = revenues.data?.confirmed_allocated_amount
    ?? revenueRows.filter((r) => r.status === 'confirmed').reduce((n, r) => n + (r.amount || 0), 0);
  const totalCost = purchases.data?.total_allocated_amount
    ?? purchaseRows.reduce((n, p) => n + (p.amount || 0), 0);
  const grossProfit = confirmedRevenue - totalCost;

  /** 行は 100 件までしか出せないので、**残りがあることを書く**（黙って切らない） */
  const moreRevenue = Math.max(0, (revenues.data?.pagination?.total ?? 0) - revenueRows.length);
  const morePurchase = Math.max(0, (purchases.data?.pagination?.total ?? 0) - purchaseRows.length);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <p className="text-cardtitle border-b border-border px-4 py-3">売上</p>
        {revenueRows.length === 0 ? (
          <EmptyState title="売上はまだありません" description="財務管理の売上台帳から登録できます。" />
        ) : mobile ? (
          <>
            <div className="flex flex-col">
              {revenueRows.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 border-b border-border-faint p-3.5 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="text-list block truncate font-bold">{r.subtitle || r.notes || '（内容未設定）'}</span>
                      <span className="text-sub-sm font-number block text-muted-foreground">
                        {r.recognition_date?.slice(0, 7).replace('-', '/') ?? '—'}
                      </span>
                    </span>
                    <TableBadge w={null} label={REV_STATUS_LABEL[r.status] ?? r.status}
                      className={cn('shrink-0', REV_STATUS_TONE[r.status] ?? REV_STATUS_TONE.estimate)} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Money value={r.amount} className="text-list font-bold" />
                    <DocButtons revenueId={r.id} />
                  </div>
                </div>
              ))}
            </div>
            {moreRevenue > 0 && <MoreNote n={moreRevenue} />}
          </>
        ) : (
          <>
            <RowHeader className="hidden sm:flex">
              <RowMain>内容</RowMain>
              <RowSlot w={96}>計上月</RowSlot>
              <RowSlot w={128} align="right">金額</RowSlot>
              <RowSlot w={96}>状態</RowSlot>
              <RowSlot w={96} align="right">帳票</RowSlot>
            </RowHeader>
            {revenueRows.map((r) => (
              <Row key={r.id} divider stackOnMobile align="center">
                <RowMain><span className="text-list block truncate">{r.subtitle || r.notes || '（内容未設定）'}</span></RowMain>
                <RowSlot w={96}><span className="text-sub font-number">{r.recognition_date?.slice(0, 7).replace('-', '/') ?? '—'}</span></RowSlot>
                <Money value={r.amount} className="text-sub w-32 shrink-0" />
                <TableBadge w={96} label={REV_STATUS_LABEL[r.status] ?? r.status} className={REV_STATUS_TONE[r.status] ?? REV_STATUS_TONE.estimate} />
                <DocButtons revenueId={r.id} />
              </Row>
            ))}
            {moreRevenue > 0 && <MoreNote n={moreRevenue} />}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <p className="text-cardtitle border-b border-border px-4 py-3">請求</p>
          {invoiceRows.length === 0 ? (
            <EmptyState title="請求はまだありません" description="売上・請求（全案件）から請求書を出せます。" />
          ) : mobile ? (
            <div className="flex flex-col">
              {invoiceRows.map((r) => {
                const st = invoiceState(r);
                return (
                  <div key={r.id} className="flex items-start gap-2 border-b border-border-faint p-3.5 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="text-list block truncate font-bold">{r.invoice_no || r.billing_key || '（番号未採番）'}</span>
                      <span className="text-sub-sm font-number block text-muted-foreground">{r.billing_date?.replace(/-/g, '/') ?? '—'}</span>
                      <Money value={r.amount} className="text-list mt-1 font-bold" />
                    </span>
                    <TableBadge w={null} label={st.label} className={cn('shrink-0', st.tone)} />
                  </div>
                );
              })}
            </div>
          ) : (
            invoiceRows.map((r) => {
              const st = invoiceState(r);
              return (
                <Row key={r.id} divider align="center">
                  <RowMain>
                    <span className="text-list block truncate">{r.invoice_no || r.billing_key || '（番号未採番）'}</span>
                    <span className="text-sub-sm font-number block text-muted-foreground">{r.billing_date?.replace(/-/g, '/') ?? '—'}</span>
                  </RowMain>
                  <Money value={r.amount} className="text-sub w-28 shrink-0" />
                  <TableBadge w={72} label={st.label} className={st.tone} />
                </Row>
              );
            })
          )}
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <p className="text-cardtitle border-b border-border px-4 py-3">仕入（原価）</p>
          {purchaseRows.length === 0 ? (
            <EmptyState title="仕入はまだありません" description="財務管理の仕入台帳から登録できます。" />
          ) : mobile ? (
            <>
              <div className="flex flex-col">
                {purchaseRows.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border-faint p-3.5 last:border-b-0">
                    <span className="text-list min-w-0 flex-1 truncate">{p.vendor_name || p.description || '（内容未設定）'}</span>
                    <Money value={p.amount} className="text-list shrink-0 font-bold" />
                  </div>
                ))}
              </div>
              {morePurchase > 0 && <MoreNote n={morePurchase} />}
            </>
          ) : (
            <>
              {purchaseRows.map((p) => (
                <Row key={p.id} divider align="center">
                  <RowMain><span className="text-list block truncate">{p.vendor_name || p.description || '（内容未設定）'}</span></RowMain>
                  <Money value={p.amount} className="text-sub w-28 shrink-0" />
                </Row>
              ))}
              {morePurchase > 0 && <MoreNote n={morePurchase} />}
            </>
          )}
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface-subtle p-4">
        <div className="flex flex-col gap-1.5">
          {[
            { label: '確定売上', value: confirmedRevenue, fg: '' },
            { label: '仕入（原価）', value: totalCost, fg: '' },
            { label: '粗利', value: grossProfit, fg: grossProfit < 0 ? 'text-destructive' : 'text-success' },
          ].map((s) => (
            <div key={s.label} className="flex items-baseline gap-3">
              <span className="text-sub flex-1 text-right text-muted-foreground">{s.label}</span>
              <Money value={s.value} className={`text-list w-40 shrink-0 font-bold ${s.fg}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
