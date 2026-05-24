import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { ChevronLeft, RefreshCw, Image as ImageIcon, ImageOff, Save, HelpCircle, Radio } from 'lucide-react';
import { useQuiz, useUpdateQuiz, useUpdateQuizChoice, useSyncQuizFromCategory } from '@/quiz/api';
import type { Quiz } from '@/quiz/types';
import type { CgCategory } from '@/cg/types';

interface AwardsEventDetail {
  id: number; name: string;
  categories: CgCategory[];
}

export default function QuizEditPage() {
  const { id, quizId: quizIdRaw } = useParams<{ id: string; quizId: string }>();
  const eventId = parseInt(id!);
  const quizId = parseInt(quizIdRaw!);
  const navigate = useNavigate();

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}`);
      return res.data.data as AwardsEventDetail;
    },
  });
  const { data: quiz } = useQuiz(quizId);

  const updateQuiz = useUpdateQuiz(quizId, eventId);
  const updateChoice = useUpdateQuizChoice(quizId);
  const sync = useSyncQuizFromCategory(quizId);

  const [draft, setDraft] = useState<Partial<Quiz>>({});
  useEffect(() => {
    if (quiz) setDraft({
      title: quiz.title, title_en: quiz.title_en,
      question: quiz.question, question_en: quiz.question_en,
      choice_count: quiz.choice_count,
      countdown_seconds: quiz.countdown_seconds,
      link_category_id: quiz.link_category_id,
      display: quiz.display,
      mode: quiz.mode,
      has_answer_check: quiz.has_answer_check,
      cover_image_data_url: quiz.cover_image_data_url,
    });
  }, [quiz]);

  if (!quiz) return <div className="p-6 text-sm">読み込み中…</div>;

  const onSave = async () => {
    await updateQuiz.mutateAsync(draft);
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(`/event/${eventId}/quiz`)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <HelpCircle className="h-5 w-5 text-purple-600" />
        <h1 className="text-lg font-bold truncate">{quiz.title || '(タイトル未設定)'}</h1>
        <div className="flex-1" />
        <button onClick={() => navigate(`/event/${eventId}/quiz-stack/control`)}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-xs font-bold text-white">
          <Radio className="h-3 w-3" />スタック送出
        </button>
        <button onClick={onSave}
          disabled={updateQuiz.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white">
          <Save className="h-3 w-3" />{updateQuiz.isPending ? '保存中…' : '保存'}
        </button>
      </div>

      {/* 基本設定 */}
      <section className="mb-6 rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">基本設定</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="タイトル (JA)">
            <input value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full rounded border px-2 py-1.5"/>
          </Field>
          <Field label="タイトル (EN)">
            <input value={draft.title_en ?? ''} onChange={(e) => setDraft({ ...draft, title_en: e.target.value })}
              className="w-full rounded border px-2 py-1.5"/>
          </Field>
          <Field label="質問文 (JA)">
            <input value={draft.question ?? ''} onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              className="w-full rounded border px-2 py-1.5"/>
          </Field>
          <Field label="質問文 (EN)">
            <input value={draft.question_en ?? ''} onChange={(e) => setDraft({ ...draft, question_en: e.target.value })}
              className="w-full rounded border px-2 py-1.5"/>
          </Field>
          <Field label="択数">
            <select value={draft.choice_count ?? 3} onChange={(e) => setDraft({ ...draft, choice_count: parseInt(e.target.value) })}
              className="w-full rounded border px-2 py-1.5">
              {[2,3,4,5,6].map((n) => <option key={n} value={n}>{n} 択</option>)}
            </select>
          </Field>
          <Field label="カウントダウン (秒)">
            <input type="number" value={draft.countdown_seconds ?? 60} min={5} max={600}
              onChange={(e) => setDraft({ ...draft, countdown_seconds: parseInt(e.target.value) || 60 })}
              className="w-full rounded border px-2 py-1.5"/>
          </Field>
          <Field label="表示モード">
            <select value={draft.display ?? 'count'} onChange={(e) => setDraft({ ...draft, display: e.target.value as 'count' | 'percent' })}
              className="w-full rounded border px-2 py-1.5">
              <option value="count">票数</option>
              <option value="percent">パーセント</option>
            </select>
          </Field>
          <Field label="モード">
            <select value={draft.mode ?? 'survey'} onChange={(e) => setDraft({ ...draft, mode: e.target.value as 'survey' | 'survey-only' | 'quiz' })}
              className="w-full rounded border px-2 py-1.5">
              <option value="survey-only">アンケート (質問のみ)</option>
              <option value="survey">アンケート (結果発表あり)</option>
              <option value="quiz">クイズ (正解発表あり)</option>
            </select>
          </Field>
          <Field label="アンサーチェック">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!draft.has_answer_check}
                onChange={(e) => setDraft({ ...draft, has_answer_check: e.target.checked })}/>
              <span>結果/正解発表前に回答数を表示するステップを挿入</span>
            </label>
          </Field>
          <Field label="連動カテゴリ (任意)">
            <div className="flex gap-2">
              <select value={draft.link_category_id ?? ''}
                onChange={(e) => setDraft({ ...draft, link_category_id: e.target.value ? parseInt(e.target.value) : null })}
                className="flex-1 rounded border px-2 py-1.5">
                <option value="">手入力 (連動なし)</option>
                {(event?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} / {c.description || '-'}</option>
                ))}
              </select>
              <button onClick={async () => {
                if (!quiz.link_category_id) { alert('先に連動カテゴリを保存してください'); return; }
                if (!window.confirm('連動カテゴリの TOP-N で choices を上書きします。よろしいですか？')) return;
                await sync.mutateAsync();
              }}
                disabled={!quiz.link_category_id || sync.isPending}
                className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw className="h-3 w-3" />読み込み
              </button>
            </div>
          </Field>
        </div>
        <CoverImageEditor
          value={draft.cover_image_data_url ?? null}
          onChange={(v) => setDraft({ ...draft, cover_image_data_url: v })}
        />
      </section>

      {/* Choices */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">選択肢 ({quiz.choice_count} 件)</h2>
        <div className="space-y-2">
          {quiz.choices.slice(0, quiz.choice_count).map((c) => (
            <ChoiceEditor key={c.id} quizId={quizId} initial={c} updateChoice={updateChoice}
            showCorrectFlag={draft.mode === 'quiz'} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

interface ChoiceEditorProps {
  quizId: number;
  initial: import('@/quiz/types').QuizChoice;
  updateChoice: ReturnType<typeof useUpdateQuizChoice>;
  showCorrectFlag: boolean;
}

function ChoiceEditor({ initial, updateChoice, showCorrectFlag }: ChoiceEditorProps) {
  const [draft, setDraft] = useState({
    name: initial.name ?? '',
    name_en: initial.name_en ?? '',
    company: initial.company ?? '',
    company_en: initial.company_en ?? '',
    nomination_title: initial.nomination_title ?? '',
    nomination_title_en: initial.nomination_title_en ?? '',
    photo_data_url: initial.photo_data_url ?? '',
    vote_count: initial.vote_count ?? 0,
    is_correct: !!initial.is_correct,
  });
  useEffect(() => {
    setDraft({
      name: initial.name ?? '', name_en: initial.name_en ?? '',
      company: initial.company ?? '', company_en: initial.company_en ?? '',
      nomination_title: initial.nomination_title ?? '',
      nomination_title_en: initial.nomination_title_en ?? '',
      photo_data_url: initial.photo_data_url ?? '',
      vote_count: initial.vote_count ?? 0,
      is_correct: !!initial.is_correct,
    });
  }, [initial]);

  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * r), h = Math.round(img.height * r);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setDraft({ ...draft, photo_data_url: dataUrl }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', 0.82);
        setDraft((d) => ({ ...d, photo_data_url: out }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  };

  const save = () => {
    updateChoice.mutate({ position: initial.position, body: draft });
  };

  return (
    <div className="rounded border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-base font-black text-white">
          {initial.position}
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="名前" className="rounded border px-2 py-1.5"/>
          <input value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })}
            placeholder="Name (EN)" className="rounded border px-2 py-1.5"/>
          <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            placeholder="会社・所属" className="rounded border px-2 py-1.5"/>
          <input value={draft.company_en} onChange={(e) => setDraft({ ...draft, company_en: e.target.value })}
            placeholder="Company (EN)" className="rounded border px-2 py-1.5"/>
          <input value={draft.nomination_title} onChange={(e) => setDraft({ ...draft, nomination_title: e.target.value })}
            placeholder="ノミネートタイトル" className="rounded border px-2 py-1.5"/>
          <input value={draft.nomination_title_en} onChange={(e) => setDraft({ ...draft, nomination_title_en: e.target.value })}
            placeholder="Nomination Title (EN)" className="rounded border px-2 py-1.5"/>
          {showCorrectFlag && (
            <label className="flex items-center gap-2 text-xs col-span-1 sm:col-span-2 px-2 py-1.5 rounded border bg-amber-50">
              <input type="checkbox" checked={draft.is_correct}
                onChange={(e) => setDraft({ ...draft, is_correct: e.target.checked })}/>
              <span className="font-bold text-amber-800">この選択肢が正解 (複数選択可)</span>
            </label>
          )}
          <label className="block">
            <span className="block text-[10px] text-muted-foreground mb-0.5">投票数 / 回答数</span>
            <input type="text" inputMode="numeric" value={String(draft.vote_count)}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d]/g, '');
                const n = cleaned === '' ? 0 : parseInt(cleaned, 10);
                setDraft({ ...draft, vote_count: isNaN(n) ? 0 : Math.max(0, n) });
              }}
              onFocus={(e) => e.target.select()}
              className="w-full rounded border px-2 py-1.5"/>
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()}
              className="relative w-16 h-16 rounded-md overflow-hidden bg-slate-100 border hover:border-purple-500 flex items-center justify-center"
              title="画像をアップロード">
              {draft.photo_data_url
                ? <img src={draft.photo_data_url} alt="" className="w-full h-full object-cover"/>
                : <ImageIcon className="h-5 w-5 text-slate-400"/>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}/>
            {draft.photo_data_url && (
              <button onClick={() => setDraft({ ...draft, photo_data_url: '' })}
                className="text-[10px] text-slate-500 hover:text-red-500 inline-flex items-center gap-0.5">
                <ImageOff className="h-3 w-3"/>削除
              </button>
            )}
          </div>
        </div>
        <button onClick={save}
          disabled={updateChoice.isPending}
          className="shrink-0 rounded bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-50">
          保存
        </button>
      </div>
    </div>
  );
}

// ── 16:9 カバー画像エディタ (poll 段階のカメラ枠内に差し替え表示) ───────────
function CoverImageEditor({ value, onChange }: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        // 16:9 で 1280x720 にリサイズ + crop
        const targetW = 1280, targetH = 720;
        const canvas = document.createElement('canvas');
        canvas.width = targetW; canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) { onChange(dataUrl); return; }
        // cover 計算
        const srcRatio = img.width / img.height;
        const dstRatio = targetW / targetH;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > dstRatio) {
          sw = img.height * dstRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / dstRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        const out = canvas.toDataURL('image/jpeg', 0.82);
        onChange(out);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  };
  return (
    <div className="mt-2 rounded border bg-slate-50/40 p-3">
      <div className="text-[10px] font-bold text-slate-600 mb-2">カバー画像 (16:9, アンケート画面のカメラ枠内に表示)</div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-48 aspect-video rounded-md overflow-hidden bg-slate-200 border border-slate-300 hover:border-purple-500 flex items-center justify-center"
        >
          {value
            ? <img src={value} alt="" className="w-full h-full object-cover"/>
            : <span className="text-xs text-slate-500">クリックで画像を選択</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}/>
        {value && (
          <button onClick={() => onChange(null)}
            className="text-xs text-slate-500 hover:text-red-500">削除</button>
        )}
      </div>
      <div className="text-[10px] text-slate-500 mt-2">
        ※ 自動的に 1280×720 (16:9) にクロップされます。未設定の場合はアルファ透過枠のままです。
      </div>
    </div>
  );
}
