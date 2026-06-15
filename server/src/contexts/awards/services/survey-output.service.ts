import { queryAll } from '../../../shared/db/connection';

/**
 * v2.9.63: ランキングCG の survey-oneshot (アンケート No.1 発表) 用に、
 * 連動カテゴリ (link_category_id) を持つ top-reveal アンケートと選択肢を返す。
 *
 * ランキングCG は連動アンケートの選択肢 (name/company/photo/得票数) を直読みして
 * 最多得票を No.1 としてフルスクリーン発表する。最終票は quiz_choices.vote_count に
 * 残っているスナップショットを使う (アンケート終了後に発表する前提)。
 */
export interface SurveyChoiceOut {
  position: number;
  name: string | null;
  name_en: string | null;
  company: string | null;
  company_en: string | null;
  photo_data_url: string | null;
  nomination_title: string | null;
  nomination_title_en: string | null;
  vote_count: number;
}
export interface SurveyOut {
  id: number;
  link_category_id: number;
  title: string;
  title_en: string | null;
  display: 'count' | 'percent';
  choice_count: number;
  choices: SurveyChoiceOut[];
}

export async function fetchEventSurveys(eventId: number): Promise<SurveyOut[]> {
  const surveys = await queryAll(
    `SELECT id, link_category_id, title, title_en, display, choice_count
       FROM quizzes
      WHERE event_id = ?
        AND link_category_id IS NOT NULL
        AND mode = 'survey'
        AND survey_pattern = 'top-reveal'
      ORDER BY id`,
    [eventId]
  );
  if (surveys.length === 0) return [];

  const out: SurveyOut[] = [];
  for (const s of surveys) {
    const choices = await queryAll(
      `SELECT position, name, name_en, company, company_en, photo_data_url,
              nomination_title, nomination_title_en, vote_count
         FROM quiz_choices
        WHERE quiz_id = ?
        ORDER BY position`,
      [s.id]
    );
    out.push({
      id: s.id as number,
      link_category_id: s.link_category_id as number,
      title: (s.title as string) ?? '',
      title_en: (s.title_en as string | null) ?? null,
      display: s.display === 'percent' ? 'percent' : 'count',
      choice_count: (s.choice_count as number) ?? choices.length,
      choices: choices as unknown as SurveyChoiceOut[],
    });
  }
  return out;
}
