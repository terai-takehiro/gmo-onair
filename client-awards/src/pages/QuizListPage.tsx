import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { ChevronLeft, Plus, Trash2, Edit3, ExternalLink, Radio, HelpCircle } from 'lucide-react';
import { useQuizzes, useCreateQuiz, useDeleteQuiz } from '@/quiz/api';
import type { CgCategory } from '@/cg/types';

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

  const [newTitle, setNewTitle] = useState('');
  const [newChoiceCount, setNewChoiceCount] = useState(3);
  const [newCountdown, setNewCountdown] = useState(60);
  const [newLinkCat, setNewLinkCat] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createMut.mutateAsync({
      title: newTitle.trim(),
      choice_count: newChoiceCount,
      countdown_seconds: newCountdown,
      link_category_id: newLinkCat,
      question: 'もっともふさわしいのは？',
    });
    setNewTitle(''); setNewChoiceCount(3); setNewCountdown(60); setNewLinkCat(null);
  };

  return (
    <div className="p-4 sm:p-6 max-w-screen-xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(`/event/${eventId}`)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <HelpCircle className="h-5 w-5 text-purple-600" />
        <h1 className="text-lg font-bold">アンケート/クイズCG</h1>
        {event && <span className="text-xs text-muted-foreground">{event.name}</span>}
        <div className="ml-auto flex items-center gap-2">
          <a
            href={`/awards/output/quiz-stack/${eventId}?lang=ja`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
            title="出力 URL JA (OBS 用)"
          >
            <ExternalLink className="h-3 w-3" />出力 JA
          </a>
          <a
            href={`/awards/output/quiz-stack/${eventId}?lang=en`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
            title="出力 URL EN (OBS 用)"
          >
            <ExternalLink className="h-3 w-3" />出力 EN
          </a>
          <button
            onClick={() => navigate(`/event/${eventId}/quiz-stack/control`)}
            className="flex items-center gap-1 rounded bg-purple-600 hover:bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Radio className="h-3 w-3" />スタック送出
          </button>
        </div>
      </div>

      {/* 新規作成 */}
      <div className="mb-6 rounded-xl border bg-card p-4 space-y-3">
        <div className="text-sm font-bold flex items-center gap-2">
          <Plus className="h-4 w-4" /> 新しいアンケート/クイズ
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs">
            <span className="block mb-1 font-semibold text-muted-foreground">タイトル</span>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              placeholder="例: 最優秀新人賞"
              className="w-full rounded border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block mb-1 font-semibold text-muted-foreground">択数</span>
            <select value={newChoiceCount} onChange={(e) => setNewChoiceCount(parseInt(e.target.value))}
              className="w-full rounded border px-2 py-1.5 text-sm">
              {[2,3,4,5,6].map((n) => <option key={n} value={n}>{n} 択</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="block mb-1 font-semibold text-muted-foreground">カウントダウン (秒)</span>
            <input type="number" value={newCountdown} min={5} max={600}
              onChange={(e) => setNewCountdown(Math.max(5, Math.min(600, parseInt(e.target.value) || 60)))}
              className="w-full rounded border px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block mb-1 font-semibold text-muted-foreground">連動カテゴリ (任意)</span>
            <select value={newLinkCat ?? ''} onChange={(e) => setNewLinkCat(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full rounded border px-2 py-1.5 text-sm">
              <option value="">手入力 (連動なし)</option>
              {(event?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} / {c.description || '-'}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          onClick={handleCreate}
          disabled={!newTitle.trim() || createMut.isPending}
          className="rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 text-sm font-bold text-white"
        >
          {createMut.isPending ? '作成中…' : '作成'}
        </button>
      </div>

      {/* 一覧 */}
      <div className="space-y-2">
        {quizzes.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            まだクイズがありません。上のフォームから作成してください。
          </div>
        )}
        {quizzes.map((q) => {
          const linked = event?.categories.find((c) => c.id === q.link_category_id);
          return (
            <div key={q.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{q.title || '(タイトル未設定)'}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {q.choice_count} 択 / {q.countdown_seconds} 秒 / 表示: {q.display === 'percent' ? '%' : '票'}
                  {linked && ` / 連動: ${linked.name} - ${linked.description || ''}`}
                </div>
              </div>
              <button
                onClick={() => navigate(`/event/${eventId}/quiz/${q.id}/edit`)}
                className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                <Edit3 className="h-3 w-3" />編集
              </button>
              <button
                onClick={() => { if (window.confirm(`「${q.title}」を削除します。よろしいですか？`)) deleteMut.mutate(q.id); }}
                className="flex items-center justify-center rounded p-1.5 text-red-500 hover:bg-red-50"
                title="削除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
