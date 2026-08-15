/**
 * 社名から「GMOグループの会社か」を見立てる（**画面側の写し**）
 *
 * 実体の説明は `server/src/shared/services/gmo-group.ts` にあります。
 * こちらは**取引先マスター／顧客マスターのチェックボックスを、社名を打った
 * その場で入れて見せる**ためのものです（保存してからでは、押した人が
 * 「印が付くのかどうか」を確かめられません）。
 *
 * ⚠️ **server は `shared/` を import できません**（`rootDir` が `server/src`）。
 * そのため同じ関数が2か所にあります。**食い違うと、チェックが入って見えるのに
 * 保存すると外れます**（逆も）。`shared/tests/gmoGroup.test.ts` が
 * **両方のファイルを読んで同じ答えになることを固定**しているので、
 * 片方だけ直すと試験が落ちます。
 */

/** 全角英字を半角に落としてから大文字にする */
function normalizeName(name: string): string {
  return name
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toUpperCase();
}

/** 社名に GMO が入っているか。空・未入力は false（分からないものをグループにしない） */
export function looksLikeGmoGroup(name: string | null | undefined): boolean {
  if (typeof name !== 'string' || !name.trim()) return false;
  return normalizeName(name).includes('GMO');
}
