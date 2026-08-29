/**
 * 「探す」— PC
 *
 * PC は今までどおり**罫線区切りの一覧**（`Row`/`RowMain`）。ここを縮めたものが
 * スマホ版ではない — スマホ版（`SearchPageMobile.tsx`）はカード積みで別に組む。
 */
import { Search, Loader2, FolderKanban, Building2, Truck, Clock, ChevronRight, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowTitle, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { PROJECT_STAGE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import type { Shortcut } from './shortcuts';
import type { SearchPageViewProps } from './types';

export function SearchPageDesktop({
  query, onType, searching, failed, onRetry, results, total,
  doItems, places, onGoShortcut, recent, onOpenRecent, onRemoveRecent,
  onOpenProject, onOpenCustomer, onOpenVendor,
}: SearchPageViewProps) {
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
          onChange={(e) => onType(e.target.value)}
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
                <ShortcutRow key={s.key} item={s} onOpen={() => onGoShortcut(s)} />
              ))}
            </Group>
          )}

          {recent.length > 0 && (
            <Group icon={Clock} label="最近見たもの" n={recent.length}>
              {recent.map((r) => (
                <ClickRow key={r.to} onOpen={() => onOpenRecent(r.to)}>
                  <RowMain>
                    <RowTitle>{r.label}</RowTitle>
                    <RowSub>{[r.kind === 'customer' ? 'お客様' : '案件', r.sub].filter(Boolean).join(' ・ ')}</RowSub>
                  </RowMain>
                  <RemoveRecentButton label={r.label} onRemove={() => onRemoveRecent(r.to)} />
                </ClickRow>
              ))}
            </Group>
          )}

          <Group icon={Building2} label="場所" n={places.length}>
            {places.map((s) => (
              <ShortcutRow key={s.key} item={s} onOpen={() => onGoShortcut(s)} />
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
        <ErrorPanel title="探せませんでした" error={failed} onRetry={onRetry} />
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
                <ClickRow key={p.id} onOpen={() => onOpenProject(p.id)}>
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
                <ClickRow key={c.id} onOpen={() => onOpenCustomer(c.id)}>
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
                          /*
                            ⚠️ **押下だけでなくキー操作も止める**（レビューでの指摘 #140）。
                            `ClickRow` は Enter / Space を拾って
                            **`preventDefault()` してから行を開きます**。止めないと
                            キーボードやスイッチで番号に来て Enter を押した人は、
                            **電話が掛からずお客様の画面へ飛ばされます** —
                            そこはスマホでは PC 専用の案内に差し替わるので、
                            **この行を足したときに避けたかった行き止まりそのもの**です。
                            （指で押す人だけが番号に辿り着ける状態でした）
                          */
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
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
                <ClickRow key={v.id} onOpen={onOpenVendor}>
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

/**
 * 「最近見たもの」の削除ボタン。**行を開くのと同じ要素の中にある**ので、
 * 電話番号リンク（上）と同じ理由でクリック・キー操作の両方を止める
 * （止めないと、消したいだけなのに行が開いてしまう）。
 */
function RemoveRecentButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={`「${label}」を最近見たものから消す`}
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      onKeyDown={(e) => e.stopPropagation()}
      className="v4-tap rounded-full p-2.5 text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
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
