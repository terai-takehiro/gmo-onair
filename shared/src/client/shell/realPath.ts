// shared/src/client/shell/realPath.ts
//
// サブアプリの一部 (client-live / client-daily / client-awards) は
// <BrowserRouter basename="/live"> のように basename を付けているため、
// useLocation().pathname は「ルーター内の相対パス」になる (例: /tasks)。
// 一方レールは全アプリ横断の絶対パス (/today, /projects, ...) で現在地を判定するので、
// ブラウザの実パス (例: /daily/tasks) を渡す必要がある。
//
// 使い方 — routerPath を渡すのは、ルーター遷移で再レンダーを起こして
// window.location.pathname を読み直させるため。
//
//   const routerPath = useLocation().pathname;
//   <AppShell currentPath={realPathname(routerPath)} ... />

export function realPathname(routerPath: string): string {
  if (typeof window === 'undefined') return routerPath;
  return window.location.pathname || routerPath;
}
