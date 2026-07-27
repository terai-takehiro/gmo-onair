import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '@/lib/api';
import { ArrowLeft, Plus, Trash2, Edit3, ExternalLink, Radio, X, HelpCircle, GripVertical, ChevronUp, ChevronDown, ListOrdered } from 'lucide-react';
import { useQuizzes, useCreateQuiz, useDeleteQuiz, useReorderQuizzes, useUpdateQuiz } from '@/quiz/api';
import { quizStackLabel, type Quiz, type QuizMode } from '@/quiz/types';
import InteractiveLinkPanel from '@/quiz/InteractiveLinkPanel';
import QuizInteractiveSync, { type IaQuestion } from '@/quiz/QuizInteractiveSync';
import type { CgCategory } from '@/cg/types';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { EmptyState } from '@gmo-onair/shared/src/client/states';

interface AwardsEventDetail {
  id: number; name: string;
  categories: CgCategory[];
}

export default function QuizListPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}`);
      return res.data.data as AwardsEventDetail;
    },
  });

  const { data: quizzes = [] } = useQuizzes(eventId);
  const createMut = useCreateQuiz(eventId);
  const deleteMut = useDeleteQuiz(eventId);

  // Interactive 連携の設定状態
  const { data: iaLink } = useQuery({
    queryKey: ['interactive-link', eventId],
    queryFn: async () => (await api.get(`/quiz/events/${eventId}/interactive-link`)).data.data as { configured: boolean },
  });
  // 連携先 Interactive の問題一覧 (各 quiz のプルダウン候補)。連携済みのときだけ取得。
  const { data: iaQuestions = [] } = useQuery({
    queryKey: ['interactive-questions', eventId],
    queryFn: async () => {
      const res = await api.get(`/quiz/events/${eventId}/interactive-link/preview`);
      return (res.data.data?.questions ?? []) as IaQuestion[];
    },
    enabled: !!iaLink?.configured,
  });

  const [activeTab, setActiveTab] = useState<QuizMode>('quiz');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newChoiceCount, setNewChoiceCount] = useState(3);
  const [newCountdown, setNewCountdown] = useState(60);
  const [newLinkCat, setNewLinkCat] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createMut.mutateAsync({
      title: newTitle.trim(),
      mode: activeTab,
      choice_count: newChoiceCount,
      countdown_seconds: newCountdown,
      link_category_id: newLinkCat,
      question: 'もっともふさわしいのは？',
    });
    setNewTitle(''); setNewChoiceCount(3); setNewCountdown(60); setNewLinkCat(null);
    setShowCreate(false);
  };

  const quizItems = quizzes.filter((q) => q.mode === 'quiz');
  const surveyItems = quizzes.filter((q) => q.mode === 'survey');
  const filtered = activeTab === 'quiz' ? quizItems : surveyItems;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5 pb-12">
      {/* Header — インタラクティブ QuizManagerPage と同じ構成 */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/event/${eventId}`)}
          aria-label="戻る"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold truncate flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary shrink-0" />クイズ / アンケート管理
          </h1>
          <p className="text-sm text-muted-foreground truncate">{event?.name ?? ''} · {quizzes.length}問</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href={`/awards/output/quiz-stack/${eventId}?lang=ja`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-border hover:bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"
            title="出力 URL JA (OBS 用)">
            <ExternalLink className="h-3.5 w-3.5" />JA
          </a>
          <a href={`/awards/output/quiz-stack/${eventId}?lang=en`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-border hover:bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"
            title="出力 URL EN (OBS 用)">
            <ExternalLink className="h-3.5 w-3.5" />EN
          </a>
          <button onClick={() => navigate(`/event/${eventId}/quiz-stack/control`)}
            className="flex items-center gap-1 rounded-lg bg-primary hover:bg-primary/90 px-3 py-1.5 text-xs font-semibold text-white">
            <Radio className="h-3.5 w-3.5" />送出
          </button>
        </div>
      </div>

      {/* インタラクティブ演出 連携 */}
      <InteractiveLinkPanel eventId={eventId} />

      {/* 送出スタック (順番・送出名) */}
      <StackOrderPanel eventId={eventId} quizzes={quizzes} />

      {/* タブ: クイズ / アンケート */}
      <div className="flex items-center justify-between border-b">
        <div className="flex gap-1">
          {(['quiz', 'survey'] as const).map((m) => {
            const active = activeTab === m;
            const count = m === 'quiz' ? quizItems.length : surveyItems.length;
            return (
              <button key={m}
                onClick={() => setActiveTab(m)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {m === 'quiz' ? 'クイズ' : 'アンケート'} ({count})
              </button>
            );
          })}
        </div>
        <button onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-1 rounded-lg bg-primary hover:bg-primary/90 px-3 py-1.5 text-xs font-semibold text-white mb-1">
          <Plus className="h-3.5 w-3.5" />追加
        </button>
      </div>

      {/* 新規作成 (折りたたみ) */}
      {showCreate && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">
              新しい{activeTab === 'quiz' ? 'クイズ' : 'アンケート'}
            </div>
            <button onClick={() => setShowCreate(false)} aria-label="閉じる"
              className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="text-xs sm:col-span-2 lg:col-span-1">
              <span className="block mb-1 font-semibold text-muted-foreground">タイトル</span>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例: 最優秀新人賞"
                className="w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-semibold text-muted-foreground">択数</span>
              <select value={newChoiceCount} onChange={(e) => setNewChoiceCount(parseInt(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm">
                {[2,3,4,5,6].map((n) => <option key={n} value={n}>{n} 択</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-semibold text-muted-foreground">カウントダウン (秒)</span>
              <input type="number" value={newCountdown} min={5} max={600}
                onChange={(e) => setNewCountdown(Math.max(5, Math.min(600, parseInt(e.target.value) || 60)))}
                className="w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="text-xs sm:col-span-2 lg:col-span-3">
              <span className="block mb-1 font-semibold text-muted-foreground">連動カテゴリ (任意)</span>
              <select value={newLinkCat ?? ''} onChange={(e) => setNewLinkCat(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">手入力 (連動なし)</option>
                {(event?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} / {c.description || '-'}</option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={handleCreate}
            disabled={!newTitle.trim() || createMut.isPending}
            className="w-full rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 px-4 py-2 text-sm font-bold text-white">
            {createMut.isPending ? '作成中…' : `${activeTab === 'quiz' ? 'クイズ' : 'アンケート'}を作成`}
          </button>
        </div>
      )}

      {/* 一覧 (タブで絞り込み) */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{activeTab === 'quiz' ? 'クイズ' : 'アンケート'}がありません</p>
            <p className="text-xs mt-1">「追加」から登録してください</p>
          </div>
        )}
        {filtered.map((q) => {
          const linked = event?.categories.find((c) => c.id === q.link_category_id);
          const isQuiz = q.mode === 'quiz';
          return (
            <div key={q.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                      isQuiz ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {isQuiz ? 'クイズ' : 'アンケート'}
                    </span>
                    {/* v2.9.36: 演出パターン バッジ */}
                    {(() => {
                      if (isQuiz) {
                        return (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-accent text-primary">
                            正解発表
                          </span>
                        );
                      }
                      const p = q.survey_pattern ?? 'top-reveal';
                      return p === 'answer-check' ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-success-surface text-success">
                          アンサーチェック
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-warning-surface text-warning-strong">
                          No.1 発表
                        </span>
                      );
                    })()}
                    {q.has_answer_check && (q.mode === 'quiz' || (q.survey_pattern ?? 'top-reveal') === 'top-reveal') && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 bg-muted text-muted-foreground border border-border">
                        + 前段ANS
                      </span>
                    )}
                    <span className="text-sm font-bold truncate">{q.title || '(タイトル未設定)'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {q.choice_count} 択 / {q.countdown_seconds} 秒 / 表示: {q.display === 'percent' ? '%' : '票'}
                    {linked && ` / 連動: ${linked.name} - ${linked.description || ''}`}
                  </div>
                </div>
                <button onClick={() => navigate(`/event/${eventId}/quiz/${q.id}/edit`)}
                  className="flex items-center gap-1 rounded-lg border border-border hover:bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
                  <Edit3 className="h-3.5 w-3.5" />編集
                </button>
                <button onClick={async () => { if ((await confirmAction({ title: `「${q.title}」を削除します。よろしいですか？`, confirmLabel: '削除する', tone: 'danger' }))) deleteMut.mutate(q.id); }}
                  className="flex items-center justify-center rounded-lg p-2 text-destructive hover:bg-destructive/90-surface"
                  title="削除">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* 1 問単位の Interactive 連携 (連携設定済みのときのみ) */}
              {iaLink?.configured && (
                <div className="mt-2 border-t border-dashed pt-2">
                  <QuizInteractiveSync
                    eventId={eventId}
                    quizId={q.id}
                    currentIqId={(q as unknown as { interactive_question_id?: string | null }).interactive_question_id ?? null}
                    questions={iaQuestions}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 送出スタック (順番・送出名) — v2.9.48
//   送出 UI (QuizStackControlPage) の NEXT プルダウン / 自動進行が参照する
//   display_order を 1 本のスタックとして並び替え + 送出名 (stack_label) を編集。
//   並び替え: PC = ドラッグ&ドロップ / スマホ = ↑↓ ボタン。
// ════════════════════════════════════════════════════════════════
function StackOrderPanel({ eventId, quizzes }: { eventId: number; quizzes: Quiz[] }) {
  const [open, setOpen] = useState(true);
  const [order, setOrder] = useState<number[]>([]);
  const reorderMut = useReorderQuizzes(eventId);

  // quizzes 変化 (初回ロード / 並び替え成功 / 追加・削除) に追従
  useEffect(() => {
    setOrder(quizzes.map((q) => q.id));
  }, [quizzes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const quizMap = new Map(quizzes.map((q) => [q.id, q]));
  const ordered = order.map((id) => quizMap.get(id)).filter((q): q is Quiz => !!q);

  const applyOrder = (next: number[]) => {
    setOrder(next);
    reorderMut.mutate(next);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    applyOrder(arrayMove(order, from, to));
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(Number(active.id));
    const to = order.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    applyOrder(arrayMove(order, from, to));
  };

  return (
    <div className="rounded-xl border bg-card">
      <button onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <ListOrdered className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">送出スタック（順番・送出名）</span>
        <span className="text-xs text-muted-foreground">{ordered.length}問</span>
        <span className="flex-1" />
        {reorderMut.isPending && <span className="text-xs text-muted-foreground">保存中…</span>}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            送出 UI は基本この順番で出題し、必要に応じて「かるた取り」のように NEXT から任意の問題を選べます。
            送出名は送出 UI に表示する名前（空ならタイトルを表示）。
          </p>
          {ordered.length === 0 ? (
            <EmptyState
              title="問題はまだ1問もありません"
              description="「問題を追加」から作ると、ここで送出の順番を並べ替えられます。"
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={order.map(String)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {ordered.map((q, i) => (
                    <StackRow
                      key={q.id}
                      quiz={q}
                      index={i}
                      total={ordered.length}
                      eventId={eventId}
                      onUp={() => move(i, i - 1)}
                      onDown={() => move(i, i + 1)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
}

function StackRow({ quiz, index, total, eventId, onUp, onDown }: {
  quiz: Quiz; index: number; total: number; eventId: number;
  onUp: () => void; onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(quiz.id) });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const updateMut = useUpdateQuiz(quiz.id, eventId);
  const [label, setLabel] = useState(quiz.stack_label ?? '');
  useEffect(() => { setLabel(quiz.stack_label ?? ''); }, [quiz.stack_label]);

  const saveLabel = () => {
    const trimmed = label.trim();
    if (trimmed === (quiz.stack_label ?? '')) return;
    updateMut.mutate({ stack_label: trimmed || null });
  };

  const isQuiz = quiz.mode === 'quiz';
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 rounded-lg border bg-background px-2 py-2">
      {/* PC: ドラッグハンドル / スマホ: ↑↓ ボタン */}
      <button {...listeners} {...attributes}
        className="hidden sm:flex cursor-grab touch-none text-muted-foreground hover:text-muted-foreground shrink-0"
        title="ドラッグして並び替え" aria-label="ドラッグして並び替え">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex sm:hidden flex-col shrink-0">
        <button onClick={onUp} disabled={index === 0} aria-label="上へ"
          className="flex h-5 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
          <ChevronUp className="h-4 w-4" />
        </button>
        <button onClick={onDown} disabled={index === total - 1} aria-label="下へ"
          className="flex h-5 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <span className="shrink-0 w-6 text-center text-sm font-bold text-primary tabular-nums">{index + 1}</span>
      <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isQuiz ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'
      }`}>
        {isQuiz ? 'クイズ' : 'アンケート'}
      </span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder={quizStackLabel(quiz)}
        className="flex-1 min-w-0 rounded-md border px-2 py-1.5 text-sm"
        title="送出名 (空ならタイトルを表示)"
      />
    </div>
  );
}
