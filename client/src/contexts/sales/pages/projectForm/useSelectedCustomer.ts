/**
 * いま選ばれているお客様を**確かに**引く（案件を直す画面）
 *
 * ── なぜ要るか（PR #129 のレビューで指摘・P2）────────────────
 *
 * 直す画面のお客様の候補は `GET /customers?limit=200`（**名前順の先頭 200 件**）です。
 * その案件のお客様が **201 件目以降にいる**と一覧に載らないので、
 * 「見つからない ＝ グループ会社ではない」と読むと**画面が嘘をつきます**:
 *
 *   ・グループ区分に「グループ外・単価は定価になります」と**言い切って**出る
 *   ・ところがサーバーは取引先マスターの印から `internal` で保存する
 *     （migration 192）ので、**実際の見積はグループ内価格**になる
 *
 * 読んだ人は画面のほうを信じるので、**間違ったまま見積の話が進みます**。
 * リード経路の「グループ案件」の固定表示も同じ理由でずれます。
 *
 * ── 直し方 ──────────────────────────────────────────────────
 *
 *  ① 一覧に居ればそれを使う（ふつうはこれ。追加の通信は起きません）
 *  ② 居なければ **id で1件だけ引き直す**（`GET /customers/:id`）
 *  ③ それも引けないあいだ（通信中・消えたお客様で 404）は
 *     **案件に保存されている値**を使う。どちらも「いま本当のこと」で、
 *     **持っていない情報をこちらで作らない**
 *
 * 引き直せたお客様は**候補にも足します** — 足さないと、お客様の欄が
 * 空に見えたまま（選び直さないと保存できないように読める）になります。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { CustomerOption } from '../projectNew/fields';

export interface SelectedCustomer {
  /** 選ばれているお客様。まだ引けていないときだけ null */
  customer: CustomerOption | null;
  /** 候補（引き直したお客様を足したもの）。欄に渡すのはこちら */
  customers: CustomerOption[];
  /** グループ会社か。引けないあいだは案件に保存されている値に従う */
  isGroup: boolean;
}

export function useSelectedCustomer(
  customerId: string,
  listed: CustomerOption[],
  /** 案件に保存されている `customer_type`。引けないあいだの拠り所 */
  savedCustomerType: unknown,
): SelectedCustomer {
  const inList = listed.find((c) => c.id === customerId) ?? null;

  const { data } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}`)).data.data as CustomerOption,
    enabled: !!customerId && !inList,
    // **消えたお客様（404）で叩き直さない。** 案件の値に落ちれば画面は成り立つ
    retry: false,
  });

  const fetched = data && data.id === customerId ? data : null;
  const customer = inList ?? fetched;

  return {
    customer,
    customers: customer && !inList ? [customer, ...listed] : listed,
    isGroup: customer ? customer.is_gmo_group === true : savedCustomerType === 'internal',
  };
}
