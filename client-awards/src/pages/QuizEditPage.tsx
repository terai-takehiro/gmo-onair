import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  ArrowLeft, RefreshCw, Image as ImageIcon, ImageOff, Save, Radio, Check,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { useQuiz, useUpdateQuiz, useUpdateQuizChoice, useSyncQuizFromCategory } from '@/quiz/api';
import type { Quiz } from '@/quiz/types';
import { QUIZ_COLORS } from '@/quiz/types';
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

  if (!quiz) return <div className="p-6 text-sm text-muted-foreground">読み込み中…</div>;

  const isQuiz = (draft.mode ?? quiz.mode) === 'quiz';

  const onSave = async () => {
    await updateQuiz.mutateAsync(draft);
    // v2.9.26: Interactive と連携済みの quiz は保存時に本文・選択肢・正解を自動同期。
    // 未連携 (interactive_question_id 無し) のときは新規作成を避けるため何もしない。
    if ((quiz as unknown as { interactive_question_id?: string | null }).interactive_question_id) {
      try {
        await api.post(`/quiz/events/${eventId}/interactive-link/push/${quizId}`);
      } catch { /* 連携未設定/失敗は保存をブロックしない */ }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5 pb-12">
      {/* Header — インタラクティブ QuizManagerPage と同じ構成 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/event/${eventId}/quiz`)}
          aria-label="戻る"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold truncate">{quiz.title || '(タイトル未設定)'}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isQuiz ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {isQuiz ? 'クイズ' : 'アンケート'}
            </span>
            <span className="text-xs text-muted-foreground">{quiz.choice_count} 択 / {draft.countdown_seconds ?? quiz.countdown_seconds} 秒</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => navigate(`/event/${eventId}/quiz-stack/control`)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            <Radio className="h-3.5 w-3.5" />送出
          </button>
          <button onClick={onSave}
            disabled={updateQuiz.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white">
            <Save className="h-3.5 w-3.5" />{updateQuiz.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {/* 種別タブ (アンケート / クイズ) — インタラクティブ側のタブ UI に合わせる */}
      <div className="flex gap-1 border-b">
        {(['survey', 'quiz'] as const).map((m) => {
          const active = (draft.mode ?? 'survey') === m;
          return (
            <button key={m}
              onClick={() => setDraft({ ...draft, mode: m })}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active ? 'border-purple-600 text-purple-700' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {m === 'quiz' ? 'クイズ (正解発表あり)' : 'アンケート'}
            </button>
          );
        })}
      </div>

      {/* 基本設定 */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">基本設定</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="タイトル (JA)">
            <input value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="例: 最優秀新人賞"
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="タイトル (EN)">
            <input value={draft.title_en ?? ''} onChange={(e) => setDraft({ ...draft, title_en: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="質問文 (JA)">
            <input value={draft.question ?? ''} onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              placeholder="例: もっともふさわしいのは？"
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="質問文 (EN)">
            <input value={draft.question_en ?? ''} onChange={(e) => setDraft({ ...draft, question_en: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="択数">
            <select value={draft.choice_count ?? 3} onChange={(e) => setDraft({ ...draft, choice_count: parseInt(e.target.value) })}
              className="w-full rounded-lg border px-3 py-2">
              {[2,3,4,5,6].map((n) => <option key={n} value={n}>{n} 択</option>)}
            </select>
          </Field>
          <Field label="カウントダウン (秒)">
            <input type="number" value={draft.countdown_seconds ?? 60} min={5} max={600}
              onChange={(e) => setDraft({ ...draft, countdown_seconds: parseInt(e.target.value) || 60 })}
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="表示モード">
            <select value={draft.display ?? 'count'} onChange={(e) => setDraft({ ...draft, display: e.target.value as 'count' | 'percent' })}
              className="w-full rounded-lg border px-3 py-2">
              <option value="count">票数</option>
              <option value="percent">パーセント</option>
            </select>
          </Field>
          <Field label="連動カテゴリ (任意)">
            <div className="flex gap-2">
              <select value={draft.link_category_id ?? ''}
                onChange={(e) => setDraft({ ...draft, link_category_id: e.target.value ? parseInt(e.target.value) : null })}
                className="flex-1 rounded-lg border px-3 py-2">
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
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 hover:bg-slate-50 disabled:opacity-50 text-xs">
                <RefreshCw className="h-3.5 w-3.5" />取込
              </button>
            </div>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm rounded-lg border bg-slate-50/60 px-3 py-2">
          <input type="checkbox" checked={!!draft.has_answer_check}
            onChange={(e) => setDraft({ ...draft, has_answer_check: e.target.checked })}/>
          <span>結果/正解発表の前に「回答数の確認」ステップを挿入する</span>
        </label>

        <CoverImageEditor
          value={draft.cover_image_data_url ?? null}
          onChange={(v) => setDraft({ ...draft, cover_image_data_url: v })}
        />
      </section>

      {/* 選択肢 */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">選択肢 ({quiz.choice_count} 件)</h2>
          {isQuiz && (
            <span className="text-[11px] text-green-700 font-medium flex items-center gap-1">
              <Check className="h-3 w-3" />正解を選択 (複数可)
            </span>
          )}
        </div>
        <div className="space-y-2">
          {quiz.choices.slice(0, quiz.choice_count).map((c) => (
            <ChoiceEditor key={c.id} quizId={quizId} initial={c} updateChoice={updateChoice}
              showCorrectFlag={isQuiz} />
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
  const [open, setOpen] = useState(false);
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
  const color = QUIZ_COLORS[(initial.position - 1) % QUIZ_COLORS.length];

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
    <div className="rounded-lg border bg-card p-3">
      {/* 基本行: 番号 + 名前 + 正解トグル + 写真 + 保存 */}
      <div className="flex items-center gap-2.5">
        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white"
          style={{ background: color.core }}>
          {initial.position}
        </div>

        {/* 正解トグル (クイズ時のみ) — インタラクティブ側と同じ緑チェック */}
        {showCorrectFlag && (
          <button type="button" aria-pressed={draft.is_correct}
            aria-label={`選択肢 ${initial.position} を正解にする`}
            onClick={() => setDraft({ ...draft, is_correct: !draft.is_correct })}
            className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
              draft.is_correct ? 'border-green-500 bg-green-500 text-white' : 'border-slate-300 text-transparent hover:border-green-400'
            }`}>
            <Check className="h-4 w-4" />
          </button>
        )}

        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder={`選択肢 ${initial.position}`} className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"/>

        <button onClick={() => fileRef.current?.click()}
          className="relative w-9 h-9 rounded-lg overflow-hidden bg-slate-100 border hover:border-purple-500 flex items-center justify-center shrink-0"
          title="画像をアップロード">
          {draft.photo_data_url
            ? <img src={draft.photo_data_url} alt="" className="w-full h-full object-cover"/>
            : <ImageIcon className="h-4 w-4 text-slate-400"/>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}/>

        <button onClick={save} disabled={updateChoice.isPending}
          className="shrink-0 rounded-lg bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 text-xs font-bold disabled:opacity-50">
          保存
        </button>
      </div>

      {/* 詳細 (CG 表示用) — 折りたたみでシンプルさを維持 */}
      <button onClick={() => setOpen((o) => !o)}
        className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        詳細 (CG 表示用: 英語名 / 会社 / ノミネートタイトル / 票数)
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <input value={draft.name_en} onChange={(e) => setDraft({ ...draft, name_en: e.target.value })}
            placeholder="Name (EN)" className="rounded-lg border px-3 py-2"/>
          <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            placeholder="会社・所属" className="rounded-lg border px-3 py-2"/>
          <input value={draft.company_en} onChange={(e) => setDraft({ ...draft, company_en: e.target.value })}
            placeholder="Company (EN)" className="rounded-lg border px-3 py-2"/>
          <input value={draft.nomination_title} onChange={(e) => setDraft({ ...draft, nomination_title: e.target.value })}
            placeholder="ノミネートタイトル" className="rounded-lg border px-3 py-2"/>
          <input value={draft.nomination_title_en} onChange={(e) => setDraft({ ...draft, nomination_title_en: e.target.value })}
            placeholder="Nomination Title (EN)" className="rounded-lg border px-3 py-2"/>
          <label className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground shrink-0">投票数/回答数</span>
            <input type="text" inputMode="numeric" value={String(draft.vote_count)}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d]/g, '');
                const n = cleaned === '' ? 0 : parseInt(cleaned, 10);
                setDraft({ ...draft, vote_count: isNaN(n) ? 0 : Math.max(0, n) });
              }}
              onFocus={(e) => e.target.select()}
              className="w-full rounded-lg border px-3 py-2"/>
          </label>
          {draft.photo_data_url && (
            <button onClick={() => setDraft({ ...draft, photo_data_url: '' })}
              className="text-[11px] text-slate-500 hover:text-red-500 inline-flex items-center gap-1 justify-self-start">
              <ImageOff className="h-3.5 w-3.5"/>画像を削除
            </button>
          )}
        </div>
      )}
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
    <div className="rounded-lg border bg-slate-50/40 p-3">
      <div className="text-[11px] font-bold text-slate-600 mb-2">カバー画像 (16:9, アンケート画面のカメラ枠内に表示)</div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-48 aspect-video rounded-lg overflow-hidden bg-slate-200 border border-slate-300 hover:border-purple-500 flex items-center justify-center"
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
      <div className="text-[11px] text-slate-500 mt-2">
        ※ 自動的に 1280×720 (16:9) にクロップされます。未設定の場合はアルファ透過枠のままです。
      </div>
    </div>
  );
}
