/**
 * awards/services/interactive-bridge.service.ts
 *
 * 表彰CG (Awards) からインタラクティブ演出 (Interactive) の外部公開 API を呼んで
 * クイズ/アンケート結果を取り込むためのブリッジ。
 *
 * 通信プロトコル:
 *   - baseUrl + "/api/v1/external/interactive" 配下にアクセス
 *   - 認証は X-API-Key ヘッダー (Interactive 側 interactive_api_keys で発行)
 *   - サーバー間通信 (browser からは呼ばない) のため API キーは Awards サーバーに留まる
 *
 * 連携設定の保存先: awards_events.interactive_link JSONB
 *   {
 *     baseUrl: string,                // 例: "https://interactive.gmo-onair.jp"
 *                                     //   ローカル/統合運用時は "" (同サーバー扱い)
 *     apiKeySecret: string,           // v1: 平文保存 (社内限定運用、SSO 移行時に改善)
 *     apiKeyPrefix: string,           // 表示用 ("ak_xxxx...")
 *     eventId: string,                // interactive 側の event id
 *     mapping: {
 *       [interactiveQuestionId]: {
 *         mode: "choices-as-entries",
 *         targetField: "points" | "own_points",
 *         choiceMap: { [choiceIndex: string]: awardsEntryId }
 *       }
 *     }
 *   }
 */
import { queryOne, queryAll, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { questionService } from '../../interactive/services/question.service';

export interface InteractiveLinkConfig {
  baseUrl: string;
  apiKeySecret: string;
  apiKeyPrefix?: string;
  eventId: string;
  mapping?: Record<string, MappingEntry>;
}

export interface MappingEntry {
  mode: 'choices-as-entries';
  targetField: 'points' | 'own_points';
  choiceMap: Record<string, number>; // choiceIndex (string) → awards_entries.id
}

interface ExternalQuestionResult {
  questionId: string;
  type: 'quiz' | 'survey';
  correctIndex: number | null;
  status: string;
  texts: Array<{ lang: string; question: string; choices: string[] }>;
  results: {
    total: number;
    choices: Array<{ index: number; count: number; percent: number }>;
  };
}

interface ExternalQuestionListItem {
  id: string;
  type: string;
  status: string;
  correct_index: number | null;
  texts: Array<{
    language_code: string;
    question_text: string;
    choices: string[] | string;
  }> | null;
  answer_count: number;
}

function maskKey(prefix: string): string {
  return `${prefix.slice(0, 6)}••••`;
}

/**
 * Interactive 外部 API を呼ぶ。
 *   - baseUrl が設定されていれば HTTPS で外部 VPS の Interactive を叩く
 *     (将来 Interactive を別 VPS に切り出した後の本番経路)
 *   - baseUrl が空のときは同一プロセスの questionService を直接呼び出す
 *     (切り出し前の統合運用時のローカル経路 — 余計な HTTP オーバーヘッドを避ける)
 *
 * いずれの経路でも返す形は外部 API スキーマに揃える。
 */
async function fetchQuestionList(
  cfg: InteractiveLinkConfig,
): Promise<{ event: { id: string; title: string; status: string }; questions: ExternalQuestionListItem[] }> {
  const base = (cfg.baseUrl || '').trim();
  if (!base) {
    const ev = (await queryOne(
      'SELECT id, title, status FROM interactive_events WHERE id = ? AND deleted_at IS NULL',
      [cfg.eventId],
    )) as { id: string; title: string; status: string } | null;
    if (!ev) throw new AppError(404, 'NOT_FOUND', 'Interactive イベントが見つかりません');
    const questions = (await questionService.listByEvent(cfg.eventId)) as unknown as ExternalQuestionListItem[];
    return { event: ev, questions };
  }
  return httpGet<{
    event: { id: string; title: string; status: string };
    questions: ExternalQuestionListItem[];
  }>(cfg, `/events/${encodeURIComponent(cfg.eventId)}/questions`);
}

async function fetchQuestionResults(
  cfg: InteractiveLinkConfig,
  questionId: string,
): Promise<ExternalQuestionResult> {
  const base = (cfg.baseUrl || '').trim();
  if (!base) {
    const q = await questionService.getById(questionId);
    if (!q) throw new AppError(404, 'NOT_FOUND', '問題が見つかりません');
    return (await questionService.getResultsDump(questionId)) as ExternalQuestionResult;
  }
  return httpGet<ExternalQuestionResult>(
    cfg,
    `/questions/${encodeURIComponent(questionId)}/results`,
  );
}

async function httpGet<T>(cfg: InteractiveLinkConfig, pathSuffix: string): Promise<T> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const url = `${base}/api/v1/external/interactive${pathSuffix}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': cfg.apiKeySecret,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError(
      res.status === 401 ? 401 : 502,
      'INTERACTIVE_API_ERROR',
      `Interactive API エラー (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { data?: T };
  if (!json.data) throw new AppError(502, 'INTERACTIVE_API_ERROR', 'レスポンス形式が不正です');
  return json.data;
}

async function getEventLink(eventId: number): Promise<InteractiveLinkConfig | null> {
  const row = (await queryOne(
    `SELECT interactive_link FROM awards_events WHERE id = ?`,
    [eventId],
  )) as { interactive_link: InteractiveLinkConfig | null } | null;
  return row?.interactive_link ?? null;
}

export const interactiveBridge = {
  async getLink(eventId: number): Promise<{
    baseUrl: string;
    apiKeyMasked: string;
    eventId: string;
    mapping: Record<string, MappingEntry>;
  } | null> {
    const cfg = await getEventLink(eventId);
    if (!cfg) return null;
    return {
      baseUrl: cfg.baseUrl || '',
      apiKeyMasked: cfg.apiKeyPrefix ? maskKey(cfg.apiKeyPrefix) : '••••',
      eventId: cfg.eventId,
      mapping: cfg.mapping ?? {},
    };
  },

  async saveLink(
    eventId: number,
    input: {
      baseUrl: string;
      apiKeySecret?: string; // 空なら既存のシークレットを保持
      eventId: string;
      mapping?: Record<string, MappingEntry>;
    },
  ): Promise<void> {
    const existing = await getEventLink(eventId);
    const apiKeySecret = (input.apiKeySecret?.trim() || existing?.apiKeySecret || '').trim();
    if (!apiKeySecret) {
      throw new AppError(400, 'VALIDATION_ERROR', 'API キーが未設定です');
    }
    const apiKeyPrefix = apiKeySecret.startsWith('ak_')
      ? apiKeySecret.slice(0, 10)
      : existing?.apiKeyPrefix ?? '';
    const payload: InteractiveLinkConfig = {
      baseUrl: input.baseUrl.trim(),
      apiKeySecret,
      apiKeyPrefix,
      eventId: input.eventId.trim(),
      mapping: input.mapping ?? existing?.mapping ?? {},
    };
    await execute(
      `UPDATE awards_events SET interactive_link = ?::jsonb, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(payload), eventId],
    );
  },

  async clearLink(eventId: number): Promise<void> {
    await execute(
      `UPDATE awards_events SET interactive_link = NULL, updated_at = NOW() WHERE id = ?`,
      [eventId],
    );
  },

  /** 連携先 Interactive イベントの問題一覧を取得 (マッピング UI 用) */
  async previewQuestions(eventId: number): Promise<{
    event: { id: string; title: string; status: string };
    questions: ExternalQuestionListItem[];
  }> {
    const cfg = await getEventLink(eventId);
    if (!cfg) throw new AppError(404, 'NOT_LINKED', 'この Awards イベントは Interactive と連携していません');
    return fetchQuestionList(cfg);
  },

  /**
   * 設定済み mapping に基づいて結果を取り込み、awards_entries.points / own_points を更新。
   * @returns 取り込み結果のサマリー
   */
  async ingest(eventId: number): Promise<{
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
        targetField: 'points' | 'own_points';
      }>;
    }>;
  }> {
    const cfg = await getEventLink(eventId);
    if (!cfg) throw new AppError(404, 'NOT_LINKED', 'Interactive と連携していません');
    const mapping = cfg.mapping ?? {};
    const questionIds = Object.keys(mapping);
    if (questionIds.length === 0) {
      return { updatedEntries: 0, questions: [] };
    }

    let updated = 0;
    const summary: Array<{
      questionId: string;
      questionText?: string;
      total: number;
      assignments: Array<{
        choiceIndex: number;
        choiceText?: string;
        entryId: number;
        entryName?: string;
        count: number;
        targetField: 'points' | 'own_points';
      }>;
    }> = [];

    // 当該 Awards イベントの entry id 集合を事前に取得 (誤った id を弾く)
    const validEntries = (await queryAll(
      `SELECT id, name FROM awards_entries WHERE event_id = ?`,
      [eventId],
    )) as Array<{ id: number; name: string }>;
    const validIds = new Set(validEntries.map((e) => e.id));
    const nameById = new Map(validEntries.map((e) => [e.id, e.name] as const));

    for (const qid of questionIds) {
      const map = mapping[qid];
      if (!map || map.mode !== 'choices-as-entries') continue;
      const result = await fetchQuestionResults(cfg, qid);
      const jaText = result.texts.find((t) => t.lang === 'ja') ?? result.texts[0];
      const questionText = jaText?.question;
      const choicesArr = jaText?.choices ?? [];
      const assignments: Array<{
        choiceIndex: number;
        choiceText?: string;
        entryId: number;
        entryName?: string;
        count: number;
        targetField: 'points' | 'own_points';
      }> = [];

      for (const c of result.results.choices) {
        const entryId = map.choiceMap[String(c.index)];
        if (!entryId || !validIds.has(entryId)) continue;
        const field = map.targetField === 'own_points' ? 'own_points' : 'points';
        await execute(
          `UPDATE awards_entries SET ${field} = ?, updated_at = NOW() WHERE id = ? AND event_id = ?`,
          [c.count, entryId, eventId],
        );
        updated += 1;
        assignments.push({
          choiceIndex: c.index,
          choiceText: choicesArr[c.index],
          entryId,
          entryName: nameById.get(entryId),
          count: c.count,
          targetField: field,
        });
      }
      summary.push({
        questionId: qid,
        questionText,
        total: result.results.total,
        assignments,
      });
    }
    return { updatedEntries: updated, questions: summary };
  },
};
