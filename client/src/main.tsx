import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { installHistoryDiagnostic } from '@gmo-onair/shared/src/client/historyDiagnostic';
import { queryClient } from '@/lib/queryClient';
import App from '@/App';
import '@/index.css';

installHistoryDiagnostic();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
