/**
 * 案件をつくる — 全画面1枚 (v4・モックの登録モーダル・migration 165/170)
 *
 * ── なぜ全画面1枚なのか ────────────────────────────────────
 *
 * 引き合いを受けた直後に入れる画面なので、**電話を切る前に入れ終わる**のが目標です。
 * 16項目を段に分けると「まだ次があるのか」と手が止まります。1枚に並べて、
 * **必須は4つだけ**（お客様・案件名・種類・社内の担当）にしてあります。
 *
 * ── 直すのは別の画面 ────────────────────────────────────────
 *
 * `/sales/projects/:id/edit` は今までのフォームのままです。あちらは
 * BOX の URL・按分・申込書・見積のシミュレーションまで扱う画面で、
 * **登録の16項目とは目的が違います**。1つにまとめると、電話中に開く画面に
 * 使わない欄が数十個並びます。
 *
 * ── 会場・スタジオはここでは押さえない ──────────────────────
 *
 * 部屋を押さえるのは空きの確認が要る操作です。登録の流れに混ぜると、
 * 押さえられなかったときに**案件だけできて「押さえたつもり」**になります。
 * 項目は出して（無いと入れ忘れたと思われる）、行き先だけ書きます。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, MapPin, Plus, X } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { ProjectStageLabels, ProjectTypeLabels, type ProjectStage } from '@/types';
import { INTAKE_CHANNEL_LABEL } from '../projectList/intake';
import {
  CREATABLE_STAGES, EMPTY_NEW_PROJECT, RECURRENCE_LABEL, WANTS_HINTS,
  missingOf, type NewProjectValues,
} from './fields';

interface Named { id: string; name: string; short_name?: string | null }

/** 項目1つ。**幅はモックの `w` に合わせる**（half / full） */
function Field({
  label, hint, required, full, htmlFor, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  full?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-note mt-1 text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function NewProjectDialog() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();

  const [v, setV] = useState<NewProjectValues>(() => ({
    ...EMPTY_NEW_PROJECT,
    // ダッシュボードの受付カードから来ると入口が付いている
    intake_channel: params.get('intake') ?? '',
  }));
  const set = <K extends keyof NewProjectValues>(k: K, value: NewProjectValues[K]) =>
    setV((f) => ({ ...f, [k]: value }));

  const [newDate, setNewDate] = useState('');

  const { data: customersData } = useQuery({
    queryKey: ['customers-for-new-project'],
    queryFn: async () => (await api.get('/customers?limit=500')).data,
  });
  const customers: Named[] = customersData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users?limit=200')).data,
  });
  const users: Named[] = usersData?.data ?? [];

  const missing = useMemo(() => missingOf(v), [v]);

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        customer_id: v.customer_id,
        contact_name: v.contact_name.trim() || null,
        name: v.name.trim(),
        project_type: v.project_type,
        gls_category: v.gls_category,
        recurrence: v.recurrence,
        stage: v.stage,
        assigned_to: v.assigned_to,
        attendee_count: v.attendee_count ? Number(v.attendee_count) : null,
        goal: v.goal.trim() || null,
        expected_amount: v.expected_amount ? Number(v.expected_amount) : 0,
        reply_due: v.reply_due || null,
        wants: v.wants.trim() || null,
        intake_channel: v.intake_channel || undefined,
        notes: v.notes.trim() || null,
      };
      // 実施日は**複数日**を持てる（飛び日）。1日でも同じ形で送る
      if (v.dates.length > 0) body.dates = v.dates.map((d) => ({ date: d }));
      if (v.first_task_title.trim()) {
        body.first_task = {
          title: v.first_task_title.trim(),
          assigned_to: v.assigned_to,
          due_date: v.first_task_due || null,
        };
      }
      return (await api.post('/projects', body)).data.data as { id: string; code: string };
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'sales-overview'] });
      notifySuccess('案件をつくりました', {
        description: v.first_task_title.trim()
          ? '最初のタスクも入れました。'
          : 'タスクは案件詳細から足せます。',
      });
      navigate(`/sales/projects/${row.id}`);
    },
    onError: (e) => notifyApiError('案件をつくれませんでした', e),
  });

  const addDate = () => {
    if (!newDate || v.dates.includes(newDate)) return;
    set('dates', [...v.dates, newDate].sort());
    setNewDate('');
  };

  return (
    <div className="flex min-h-full flex-col">
      {/*
        上辺は**貼り付け**。16項目あるので、下まで進むと「つくる」が画面外になります。
        スマホでも押せる位置に常にある形にします。
      */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 lg:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-h1">案件をつくる</h1>
          <p className="text-note text-muted-foreground">
            必須は <strong className="font-bold">お客様・案件名・種類・社内の担当</strong> の4つだけです。
            残りはあとから足せます
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />やめる
        </Button>
        <Button onClick={() => create.mutate()} disabled={missing.length > 0 || create.isPending}>
          {create.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
          つくる
        </Button>
      </div>

      {missing.length > 0 && (
        <p className="border-b border-warning-border bg-warning-surface px-4 py-2 text-sub text-warning lg:px-6">
          {missing.join(' ・ ')} が入っていないので、まだつくれません
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:px-6 lg:pb-6">
        <Field label="お客様" required hint="無ければ「取引先マスター」で先につくります">
          <SearchableSelect
            options={customers.map((c) => ({ value: c.id, label: c.short_name || c.name, subLabel: c.short_name ? c.name : undefined }))}
            value={v.customer_id}
            onChange={(id) => set('customer_id', id)}
            placeholder="会社を探す"
          />
        </Field>

        <Field label="ご担当" htmlFor="np-contact" hint="この案件の窓口。会社の代表窓口とは別に持ちます">
          <Input id="np-contact" value={v.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="宮田 里香 様（広報部）" />
        </Field>

        <Field label="案件名" required full htmlFor="np-name" hint="あとから変えられます">
          <Input id="np-name" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="周年記念式典 配信・収録" />
        </Field>

        <Field label="案件の種類" required hint="標準工程がこれで決まります">
          <Select value={v.project_type} onValueChange={(x) => set('project_type', x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(ProjectTypeLabels) as [string, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="継続区分" required hint="レギュラーは「回」を持ちます（第1回・7月分…）">
          <Select value={v.recurrence} onValueChange={(x) => set('recurrence', x as 'single' | 'regular')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RECURRENCE_LABEL) as ('single' | 'regular')[]).map((k) => (
                <SelectItem key={k} value={k}>{RECURRENCE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="ステージ" required hint="受注はここでは選べません（GLS番号を採る確認が別にあります）">
          <Select value={v.stage} onValueChange={(x) => set('stage', x as ProjectStage)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CREATABLE_STAGES.map((st) => (
                <SelectItem key={st} value={st}>{ProjectStageLabels[st]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="案件分類" required hint="A=スタジオ案件 ／ B=ビジネス案件。GLS番号の採り方が変わります">
          <Select value={v.gls_category} onValueChange={(x) => set('gls_category', x as 'A' | 'B')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A スタジオ案件</SelectItem>
              <SelectItem value="B">B ビジネス案件</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="実施日" full hint="未定のままでも登録できます。飛び日は「足す」で何日でも入れられます">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } }}
              className="w-auto"
            />
            <Button variant="outline" onClick={addDate} disabled={!newDate}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />足す
            </Button>
            {v.dates.map((d) => (
              <span key={d} className="rounded-chip flex items-center gap-1 bg-muted px-2.5 py-1 text-sub">
                <span className="font-number">{d}</span>
                <button
                  type="button"
                  onClick={() => set('dates', v.dates.filter((x) => x !== d))}
                  aria-label={`${d} を外す`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </Field>

        {/* 会場・スタジオ。**ここでは押さえない** — 空きの確認が要る操作なので */}
        <Field label="会場・スタジオ" full>
          <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3 py-2 text-sub text-secondary-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <span>
              部屋はここでは押さえません（空きの確認が要るためです）。
              つくったあと<strong className="font-bold">案件詳細の「予約」</strong>か
              <strong className="font-bold">カレンダー</strong>から押さえてください。
            </span>
          </p>
        </Field>

        <Field label="規模" htmlFor="np-scale" hint="何名か。数で持つので、あとで規模別に数えられます">
          <div className="flex items-center gap-2">
            <Input
              id="np-scale" type="number" min="0" inputMode="numeric"
              value={v.attendee_count}
              onChange={(e) => set('attendee_count', e.target.value)}
              placeholder="150"
            />
            <span className="text-sub shrink-0 text-muted-foreground">名</span>
          </div>
        </Field>

        <Field label="やりたいこと" htmlFor="np-goal" hint="お客様の言葉のままで大丈夫です">
          <Input id="np-goal" value={v.goal} onChange={(e) => set('goal', e.target.value)} placeholder="式典のライブ配信と収録" />
        </Field>

        <Field label="予算" htmlFor="np-amount" hint="見積をつくると金額はそちらが正になります">
          <div className="flex items-center gap-2">
            <span className="text-sub shrink-0 text-muted-foreground">¥</span>
            <Input
              id="np-amount" type="number" min="0" inputMode="numeric"
              value={v.expected_amount}
              onChange={(e) => set('expected_amount', e.target.value)}
              placeholder="1500000"
            />
          </div>
        </Field>

        <Field label="返事の期限" htmlFor="np-reply" hint="相手を待たせている目安です（タスクの期限とは別）">
          <Input id="np-reply" type="date" value={v.reply_due} onChange={(e) => set('reply_due', e.target.value)} />
        </Field>

        <Field label="求められているもの" htmlFor="np-wants" hint="見積・資料 など">
          <Input
            id="np-wants" list="np-wants-hints"
            value={v.wants} onChange={(e) => set('wants', e.target.value)}
            placeholder="見積 と 資料"
          />
          <datalist id="np-wants-hints">
            {WANTS_HINTS.map((w) => <option key={w} value={w} />)}
          </datalist>
        </Field>

        <Field label="入手経路" hint="あとで集計します。分からなければ空のままで大丈夫です">
          <Select value={v.intake_channel || 'none'} onValueChange={(x) => set('intake_channel', x === 'none' ? '' : x)}>
            <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">分からない</SelectItem>
              {Object.entries(INTAKE_CHANNEL_LABEL).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="社内の担当" required hint="この案件を持つ人。タスクの担当は1件ずつ別に決められます">
          <SearchableSelect
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            value={v.assigned_to}
            onChange={(id) => set('assigned_to', id)}
            placeholder="担当を探す"
          />
        </Field>

        <Field label="最初のタスク" full hint="入れなくても大丈夫です。期限は日付だけ入れると 18:00 になります">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={v.first_task_title}
              onChange={(e) => set('first_task_title', e.target.value)}
              placeholder="見積を送る"
            />
            <Input
              type="date"
              value={v.first_task_due}
              onChange={(e) => set('first_task_due', e.target.value)}
              aria-label="最初のタスクの期限"
            />
          </div>
        </Field>

        <Field label="メモ" full htmlFor="np-notes">
          <Textarea id="np-notes" rows={3} value={v.notes} onChange={(e) => set('notes', e.target.value)} placeholder="会場はこれから探すとのこと。" />
        </Field>
      </div>
    </div>
  );
}
