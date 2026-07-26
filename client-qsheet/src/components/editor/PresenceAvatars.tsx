// 在席アバターは案件ワークスペースでも使うので shared に集約した。
// ここは移行のための薄い再エクスポート (コピーを2つ持たない)。
export { default } from "@gmo-onair/shared/src/client/collab/PresenceAvatars";
export type { PresenceUser } from "@gmo-onair/shared/src/client/collab/PresenceAvatars";
