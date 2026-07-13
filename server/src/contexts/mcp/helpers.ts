import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../../shared/middleware/errorHandler';
import { execute } from '../../shared/db/connection';

// MCP ツール共通ヘルパー

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

/** ツールの正常応答 (JSON を text content にして返す) */
export function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

/** ツールハンドラを try/catch で包み、AppError 等を isError 応答に変換する */
export async function runTool(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof AppError
      ? err.message
      : err instanceof Error ? err.message : String(err);
    const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message, code }) }],
      isError: true,
    };
  }
}

/** 一覧ツールの limit を 1〜100 にクランプ (コンテキスト保護) */
export function clampLimit(n: number | undefined, fallback = 20): number {
  return Math.min(100, Math.max(1, n ?? fallback));
}

/** ページング情報 (paginatedResponse と同じ形) */
export function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

// ============================================================
// 書き込みツール共通: confirm フロー / 監査ログ
// ============================================================

/** 全書き込みツール共通の任意引数 (監査ログ用の指示者名) */
export const REQUESTED_BY = {
  requested_by: z.string().max(100).optional()
    .describe('この操作を依頼した人の名前 (監査ログに記録される。分かる場合は必ず渡す)'),
};

/**
 * 危険操作の confirm フロー (ステートレス)。
 * confirm: false のとき書き込まずにこのプレビューを返し、AI がユーザーに内容を提示して
 * 了承を得てから confirm: true で再実行する契約。
 */
export function preview(action: string, effects: string[], warning?: string): ToolResult {
  return ok({
    preview: true,
    executed: false,
    action,
    effects,
    ...(warning ? { warning } : {}),
    next_step: '上記の内容をユーザーに提示し、明示的な了承を得てから confirm: true を付けて再実行してください',
  });
}

/** args 内の長大文字列を切り詰める (監査ログの肥大防止) */
function truncateDeep(value: unknown, maxLen: number): unknown {
  if (typeof value === 'string') {
    return value.length > maxLen ? value.slice(0, maxLen) + '…[truncated]' : value;
  }
  if (Array.isArray(value)) return value.map((v) => truncateDeep(v, maxLen));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = truncateDeep(v, maxLen);
    return out;
  }
  return value;
}

/**
 * 監査ログ記録 (書き込み成功時のみ呼ぶ)。fire-and-forget —
 * INSERT に失敗してもツールの成功結果は変えない (warn のみ)。
 */
export function audit(tool: string, args: unknown, resultSummary: unknown, requestedBy?: string): void {
  void execute(
    `INSERT INTO mcp_audit_log (id, tool_name, args, result_summary, requested_by) VALUES (?, ?, ?::jsonb, ?::jsonb, ?)`,
    [uuidv4(), tool, JSON.stringify(truncateDeep(args, 1000) ?? null), JSON.stringify(resultSummary ?? null), requestedBy ?? null],
  ).catch((e) => console.warn('[mcp audit] insert failed (non-blocking):', (e as Error).message));
}
