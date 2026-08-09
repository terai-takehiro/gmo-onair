/**
 * 案件詳細 / 概要タブ (v4 ⑥)
 *
 * モックは **左に本文・右に 320px の欄**の2段組で、上に「事実の帯」を置きます。
 * 事実の帯に出すのは**その案件で真っ先に確認されるもの**だけ:
 * 実施日 / 会場・スタジオ / 金額 / 次にやること。
 *
 * ── 直すのはここではありません ────────────────────────────
 *
 * この画面は**読む場所**です。直すのは見出しの鉛筆から入る編集画面
 * (`/sales/projects/:id/edit`)。1つの画面で読むと直すを兼ねると、
 * 入力欄が並ぶだけになって「いまどうなっているか」が読み取れなくなります
 * (いまの 2,178 行の画面がまさにそれでした)。
 */
import { CalendarDays, MapPin, Wallet, CalendarClock, Building2, Tag, ExternalLink } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { ProjectTypeLabels } from '@/types';
import { classificationLabel } from '@/contexts/sales/classification';
import { channelLabel } from '../projectList/intake';
import { AiReviewBanner } from './AiReviewBanner';
import type { ProjectDetail, StudioBooking, ActivityLog } from './types';

/** 事実の帯の1枠 */
function Fact({
  icon: Icon, label, children,
}: { icon: typeof CalendarDays; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-l border-border-subtle px-4 first:border-l-0">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sub-sm text-muted-foreground">{label}</span>
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card">
      <h2 className="text-cardtitle border-b border-border-subtle px-4 py-3">{title}</h2>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** 名前と値が縦に並ぶ表。**値が無い行も残す** (無いことが分かるように) */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border-faint py-2 last:border-b-0">
      <span className="text-sub w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-sub min-w-0 flex-1 text-foreground">{children || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

export function OverviewTab({
  project, bookings, activities,
}: {
  project: ProjectDetail;
  bookings: StudioBooking[];
  activities: ActivityLog[];
}) {
  const revenue = Number(project.total_revenue) || 0;
  const expected = Number(project.expected_amount) || 0;
  const amount = revenue > 0 ? revenue : expected > 0 ? expected : null;

  // 未完了で期限がいちばん近い次回アクション。**無いことも出す** (空欄にしない)
  const nextAction = activities
    .filter((a) => a.next_action && !a.next_action_done_at)
    .sort((a, b) => (a.next_action_date ?? '9999').localeCompare(b.next_action_date ?? '9999'))[0];

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
      <div className="flex min-w-0 flex-col gap-3.5">
        {/*
          AI が作った案件だけに出る帯。**「確認した」はここにしかありません** —
          押されるまで「まだ誰も見ていない案件」として待ち行列に残ります。
        */}
        {project.is_ai_created && (
          <AiReviewBanner projectId={project.id} reviewedAt={project.ai_reviewed_at} />
        )}

        {/* 事実の帯 */}
        <div className="grid grid-cols-2 gap-y-4 rounded-card border border-border bg-card px-1 py-4 lg:grid-cols-4">
          <Fact icon={CalendarDays} label="実施日">
            <DateRange start={project.event_start} end={project.event_end} className="text-list" />
          </Fact>
          <Fact icon={MapPin} label="会場・スタジオ">
            {bookings.length === 0 ? (
              <span className="text-sub text-muted-foreground">押さえていません</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {bookings.slice(0, 4).map((b) => (
                  <span key={b.id} className="text-sub rounded-control-md bg-muted px-2 py-0.5 font-bold">
                    {b.room_name ?? b.location_name ?? '部屋 未設定'}
                  </span>
                ))}
                {bookings.length > 4 && (
                  <span className="text-sub-sm self-center text-muted-foreground">ほか {bookings.length - 4}</span>
                )}
              </div>
            )}
          </Fact>
          <Fact icon={Wallet} label={revenue > 0 ? '確定した売上' : '想定金額'}>
            <Money value={amount} className="text-list w-full" />
          </Fact>
          <Fact icon={CalendarClock} label="次にやること">
            {nextAction ? (
              <>
                <p className="text-sub truncate font-bold" title={nextAction.next_action ?? ''}>{nextAction.next_action}</p>
                {nextAction.next_action_date && (
                  <p className="text-sub-sm font-number text-muted-foreground">{nextAction.next_action_date}</p>
                )}
              </>
            ) : (
              <span className="text-sub text-warning">決まっていません</span>
            )}
          </Fact>
        </div>

        {/*
          並びは**登録の16項目と同じ**にしてある（`projectNew/fields.ts`）。
          入れた順に読めないと、どこに入れた値なのかを探すことになる。
          `Field` は中身が空なら「—」を出すので、空欄でも列がずれない
        */}
        <Section title="この案件のこと">
          <Field label="お客様">{project.customer_name}</Field>
          <Field label="ご担当">{project.contact_name}</Field>
          {/*
            **案件分類は2段**（migration 181）。2つ揃っているときはそれを出し、
            揃っていない古い案件は旧「種類」を出します — **どちらも出さないと
            分類が空欄に見えます**（2段が入る前の案件は全部そう見える）。
          */}
          <Field label="案件分類">
            {classificationLabel(project.audience, project.project_category)
              ?? (project.project_type
                ? ProjectTypeLabels[project.project_type as keyof typeof ProjectTypeLabels] ?? project.project_type
                : null)}
          </Field>
          <Field label="継続区分">
            {project.recurrence === 'regular' ? 'レギュラー（回を持つ）' : '単発'}
          </Field>
          {/* **無観客の案件には来場人数を出さない**（人が来ないので欄ごと意味が無い） */}
          {project.audience !== 'no_audience' && (
            <Field label="来場人数">
              {project.attendee_count ? <><span className="font-number">{project.attendee_count}</span> 名</> : null}
            </Field>
          )}
          <Field label="案件内容">{project.goal}</Field>
          {/*
            **返事の期限と求められているものは、案件作成のフォームから外しました。**
            列は残っているので、**すでに入っている案件では読めるようにしておきます**
            （新しい案件には入りません）。空の案件では欄ごと出しません
          */}
          {project.reply_due && (
            <Field label="返事の期限"><span className="font-number">{project.reply_due}</span></Field>
          )}
          {project.wants && <Field label="求められているもの">{project.wants}</Field>}
          <Field label="リード経路">{channelLabel(project.intake_channel) === '—' ? null : channelLabel(project.intake_channel)}</Field>
          <Field label="GLS 番号">
            {project.gls_number ?? <span className="text-muted-foreground">まだ発番していません（ヨミ段階）</span>}
          </Field>
          <Field label="社内コード">{project.code}</Field>
          <Field label="メモ">
            {project.notes ? <span className="whitespace-pre-line">{project.notes}</span> : null}
          </Field>
        </Section>

        <Section title="お客様とのやり取り">
          {activities.length === 0 ? (
            <p className="text-sub text-muted-foreground">
              記録はまだありません。メールは AI が自動で取り込みます。
            </p>
          ) : (
            <ul className="flex flex-col">
              {activities.slice(0, 5).map((a) => (
                <li key={a.id} className="flex gap-3 border-b border-border-faint py-2 last:border-b-0">
                  <span className="text-sub-sm font-number w-20 shrink-0 text-muted-foreground">
                    {a.activity_date}
                  </span>
                  <span className="text-sub min-w-0 flex-1">
                    <span className="block truncate font-bold">{a.subject}</span>
                    {a.next_action && (
                      <span className="text-sub-sm block truncate text-muted-foreground">
                        次: {a.next_action}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* 右の欄。スマホでは本文の下に回ります */}
      <div className="flex flex-col gap-3.5">
        <Section title="BOX">
          {project.box_url_internal || project.box_url_external ? (
            <div className="flex flex-col gap-2">
              {project.box_url_internal && (
                <a href={project.box_url_internal} target="_blank" rel="noopener noreferrer"
                   className="text-sub inline-flex min-h-tap items-center gap-1.5 text-primary hover:underline lg:min-h-[36px]">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />社内限りのフォルダ
                </a>
              )}
              {project.box_url_external && (
                <a href={project.box_url_external} target="_blank" rel="noopener noreferrer"
                   className="text-sub inline-flex min-h-tap items-center gap-1.5 text-primary hover:underline lg:min-h-[36px]">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />社外と共有するフォルダ
                </a>
              )}
            </div>
          ) : (
            <p className="text-sub text-muted-foreground">まだ作られていません。GLS を発番すると作られます。</p>
          )}
        </Section>

        <Section title="押さえている部屋">
          {bookings.length === 0 ? (
            <p className="text-sub text-muted-foreground">押さえていません。</p>
          ) : (
            <ul className="flex flex-col">
              {bookings.map((b) => (
                <li key={b.id} className="flex gap-2 border-b border-border-faint py-2 last:border-b-0">
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="text-sub block truncate font-bold">
                      {b.room_name ?? b.location_name ?? '部屋 未設定'}
                    </span>
                    <span className="text-sub-sm font-number block text-muted-foreground">
                      {b.booking_date}{b.start_time ? ` ${b.start_time.slice(0, 5)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="タグ">
          {project.tags ? (
            <div className="flex flex-wrap gap-1.5">
              {project.tags.split(',').filter(Boolean).map((t) => (
                <span key={t} className="text-sub inline-flex items-center gap-1 rounded-chip bg-muted px-2.5 py-1">
                  <Tag className="h-3 w-3 text-muted-foreground" aria-hidden="true" />{t}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sub text-muted-foreground">付いていません。</p>
          )}
        </Section>

        <p className="text-sub-sm px-1 text-muted-foreground">
          最後の更新 {formatRelativeTime(project.updated_at)}
        </p>
      </div>
    </div>
  );
}
