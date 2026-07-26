import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { installHistoryDiagnostic } from '@gmo-onair/shared/src/client/historyDiagnostic';
import { queryClient } from './lib/queryClient';
import App from './App';
import './index.css';
import { NoticeBar, ConfirmHost } from '@gmo-onair/shared/src/client/ui';

// v2.4.1+ replaceState 暴走の根本原因観測 + ハード上限ガード
installHistoryDiagnostic();

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
          <h2>エラーが発生しました</h2>
          <pre style={{ color: 'red', whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
          <a href="/">メインアプリに戻る</a>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
  </StrictMode>
);
