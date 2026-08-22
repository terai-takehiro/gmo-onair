import { useParams } from 'react-router-dom';
import { RedirectView } from './RedirectStatus';
import { useLegacyProgramRedirect } from './useLegacyProgramRedirect';

/** 旧URL `/live/program/:id/timers` → 新URL `/qsheet/live/:projectId/timers`（タイマー管理） */
export default function RedirectFromProgramTimers() {
  const { programId } = useParams<{ programId: string }>();
  const target = useLegacyProgramRedirect(programId, '/timers');
  return <RedirectView target={target} />;
}
