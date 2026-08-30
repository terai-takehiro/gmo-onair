/**
 * 配信先プリセット — **現地の GMO ONAiR Assistant（`stream/presets.ts`）と同じ中身**。
 * 打ち間違いの多い RTMP URL を選ぶだけにする（Assistant の画面と同じ操作感にする）。
 *
 * 決めごと（Assistant 側の判断をそのまま持ってくる）:
 *   - **URL だけ入れる。キーはプリセットで動かさない** — キーは番組ごとに違うのに
 *     URL は同じなので、プリセットでキーまで動かすと直前に入れたキーが消える。
 *   - **選んだ値を覚えない。** URL が手で書き換われば自動で「カスタム入力」に戻る。
 *   - 「カスタム入力」を選んでも**入っていた URL を消さない**（自分で書こうと
 *     思って選んだ人が、入っていた宛先を失わないため）。
 *
 * YouTube の値の出どころ（日本語ラベルは YouTube Studio の表記と同じにする）:
 *   - エンコーダ配信の作成: https://support.google.com/youtube/answer/2907883?hl=ja
 *   - 推奨エンコーダ設定:   https://support.google.com/youtube/answer/2853702?hl=ja
 *   - 配信の遅延:           https://support.google.com/youtube/answer/7444635?hl=ja
 */

export interface RtmpPreset {
  label: string;
  url: string;
}

/** URL は実在のホスト。**キーは入れない**（例示のキーを置く場所ではない） */
export const RTMP_PRESETS: RtmpPreset[] = [
  { label: 'YouTube（プライマリ）', url: 'rtmp://a.rtmp.youtube.com/live2' },
  { label: 'YouTube（バックアップ）', url: 'rtmp://b.rtmp.youtube.com/live2?backup=1' },
];

export const CUSTOM_PRESET = 'カスタム入力';

/** その URL がどのプリセットか（一致しなければ「カスタム入力」） */
export function presetOf(url: string | undefined): string {
  const hit = RTMP_PRESETS.find((p) => p.url === (url ?? ''));
  return hit ? hit.label : CUSTOM_PRESET;
}

/** プリセット名 → URL。「カスタム入力」は null（呼ぶ側は何もしない = URL を消さない） */
export function urlForPreset(label: string): string | null {
  return RTMP_PRESETS.find((p) => p.label === label)?.url ?? null;
}

/** 一覧に出す短い呼び名（プリセットに当たらなければ null。呼ぶ側は URL を出す） */
export function presetLabelOf(url: string | undefined): string | null {
  const hit = RTMP_PRESETS.find((p) => p.url === (url ?? ''));
  return hit ? hit.label : null;
}

/** YouTube の配信先か（インスペクタの「YouTube の決めごと」を出すかどうか） */
export function isYouTubeUrl(url: string | undefined): boolean {
  // rtmps 版はポート付き（rtmps://a.rtmps.youtube.com:443/live2）なので :443 も受ける
  return /^rtmps?:\/\/[a-z]\.rtmps?\.youtube\.com(?::\d+)?\//.test(url ?? '');
}

/**
 * YouTube の推奨エンコーダ設定（公式の日本語ページの値そのまま・2026-08 時点）。
 * 出どころ: https://support.google.com/youtube/answer/2853702?hl=ja
 * ⚠️ ONAiR の配信先には画質の欄が無い（画質は現地の機器側の設定）。
 * ここは**現地とすり合わせるための参考表**としてインスペクタに出す。
 */
export const YOUTUBE_BITRATES: { quality: string; kbps: string }[] = [
  { quality: '2160p (4K) 60fps', kbps: '20,000〜51,000' },
  { quality: '2160p (4K) 30fps', kbps: '13,000〜34,000' },
  { quality: '1080p 60fps', kbps: '4,500〜9,000' },
  { quality: '1080p 30fps', kbps: '3,000〜6,000' },
  { quality: '720p 60fps', kbps: '2,250〜6,000' },
  { quality: '720p 30fps', kbps: '1,500〜4,000' },
];

/** エンコーダ側の決めごと（解像度によらない共通値） */
export const YOUTUBE_ENCODER_NOTES: string[] = [
  'キーフレームの頻度: 2秒を推奨（4秒を超えない）',
  'ビットレートは CBR（固定）で送る',
  '音声: AAC・44.1 kHz・128 Kbps ステレオ',
];

/**
 * **YouTube Studio 側で設定する項目**（機器からは変えられない。ラベルは YouTube Studio の表記）。
 * Excel にも機器にも入らないので、ここに「現地で確認する言葉」として出しておく
 * （画面に出せない設定を欄として置くと「打てるのに反映されない欄」になる — #279 の判断）。
 */
export const YOUTUBE_STUDIO_ITEMS: { label: string; values: string }[] = [
  { label: '公開設定', values: '公開 / 限定公開 / 非公開' },
  { label: '配信の遅延', values: '通常の遅延 / 低遅延 / 超低遅延（4K は通常の遅延のみ）' },
  { label: 'DVR を有効にする', values: '視聴者が一時停止・巻き戻しできるか' },
  { label: '視聴者（子ども向け）', values: '「はい / いいえ」を必ず選ぶ' },
  { label: 'ストリームキー', values: 'YouTube Studio の「配信設定」でコピー（漏れたら「リセット」）' },
];
