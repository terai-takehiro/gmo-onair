/**
 * ④ 新規作成 ステップ5 — 確かめて作る（PR③・項目18）
 *
 * ── 4段目と5段目が同じ部品を描いていた不具合を直す ──────────────
 *
 * 以前は `GpmProjectFormPage.tsx` が `step === 4 || step === 5` の両方で
 * `OrgStep` を描いていた——ラベルは「体制（組織図）」「メンバー・書類」で
 * 違うのに、中身は1ピクセルも変わらなかった。5段目を実際に
 * **入れた内容の確認**にする（体制は4段目だけで完結させる）。
 *
 * ── ここでは何も編集させない ────────────────────────────────
 *
 * 直したくなったら該当の段（1〜4）へ戻ればよい。上の段のタブは
 * いつでも押して直接行ける（`GpmProjectFormPage` の元の設計）ので、
 * この段に確認以外の入力を持たせる必要が無い。
 */
import { Users } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import { SIDE_LABEL, TIER_LABEL, KIND_LABEL } from '../../types';
import type { BasicValues } from './BasicStep';
import type { DraftMember } from './OrgStep';
import { previewSchedule, previewEnd, totalDays, type PreviewSource } from './schedule';

export interface ReviewStepProps {
  basic: BasicValues;
  customerName: string | null;
  pmUserName: string | null;
  templateName: string | null;
  template: PreviewSource | undefined;
  startedOn: string;
  members: DraftMember[];
}

export function ReviewStep({
  basic, customerName, pmUserName, templateName, template, startedOn, members,
}: ReviewStepProps) {
  const rows = previewSchedule(template, startedOn);
  const end = previewEnd(rows);
  const days = totalDays(rows);

  return (
    <div className="space-y-3.5">
      <section className="rounded-card border border-border bg-card p-4 lg:px-5">
        <h2 className="text-cardtitle mb-3">基本情報</h2>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          <ReviewRow label="プロジェクト名" value={basic.name || '（未入力）'} />
          <ReviewRow label="区分" value={KIND_LABEL[basic.kind]} />
          <ReviewRow
            label="依頼元"
            value={basic.kind === 'self_build' ? '自社（GMOグローバルスタジオ）' : (customerName ?? '未定')}
          />
          <ReviewRow label="PM会社" value={basic.kind === 'group_order' ? (basic.pmCompany || '自社PM です') : '自社PM です'} />
          <ReviewRow label="自社担当（PM）" value={pmUserName ?? '未定'} />
          <ReviewRow label="いまの段" value={STAGE_BADGE_LABEL[basic.stage]} />
        </dl>
        {basic.notes && (
          <p className="text-sub mt-3 whitespace-pre-wrap border-t border-border-faint pt-3 text-foreground">
            {basic.notes}
          </p>
        )}
      </section>

      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border-subtle p-4 lg:px-5">
          <h2 className="text-cardtitle">工程</h2>
          {rows.length === 0 ? (
            <p className="text-note text-muted-foreground">
              工程テンプレートを選んでいないので工程はまだありません。作ったあとに足せます。
            </p>
          ) : (
            <p className="text-note text-muted-foreground">
              {templateName ?? 'テンプレート'} ・ 工程 <span className="font-number">{rows.length}</span> ・
              目安 <span className="font-number">{days}</span>日
              {startedOn && end && (
                <> ・ <DateRange short start={startedOn} end={end} /> の見込み</>
              )}
              {!startedOn && '（着手日は未入力 — 日付は空のまま入ります）'}
            </p>
          )}
        </div>
        {rows.length > 0 && (
          <>
            <RowHeader className="hidden sm:flex">
              <RowSlot w={56} align="right">#</RowSlot>
              <RowMain>工程</RowMain>
              <RowSlot w={96}>担当ロール</RowSlot>
              <RowSlot w={128}>期間</RowSlot>
            </RowHeader>
            {rows.map((p, i) => (
              <Row key={`${p.label}-${i}`} divider stackOnMobile>
                <RowSlot w={56} align="right" className="text-sub-sm font-number text-muted-foreground">
                  {i + 1}
                </RowSlot>
                <RowMain><RowTitle>{p.label}</RowTitle></RowMain>
                <RowSlot w={96} className="text-sub" hideOnMobile>{p.role}</RowSlot>
                <RowSlot w={128}>
                  <DateRange short start={p.start} end={p.end} className="text-sub" />
                </RowSlot>
              </Row>
            ))}
          </>
        )}
      </section>

      <section className="rounded-card border border-border bg-card p-4 lg:px-5">
        <h2 className="text-cardtitle mb-1">体制</h2>
        {members.length === 0 ? (
          <p className="text-sub flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" aria-hidden="true" />
            まだ誰も入れていません（あとから体制タブで足せます）
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {members.map((m, i) => (
              <li key={`${m.name}-${i}`} className="text-sub flex flex-wrap items-baseline gap-x-2">
                <span className="font-bold">{m.name}</span>
                <span className="text-sub-sm text-muted-foreground">
                  {[TIER_LABEL[m.tier], m.group_label || SIDE_LABEL[m.side], m.role].filter(Boolean).join(' ・ ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-note text-muted-foreground">
        <strong className="font-bold">「作成」を押すとこの内容でプロジェクトができます。</strong>
        直したいところがあれば、上の番号を押してその段に戻ってください。
      </p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 border-b border-border-faint py-1.5 text-sub sm:border-0 sm:py-0">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-bold">{value}</dd>
    </div>
  );
}
