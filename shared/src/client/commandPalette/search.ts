// ⌘K の「見つかった案件・お客様」— 既存の GET /search をそのまま使う
//
// 7アプリで同じマッピングを書き写すと、片方だけ直って食い違うので1箇所に置く。

import { PROJECT_STAGE, statusOf } from '../../constants/statuses';
import type { PaletteHit } from './types';

interface MinimalApi {
  get: (url: string, config?: { params?: Record<string, unknown> }) => Promise<{ data?: unknown }>;
}

const str = (v: unknown): string => (v == null ? '' : String(v));

export function createPaletteSearch(api: MinimalApi) {
  return async function search(q: string): Promise<PaletteHit[]> {
    const res = await api.get('/search', { params: { q } });
    const d = ((res.data as { data?: Record<string, unknown[]> })?.data ?? {}) as Record<string, unknown[]>;

    const projects = (d.projects ?? []).map((raw) => {
      const p = raw as Record<string, unknown>;
      return {
        id: `project-${p.id}`,
        name: str(p.name),
        sub: p.customer_name ? str(p.customer_name) : undefined,
        code: p.gls_number ? str(p.gls_number) : p.code ? str(p.code) : undefined,
        badge: p.stage ? statusOf(PROJECT_STAGE, str(p.stage)).label : undefined,
        path: `/sales/projects/${p.id}`,
      } satisfies PaletteHit;
    });

    const customers = (d.customers ?? []).map((raw) => {
      const c = raw as Record<string, unknown>;
      return {
        id: `customer-${c.id}`,
        name: str(c.name),
        sub: c.short_name ? str(c.short_name) : 'お客様',
        path: `/customers/${c.id}`,
      } satisfies PaletteHit;
    });

    const vendors = (d.vendors ?? []).map((raw) => {
      const v = raw as Record<string, unknown>;
      return {
        id: `vendor-${v.id}`,
        name: str(v.name),
        sub: v.vendor_type ? str(v.vendor_type) : '仕入先',
        path: '/budget/vendors',
      } satisfies PaletteHit;
    });

    return [...projects, ...customers, ...vendors];
  };
}
