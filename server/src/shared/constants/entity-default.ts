import type { LegalEntityCode } from '../../contexts/platform/services/legal-entity.service';

/**
 * 2026年10月の事業再編（docs/reorg-2026-10-plan.md）— P0 のあいだの仮の計上会社。
 *
 * `org_transition.state` はまだ 'off' で、案件ごとの計上会社を決める
 * `resolveEntity()`（§4.4）はまだ実装されていない。それまでは**すべての新規行を
 * GSS として書く**——これは「off のあいだ振る舞いを変えない」の実装そのもの
 * （既存データはすべて今の1社＝GSS の実績だったため）。
 *
 * ⚠️ **P1 でこの定数への参照を `resolveEntity()` の呼び出しに置き換える。**
 * grep 一発で置き換え箇所を洗い出せるよう、リテラル `'GSS'` を書かずに
 * 必ずこの定数を import して使うこと。
 */
export const CURRENT_ENTITY_CODE: LegalEntityCode = 'GSS';
