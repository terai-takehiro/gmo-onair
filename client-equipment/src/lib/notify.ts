// 操作の結果は **消えないお知らせ帯** に出す (トーストは使わない・§4.15)。
// 実体は shared に 1 本だけ置いてある (v2.9.290 で 7 アプリ分を集約)。
export {
  notifySuccess,
  notifyError,
  notifyInfo,
  notifyWarning,
  notifyApiError,
  type NotifyOptions,
} from '@gmo-onair/shared/src/client/notify';
