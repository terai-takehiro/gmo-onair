import { useParams } from 'react-router-dom';
import { RedirectView } from './RedirectStatus';
import { useLegacyProgramRedirect } from './useLegacyProgramRedirect';

/** 旧URL `/live/program/:id/settings` → 新URL `/qsheet/live/:projectId/settings`（番組設定） */
export default function RedirectFromProgramSettings() {
  const { programId } = useParams<{ programId: string }>();
  const target = useLegacyProgramRedirect(programId, '/settings');
  return <RedirectView target={target} />;
}
