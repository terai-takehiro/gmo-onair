/**
 * 機材の編集ダイアログ — 品名から「同じ品名の機材」を引くところ
 *
 * 画面（`EquipmentDetailPage`）から切り出したのは、1ファイル 400 行の検査
 * （`scripts/check-file-size.mjs`）で**あの画面がすでに上限を超えている**ためです。
 * 足すのではなく分ける向きで直す、という検査の案内どおりに、通信と判定だけを
 * ここに移しました。**動きは変えていません。**
 */
import api from "@/lib/api";

/** 品名が**完全に同じ**機材だけを返す（失敗しても画面を止めない） */
export async function fetchExactNameMatches(name: string): Promise<any[]> {
  try {
    const res = await api.get("/equipment/items", {
      params: { search: name, include_children: "1" },
    });
    const found: any[] = res.data.data ?? [];
    return found.filter((i: any) => (i.name ?? "").toLowerCase() === name.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * 型名が1つに決まるときだけ、埋める値を返す。
 * 型名が複数あるときは決め打ちせず、候補を選ばせる（`null` を返す）。
 */
export function autofillFromMatches(
  matches: any[],
): { model_number: string; manufacturer_id: string } | null {
  if (matches.length === 0) return null;
  const models = [...new Set(matches.map((i: any) => i.model_number ?? ""))];
  if (models.length !== 1) return null;
  return {
    model_number: matches[0].model_number || "",
    manufacturer_id: matches[0].manufacturer_id || "",
  };
}
