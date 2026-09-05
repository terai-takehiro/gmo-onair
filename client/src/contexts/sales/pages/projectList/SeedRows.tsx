/**
 * ③ 案件一覧 ／ 「ネタ」の見え方 (v4・モックの3つ目のタブ)
 *
 * ── リストと列が違うのはわざと ──────────────────────────────
 *
 * ネタはまだ案件になっていない引き合いなので、**金額も実施日もほとんど空**です。
 * リストと同じ列で出すと空欄が並ぶだけになります。モックはここだけ
 * 「お客様 ／ 要点 ／ 入口 ／ 確信 ／ 状態 ／ 受けた日」に組み替えていて、
 * 受付で読む順を決めるための並びになっています。
 *
 * ── 入口と確信は AI が入れたときだけ入っている ──────────────
 *
 * `projects.intake_channel` / `intake_confidence` (migration 165)。
 * **手で登録した案件は両方 NULL** が正しく、そのときは「—」を出します。
 * AI にも「分からなければ渡すな」と伝えてある (`create_project` の説明) ので、
 * 空は普通にあります。空を赤くしない — 「低い確信」と見分けが付かなくなります。
 *
 * ── 幅は7段から選ぶ ─────────────────────────────────────────
 *
 * お客様 200 ／ 要点 伸びる ／ 入口 96 ／ 確信 56 ／ 状態 72 ／ 受けた日 72。
 * モックの実測 (200 / flex / 86 / 52 / 76 / 78) にいちばん近い段に寄せています。
 */
import { Mail, Phone, Users, Globe, Handshake, Building2, HelpCircle } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { channelLabel, confidenceLabel, confidenceTone } from './intake';
import { rowInProps, type RowAnim } from './rowAnim';
import type { ProjectListRow } from './types';

const CHANNEL_ICON: Record<string, typeof Mail> = {
  mail: Mail,
  phone: Phone,
  inview: Building2,
  referral: Handshake,
  web: Globe,
  meeting: Users,
  group: Building2,
  other: HelpCircle,
};

export function SeedRowsHeader() {
  return (
    <RowHeader className="hidden sm:flex">
      <RowSlot w={200}>お客様</RowSlot>
      <RowMain>要点</RowMain>
      <RowSlot w={96}>入口</RowSlot>
      <RowSlot w={56}>確信</RowSlot>
      <RowSlot w={72}>状態</RowSlot>
      <RowSlot w={72} align="right">受けた日</RowSlot>
    </RowHeader>
  );
}

/**
 * 状態。**ステージ `e_lost` は画面ではどこでも「失注」**と呼ぶ（決めごと）。
 * ネタの並びでは「案件にしなかった」ものもここに入るが、理由マスタ側で
 * 「見送り（案件化せず）」と分けてあるので、失注分析のノイズにはならない。
 */
function stateOf(p: ProjectListRow): { label: string; tone: string } {
  if (p.stage === 'e_lost') return { label: '失注', tone: 'text-muted-foreground' };
  if (p.ai_reviewed_at) return { label: '確認済み', tone: 'text-secondary-foreground' };
  if (p.is_ai_created) return { label: '新しいネタ', tone: 'font-bold text-primary' };
  return { label: '手で登録', tone: 'text-secondary-foreground' };
}

/** `2026-08-07T…` → `8/07`。受けた日は「いつ待たせ始めたか」なので月日だけでよい */
function md(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
}

export function SeedRow({ p, row, onOpen }: { p: ProjectListRow; row?: RowAnim; onOpen: () => void }) {
  const Icon = CHANNEL_ICON[p.intake_channel ?? ''] ?? HelpCircle;
  const state = stateOf(p);

  return (
    <Row
      divider
      interactive
      data-flip-key={p.id}
      {...rowInProps(row)}
      stackOnMobile
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RowSlot w={200}>
        <span className="truncate text-list">{p.customer_name || 'お客様 未設定'}</span>
      </RowSlot>

      {/*
        要点は**案件名 ＋ メモの1行目**。ネタの段では案件名がそのまま用件になっている。
        メモは migration 184 でやり取り（`activity_logs`）に畳んだので、
        一覧はいちばん新しいメモを `memo_excerpt` として受け取る
      */}
      <RowMain>
        <RowTitle>{p.name}</RowTitle>
        {p.memo_excerpt && <RowSub>{p.memo_excerpt.split('\n')[0]}</RowSub>}
      </RowMain>

      <RowSlot w={96} hideOnMobile>
        <span className="flex items-center gap-1.5 text-sub-sm text-secondary-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {channelLabel(p.intake_channel)}
        </span>
      </RowSlot>

      <RowSlot w={56}>
        <TableBadge label={confidenceLabel(p.intake_confidence)} w={null} className={confidenceTone(p.intake_confidence)} />
      </RowSlot>

      <RowSlot w={72} hideOnMobile>
        <span className={`text-sub-sm ${state.tone}`}>{state.label}</span>
      </RowSlot>

      <RowSlot w={72} align="right" hideOnMobile>
        <span className="font-number text-sub-sm text-muted-foreground">{md(p.created_at)}</span>
      </RowSlot>
    </Row>
  );
}
