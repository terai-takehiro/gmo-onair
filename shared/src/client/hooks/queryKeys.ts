/**
 * shared/src/client/hooks/queryKeys.ts — React Query キー factory
 *
 * v2.4.0 で導入。
 * 従来、各ページが `queryKey: ['projects-all', page]` のようにハードコード文字列を
 * 散在させていたため、リファクタ耐性が低かった。ここを単一の factory 化することで:
 *   - キーのスペル間違い防止
 *   - `qc.invalidateQueries({ queryKey: queryKeys.projects.list.prefix })` で関連クエリを
 *     一括失効させやすくなる (階層化)
 *
 * Phase 1 (v2.4.0) では主要ドメインのみ定義。残りは Phase 2 で全キー移行。
 */

export const queryKeys = {
  // ── Platform Dashboard ───────────────────────────────────
  dashboard: {
    all:            ['dashboard'] as const,
    kpi:            (period: string) => ['dashboard', 'kpi', period] as const,
    alerts:         () => ['dashboard', 'alerts'] as const,
    recentProjects: () => ['dashboard', 'recent-projects'] as const,
    monthlyChart:   () => ['dashboard', 'monthly-chart'] as const,
    weeklySchedule: () => ['dashboard', 'weekly-schedule'] as const,
    pipeline:       () => ['dashboard', 'pipeline'] as const,
    checkCompleted: () => ['dashboard', 'check-completed'] as const,
  },

  // ── 案件 (Sales) ─────────────────────────────────────────
  projects: {
    all:    ['projects'] as const,
    list:   (params: { page?: number; limit?: number; search?: string; stage?: string }) =>
              ['projects', 'list', params] as const,
    detail: (id: string) => ['projects', 'detail', id] as const,
  },

  // ── 予算 (Budget) ────────────────────────────────────────
  budget: {
    all:            ['budget'] as const,
    monthlySummary: (month: string, projectId?: string) =>
                      ['budget', 'monthly-summary', { month, projectId: projectId || null }] as const,
  },

  // ── 機材 (Equipment) ─────────────────────────────────────
  equipment: {
    all:    ['equipment'] as const,
    stats:  () => ['equipment', 'stats'] as const,
    items:  (params?: Record<string, unknown>) => ['equipment', 'items', params ?? {}] as const,
    item:   (id: string) => ['equipment', 'item', id] as const,
  },

  // ── Qシート ──────────────────────────────────────────────
  qsheet: {
    documents: (params?: { projectId?: string; search?: string }) =>
                 ['qsheet', 'documents', params ?? {}] as const,
    document:  (id: string) => ['qsheet', 'document', id] as const,
  },

  // ── インタラクティブ ──────────────────────────────────────
  interactive: {
    events: (params?: { search?: string; status?: string }) =>
              ['interactive', 'events', params ?? {}] as const,
    event:  (id: string) => ['interactive', 'event', id] as const,
  },

  // ── 技術資料 (TechSheet) ─────────────────────────────────
  techsheet: {
    documents: (params?: { projectId?: string; search?: string }) =>
                 ['techsheet', 'documents', params ?? {}] as const,
    document:  (id: string) => ['techsheet', 'document', id] as const,
  },

  // ── 計時LIVE ─────────────────────────────────────────────
  liveops: {
    programs:  () => ['liveops', 'programs'] as const,
    program:   (id: string) => ['liveops', 'program', id] as const,
    timers:    (programId: string) => ['liveops', 'timers', programId] as const,
    snapshots: (programId: string) => ['liveops', 'snapshots', programId] as const,
    settings:  () => ['liveops', 'settings'] as const,
  },

  // ── Auth ──────────────────────────────────────────────────
  auth: {
    me:          () => ['auth', 'me'] as const,
    permissions: () => ['users', 'me', 'permissions'] as const,
    mode:        () => ['auth', 'mode'] as const,
  },

  // ── Lookup (共通ルックアップ) ─────────────────────────────
  lookup: {
    glsOptions:      () => ['lookup', 'gls-options'] as const,
    episodeOptions:  (projectId: string) => ['lookup', 'episode-options', projectId] as const,
  },
} as const;
