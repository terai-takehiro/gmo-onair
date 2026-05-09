// shared/src/client/queryClient.ts — Common React Query client config
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // 4xx は retry しない (権限/認証エラーは即時に表示)。
      // 5xx / network 系は最大 2 回 retry (= 計 3 試行) で transient blip を吸収。
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } } | null | undefined)?.response?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
      refetchOnWindowFocus: false,
    },
  },
});
