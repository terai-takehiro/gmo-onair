/**
 * ④ プロジェクト新規作成 (v4 GPM)
 *
 * ── モックは5段、ここは3段 ──────────────────────────────────
 *
 * モックの段は「基本情報 → 標準工程 → 着手日と工程 → 体制（組織図） →
 * メンバー・書類」の5つですが、**後ろの2つは作っていません**:
 *
 *   ・**体制（組織図）** … 箱と線を描く組織図は別の仕事です
 *     （`docs/design/gpm-model.md`「やらないと決めたこと」）。
 *     体制は `gpm_members` の一覧として詳細画面で見られます
 *   ・**メンバー・書類** … `gpm_members` に**書き込む API がありません**
 *     （読むだけ）。BOX は**プロジェクト詳細の「書類」タブ**で押したときだけ作ります
 *     （本番の BOX に実際にフォルダができ、ONAiR からは消せないため）
 *
 * **押しても何も起きない段を置かないため**に、出せる3段だけにしてあります。
 *
 * ── 段を「進む」だけにしない ────────────────────────────────
 *
 * 上の番号は押して直接行けます。ひな形を選び直したあとに着手日を見に行く、が
 * 普通に起きるので、順番に進むしかない形にすると戻る操作が増えます。
 * **作るのは最後の段でなくても押せます**（名前と依頼元さえ入っていればよい）。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useGpmTemplates, useGpmUsers, useInvalidateGpm } from '../queries';
import type { GpmProjectDetail } from '../types';
import { BasicStep, type BasicValues } from './projectForm/BasicStep';
import { TemplateStep } from './projectForm/TemplateStep';
import { PreviewStep } from './projectForm/PreviewStep';

const STEPS = [
  { n: 1, label: '基本情報' },
  { n: 2, label: '標準工程を選ぶ' },
  { n: 3, label: '着手日と工程の確認' },
] as const;

export default function GpmProjectFormPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidateGpm();
  const [step, setStep] = useState(1);

  const [basic, setBasic] = useState<BasicValues>({
    name: '', kind: 'self_build', clientName: '', pmCompany: '', pmUserId: '',
    status: 'active', notes: '',
  });
  const [templateId, setTemplateId] = useState('');
  const [startedOn, setStartedOn] = useState('');

  const templates = useGpmTemplates();
  const users = useGpmUsers();

  const template = useMemo(
    () => templates.data?.find((t) => t.id === templateId),
    [templates.data, templateId],
  );

  const create = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: GpmProjectDetail }>('/gpm/projects', {
        name: basic.name.trim(),
        kind: basic.kind,
        client_name: basic.clientName.trim() || null,
        pm_company: basic.pmCompany.trim() || null,
        pm_user_id: basic.pmUserId || null,
        status: basic.status,
        notes: basic.notes.trim() || null,
        started_on: startedOn || null,
        template_id: templateId || null,
      })).data.data,
    onSuccess: (row) => {
      invalidate(row.id);
      notifySuccess('プロジェクトを作りました', {
        description: templateId
          ? '標準工程から工程とタスクを入れました。ここから直せます。'
          : '工程はまだありません。詳細画面から足せます。',
      });
      navigate(`/gpm/projects/${row.id}`);
    },
    onError: (err) => notifyApiError('プロジェクトを作れませんでした', err),
  });

  /** 足りない項目。**押せなくするのではなく名指しする** */
  const missing = [
    basic.name.trim() ? null : 'プロジェクト名',
    basic.clientName.trim() ? null : '依頼元',
  ].filter((m): m is string => m !== null);

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="プロジェクトを作る"
        sub="発注が確定してから立ち上げます。売れるかどうかを追う段階のものはここに入りません（案件管理で扱います）"
        primaryAction={
          <Button onClick={() => create.mutate()} disabled={missing.length > 0 || create.isPending}>
            {create.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
            作る
          </Button>
        }
      >
        <Button variant="outline" onClick={() => navigate('/gpm/projects')}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />やめる
        </Button>
      </PageHeader>

      {/* 段。横に入りきらないときは折り返さず横スクロール（一覧のチップと同じ） */}
      <div className="flex gap-2 overflow-x-auto">
        {STEPS.map((s) => {
          const on = s.n === step;
          const done = s.n < step;
          return (
            <button
              key={s.n}
              type="button"
              aria-current={on ? 'step' : undefined}
              onClick={() => setStep(s.n)}
              className={cn(
                'min-h-tap rounded-control-lg flex shrink-0 items-center gap-2 border px-3.5 lg:min-h-[40px]',
                on ? 'border-primary-border-strong bg-primary-surface-weak' : 'border-border bg-card hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'text-badge font-number flex h-6 w-6 items-center justify-center rounded-chip',
                  on ? 'bg-primary text-primary-foreground'
                    : done ? 'bg-success-surface text-success' : 'bg-muted text-muted-foreground',
                )}
              >
                {s.n}
              </span>
              <span className={cn('text-sub', on ? 'font-bold text-primary' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {step === 1 && (
        <BasicStep values={basic} onChange={(p) => setBasic((v) => ({ ...v, ...p }))} users={users.data ?? []} />
      )}
      {step === 2 && (
        <TemplateStep
          templates={templates.data ?? []}
          loading={templates.isLoading}
          value={templateId}
          onChange={setTemplateId}
        />
      )}
      {step === 3 && (
        <PreviewStep
          startedOn={startedOn}
          onStartedOn={setStartedOn}
          template={template}
          templateName={template?.name ?? null}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>前に戻る</Button>
        )}
        {step < STEPS.length && (
          <Button variant="outline" onClick={() => setStep(step + 1)}>
            次へ（{STEPS[step].label}）
          </Button>
        )}
        {missing.length > 0 && (
          <p className="text-sub text-destructive">
            {missing.join(' と ')} が入っていないので、まだ作れません（ステップ1）
          </p>
        )}
      </div>

      <p className="text-note text-muted-foreground">
        体制（誰がやるか）はこの画面では入れません（読む一覧だけあり、書き込む口がまだサーバーにありません）。
        BOX のフォルダは<strong className="font-bold">作ったあとの「書類」タブ</strong>から作ります —
        押すと本番の BOX に実際にフォルダができ、ONAiR からは消せないためです。
      </p>
    </div>
  );
}
