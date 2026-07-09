import { AppError } from '../../shared/middleware/errorHandler';

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
