import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { installHistoryDiagnostic } from '@gmo-onair/shared/src/client/historyDiagnostic';
import { queryClient } from '@/lib/queryClient';
import App from '@/App';
import '@/index.css';
import { NoticeBar, ConfirmHost } from '@gmo-onair/shared/src/client/ui';

installHistoryDiagnostic();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/*
          お知らせ帯と確認ダイアログの出る場所。**アプリに1組だけ、ルート直下**に置く (v2.9.290)。
          AppShell (ヘッダーとレール) の中ではなくここに置く理由: OnAir・ランダウン・
          プロンプターなどの**全画面ページは AppShell を通らない**ので、そちらに置くと
          本番中の画面で確認ダイアログが出せず「停止してリセット」が黙って何もしない。
        */}
        <NoticeBar />
        <ConfirmHost />
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
