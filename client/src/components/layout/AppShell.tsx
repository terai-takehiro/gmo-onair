import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface ErrorBoundaryState {
  hasError: boolean;
}

class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PageErrorBoundary] Caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 gap-4 text-center">
          <p className="text-lg font-medium text-destructive">ページの読み込み中にエラーが発生しました</p>
          <p className="text-sm text-muted-foreground">前のページに戻るか、ホームに移動してください。</p>
          <div className="flex gap-3">
            <button
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              onClick={() => {
                this.setState({ hasError: false });
                window.history.back();
              }}
            >
              戻る
            </button>
            <button
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.href = "/";
              }}
            >
              ホームへ
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppShell() {
  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 min-h-0 overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <PageErrorBoundary>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
