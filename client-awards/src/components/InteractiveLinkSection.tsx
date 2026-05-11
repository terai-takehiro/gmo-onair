/**
 * Awards EventEditorPage 用「Interactive 連携」セクション。
 *
 * 機能:
 *   - 連携設定 (Interactive baseUrl / API キー / Interactive eventId) の保存
 *   - 連携先イベントの問題一覧を取得 (preview)
 *   - 問題ごとに「選択肢 → ノミネート」マッピングを編集
 *   - 「結果を取り込み」で interactive_answers の集計値を
 *     awards_entries.points / own_points に書き込む
 *
 * セキュリティ: API キーは Awards サーバーが保持し、ブラウザには返さない。
 * 既存キーを保ったまま設定を更新する場合は apiKeySecret を空送信。
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, RefreshCw, Save, Trash2, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';

type TargetField = 'points' | 'own_points';

interface MappingEntry {
  mode: 'choices-as-entries';
  targetField: TargetField;
  choiceMap: Record<string, number>;
}

interface LinkConfig {
  baseUrl: string;
  apiKeyMasked: string;
  eventId: string;
  mapping: Record<string, MappingEntry>;
}

interface QuestionTextRow {
  language_code: string;
  question_text: string;
  choices: string[] | string;
}

interface QuestionListItem {
  id: string;
  type: string;
  status: string;
  correct_index: number | null;
  texts: QuestionTextRow[] | null;
  answer_count: number;
}

interface IngestSummary {
  updatedEntries: number;
  questions: Array<{
    questionId: string;
    questionText?: string;
    total: number;
    assignments: Array<{
      choiceIndex: number;
      choiceText?: string;
      entryId: number;
      entryName?: string;
      count: number;
      targetField: TargetField;
    }>;
  }>;
}

interface EntryOption {
  id: number;
  label: string; // "賞名 / 部門 — 氏名"
}

function parseChoices(raw: string[] | string | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((c) => String(c));
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((c) => String(c)) : [];
  } catch {
    return [];
  }
}

export default function InteractiveLinkSection({
  awardsEventId,
  entryOptions,
  onIngested,
}: {
  awardsEventId: number;
  entryOptions: EntryOption[];
  onIngested: () => void;
}) {
  const qc = useQueryClient();
  const linkQuery = useQuery({
    queryKey: ['interactive-link', awardsEventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${awardsEventId}/interactive-link`);
      return res.data.data as LinkConfig | null;
    },
  });

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKeySecret, setApiKeySecret] = useState('');
  const [interactiveEventId, setInteractiveEventId] = useState('');
  const [mapping, setMapping] = useState<Record<string, MappingEntry>>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [ingestSummary, setIngestSummary] = useState<IngestSummary | null>(null);

  useEffect(() => {
    const cfg = linkQuery.data;
    if (!cfg) return;
    setBaseUrl(cfg.baseUrl ?? '');
    setInteractiveEventId(cfg.eventId ?? '');
    setMapping(cfg.mapping ?? {});
    setApiKeySecret('');
  }, [linkQuery.data]);

  const previewQuery = useQuery({
    queryKey: ['interactive-link-preview', awardsEventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${awardsEventId}/interactive-link/preview`);
      return res.data.data as {
        event: { id: string; title: string; status: string };
        questions: QuestionListItem[];
      };
    },
    enabled: false,
    retry: false,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: {
        baseUrl: string;
        apiKeySecret?: string;
        eventId: string;
        mapping: Record<string, MappingEntry>;
      } = {
        baseUrl: baseUrl.trim(),
        eventId: interactiveEventId.trim(),
        mapping,
      };
      if (apiKeySecret.trim()) payload.apiKeySecret = apiKeySecret.trim();
      const res = await api.put(`/awards/events/${awardsEventId}/interactive-link`, payload);
      return res.data.data as LinkConfig;
    },
    onSuccess: (data) => {
      setStatus({ kind: 'ok', msg: '保存しました' });
      setApiKeySecret('');
      qc.setQueryData(['interactive-link', awardsEventId], data);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? '保存に失敗しました';
      setStatus({ kind: 'err', msg });
    },
  });

  const clearMut = useMutation({
    mutationFn: async () => {
      await api.delete(`/awards/events/${awardsEventId}/interactive-link`);
    },
    onSuccess: () => {
      setBaseUrl('');
      setApiKeySecret('');
      setInteractiveEventId('');
      setMapping({});
      qc.setQueryData(['interactive-link', awardsEventId], null);
      setStatus({ kind: 'ok', msg: '連携を解除しました' });
    },
  });

  const ingestMut = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/awards/events/${awardsEventId}/interactive-link/ingest`);
      return res.data.data as IngestSummary;
    },
    onSuccess: (data) => {
      setIngestSummary(data);
      setStatus({ kind: 'ok', msg: `${data.updatedEntries} 件のノミネートを更新しました` });
      onIngested();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? '取り込みに失敗しました';
      setStatus({ kind: 'err', msg });
    },
  });

  const isLinked = !!linkQuery.data;
  const mappedCount = useMemo(() => Object.keys(mapping).length, [mapping]);

  function updateMapping(qid: string, patch: Partial<MappingEntry> | null) {
    setMapping((prev) => {
      const next = { ...prev };
      if (patch === null) {
        delete next[qid];
      } else {
        const current = next[qid] ?? {
          mode: 'choices-as-entries' as const,
          targetField: 'points' as const,
          choiceMap: {},
        };
        next[qid] = { ...current, ...patch };
      }
      return next;
    });
  }

  function updateChoice(qid: string, choiceIdx: number, entryId: number | null) {
    setMapping((prev) => {
      const current = prev[qid] ?? {
        mode: 'choices-as-entries' as const,
        targetField: 'points' as const,
        choiceMap: {},
      };
      const choiceMap = { ...current.choiceMap };
      if (entryId == null) {
        delete choiceMap[String(choiceIdx)];
      } else {
        choiceMap[String(choiceIdx)] = entryId;
      }
      return { ...prev, [qid]: { ...current, choiceMap } };
    });
  }

  return (
    <div className="mt-6 rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-xl bg-violet-100 text-violet-700 p-2">
          <Plug className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold">Interactive 連携</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            インタラクティブ演出のクイズ/アンケート結果を、Awards ノミネートの票数 (points / own_points)
            に取り込みます。
          </p>
        </div>
        {isLinked && (
          <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">
            連携中
          </span>
        )}
      </div>

      {status && (
        <div
          className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            status.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {status.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{status.msg}</span>
          <button onClick={() => setStatus(null)} className="shrink-0 underline">閉じる</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Interactive Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://interactive.gmo-onair.jp"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <span className="text-[11px] text-muted-foreground">
            同サーバー運用中は空欄で OK (ローカル経由で集計を読みます)
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Interactive Event ID</span>
          <input
            value={interactiveEventId}
            onChange={(e) => setInteractiveEventId(e.target.value)}
            placeholder="例: a1b2c3d4-..."
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-muted-foreground">
            API キー
            {linkQuery.data?.apiKeyMasked && (
              <span className="ml-2 text-emerald-700">保存済み: {linkQuery.data.apiKeyMasked}</span>
            )}
          </span>
          <input
            type="password"
            value={apiKeySecret}
            onChange={(e) => setApiKeySecret(e.target.value)}
            placeholder={linkQuery.data ? '変更しない場合は空欄' : 'ak_xxxxxxxx...'}
            className="rounded-lg border px-3 py-2 text-sm font-mono"
            autoComplete="off"
          />
          <span className="text-[11px] text-muted-foreground">
            Interactive アプリの「API キー管理」で発行し、発行直後の文字列をここに貼り付け。
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !interactiveEventId.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-white px-3 py-1.5 text-sm hover:bg-violet-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          設定を保存
        </button>
        <button
          onClick={() => previewQuery.refetch()}
          disabled={!isLinked || previewQuery.isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${previewQuery.isFetching ? 'animate-spin' : ''}`} />
          問題一覧を取得
        </button>
        <button
          onClick={() => ingestMut.mutate()}
          disabled={!isLinked || ingestMut.isPending || mappedCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-sm hover:bg-emerald-700 disabled:opacity-50"
          title={mappedCount === 0 ? 'マッピングを 1 つ以上設定してから取り込めます' : ''}
        >
          <Download className="h-4 w-4" />
          結果を取り込み ({mappedCount})
        </button>
        {isLinked && (
          <button
            onClick={() => {
              if (confirm('Interactive 連携を解除します。マッピング設定も消えますがよろしいですか？')) {
                clearMut.mutate();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 text-red-700 px-3 py-1.5 text-sm hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            連携を解除
          </button>
        )}
      </div>

      {previewQuery.data && (
        <div className="mt-5 space-y-3">
          <div className="text-xs text-muted-foreground">
            Interactive イベント: <span className="font-medium text-foreground">{previewQuery.data.event.title}</span>
            {' · '}
            問題 {previewQuery.data.questions.length} 件
          </div>
          {previewQuery.data.questions.map((q) => (
            <QuestionMappingCard
              key={q.id}
              question={q}
              mapping={mapping[q.id]}
              entryOptions={entryOptions}
              onUpdateField={(field) =>
                updateMapping(q.id, { targetField: field, choiceMap: mapping[q.id]?.choiceMap ?? {} })
              }
              onUpdateChoice={(idx, entryId) => updateChoice(q.id, idx, entryId)}
              onClear={() => updateMapping(q.id, null)}
            />
          ))}
        </div>
      )}

      {previewQuery.error && (
        <div className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="font-medium">取得に失敗しました</div>
          <div className="mt-1">
            {(previewQuery.error as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message ?? String(previewQuery.error)}
          </div>
        </div>
      )}

      {ingestSummary && (
        <div className="mt-5 rounded-xl border bg-muted/30 p-3 text-xs">
          <div className="font-medium mb-2">取り込みサマリー ({ingestSummary.updatedEntries} 件更新)</div>
          <div className="space-y-2">
            {ingestSummary.questions.map((q) => (
              <div key={q.questionId} className="rounded-lg bg-card p-2 border">
                <div className="font-medium text-sm truncate">{q.questionText ?? q.questionId}</div>
                <div className="text-[11px] text-muted-foreground mb-1">回答総数 {q.total}</div>
                <ul className="space-y-0.5">
                  {q.assignments.map((a) => (
                    <li key={a.choiceIndex} className="flex items-center gap-2">
                      <span className="text-muted-foreground w-32 truncate">
                        {a.choiceIndex + 1}. {a.choiceText ?? '(無題)'}
                      </span>
                      <span className="flex-1 truncate">{a.entryName ?? `entry#${a.entryId}`}</span>
                      <span className="font-mono">
                        {a.count} → {a.targetField}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionMappingCard({
  question,
  mapping,
  entryOptions,
  onUpdateField,
  onUpdateChoice,
  onClear,
}: {
  question: QuestionListItem;
  mapping: MappingEntry | undefined;
  entryOptions: EntryOption[];
  onUpdateField: (field: TargetField) => void;
  onUpdateChoice: (choiceIdx: number, entryId: number | null) => void;
  onClear: () => void;
}) {
  const ja = question.texts?.find((t) => t.language_code === 'ja') ?? question.texts?.[0];
  const choices = parseChoices(ja?.choices);
  const isMapped = !!mapping;

  return (
    <div className={`rounded-xl border p-3 ${isMapped ? 'border-violet-300 bg-violet-50/30' : ''}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
            <span className="rounded bg-muted px-1.5 py-0.5">{question.type}</span>
            <span className="rounded bg-muted px-1.5 py-0.5">{question.status}</span>
            <span>回答 {question.answer_count}</span>
          </div>
          <div className="text-sm font-medium">{ja?.question_text ?? '(問題文未設定)'}</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">書き込み先:</span>
          <select
            value={mapping?.targetField ?? 'points'}
            onChange={(e) => onUpdateField(e.target.value as TargetField)}
            className="rounded border px-2 py-1 text-xs"
          >
            <option value="points">points</option>
            <option value="own_points">own_points</option>
          </select>
          {isMapped && (
            <button onClick={onClear} className="text-red-600 hover:underline">マッピング解除</button>
          )}
        </div>
      </div>
      {choices.length === 0 ? (
        <div className="mt-2 text-[11px] text-muted-foreground">選択肢が登録されていません</div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {choices.map((c, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-right text-muted-foreground">{idx + 1}.</span>
              <span className="flex-1 truncate">{c}</span>
              <select
                value={mapping?.choiceMap[String(idx)] ?? ''}
                onChange={(e) => onUpdateChoice(idx, e.target.value ? Number(e.target.value) : null)}
                className="rounded border px-2 py-1 text-xs min-w-[200px] max-w-[320px]"
              >
                <option value="">(マッピングなし)</option>
                {entryOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
