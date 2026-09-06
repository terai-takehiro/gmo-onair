/**
 * 計上会社マスター（`legal_entities`）の純粋関数のテスト
 *
 * 2026年10月の事業再編（社名変更・計上会社の2社化）で新設。設計の全文:
 * docs/reorg-2026-10-plan.md（§4.2・§4.9・§9-E）。
 *
 * `issuerNameAsOf` は DB を触らない純粋関数なので、手組みの `LegalEntity` で
 * そのまま固定できる（`dueDate.test.ts` 等と同じ——server 側の実装をそのまま import）。
 */
import { describe, it, expect } from 'vitest';
import {
  issuerNameAsOf,
  type LegalEntity,
} from '../../server/src/contexts/platform/services/legal-entity.service';

/** GSS 相当（社名変更あり）の最小フィクスチャ。個々のテストで renamedOn 等を上書きする */
function gss(overrides: Partial<LegalEntity> = {}): LegalEntity {
  return {
    code: 'GSS',
    name: 'GMOサムライスタジオ株式会社',
    shortName: 'サムライスタジオ',
    formerName: 'GMOグローバルスタジオ株式会社',
    renamedOn: '2026-10-01',
    kind: 'revenue',
    parentCode: 'GJV',
    numberPrefix: 'GSS-',
    issuerAddress1: '東京都世田谷区用賀四丁目10番1号',
    issuerAddress2: 'GMOインターネットTOWER 27F',
    invoiceRegistrationNumber: 'T9011001154049',
    bankAccount: null,
    logoRef: null,
    activeFrom: null,
    sortOrder: 2,
    ...overrides,
  };
}

/** GJV 相当（社名変更なし＝ former_name/renamed_on とも null）の最小フィクスチャ */
function gjv(overrides: Partial<LegalEntity> = {}): LegalEntity {
  return {
    code: 'GJV',
    name: 'GMOサムライコンテンツスタジオ株式会社',
    shortName: 'コンテンツスタジオ',
    formerName: null,
    renamedOn: null,
    kind: 'revenue',
    parentCode: null,
    numberPrefix: 'GJV-',
    issuerAddress1: null,
    issuerAddress2: null,
    invoiceRegistrationNumber: null,
    bankAccount: null,
    logoRef: null,
    activeFrom: null,
    sortOrder: 1,
    ...overrides,
  };
}

describe('issuerNameAsOf（§9-E: 社名変更前後の帳票の表記）', () => {
  it('renamedOn より前の日付 → 旧社名（formerName）', () => {
    expect(issuerNameAsOf(gss(), '2026-09-30')).toBe('GMOグローバルスタジオ株式会社');
  });

  it('renamedOn と同じ日 → 新社名＋「（旧 …）」の併記（境目は「以後」側に含む）', () => {
    expect(issuerNameAsOf(gss(), '2026-10-01')).toBe(
      'GMOサムライスタジオ株式会社（旧 GMOグローバルスタジオ株式会社）',
    );
  });

  it('renamedOn より後の日付 → 新社名＋「（旧 …）」の併記', () => {
    expect(issuerNameAsOf(gss(), '2026-12-31')).toBe(
      'GMOサムライスタジオ株式会社（旧 GMOグローバルスタジオ株式会社）',
    );
  });

  it('formerName が無いエンティティ（GJV）→ renamedOn も無いので、日付によらず name だけ', () => {
    expect(issuerNameAsOf(gjv(), '2020-01-01')).toBe('GMOサムライコンテンツスタジオ株式会社');
    expect(issuerNameAsOf(gjv(), '2026-10-01')).toBe('GMOサムライコンテンツスタジオ株式会社');
    expect(issuerNameAsOf(gjv(), '2099-12-31')).toBe('GMOサムライコンテンツスタジオ株式会社');
  });

  it('formerName が無い（renamedOn だけ何かの理由で入っている想定の異常値）場合も name だけ', () => {
    // 実運用では起きない組み合わせ（former_name は renamedOn とセットで入る・migration 280）だが、
    // 関数の契約として「formerName が無ければ日付によらず name」を単独でも固定しておく。
    const weird = gjv({ renamedOn: '2026-10-01' });
    expect(issuerNameAsOf(weird, '2026-09-01')).toBe('GMOサムライコンテンツスタジオ株式会社');
    expect(issuerNameAsOf(weird, '2026-10-01')).toBe('GMOサムライコンテンツスタジオ株式会社');
  });

  it('renamedOn が null なら、formerName があっても常に formerName を返す', () => {
    const noRename = gss({ renamedOn: null });
    expect(issuerNameAsOf(noRename, '2020-01-01')).toBe('GMOグローバルスタジオ株式会社');
    expect(issuerNameAsOf(noRename, '2099-12-31')).toBe('GMOグローバルスタジオ株式会社');
  });
});
