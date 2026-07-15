import { AsyncLocalStorage } from 'async_hooks';

// authorize ハンドラは provider.authorize(client, params, res) に req/cookie を渡さないため、
// /authorize の pre-middleware で解決した ONAiR ユーザーを AsyncLocalStorage 経由で provider に渡す。
export interface AuthorizeContext {
  userId: string;
  userName?: string;
}

export const authorizeContext = new AsyncLocalStorage<AuthorizeContext>();
