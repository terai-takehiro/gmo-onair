import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import App from './App';
import './index.css';
import './cg/cg.css';
import { NoticeBar, ConfirmHost } from '@gmo-onair/shared/src/client/ui';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // v2.8.80+: 詳細エラーをコンソールに出して原因特定をしやすく
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg font-semibold text-destructive">エラーが発生しました</p>
          <p className="text-sm text-muted-foreground">ページを再読み込みしてください</p>
          {err && (
            <details className="max-w-md text-left text-xs text-muted-foreground bg-muted/40 rounded-md p-3 whitespace-pre-wrap break-all">
              <summary className="cursor-pointer font-bold mb-1">エラー詳細</summary>
              <p className="font-mono">{err.name}: {err.message}</p>
              {err.stack && (
                <pre className="mt-2 text-[10px] opacity-80 overflow-x-auto">{err.stack.split('\n').slice(0, 8).join('\n')}</pre>
              )}
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/*
          お知らせ帯と確認ダイアログの出る場所。**アプリに1組だけ、ルート直下**に置く (v2.9.290)。
          AppShell (ヘッダーとレール) の中ではなくここに置く理由: OnAir・ランダウン・
          プロンプターなどの**全画面ページは AppShell を通らない**ので、そちらに置くと
          本番中の画面で確認ダイアログが出せず「停止してリセット」が黙って何もしない。
        */}
        <NoticeBar />
        <ConfirmHost />
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
