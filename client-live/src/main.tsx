import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { installHistoryDiagnostic } from '@gmo-onair/shared/src/client/historyDiagnostic';
import { queryClient } from './lib/queryClient';
import App from './App';
import './index.css';

// v2.4.1+ replaceState 暴走の根本原因観測 + ハード上限ガード
installHistoryDiagnostic();

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        // ⚠️ 例外オブジェクトの中身は画面に出さない（docs/wording.md ルール5）。
        // 原因の追跡はコンソール（React が自動で出す）側で行う。
        <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
          <h2>画面を表示できませんでした。</h2>
          <p>もう一度読み込んでも直らないときは、ONAiR のトップから開き直してください。</p>
          <a href="/">ONAiR のトップへ</a>
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
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
