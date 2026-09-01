/**
 * contexts/graphics/services/interactive-bridge.service.ts — 段6-7
 *
 * テロップCGから別 VPS のインタラクティブ演出 (interactive.gmo-onair.jp) の
 * 外部公開 API を叩く HTTP クライアント。
 *
 * `server/src/contexts/quiz/services/interactive-bridge.service.ts`（旧リアルタイムCG
 * `client-awards` 向けに実装済み・実運用実績あり）の**ほぼそのままの移植**——この
 * ファイルは DB を一切読み書きしない純粋な HTTP クライアントで、どの内部コンテキストが
 * 呼んでも Interactive 側の外部公開APIの契約は変わらないため、移植による挙動変更は無い。
 * 変えたのはファイルパス・コメントのみ。
 *
 * 認証は X-API-Key ヘッダー（Interactive 側 interactive_api_keys テーブルで発行）。
 * 設定は graphics_projects.interactive_link JSONB に保存する（migration 258）。
 */
import { AppError } from '../../../shared/middleware/errorHandler';
import { assertSafeHttpsUrl } from '../../../shared/security/safe-remote-url';

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
  // SSRF 対策（ICS の SEC-01 と同じ守り）: 保存済みの古いリンクや別経路の呼び出しにも
  // 効かせる二重の検証。https 以外・ループバック/プライベート宛にはサーバーから出ない。
  // グローバル fetch には publicHttpsAgent を渡せないため、リテラル IP とスキームの
  // 検証のみ（DNS 再解決までの守りが要るなら undici の dispatcher で lookup を差し替える）
  try {
    assertSafeHttpsUrl(link.baseUrl);
  } catch (e) {
    throw new AppError(400, 'INTERACTIVE_UNSAFE_URL', `Interactive の baseUrl が不正です: ${(e as Error).message}`);
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

  /** 出題 (回答受付開始) — カウントダウン開始・voteState='open' に連動 */
  activateQuestion(link: InteractiveLink, questionId: string) {
    return call<{ ok: boolean; status: string }>(link, 'POST', `/questions/${encodeURIComponent(questionId)}/activate`);
  },

  /** 締切 (回答受付終了) — カウントダウン終了 + バッファに連動 */
  closeQuestion(link: InteractiveLink, questionId: string) {
    return call<{ ok: boolean; status: string }>(link, 'POST', `/questions/${encodeURIComponent(questionId)}/close`);
  },

  /** 正解発表・開票 — voteState='revealed' に連動して視聴者画面に正解/結果を表示 */
  revealQuestion(link: InteractiveLink, questionId: string) {
    return call<{ ok: boolean; status: string }>(link, 'POST', `/questions/${encodeURIComponent(questionId)}/reveal`);
  },

  /** クリア — 連携解除・ページ削除等に連動して視聴者画面の問題表示を消す */
  dismissQuestion(link: InteractiveLink, questionId: string) {
    return call<{ ok: boolean; status: string }>(link, 'POST', `/questions/${encodeURIComponent(questionId)}/dismiss`);
  },

  /** テロップCG → Interactive へ問題本文・選択肢を書き込む (push) */
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
