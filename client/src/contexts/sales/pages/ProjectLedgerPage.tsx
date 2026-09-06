/**
 * 案件台帳（`/sales/projects/ledger`）— データを網羅して見る・まとめて直す
 *
 * ── 「案件一覧」とは役割が別 ────────────────────────────────
 *
 * `/sales/projects`（案件一覧）は**毎日開いて次の一手を決める画面**で、1行に4つしか
 * 置いていません。**そこに列を足すと毎日使う画面が読めなくなる**ので、網羅して見る・
 * まとめて直すほうをこの画面に分けました（機材台帳と同じ役割）。
 *
 * **同じ口（`GET /projects`）を読みます。** 別の口を作ると、一覧とこの画面で違う数が
 * 出て、どちらが正しいのか誰にも分かりません（v4 でボードを別画面から「見え方」にしたのと同じ理由）。
 *
 * ── PC 専用は一括編集だけ ───────────────────────────────────
 *
 * 升目の選択・編集モード・`BulkEditDialog` は戻せない誤操作になるので PC 専用のまま
 * （`isMobile` で出し分け）。**閲覧（既定表示9列）はスマホでもカード**（`MobileLedgerCards`）で開ける。
 *
 * ── 権限 ────────────────────────────────────────────────────
 *
 * 読むのは `sales` があれば誰でも。**まとめて直せるのは manager 以上**
 * （サーバーの `PATCH /projects/bulk` がそう止めています）。権限が無い人にはチェックボックスごと出しません。
 */
import { useState } from 'react';
import { Columns3, Copy, Download, Eye, Loader2, Pencil, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { ErrorPanel } from '@gmo-onair/shared/src/client/states/ErrorPanel';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useAuth } from '@/contexts/platform/AuthContext';
import { ProjectStageLabels, type ProjectStage } from '@/types';
import { useLedgerState, PAGE_SIZE } from './projectLedger/useLedgerState';
import { useColumnPrefs } from './projectLedger/useColumnPrefs';
import { LedgerTable } from './projectLedger/LedgerTable';
import { MobileLedgerCards } from './projectLedger/MobileLedgerCards';
import { ColumnPicker } from './projectLedger/ColumnPicker';
import { BulkEditDialog } from './projectLedger/BulkEditDialog';
import { IntegrityPanel } from './projectLedger/IntegrityPanel';
import { useLedgerCsv } from './projectLedger/useLedgerCsv';
import { CSV_MAX_ROWS } from './projectLedger/csv';
import { JA_SORT_KEYS, JA_SORT_NOTE } from './projectLedger/display';
import { useLedgerGrid } from './projectLedger/useLedgerGrid';
import { PastePlanDialog } from './projectLedger/PastePlanDialog';
import { useLedgerLookups } from './projectLedger/useLedgerLookups';
import { LookupNotices } from './projectLedger/LookupNotices';

const STAGE_OPTIONS: ProjectStage[] = [
  'neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 'r_delivered', 's_completed', 'e_lost',
];

export default function ProjectLedgerPage() {
  const { hasPermission } = useAuth();
  /** **一括編集は引き続き PC 専用**（ご指示）。閲覧（既定表示9列・`MobileLedgerCards`）だけ開放する */
  const isMobile = useIsMobile();
  const canBulk = hasPermission('sales', 'manager');
  /**
   * **1件ずつ「直す」画面へ行けるか**（レビューでの指摘 #127）。
   * ⚠️ ルート（`/sales/projects/:id/edit`）は `sales` があれば通すので、
   * **ここで出し分けないと閲覧だけの人にも鉛筆が出ます** —
   * 押すとフォームが開いて中身も打てて、**保存して初めて 403** です。
   */
  const canEditOne = hasPermission('sales', 'editor');
  const s = useLedgerState();
  const prefs = useColumnPrefs();
  const csv = useLedgerCsv();
  const [colsOpen, setColsOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  /**
   * 閲覧モード／編集モード（ご指示）。**既定は閲覧**です。
   *
   * ⚠️ この画面の書き換えは**取り消せません**（どの案件が元は何だったかを
   * 持っていない）。開いた瞬間から書き換えられる状態だと、
   * **読みに来ただけの人が指1本で N 件を書き換えられます**。
   * モードを1つ挟むと「いま自分は直す側にいる」と分かります。
   *
   * **憶えません**（`localStorage` に入れない）— 前に開いたときのモードで
   * 開くと、読むつもりで開いた日に編集モードで始まります。
   */
  const [editMode, setEditMode] = useState(false);
  const canEdit = canBulk && editMode;

  /**
   * 名前で直すための候補。引き方の決めごと3つは `useLedgerLookups` にあります
   * （ページを最後までたどる／鍵を他の画面と分ける／引き終わったかを返す）。
   */
  const lookups = useLedgerLookups(bulkOpen || canEdit);
  const { users, customers, ready: lookupsReady, failed: lookupsFailed } = lookups;

  /**
   * 升目としての操作（選ぶ・コピー・貼り付け・その場で直す）。
   * ⚠️ **コピーは閲覧モードでもできます**（読むだけなので壊せない）。
   * 書き換えは `canEdit` のときだけ（`useLedgerGrid` が見ています）。
   */
  const grid = useLedgerGrid({
    rows: s.rows, shown: prefs.shown, canEdit, users, customers, lookupsReady, lookupsFailed,
    onDone: s.clearSelection,
  });

  const targets = s.rows.filter((r) => s.selected.has(r.id)).map((r) => ({ id: r.id, name: r.name }));

  return (
    /* ⚠️ **画面の余白はこの根が持つ**（`<main>` は持っていない・`shell/AppShell.tsx`）。
       書かないと見出しも表も左メニューの罫線に貼り付く（実測 0px）。
       段は隣の案件一覧・タスク一覧と同じ（違うと行き来したとき表の左端が動く） */
    <div className="space-y-4 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="案件台帳"
        sub="案件のデータを列で見比べて、一括編集画面です（毎日の仕事は「案件一覧」から）"
      />

      {/*
        **いちばん上に置く。** この画面のもう1つの目的が
        「v4 より前のデータが揃っているか確かめる」ことなので、
        表を眺めても分からないもの（空欄・ずれ）を先に名指しします
      */}
      <IntegrityPanel
        checks={s.integrity.checks}
        total={s.integrity.total}
        loading={s.integrityLoading}
        active={s.filters.issue}
        /* ⚠️ **`setFilter('issue', …)` を直接呼ばないこと。** 件数は全案件を
           数えているので、既定の GLS-A と AND になって 0 行になります
           （`useLedgerState` の `pickIssue`） */
        onPick={s.pickIssue}
      />

      {/* ── 絞り込み（1段目）──────────────────────────────── */}
      <div className="rounded-card flex flex-wrap items-center gap-2.5 border border-border bg-card px-3.5 py-3">
        <Input
          className="h-10 w-[260px]"
          value={s.filters.search}
          onChange={(e) => s.setFilter('search', e.target.value)}
          placeholder="案件名・GLS番号・お客様で検索"
          aria-label="案件を検索"
        />
        <Select value={s.filters.stage || 'all'} onValueChange={(v) => s.setFilter('stage', v === 'all' ? '' : v)}>
          <SelectTrigger className="h-10 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ステージ：すべて</SelectItem>
            {STAGE_OPTIONS.map((st) => (
              <SelectItem key={st} value={st}>{ProjectStageLabels[st]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={s.filters.source === 'kessan' ? 'kessan' : (s.filters.glsCategory || 'all')} onValueChange={(v) => s.pickCategory(v as 'A' | 'B' | 'kessan' | 'all')}>
          <SelectTrigger className="h-10 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="A">GLS-A</SelectItem>
            <SelectItem value="B">GLS-B</SelectItem>
            <SelectItem value="kessan">旧GLS（決算取込）</SelectItem>
            <SelectItem value="all">どちらも</SelectItem>
          </SelectContent>
        </Select>
        <span className="flex-1" />
        {/* **スマホでは出さない。** カードは既定表示9列の決め打ちで `prefs.shown` を見ないので、開いても効かない */}
        {!isMobile && (
          <Button variant="outline" onClick={() => setColsOpen(true)}>
            <Columns3 className="mr-2 h-4 w-4" aria-hidden="true" />出す列（{prefs.shown.length}）
          </Button>
        )}
        {/* **書き出すのは絞り込み全体**（並んでいる行だけだと101件目から黙って落ちる・`ledgerCsv.ts`）。
            3つ目に渡すのはファイル名に入れる絞り込みで、**日本語ではなく鍵**（`csv.ts`） */}
        <Button
          variant="outline"
          disabled={csv.busy || s.total === 0}
          onClick={() => csv.download(s.params, prefs.shown, s.filters.issue || null)}
        >
          {csv.busy
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
          CSV で書き出す
        </Button>
      </div>

      {/* ── 件数と、選んだときの操作（2段目）────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sub text-muted-foreground">
          {/* **絞り込み全体の件数**（サーバーが数えたもの・並んだ行を数えると「これで全部」と読まれる） */}
          全 <strong className="font-number font-bold text-foreground">{s.total}</strong> 件
          {s.totalPages > 1 && <>（この画面は {s.rows.length} 件・{s.page} / {s.totalPages} ページ）</>}
        </p>
        {/* 並べ替えの但し書き。**「五十音順」と言い切らない**（漢字は読みを持っていない） */}
        {JA_SORT_KEYS.includes(s.sort.by) && (
          <span className="text-note text-muted-foreground">{JA_SORT_NOTE}</span>
        )}
        <span className="flex-1" />

        {/*
          ⚠️ **閲覧 / 編集の切り替え**（ご指示）。既定は閲覧、書き換えは取り消せないので
          読みに来ただけの人が指1本でN件を書き換えられる状態にしません。
          **スマホではこの切り替えごと出さない**（`editMode`をtrueにする手段自体が無くなる）
        */}
        {canBulk && !isMobile && (
          <div className="flex rounded-control border border-border p-0.5" role="group" aria-label="モード">
            {([
              ['閲覧', false, Eye],
              ['編集', true, PencilLine],
            ] as const).map(([label, on, Icon]) => (
              <button
                key={label}
                type="button"
                aria-pressed={editMode === on}
                onClick={() => {
                  setEditMode(on);
                  // **切り替えたら選択を捨てる。** 残すと、閲覧に戻って
                  // また編集にしたときに「いつ選んだか分からない行」が選ばれたまま
                  if (!on) s.clearSelection();
                }}
                className={`text-sub flex min-h-tap items-center gap-1.5 rounded-control px-3 lg:min-h-[32px] ${
                  editMode === on ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        )}

        {s.selected.size > 0 && canEdit && (
          <>
            <span className="text-sub font-bold">{s.selected.size} 件を選んでいます</span>
            <Button variant="outline" onClick={s.clearSelection}>選択を解除</Button>
            <Button onClick={() => setBulkOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />一括編集
            </Button>
          </>
        )}
        {/* **権限が無い理由を書く。** スマホでは出さない — 切り替えボタン自体が無い */}
        {!canBulk && !isMobile && (
          <span className="text-note text-muted-foreground">
            一括編集には案件管理の「管理者」の権限が要ります
          </span>
        )}
      </div>

      {/* **編集モードに入ったことを画面に出す。** 見落とすと取り消せない書き換えができる側にいることに気づけない */}
      {canEdit && (
        <div className="rounded-note flex items-center gap-2 border border-warning-border bg-warning-surface px-3.5 py-2">
          <PencilLine className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sub text-warning">
            <strong className="font-bold">編集モードです。</strong>
            行を選んで一括編集／
            <strong className="font-bold">セルを二度押しでその場で直す</strong>／
            <strong className="font-bold">Excel から貼り付ける（Ctrl+V）</strong>ことができます。
            <strong className="font-bold">直したものは元に戻せません。</strong>
          </p>
        </div>
      )}

      {/* 候補の様子（引いている／引けなかった／打ち切った）。理由は `LookupNotices` に */}
      {canEdit && <LookupNotices lookups={lookups} />}

      {/*
        **押し方を画面に出す。** Ctrl+C / Ctrl+V は、書いていなければ
        誰も試しません（「Excel のように使える」ことに気づけない）。
        ⚠️ **コピーはボタンでもできるようにする** — キーが効くのは表に
        焦点があるときだけで、押した人には効かない理由が分かりません。
      */}
      {/*
        ⚠️ **選んだときに現れる帯にしないこと**（実測で直した）。

        前は `rangeCount > 0` のときだけ出していたので、**升目を押した瞬間に
        この帯が生まれて表が 52px 下がって**いました。押し下げと押し上げの
        間に表が動くので、**二度押しの2回目が別の場所に落ちます** —
        つまり**その場で直す入力欄が、一度目の二度押しでは開きません**
        （二度目からは帯がもう出ているので開く、という気づきにくい形でした）。

        **枠は always 置いて、中身だけ入れ替えます。** 押し方（Ctrl+C / Ctrl+V）は
        書いていなければ誰も試さない — 常に出しておくほうが元々の意図にも合います。
        高さを変えないため、**コピーのボタンは選んでいなくても置き**（押せなくする）、
        `<p>` とボタンの組み合わせを両方の状態で同じにしてあります。
      */}
      {/* **升目の選択・コピーの帯はスマホでは出さない。** カードは升目を持たない */}
      {!isMobile && s.rows.length > 0 && (
        <div
          className={`rounded-note flex flex-wrap items-center gap-2 border px-3.5 py-2 ${
            grid.rangeCount > 0
              ? 'border-primary-border bg-primary-surface-weak'
              : 'border-border bg-surface-subtle'
          }`}
        >
          <p className="text-sub">
            {grid.rangeCount > 0 ? (
              <>
                <strong className="font-number font-bold">{grid.rangeCount}</strong> 升を選んでいます
                （Shift ＋ クリックで広げられます）
              </>
            ) : (
              <span className="text-muted-foreground">
                升目を押すと選べます（Shift ＋ クリックで広げられます）
              </span>
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={grid.rangeCount === 0}
            onClick={() => void grid.copy()}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />コピー（Ctrl+C）
          </Button>
          {canEdit && (
            <span className="text-note text-muted-foreground">
              Excel からは <strong className="font-bold">Ctrl+V</strong> で貼れます
              （書き換える前に、何がどう変わるかを出します）
            </span>
          )}
          {/*
            ⚠️ **選んでいないときも同じ数のボタンを置くこと**（実測で直した）。
            片方を出し入れすると、1280px では帯が1行から2行に折り返して
            **高さが 54px ↔ 98px で動き**、表がまた 15px ずれます
            （それでは帯を always にした意味がありません）。
          */}
          <Button
            variant="ghost"
            size="sm"
            disabled={grid.rangeCount === 0}
            onClick={grid.clear}
          >
            選択を解除
          </Button>
        </div>
      )}

      {s.isError && <ErrorPanel title="案件を読み込めませんでした" />}

      {s.isLoading ? (
        <div className="rounded-card flex items-center justify-center gap-2 border border-border bg-card py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />読み込んでいます
        </div>
      ) : s.rows.length === 0 ? (
        <EmptyState
          title="この条件に合う案件はありません"
          description={s.filters.issue
            ? 'このチェックに当たる案件はありません。上の「絞り込みを解除」で全部に戻せます。'
            : '絞り込みを解除か、検索語を変えてみてください。'}
        />
      ) : isMobile ? (
        <MobileLedgerCards rows={s.rows} /> // 既定表示9列のカード（詳細は同ファイル冒頭コメント）
      ) : (
        <LedgerTable
          rows={s.rows}
          shown={prefs.shown}
          selected={s.selected}
          onToggle={s.toggle}
          onToggleAll={s.toggleAll}
          canEdit={canEdit}
          canEditOne={canEditOne}
          canDelete={canBulk}
          onDeleteRow={s.handleDeleteRow}
          deletingId={s.deleteOne.isPending ? (s.deleteOne.variables ?? null) : null}
          sort={s.sort}
          onSort={s.onSort}
          grid={grid}
          users={users}
          customers={customers}
        />
      )}

      {/* ⚠️ **ページ送りは必ず出す。** 100 件はサーバーの上限なので、
          出さないと「これで全部だ」と読まれます */}
      {s.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={s.page <= 1} onClick={() => s.goPage(s.page - 1)}>前へ</Button>
          <span className="text-sub font-number">{s.page} / {s.totalPages}</span>
          <Button variant="outline" disabled={s.page >= s.totalPages} onClick={() => s.goPage(s.page + 1)}>次へ</Button>
        </div>
      )}
      <p className="text-note text-muted-foreground">
        1ページに出せるのは {PAGE_SIZE} 件までです（サーバーの上限）。
        まとめて直せるのは<strong className="font-bold">いま見えている行だけ</strong>です —
        見ていない行まで書き換えると、何を変えたのか確かめられなくなるためです。
        {/*
          **書き出しだけは別。** 読むだけなので全部出さないと確認に使えません。
          ⚠️ **上限も一緒に書く** — 「全部」とだけ書くと、2,000 件で切れた日に
          「これで全部だ」と読まれます（切れたことは帯にも出します）
        */}
        <strong className="font-bold">CSV は絞り込みに当たるものを全部書き出します</strong>
        （このページの {s.rows.length} 件だけではありません／一度に {CSV_MAX_ROWS} 件まで）。
      </p>

      <PastePlanDialog
        plan={grid.plan}
        saving={grid.saving}
        onClose={() => grid.setPlan(null)}
        onApply={grid.apply}
      />
      <ColumnPicker open={colsOpen} onOpenChange={setColsOpen} prefs={prefs} />
      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        targets={targets}
        users={users}
        customers={customers}
        saving={s.bulk.isPending}
        onSubmit={(set) => s.bulk.mutate(set, { onSuccess: () => setBulkOpen(false) })}
      />
    </div>
  );
}
