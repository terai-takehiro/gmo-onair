import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft, CalendarCheck, CheckCircle2, CircleDashed, Sparkles,
  Plus, Trash2, Pencil, X, Check, BarChart3, Bot, ListChecks,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReport, useAddItem, useUpdateItem, useDeleteItem, usePublishReport } from '@/lib/reportsApi';
import { usePermissions } from '@/hooks/usePermissions';
import {
  WEEKLY_CATEGORIES, STAGE_LABELS, ACTIVITY_TYPE_LABELS,
  formatWeekJa, formatDateJa, formatYen, type OpsReportItem,
} from '@/lib/types';

interface StatsShape {
  period?: { week_start: string; week_end: string };
  new_projects?: { count: number; ai_count: number; items: Array<Record<string, unknown>> };
  activities?: { count: number; ai_count: number; by_type: Array<{ activity_type: string; count: number }> };
  pipeline?: Array<{ stage: string; count: number; expected_amount: number }>;
  revenue?: { week_total: number; month_total: number; month: string };
  events_this_week?: Array<Record<string, unknown>>;
  next_week?: {
    events: Array<Record<string, unknown>>;
    next_actions: Array<Record<string, unknown>>;
  };
}

export default function WeeklyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading } = useReport(id);
  const { canEdit } = usePermissions();
  const publish = usePublishReport();

  if (isLoading || !report) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const stats = (report.payload as { stats?: StatsShape } | null)?.stats;
  const isPublished = report.status === 'published';
  const editable = canEdit && !isPublished;

  const onPublish = () => {
    if (!window.confirm('このレポートを確認・確定 (公開) しますか？\n確定後はトピックの追記ができなくなります。')) return;
    publish.mutate(report.id);
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-5">
      {/* ヘッダー */}
      <div className="space-y-2">
        <Link to="/weekly" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> 一覧へ戻る
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              {report.title || `週次活動報告`}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formatWeekJa(report.period_key)}</span>
              {isPublished ? (
                <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> 確定済み
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                  <CircleDashed className="h-3 w-3" /> 下書き
                </Badge>
              )}
              {(report.created_by === 'mcp-claude' || !!report.requested_by) && (
                <Badge variant="outline" className="gap-1 border-violet-300 text-violet-700">
                  <Sparkles className="h-3 w-3" /> AI 起票
                  {report.requested_by ? ` (指示: ${report.requested_by})` : ''}
                </Badge>
              )}
            </div>
          </div>
          {editable && (
            <Button onClick={onPublish} disabled={publish.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              確認・確定
            </Button>
          )}
        </div>
        {isPublished && report.published_at && (
          <p className="text-xs text-muted-foreground">
            {new Date(report.published_at).toLocaleString('ja-JP')} に確定済み
          </p>
        )}
      </div>

      {/* ① 自動集計 */}
      <SectionTitle icon={BarChart3} title="自動集計" sub="投稿時点の ONAiR データのスナップショット" />
      {stats ? <StatsSection stats={stats} /> : (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          集計データはまだありません (AI が投稿すると表示されます)
        </CardContent></Card>
      )}

      {/* ② AI 本文 */}
      <SectionTitle icon={Bot} title="AI サマリー" sub="AI が集計を文章化したレポート本文" />
      <Card>
        <CardContent className="p-4 sm:p-5">
          {report.body ? (
            <div className="md-body text-sm leading-relaxed">
              <ReactMarkdown>{report.body}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">AI 本文はまだありません</p>
          )}
        </CardContent>
      </Card>

      {/* ③ 週次トピックス (人間の追記) */}
      <SectionTitle icon={ListChecks} title="週次トピックス" sub="カテゴリ・内容・補足を行単位で追記 (確定後は編集不可)" />
      <TopicsSection items={report.items ?? []} reportId={report.id} editable={editable} />
    </div>
  );
}

function SectionTitle({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="font-semibold text-sm">{title}</h2>
      {sub && <span className="text-xs text-muted-foreground hidden sm:inline">— {sub}</span>}
    </div>
  );
}

// ============ 集計セクション ============

function StatsSection({ stats }: { stats: StatsShape }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiTile label="新規案件" value={`${stats.new_projects?.count ?? 0} 件`} sub={aiSub(stats.new_projects?.ai_count)} />
        <KpiTile label="営業活動" value={`${stats.activities?.count ?? 0} 件`} sub={aiSub(stats.activities?.ai_count)} />
        <KpiTile label="売上 (週)" value={formatYen(stats.revenue?.week_total ?? 0)} />
        <KpiTile label={`売上 (${stats.revenue?.month?.slice(5) ?? ''}月 累計)`} value={formatYen(stats.revenue?.month_total ?? 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* パイプライン */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">パイプライン現況</p>
            {stats.pipeline?.length ? (
              <div className="space-y-1">
                {stats.pipeline.map((p) => (
                  <div key={p.stage} className="flex items-center justify-between text-sm">
                    <span>{STAGE_LABELS[p.stage] ?? p.stage}</span>
                    <span className="text-muted-foreground">
                      {p.count} 件{Number(p.expected_amount) > 0 && ` ・ ${formatYen(Number(p.expected_amount))}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">進行中の案件はありません</p>}
          </CardContent>
        </Card>

        {/* 活動内訳 */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">営業活動の内訳</p>
            {stats.activities?.by_type?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {stats.activities.by_type.map((t) => (
                  <Badge key={t.activity_type} variant="secondary" className="font-normal">
                    {ACTIVITY_TYPE_LABELS[t.activity_type] ?? t.activity_type} {t.count}
                  </Badge>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">この週の活動記録はありません</p>}
          </CardContent>
        </Card>
      </div>

      {/* 今週のイベント / 来週の予定 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">この週のイベント</p>
            <EventList events={stats.events_this_week ?? []} empty="イベントはありません" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">来週の予定</p>
            <EventList events={stats.next_week?.events ?? []} empty="来週のイベントはありません" />
            {!!stats.next_week?.next_actions?.length && (
              <div className="mt-3 border-t pt-2 space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">期限が来る次回アクション</p>
                {stats.next_week.next_actions.slice(0, 8).map((a, i) => (
                  <p key={i} className="text-xs">
                    <span className="text-muted-foreground">{formatDateJa(String(a.next_action_date ?? ''))}</span>{' '}
                    {String(a.next_action ?? '')}
                    {a.project_name ? <span className="text-muted-foreground"> ({String(a.project_name)})</span> : null}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function aiSub(aiCount?: number): string | undefined {
  return aiCount ? `うち AI ${aiCount} 件` : undefined;
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-bold leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-violet-600 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function EventList({ events, empty }: { events: Array<Record<string, unknown>>; empty: string }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-1">
      {events.slice(0, 8).map((e, i) => (
        <p key={i} className="text-xs truncate">
          {e.gls_number ? <span className="font-medium text-primary mr-1">{String(e.gls_number)}</span> : null}
          {String(e.name ?? '')}
          {e.event_start ? (
            <span className="text-muted-foreground ml-1">
              {formatDateJa(String(e.event_start))}
              {e.event_end && e.event_end !== e.event_start ? `〜${formatDateJa(String(e.event_end))}` : ''}
            </span>
          ) : null}
        </p>
      ))}
    </div>
  );
}

// ============ トピックスセクション ============

function TopicsSection({ items, reportId, editable }: { items: OpsReportItem[]; reportId: string; editable: boolean }) {
  const addItem = useAddItem();
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!content.trim()) return;
    await addItem.mutateAsync({ reportId, item: { category: category || null, content, note: note || null } });
    setCategory(''); setContent(''); setNote(''); setAdding(false);
  };

  return (
    <Card>
      <CardContent className="p-0">
        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-8">トピックはまだありません</p>
        )}
        {items.length > 0 && (
          <div className="divide-y">
            {items.map((item) => (
              <TopicRow key={item.id} item={item} editable={editable} />
            ))}
          </div>
        )}
        {editable && (
          adding ? (
            <div className="border-t p-3 space-y-2 bg-muted/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">カテゴリ</label>
                  <Input list="weekly-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例: イベント" />
                  <datalist id="weekly-categories">
                    {WEEKLY_CATEGORIES.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">補足 (任意)</label>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="補足など" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">内容・トピックス *</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px] focus:outline-none focus:ring-2 focus:ring-ring"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="今週のトピックを入力"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAdding(false)}>キャンセル</Button>
                <Button size="sm" onClick={submit} disabled={!content.trim() || addItem.isPending}>追加</Button>
              </div>
            </div>
          ) : (
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4 mr-1" /> トピックを追加
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

function TopicRow({ item, editable }: { item: OpsReportItem; editable: boolean }) {
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(item.category ?? '');
  const [content, setContent] = useState(item.content);
  const [note, setNote] = useState(item.note ?? '');

  const save = async () => {
    if (!content.trim()) return;
    await updateItem.mutateAsync({ itemId: item.id, fields: { category: category || null, content, note: note || null } });
    setEditing(false);
  };
  const remove = () => {
    if (!window.confirm('このトピックを削除しますか？')) return;
    deleteItem.mutate(item.id);
  };

  if (editing) {
    return (
      <div className="p-3 space-y-2 bg-muted/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input list="weekly-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="カテゴリ" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="補足" />
        </div>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px] focus:outline-none focus:ring-2 focus:ring-ring"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={save} disabled={updateItem.isPending}><Check className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.category && <Badge variant="secondary" className="font-normal">{item.category}</Badge>}
          {item.source === 'ai' && (
            <Badge variant="outline" className="gap-1 border-violet-300 text-violet-700">
              <Sparkles className="h-3 w-3" /> AI
            </Badge>
          )}
          {item.recorded_by && <span className="text-[11px] text-muted-foreground">{item.recorded_by}</span>}
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap">{item.content}</p>
        {item.note && <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">{item.note}</p>}
      </div>
      {editable && (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(true)} title="編集">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={remove} title="削除">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
