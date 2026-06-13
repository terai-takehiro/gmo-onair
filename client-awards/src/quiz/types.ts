// アンケートCG は「投票 (poll) + 集計 (answer-check)」まで。
// クイズは正解発表 (correct-reveal) まで。No.1 発表 (旧 reveal/winner) は
// ランキングCG の survey-oneshot ステップへ移管済 (v2.9.63)。
export type QuizStep = 'idle' | 'poll' | 'answer-check' | 'correct-reveal';
export type QuizDisplay = 'count' | 'percent';
export type QuizMode = 'survey' | 'quiz';

// アンケート時の演出パターン (クイズ時は null = 常に正解発表)
//   'answer-check' = poll → answer-check → idle (集計のみで終了)
//   'top-reveal'   = poll → answer-check → idle (quiz 側は同一。この賞の No.1 を
//                    ランキングCG (survey-oneshot) で連動カテゴリの賞の最後に発表する)
export type SurveyPattern = 'answer-check' | 'top-reveal';

export interface QuizStackCue {
  eventId: number;
  currentQuizId: number | null;
  step: QuizStep;
  pollStartedAt: number | null;
  revealPhase: 0 | 1 | 2;
}

export interface Quiz {
  id: number;
  event_id: number;
  title: string;
  title_en: string | null;
  question: string;
  question_en: string | null;
  choice_count: number;
  countdown_seconds: number;
  link_category_id: number | null;
  display: QuizDisplay;
  display_order: number;
  mode: QuizMode;
  has_answer_check: boolean;
  /** v2.9.36: アンケート時の演出パターン。mode='quiz' のときは null (常に正解発表). */
  survey_pattern: SurveyPattern | null;
  cover_image_data_url: string | null;
  /** v2.9.48: 送出 UI に表示する任意の名前。空なら title をフォールバック表示。 */
  stack_label: string | null;
}

/** v2.9.48: 送出 UI に表示する名前 (stack_label > title フォールバック)。 */
export function quizStackLabel(q: { stack_label?: string | null; title?: string | null; id: number }): string {
  return (q.stack_label && q.stack_label.trim())
    || (q.title && q.title.trim())
    || `quiz #${q.id}`;
}

export interface QuizChoice {
  id: number;
  quiz_id: number;
  position: number;
  name: string;
  name_en: string | null;
  company: string | null;
  company_en: string | null;
  nomination_title: string | null;
  nomination_title_en: string | null;
  photo_data_url: string | null;
  vote_count: number;
  is_correct: boolean;
}

export interface QuizWithChoices extends Quiz {
  choices: QuizChoice[];
}

export interface QuizCueState {
  quizId: number;
  step: QuizStep;
  pollStartedAt: number | null;
  revealPhase: 0 | 1 | 2;
  votes: Record<number, number>;
}

export const QUIZ_COLORS = [
  { core: '#3F72D9', deep: '#0E2956', glow: 'rgba(120,170,255,0.45)' }, // 1: blue
  { core: '#D03F36', deep: '#5A0C0C', glow: 'rgba(255,130,110,0.45)' }, // 2: red
  { core: '#2EA866', deep: '#0B3B25', glow: 'rgba(120,230,160,0.45)' }, // 3: green
  { core: '#E0982F', deep: '#5E3D08', glow: 'rgba(255,200,90,0.45)'  }, // 4: amber
  { core: '#9B59B6', deep: '#3D1B4A', glow: 'rgba(200,130,230,0.45)' }, // 5: purple
  { core: '#1ABC9C', deep: '#0B4A40', glow: 'rgba(100,230,210,0.45)' }, // 6: cyan
];
