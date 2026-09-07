/**
 * 隔週キープの数字 — ③新規案件獲得（定期内覧会）
 *
 * 参加の組数・人数・分類別の表は内覧会アプリの受付から。**満足度だけは ONAiR に無い**
 * （Kairos3 のアンケートの値）ので、ここで手入力する（`keep_report_inputs` の
 * `inview_satisfaction`。会議日ごとに1つ）。直せるのは日常業務の editor。
 */
import { useState } from 'react';
import { DoorOpen, Pencil } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSlot, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { InviewSummary } from '@gmo-onair/shared/src/keepReport/types';
import { Button } from '@/components/ui/button';
import { useSaveKeepInput } from '@/lib/keepApi';
import { SectionHead } from './SectionHead';
import { mdLabel } from './format';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-sub-sm text-muted-foreground">{label}</span>
      <span className="flex items-baseline gap-1">{children}</span>
    </span>
  );
}

const UNIT = 'text-sub text-muted-foreground';

/** 満足度の欄。数字 ＋ 鉛筆。押すと同じ場所が入力欄になる（画面遷移させない） */
function Satisfaction({ value, meeting, canEdit }: { value: number | null; meeting: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const save = useSaveKeepInput(meeting);

  const submit = () => {
    const score = Number(draft);
    if (draft === '' || !Number.isFinite(score) || score < 0 || score > 4) return; // 4.0 満点（Kairos3 のアンケート）
    save.mutate({ key: 'inview_satisfaction', value: { score } }, {
      onSuccess: () => { setEditing(false); notifySuccess('満足度を保存しました'); },
      onError: (e) => notifyApiError('満足度を保存できませんでした', e),
    });
  };

  if (editing) {
    return (
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          step="0.1"
          min="0"
          max="4"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setEditing(false); }}
          aria-label="満足度（4.0 満点）"
          className="font-number text-list h-9 w-20 rounded-control border border-border bg-background px-2 text-right focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <span className={UNIT}>/ 4.0</span>
        <Button type="button" size="sm" onClick={submit} disabled={save.isPending || draft === ''}>保存</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>やめる</Button>
      </span>
    );
  }
  return (
    <>
      {value === null
        ? <span className="text-sub text-muted-foreground">未入力</span>
        : <StatValue size="sm">{value.toFixed(1)}</StatValue>}
      <span className={UNIT}>/ 4.0</span>
      {canEdit && meeting && (
        <button
          type="button"
          onClick={() => { setDraft(value === null ? '' : String(value)); setEditing(true); }}
          aria-label="満足度を入れる"
          className="ml-1 flex h-11 w-11 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground lg:h-8 lg:w-8"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </>
  );
}

export function InviewCard({ inview, meeting, canEdit }: { inview: InviewSummary | null; meeting: string | null; canEdit: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-3">
      <SectionHead
        icon={DoorOpen}
        title="定期内覧会"
        note="内覧会アプリの受付実績。ヨミ化した件数は、来場者から起票した案件を数えます"
      />
      {!inview ? (
        <p className="text-sub text-muted-foreground">直近の定期内覧会の回はまだありません。内覧会アプリに開催日を登録するとここに出ます</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
          <div className="min-w-0 rounded-card border border-border bg-card p-4 xl:col-span-2">
            <div className="flex items-center gap-2">
              <span className="text-cardtitle"><span className="font-number">{mdLabel(inview.session_date)}</span> 開催</span>
              {inview.session_date < today
                ? <TableBadge label="受付終了" w={null} className="bg-muted text-muted-foreground" />
                : <TableBadge label="受付中" w={null} className="border-success-border bg-success-surface text-success" />}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
              <Stat label="参加">
                <StatValue size="sm">{inview.groups}</StatValue><span className={UNIT}>組 ・</span>
                <StatValue size="sm">{inview.people}</StatValue><span className={UNIT}>名</span>
              </Stat>
              <Stat label="満足度">
                <Satisfaction value={inview.satisfaction} meeting={meeting} canEdit={canEdit} />
              </Stat>
              <Stat label="ヨミ化">
                <StatValue size="sm">{inview.promoted_projects}</StatValue><span className={UNIT}>案件</span>
              </Stat>
              <Stat label="次回">
                {inview.next_session
                  ? <><StatValue size="sm">{mdLabel(inview.next_session.date)}</StatValue><span className={UNIT}>・ 申込 {inview.next_session.applied_groups}組</span></>
                  : <span className="text-sub text-muted-foreground">未定</span>}
              </Stat>
            </div>
            <p className="text-sub-sm mt-3 text-muted-foreground">満足度はアンケート（Kairos3）の値を手で入れます。ONAiR には無い数字です</p>
          </div>
          <div className="min-w-0 overflow-hidden rounded-card border border-border bg-card xl:col-span-3">
            <RowHeader>
              <RowMain>来場者の分類</RowMain>
              <RowSlot w={56} align="right">組数</RowSlot>
              <RowSlot w={72} align="right">来場人数</RowSlot>
            </RowHeader>
            {inview.by_category.length === 0 && (
              <p className="text-sub px-4 py-4 text-muted-foreground">分類のある来場者はまだいません</p>
            )}
            {inview.by_category.map((c) => (
              <Row key={c.category} density="table" divider>
                <RowMain><RowTitle className="font-normal">{c.category}</RowTitle></RowMain>
                <RowSlot w={56} align="right"><span className="font-number text-sub">{c.groups}</span></RowSlot>
                <RowSlot w={72} align="right"><span className="font-number text-sub">{c.people}</span></RowSlot>
              </Row>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
