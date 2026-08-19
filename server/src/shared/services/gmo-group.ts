/**
 * 社名から「GMOグループの会社か」を見立てる（**既定値を作るだけ**）
 *
 * ── これが決めるのは「初期値」だけです ──────────────────────
 *
 * 正は取引先マスターの列（`companies.is_gmo_group`）で、
 * **画面のチェックボックスで外せます**。ここが効くのは2か所だけ:
 *
 *   ① 印を渡してこない登録の道（MCP・メール取込・Excel・決算取込・内覧会）
 *   ② 取引先マスター／顧客マスターで**新しく作るとき**の、チェックの初期状態
 *
 * **すでにある行を上書きしません。** 一度外した印が保存のたびに戻ると、
 * 外した人には「直したのに直らない」としか見えません。
 *
 * ── 全角も拾う ──────────────────────────────────────────────
 *
 * 「ＧＭＯペパボ」のような全角表記が実在します。`includes('GMO')` だけだと
 * **その会社だけ漏れる**（漏れても画面には何も出ないので気づけません）。
 *
 * ── 写しが `shared/src/utils/gmoGroup.ts` にあります ────────────
 *
 * この製品は **server が `shared/` を import しない構成**（`rootDir` が
 * `server/src`）なので、画面が使う同じ関数を `shared` にも置いています。
 * **2つが食い違うと、チェックが入って見えるのに保存すると外れます**（逆も）。
 * `shared/tests/gmoGroup.test.ts` が**両方を読んで同じ答えになることを固定**
 * しているので、片方だけ直すと試験が落ちます。
 */

/** 全角英字を半角に落としてから大文字にする */
function normalizeName(name: string): string {
  return name
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toUpperCase();
}

/**
 * 社名に GMO が入っているか（ご指示: GMO とついているものはすべてグループ）。
 *
 * 空・未入力は `false`（**分からないものをグループにしない** — グループ内価格が
 * 社外のお客様に出るほうが、定価が社内に出るより取り返しがつかない）。
 */
export function looksLikeGmoGroup(name: string | null | undefined): boolean {
  if (typeof name !== 'string' || !name.trim()) return false;
  return normalizeName(name).includes('GMO');
}
