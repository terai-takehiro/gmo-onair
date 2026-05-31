import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '@/lib/api';
import { Download, Upload, Loader2, Link2 } from 'lucide-react';

export interface IaQuestion {
  id: string;
  type: string;
  texts: { language_code: string; question_text: string; choices: string[] }[] | null;
}

/**
 * 1 問単位の Interactive 連携コントロール (QuizListPage の各 quiz 行に表示)。
 *   - プルダウン: この quiz が対応する Interactive 問題を選択
 *   - ⬇ 取込: 選択中の Interactive 問題の本文・選択肢 (ja/en) をこの quiz に取り込む
 *   - ⬆ 送信: この quiz の本文・選択肢を Interactive に書き込む (未選択なら新規作成)
 */
export default function QuizInteractiveSync({
  eventId, quizId, currentIqId, questions,
}: {
  eventId: number;
  quizId: number;
  currentIqId: string | null;
  questions: IaQuestion[];
}) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string>(currentIqId ?? '');
  const [flash, setFlash] = useState<string | null>(null);

  const blip = (t: string) => { setFlash(t); setTimeout(() => setFlash(null), 2500); };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['quizzes', eventId] });
    qc.invalidateQueries({ queryKey: ['quiz-detail', quizId] });
  };

  const setLink = useMutation({
    mutationFn: (iqId: string) => api.put(`/quiz/quizzes/${quizId}/interactive-question`, { interactiveQuestionId: iqId || null }),
    onSuccess: () => invalidate(),
  });

  const pull = useMutation({
    mutationFn: () => api.post(`/quiz/events/${eventId}/interactive-link/pull/${quizId}`, { interactiveQuestionId: sel || undefined }),
    onSuccess: () => { invalidate(); blip('取込完了'); },
    onError: (e: any) => blip(e?.response?.data?.error?.message || '取込失敗'),
  });

  const push = useMutation({
    mutationFn: () => api.post(`/quiz/events/${eventId}/interactive-link/push/${quizId}`),
    onSuccess: (r) => { const id = r.data?.data?.interactiveQuestionId; if (id) setSel(id); invalidate(); blip('送信完了'); },
    onError: (e: any) => blip(e?.response?.data?.error?.message || '送信失敗'),
  });

  const labelOf = (q: IaQuestion) => {
    const ja = q.texts?.find((t) => t.language_code === 'ja') ?? q.texts?.[0];
    const txt = (ja?.question_text || '(無題)').slice(0, 24);
    return `${q.type === 'survey' ? 'ｱﾝｹｰﾄ' : 'ｸｲｽﾞ'}: ${txt}`;
  };

  return (
    <div className="flex items-center gap-1.5">
      <Link2 className="h-3.5 w-3.5 text-cyan-600 shrink-0" />
      <select
        value={sel}
        onChange={(e) => { setSel(e.target.value); setLink.mutate(e.target.value); }}
        className="max-w-[180px] rounded border border-cyan-300 bg-white px-1.5 py-1 text-[11px] text-slate-700"
        title="連携する Interactive 問題"
      >
        <option value="">未連携</option>
        {questions.map((q) => <option key={q.id} value={q.id}>{labelOf(q)}</option>)}
      </select>
      <button
        onClick={() => pull.mutate()} disabled={!sel || pull.isPending}
        className="flex items-center gap-0.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 px-1.5 py-1 text-[11px] font-semibold text-white"
        title="この問題を Interactive から取込"
      >
        {pull.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}取込
      </button>
      <button
        onClick={() => push.mutate()} disabled={push.isPending}
        className="flex items-center gap-0.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-1.5 py-1 text-[11px] font-semibold text-white"
        title="この quiz を Interactive へ送信"
      >
        {push.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}送信
      </button>
      {flash && <span className="text-[10px] text-cyan-700">{flash}</span>}
    </div>
  );
}
