/**
 * contexts/quiz/services/interactive-bridge.service.ts — v2.9.24
 *
 * 表彰CG (Awards) から別 VPS のインタラクティブ演出 (interactive.gmo-onair.jp) の
 * 外部公開 API を叩く HTTP クライアント。
 *
 * 認証は X-API-Key ヘッダー (Interactive 側 interactive_api_keys テーブルで発行)。
 * 設定は awards_events.interactive_link JSONB に保存されている前提。
 */
import { AppError } from '../../../shared/middleware/errorHandler';

export interface InteractiveLink {
  baseUrl: string;
  apiKeyPrefix?: string;
  apiKeySecret: string;
  interactiveEventId: string;
  /** カウントダウン終了後、回答締切までに足す配信ディレイ秒 (0-120) */
  closeBufferSeconds?: number;
  /** カウントダウン連動で自動出題/締切するか (default true) */
  autoControl?: boolean;
}

export interface InteractiveResultsDump {
  questionId: string;
  type?: string;
  correctIndex?: number | null;
  status?: string;
  texts: { lang: string; question: string; choices: string[] }[];
  results: { total: number; choices: { index: number; count: number; percent: number }[] };
}

export interface InteractiveQuestionSummary {
  id: string;
  type: string;
  status: string;
  correct_index: number | null;
  correct_indices?: number[] | null;
  texts: { language_code: string; question_text: string; choices: string[] }[] | null;
  answer_count: number;
}

function base(link: InteractiveLink): string {
  return `${(link.baseUrl || '').replace(/\/+$/, '')}/api/v1/external/interactive`;
}

async function call<T>(
  link: InteractiveLink,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  if (!link?.baseUrl || !link?.apiKeySecret) {
    throw new AppError(400, 'NOT_CONFIGURED', 'Interactive 連携が設定されていません');
  }
  let res: Response;
  try {
    res = await fetch(`${base(link)}${path}`, {
      method,
      headers: {
        'X-API-Key': link.apiKeySecret,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new AppError(502, 'INTERACTIVE_UNREACHABLE', `Interactive サーバーに接続できません: ${(err as Error).message}`);
  }
  if (res.status === 401) {
    throw new AppError(401, 'INTERACTIVE_AUTH', 'Interactive の API キーが無効です');
  }
  if (!res.ok) {
    throw new AppError(502, 'INTERACTIVE_ERROR', `Interactive API エラー (HTTP ${res.status})`);
  }
  const json = (await res.json()) as { data?: T };
  return json.data as T;
}

export const interactiveBridge = {
  /** 連携先候補のイベント一覧 */
  listEvents(link: InteractiveLink) {
    return call<Array<{ id: string; title: string; status: string }>>(link, 'GET', '/events');
  },

  /** 連携イベントの問題一覧 (本文 + 多言語 + 回答数) */
  listQuestions(link: InteractiveLink) {
    return call<{ event: unknown; questions: InteractiveQuestionSummary[] }>(
      link, 'GET', `/events/${encodeURIComponent(link.interactiveEventId)}/questions`,
    );
  },

  /** 1 問の集計結果 (言語横断で合算済みの得票数) */
  getResults(link: InteractiveLink, questionId: string) {
    return call<InteractiveResultsDump>(link, 'GET', `/questions/${encodeURIComponent(questionId)}/results`);
  },

  /** 出題 (回答受付開始) — カウントダウン開始に連動 */
  activateQuestion(link: InteractiveLink, questionId: string) {
    return call<{ ok: boolean; status: string }>(link, 'POST', `/questions/${encodeURIComponent(questionId)}/activate`);
  },

  /** 締切 (回答受付終了) — カウントダウン終了 + バッファに連動 */
  closeQuestion(link: InteractiveLink, questionId: string) {
    return call<{ ok: boolean; status: string }>(link, 'POST', `/questions/${encodeURIComponent(questionId)}/close`);
  },

  /** 正解発表 — Awards の「正解発表」操作に連動して視聴者画面に正解を表示 */
  revealQuestion(link: InteractiveLink, questionId: string) {
    return call<{ ok: boolean; status: string }>(link, 'POST', `/questions/${encodeURIComponent(questionId)}/reveal`);
  },

  /** クリア — Awards の「クリア」操作に連動して視聴者画面の問題表示を消す */
  dismissQuestion(link: InteractiveLink, questionId: string) {
    return call<{ ok: boolean; status: string }>(link, 'POST', `/questions/${encodeURIComponent(questionId)}/dismiss`);
  },

  /** Awards → Interactive へ問題本文・選択肢を書き込む (push) */
  syncQuestions(
    link: InteractiveLink,
    questions: Array<{
      interactiveQuestionId?: string | null;
      type?: string;
      correctIndex?: number | null;
      correctIndexes?: number[];
      texts: Array<{ lang: string; question: string; choices: string[] }>;
    }>,
  ) {
    return call<Array<{ interactiveQuestionId: string }>>(
      link, 'POST', `/events/${encodeURIComponent(link.interactiveEventId)}/questions/sync`,
      { questions },
    );
  },
};
