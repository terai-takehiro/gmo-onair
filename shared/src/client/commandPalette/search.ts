// ⌘K の「見つかった案件・お客様」— 既存の GET /search をそのまま使う
//
// 7アプリで同じマッピングを書き写すと、片方だけ直って食い違うので1箇所に置く。

import { PROJECT_STAGE, statusOf } from '../../constants/statuses';
import type { PaletteHit, PaletteSearchResult } from './types';

interface MinimalApi {
  get: (url: string, config?: { params?: Record<string, unknown> }) => Promise<{ data?: unknown }>;
}

const str = (v: unknown): string => (v == null ? '' : String(v));

export function createPaletteSearch(api: MinimalApi) {
  return async function search(q: string): Promise<PaletteSearchResult> {
    const res = await api.get('/search', { params: { q } });
    const d = ((res.data as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>;

    // **キーが無い種類は「権限が無い」** (0件ではない)。0件として出すと
    // 「無い」と読まれるが、実際は「見せてもらえない」なので意味が違う。
    const rows = (key: string): Record<string, unknown>[] =>
      Array.isArray(d[key]) ? (d[key] as Record<string, unknown>[]) : [];
    const hiddenKinds = Array.isArray(d._hidden_kinds)
      ? (d._hidden_kinds as Array<{ label?: string }>).map((k) => String(k.label ?? '')).filter(Boolean)
      : [];

    const projects = rows('projects').map((p) => {
      return {
        id: `project-${p.id}`,
        name: str(p.name),
        sub: p.customer_name ? str(p.customer_name) : undefined,
        code: p.gls_number ? str(p.gls_number) : p.code ? str(p.code) : undefined,
        badge: p.stage ? statusOf(PROJECT_STAGE, str(p.stage)).label : undefined,
        path: `/sales/projects/${p.id}`,
      } satisfies PaletteHit;
    });

    const customers = rows('customers').map((c) => {
      return {
        id: `customer-${c.id}`,
        name: str(c.name),
        sub: c.short_name ? str(c.short_name) : 'お客様',
        path: `/customers/${c.id}`,
      } satisfies PaletteHit;
    });

    const vendors = rows('vendors').map((v) => {
      return {
        id: `vendor-${v.id}`,
        name: str(v.name),
        sub: v.vendor_type ? str(v.vendor_type) : '仕入先',
        path: '/budget/vendors',
      } satisfies PaletteHit;
    });

    const equipment = rows('equipment').map((e) => {
      return {
        id: `equipment-${e.id}`,
        name: str(e.name),
        sub: e.model_number ? str(e.model_number) : '機材',
        code: e.eq_code ? str(e.eq_code) : undefined,
        path: '/equipment/',
      } satisfies PaletteHit;
    });

    return {
      hits: [...projects, ...customers, ...vendors, ...equipment],
      hiddenKinds,
      total: typeof d._total === 'number' ? d._total : undefined,
    };
  };
}
