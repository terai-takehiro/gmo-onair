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
 * ── 4つの状態を混ぜない ──────────────────────────────────────
 *
 * **まだ打っていない / 探している / 0件 / 失敗した** は別のことです。
 * 打つ前に「該当なし」と出すと探す前から無いと言うことになり、
 * 失敗を「探しています…」のままにすると**永久に回り続けているように見えます**
 * （どちらもレビューで指摘されて直しました）。
 *
 * ── 遅れて届いた結果で上書きしない ──────────────────────────
 *
 * 打ち込みを 300ms 待ってから投げていますが、**待つのは投げるまで**で、
 * 投げたあとの通信は止まりません。「みら」の結果が「みらいてっく」の結果より
 * **後に届く**と、新しい結果が古いもので上書きされます。
 * 投げるたびに番号を振り、**最後に投げたぶんだけを画面に出します**。
 *
 * ── 打ち込む前に出すもの（モックの ⑪） ──────────────────────
 *
 * モックの ⑪ は検索欄の下に **やること4つ・場所6つ・最近見たもの**を並べます。
 * 「探す」を開く理由の半分は**探すことではなく、そこから始めること**なので、
 * 空欄のまま「探す言葉を入れてください」だけ出すのは1画面ぶんの無駄です。
 *
 * 行き先と権限は `search/shortcuts.ts` の表に置いてあります
 * （画面に直接並べると、権限の書き忘れがそのまま「押すと 403」になる）。
 * **最近見たものは端末の中だけ**（`client-v4/recent.ts`）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Loader2, FolderKanban, Building2, Truck, Clock, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowTitle, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { PROJECT_STAGE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import { readRecent, type RecentItem } from '@gmo-onair/shared/src/client-v4/recent';
import { useAuth } from '@/contexts/platform/AuthContext';
import { DO_ITEMS, PLACES, type Shortcut } from './search/shortcuts';

interface SearchResults {
  projects: Array<{ id: string; code: string; gls_number: string | null; name: string; stage: string }>;
  customers: Array<{ id: string; name: string; short_name: string; phone?: string | null; contact_name?: string | null }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const { hasPermission, currentUser } = useAuth();
  const [sp, setSp] = useSearchParams();
  const initial = sp.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // **一度だけ読む。** 描画のたびに `localStorage` を読むと、
  // この画面から開いたものが戻ってきた瞬間に並びが動く
  const [recent] = useState<RecentItem[]>(() => readRecent(currentUser?.id ?? ''));
  // **投げた順番。** 遅れて届いた古い結果で新しい結果を上書きしないための番号
  const seq = useRef(0);

  const run = useCallback(async (q: string) => {
    const mine = ++seq.current;
    setSearching(true);
    setFailed(null);
    try {
      const data = (await api.get('/search', { params: { q } })).data.data as SearchResults;
      // **自分より後に投げたものがあるなら捨てる。** 通信の速さは順番を守らない
      if (mine !== seq.current) return;
      setResults(data);
    } catch (e) {
      if (mine !== seq.current) return;
      // **`results` を null に戻さない。** null は「探している最中」の意味なので、
      // 戻すと失敗が永久の読み込み中に化ける
      setFailed(e);
    } finally {
      if (mine === seq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    // **打ち込んでいる途中で毎回叩かない。** 1文字ごとに投げると通信が積み上がる
    timer.current = setTimeout(() => {
      setSp((prev) => {
        const n = new URLSearchParams(prev);
        if (q) n.set('q', q); else n.delete('q');
        return n;
      }, { replace: true });
      if (!q) {
        // 空にしたら、走っている通信の結果も受け取らない
        seq.current += 1;
        setResults(null); setFailed(null); setSearching(false);
        return;
      }
      run(q);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, setSp, run]);

  const total = results
    ? results.projects.length + results.customers.length + results.vendors.length
    : 0;

  /** 権限が無いものは**出さない**（押してから 403 で気づかせない） */
  const allowed = (s: Shortcut) => !s.module || hasPermission(s.module, s.minLevel);
  const doItems = DO_ITEMS.filter(allowed);
  const places = PLACES.filter(allowed);
  const go = (s: Shortcut) => {
    // **別のバンドルは `navigate()` では飛べない**（React Router は同じアプリしか知らない）
    if (s.external) window.location.href = s.to;
    else navigate(s.to);
  };

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
        <div className="flex flex-col gap-3.5">
          {doItems.length > 0 && (
            <Group icon={Search} label="やること" n={doItems.length}>
              {doItems.map((s) => (
                <ShortcutRow key={s.key} item={s} onOpen={() => go(s)} />
              ))}
            </Group>
          )}

          {recent.length > 0 && (
            <Group icon={Clock} label="最近見たもの" n={recent.length}>
              {recent.map((r) => (
                <ClickRow key={r.to} onOpen={() => navigate(r.to)}>
                  <RowMain>
                    <RowTitle>{r.label}</RowTitle>
                    <RowSub>{[r.kind === 'customer' ? 'お客様' : '案件', r.sub].filter(Boolean).join(' ・ ')}</RowSub>
                  </RowMain>
                </ClickRow>
              ))}
            </Group>
          )}

          <Group icon={Building2} label="場所" n={places.length}>
            {places.map((s) => (
              <ShortcutRow key={s.key} item={s} onOpen={() => go(s)} />
            ))}
          </Group>

          <p className="text-note text-muted-foreground">
            案件名の一部・GLS番号・お客様名・仕入先名で探せます。
            <strong className="font-bold">見る権限が無いものはここに出ません。</strong>
            {recent.length > 0 && '「最近見たもの」はこの端末で開いたものだけです（別の端末では出ません）。'}
          </p>
        </div>
      ) : failed ? (
        // **失敗を読み込み中に化けさせない。** もう一度押せる口を必ず置く
        <ErrorPanel title="探せませんでした" error={failed} onRetry={() => run(query.trim())} />
      ) : results === null || searching ? (
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
                    {/*
                      ⚠️ **電話番号はここに出す**（レビューでの指摘 #73）。
                      お客様の詳細はスマホでは PC 専用の案内に差し替わるので、
                      **外から電話をかけたい人は番号に辿り着けません**
                      （仕入先は `/budget/vendors` を開けるのに、お客様だけ道が無い）。
                      **画面を開かずに答えにする**のがいちばん短い道です。
                    */}
                    {c.phone && (
                      <RowSub>
                        <a
                          href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`}
                          onClick={(e) => e.stopPropagation()}
                          className="v4-tap font-number font-bold text-primary hover:underline"
                        >
                          {c.phone}
                        </a>
                        {c.contact_name && <span className="ml-2">{c.contact_name}</span>}
                      </RowSub>
                    )}
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

/** やること・場所の1行。**行き先の名前ではなく「何が起きるか」を下に書く** */
function ShortcutRow({ item, onOpen }: { item: Shortcut; onOpen: () => void }) {
  const Icon = item.icon;
  return (
    <ClickRow onOpen={onOpen}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <RowMain>
        <RowTitle>{item.label}</RowTitle>
        <RowSub>{item.sub}</RowSub>
      </RowMain>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </ClickRow>
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
