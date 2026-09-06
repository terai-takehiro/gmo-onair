/**
 * 隔週キープの数字 — ①数値報告（当月 着地 ／ 翌月 着地見込 ／ 主体別）
 *
 * 資料の p.13/14 と同じ6行（売上高・原価（案件仕入）・粗利・販管費・償却相当額・
 * 営業利益）× 目標／実績／判定／対目標比／対目標。**判定・比率・差はサーバーが
 * 計算した値をそのまま出す**（`docs/design/v4/keep-report.md` §5.3。8/13 の資料で
 * 手計算の写し間違いがそのまま会議に出た）。ここでやるのは千円への丸めだけ。
 *
 * 列幅は `RowSlot` の7段から（千円は 72・判定は 56）。2枚並べると 1440px で
 * 名前列に 129px 残る計算で、それより狭い画面では表の中だけ横に流す。
 */
import { AlertTriangle, Table2 } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSlot, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { formatNum } from '@gmo-onair/shared/src/client/ui/numbers';
import type {
  BudgetLine, BusinessEntity, EntityScope, Judge, KeepReportPack, MonthlyPlTable, PlByEntity,
} from '@gmo-onair/shared/src/keepReport/types';
import { BUSINESS_ENTITY_LABELS } from '@gmo-onair/shared/src/keepReport/types';
import { SectionHead } from './SectionHead';
import { mdLabel, pctLabel, scopeTitle, toThousandYen, ymLabel } from './format';

const JUDGE_TONE: Record<Judge, string> = {
  '○': 'text-success',
  '✕': 'text-destructive',
  '-': 'text-muted-foreground',
};
/** 対目標比の色。資料と同じく、達している行は青（主色）・足りない行は赤 */
const RATIO_TONE: Record<Judge, string> = {
  '○': 'text-primary',
  '✕': 'text-destructive',
  '-': 'text-muted-foreground',
};

/** 千円の1マス。null は「目標が無い」= 薄い「—」。負の数は赤 */
function KYen({ value, strong }: { value: number | null | undefined; strong?: boolean }) {
  const k = toThousandYen(value);
  const text = formatNum(k);
  if (text === null) return <span className="font-number text-muted-foreground">—</span>;
  const neg = (k ?? 0) < 0;
  return (
    <span className={`font-number whitespace-nowrap ${strong ? 'text-list' : 'text-sub'} ${neg ? 'text-destructive' : ''}`}>
      {text}
    </span>
  );
}

function JudgeMark({ judge }: { judge: Judge }) {
  return <span className={`text-list ${JUDGE_TONE[judge] ?? ''}`}>{judge}</span>;
}

const AUTO_BADGE = 'border-primary-border bg-primary-surface text-primary';

function CardHead({ title, note, table }: { title: string; note: string; table: MonthlyPlTable }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-3">
      <h4 className="text-cardtitle whitespace-nowrap">{title}</h4>
      <span className="text-sub-sm text-muted-foreground">{note}</span>
      <span className="ml-auto flex items-center gap-1.5">
        {table.has_override && (
          <TableBadge
            label="経理の補正あり"
            w={null}
            className="border-warning-border bg-warning-surface text-warning"
            title={table.override_note ?? undefined}
          />
        )}
        <TableBadge label="自動集計" w={null} className={AUTO_BADGE} />
      </span>
    </div>
  );
}

/** 1表（6行）。`actualHead` は 着地 か 見通し */
function PlCard({ table, title, actualHead }: { table: MonthlyPlTable; title: string; actualHead: string }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <CardHead title={title} note="単位: 千円" table={table} />
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <RowHeader>
            <RowMain>項目</RowMain>
            <RowSlot w={72} align="right">目標</RowSlot>
            <RowSlot w={72} align="right">{actualHead}</RowSlot>
            <RowSlot w={56} align="center">判定</RowSlot>
            <RowSlot w={72} align="right">対目標比</RowSlot>
            <RowSlot w={72} align="right">対目標</RowSlot>
          </RowHeader>
          {table.lines.map((line) => <PlRow key={line.key} line={line} />)}
        </div>
      </div>
      {table.unconfirmed.length > 0 && <UnconfirmedNote items={table.unconfirmed} />}
    </div>
  );
}

function PlRow({ line }: { line: BudgetLine }) {
  const last = line.key === 'operating_profit';
  return (
    <Row density="table" divider className={last ? 'bg-primary-surface-weak' : undefined}>
      <RowMain><RowTitle className={last ? 'font-extrabold' : undefined}>{line.label}</RowTitle></RowMain>
      <RowSlot w={72} align="right"><KYen value={line.budget} /></RowSlot>
      <RowSlot w={72} align="right"><KYen value={line.actual} strong /></RowSlot>
      <RowSlot w={56} align="center"><JudgeMark judge={line.judge} /></RowSlot>
      <RowSlot w={72} align="right">
        <span className={`font-number text-list ${line.ratio === null ? 'text-muted-foreground' : RATIO_TONE[line.judge]}`}>
          {pctLabel(line.ratio)}
        </span>
      </RowSlot>
      <RowSlot w={72} align="right"><KYen value={line.diff} /></RowSlot>
    </Row>
  );
}

/**
 * 見通しに入れた「まだ確定していない売上」。資料の注記の材料になるので、
 * 表の下に**消えない帯**で出し、案件へ飛べるようにする（案件管理は別バンドルなので素の `<a>`）。
 */
function UnconfirmedNote({ items }: { items: MonthlyPlTable['unconfirmed'] }) {
  const shown = items.slice(0, 3);
  return (
    <div className="flex flex-col gap-1 border-t border-border-faint bg-warning-surface px-4 py-2">
      {shown.map((u, i) => (
        <div key={u.project_id} className="flex min-w-0 items-center gap-2">
          {i === 0
            ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            : <span className="w-3.5 shrink-0" aria-hidden="true" />}
          {i === 0 && <span className="text-sub-sm shrink-0 font-bold text-warning">未確定 {items.length}件</span>}
          <span className="text-sub-sm min-w-0 flex-1 truncate text-foreground">
            {u.project_name} — 売上 <Money value={u.amount} inline className="text-sub-sm" /> がまだ確定売上になっていません
          </span>
          <a
            href={`/sales/projects/${u.project_id}`}
            className="text-sub-sm shrink-0 whitespace-nowrap font-bold text-primary hover:underline"
          >
            案件を開く
          </a>
        </div>
      ))}
      {items.length > shown.length && (
        <span className="text-sub-sm pl-6 text-muted-foreground">ほか {items.length - shown.length} 件</span>
      )}
    </div>
  );
}

/** 主体別の表（主体ごとの 目標／実績／判定 ＋ 全体の 目標／実績）。`gig` は数字があるときだけ列を足す */
const GROUP_W = 72 + 72 + 56 + 12 * 2;   // RowSlot 3つ ＋ gap-3 ×2
const ALL_W = 72 + 72 + 12;

function ByEntityCard({ by, title, actualHead }: { by: PlByEntity; title: string; actualHead: string }) {
  const entities: BusinessEntity[] = ['gss', 'gscs', ...(by.gig ? (['gig'] as BusinessEntity[]) : [])];
  const tables = entities.map((e) => by[e]!).filter(Boolean);
  const lines = by.all.lines;
  const sub: Record<BusinessEntity, string> = { gss: 'グループ内', gscs: '外部', gig: '人格' };
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <CardHead
        title={title}
        note="売上・原価は案件の主体で、販管費・償却相当額は台帳の主体で分けます ・ 全体 ＝ 主体の合計"
        table={by.all}
      />
      <div className="overflow-x-auto">
        <div className="min-w-[880px]">
          <Row density="table" align="start" className="border-b border-border-subtle bg-surface-subtle">
            <RowMain><span className="text-th text-muted-foreground">項目（千円）</span></RowMain>
            {entities.map((e) => (
              <div key={e} className="flex shrink-0 flex-col items-end" style={{ width: GROUP_W }}>
                <span className="text-th">{BUSINESS_ENTITY_LABELS[e]}</span>
                <span className="text-sub-sm text-muted-foreground">{sub[e]} ・ 目標／{actualHead}／判定</span>
              </div>
            ))}
            <div className="shrink-0 border-l border-border-subtle pl-3">
              <div className="flex flex-col items-end" style={{ width: ALL_W }}>
                <span className="text-th">全体（統合）</span>
                <span className="text-sub-sm text-muted-foreground">目標／{actualHead}</span>
              </div>
            </div>
          </Row>
          {lines.map((line, idx) => {
            const last = line.key === 'operating_profit';
            return (
              <Row key={line.key} density="table" divider className={last ? 'bg-primary-surface-weak' : undefined}>
                <RowMain><RowTitle className={last ? 'font-extrabold' : undefined}>{line.label}</RowTitle></RowMain>
                {tables.map((t, ti) => {
                  const l = t.lines[idx] ?? t.lines.find((x) => x.key === line.key);
                  return (
                    <div key={entities[ti]} className="flex shrink-0 items-center gap-3">
                      <RowSlot w={72} align="right"><KYen value={l?.budget ?? null} /></RowSlot>
                      <RowSlot w={72} align="right"><KYen value={l?.actual ?? null} strong /></RowSlot>
                      <RowSlot w={56} align="center">{l ? <JudgeMark judge={l.judge} /> : null}</RowSlot>
                    </div>
                  );
                })}
                <div className="flex shrink-0 items-center gap-3 border-l border-border-subtle pl-3">
                  <RowSlot w={72} align="right"><KYen value={line.budget} /></RowSlot>
                  <RowSlot w={72} align="right"><KYen value={line.actual} strong /></RowSlot>
                </div>
              </Row>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-faint bg-surface-subtle px-4 py-2">
        <span className="text-sub-sm text-muted-foreground">
          GMOインターネットグループ人格は数字があるときだけ列を足します。翌月の見込も同じ形で出ます
        </span>
        <a href="/settings/money" className="text-sub-sm ml-auto whitespace-nowrap font-bold text-primary hover:underline">
          主体ごとの予算を入れる（お金のルール）
        </a>
      </div>
    </div>
  );
}

export function PlTables({ pack, entity }: { pack: KeepReportPack; entity: EntityScope }) {
  const landing = pack.landing[entity] ?? pack.landing.all;
  const forecast = pack.forecast[entity] ?? pack.forecast.all;
  const scope = scopeTitle(pack.landing[entity] ? entity : 'all');
  return (
    <div className="flex flex-col gap-3">
      <SectionHead
        icon={Table2}
        title="数値報告"
        note="目標は「お金のルール」の月次予算、着地は確定売上・仕入・販管費・償却相当額。判定と比率は毎回ここで計算します"
        right={pack.previous_meeting_date ? (
          <span className="text-sub-sm text-muted-foreground">前回の会議 {mdLabel(pack.previous_meeting_date)}</span>
        ) : undefined}
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PlCard table={landing} title={`${ymLabel(landing.year_month)} 着地 ・ ${scope}`} actualHead="着地" />
        <PlCard table={forecast} title={`${ymLabel(forecast.year_month)} 着地見込 ・ ${scope}`} actualHead="見通し" />
      </div>
      <ByEntityCard by={pack.landing} title={`${ymLabel(landing.year_month)} 着地 ・ 主体別`} actualHead="着地" />
    </div>
  );
}
