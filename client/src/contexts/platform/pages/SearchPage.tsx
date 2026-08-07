/**
 * 探す（v4・スマホの下タブ 3つ目）
 *
 * ── なぜ画面として作るのか ──────────────────────────────────
 *
 * v4 の決めごとは**下タブ3つ = ホーム / やること / 検索**
 * （`docs/design/v4/_rules.md`「3. スマホ」）。ところが
 * **スマホには検索が1つもありませんでした** — 上辺バーの `GlobalSearch` は
 * `hidden sm:block` で、375px では出ません。
 * そのため3つ目は「メニューを開く」で代用していました。
 *
 * メニューは**上辺バーの ☰ からも開けます**。つまり下タブの1枠を
 * 二重の入口に使っていて、決めごとにある検索がどこにも無い状態でした。
 * この画面を作って、3つ目を本来の「探す」に戻します。
 *
 * ── 上辺バーの検索と同じ口を叩く ────────────────────────────
 *
 * `GET /search`（案件・お客様・仕入先）。**種類ごとに権限を見るのはサーバー側**で、
 * 権限が無い種類は空で返ります（v3.2.2 で塞いだ穴）。
 * 画面は返ってきたものを出すだけで、**件数を自分で数え直しません**。
 *
 * ── 「0件」と「まだ探していない」を分ける ────────────────────
 *
 * 打ち込む前に「該当なし」と出すと、探す前から無いと言うことになります。
 * 打ち込む前・打ち込み中・0件 を別の表示にしてあります。
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Loader2, FolderKanban, Building2, Truck } from 'lucide-react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowTitle, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { PROJECT_STAGE, statusOf } from '@gmo-onair/shared/src/constants/statuses';

interface SearchResults {
  projects: Array<{ id: string; code: string; gls_number: string | null; name: string; stage: string }>;
  customers: Array<{ id: string; name: string; short_name: string }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const initial = sp.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    // **打ち込んでいる途中で毎回叩かない。** 1文字ごとに投げると、
    // 打ち終わる前の結果が後から届いて上書きすることがある
    timer.current = setTimeout(async () => {
      setSp((prev) => {
        const n = new URLSearchParams(prev);
        if (q) n.set('q', q); else n.delete('q');
        return n;
      }, { replace: true });
      if (!q) { setResults(null); return; }
      setSearching(true);
      try {
        setResults((await api.get('/search', { params: { q } })).data.data as SearchResults);
      } catch {
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, setSp]);

  const total = results
    ? results.projects.length + results.customers.length + results.vendors.length
    : 0;

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="探す"
        sub="案件・お客様・仕入先をまとめて探します。見る権限が無い種類は出ません"
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          // **スマホで最初から打てるようにする。** 探しに来た人がもう一度
          // 入力欄を押さずに済む
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="案件名・GLS番号・お客様名・仕入先名"
          aria-label="探す言葉"
          className="min-h-tap h-11 pl-10 pr-10 lg:h-10"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {/* **打ち込む前と 0件 を分ける。** 打つ前に「該当なし」と出さない */}
      {!query.trim() ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title="探す言葉を入れてください"
          description="案件名の一部・GLS番号・お客様名・仕入先名で探せます。"
        />
      ) : results === null ? (
        <p className="text-sub py-6 text-center text-muted-foreground">探しています…</p>
      ) : total === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title={`「${query.trim()}」に当たるものはありません`}
          description="言葉を短くするか、別の言い方で試してください。見る権限が無い種類はここに出ません。"
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <p className="text-sub text-muted-foreground">
            <span className="font-number font-bold">{total}</span> 件
          </p>

          {results.projects.length > 0 && (
            <Group icon={FolderKanban} label="案件" n={results.projects.length}>
              {results.projects.map((p) => (
                <ClickRow key={p.id} onOpen={() => navigate(`/sales/projects/${p.id}`)}>
                  <RowMain>
                    <RowTitle>{p.name}</RowTitle>
                    <RowSub>{p.gls_number || p.code}</RowSub>
                  </RowMain>
                  <TableBadge label={statusOf(PROJECT_STAGE, p.stage).label} w={96} />
                </ClickRow>
              ))}
            </Group>
          )}

          {results.customers.length > 0 && (
            <Group icon={Building2} label="お客様" n={results.customers.length}>
              {results.customers.map((c) => (
                <ClickRow key={c.id} onOpen={() => navigate(`/sales/customers/${c.id}`)}>
                  <RowMain>
                    <RowTitle>{c.name}</RowTitle>
                    {c.short_name && <RowSub>{c.short_name}</RowSub>}
                  </RowMain>
                </ClickRow>
              ))}
            </Group>
          )}

          {results.vendors.length > 0 && (
            <Group icon={Truck} label="仕入先" n={results.vendors.length}>
              {results.vendors.map((v) => (
                // **仕入先だけ個別の画面が無い**ので一覧へ送る（詳細を作ったら差し替える）
                <ClickRow key={v.id} onOpen={() => navigate('/budget/vendors')}>
                  <RowMain>
                    <RowTitle>{v.name}</RowTitle>
                    {v.vendor_type && <RowSub>{v.vendor_type}</RowSub>}
                  </RowMain>
                </ClickRow>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 押せる行。**キーボードでも押せるようにする** — `onClick` だけの `<div>` は
 * Tab で止まらず Enter でも動かない（案件一覧と同じ形）。
 */
function ClickRow({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) {
  return (
    <Row
      divider
      interactive
      stackOnMobile
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Row>
  );
}

function Group({
  icon: Icon, label, n, children,
}: {
  icon: typeof Search; label: string; n: number; children: React.ReactNode;
}) {
  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <h2 className="text-cardtitle flex items-center gap-2 border-b border-border-faint bg-surface-subtle px-4 py-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {label}
        <span className="text-sub font-number font-bold text-muted-foreground">{n}</span>
      </h2>
      {children}
    </section>
  );
}
