// `client-live/src/components/viewer/chartUtils.ts` の移植（v4.1 段2）。ロジックは変えていない。
export function format(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}
