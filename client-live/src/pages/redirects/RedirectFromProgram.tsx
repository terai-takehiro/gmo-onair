import { useParams } from 'react-router-dom';
import { RedirectView } from './RedirectStatus';
import { useLegacyProgramRedirect } from './useLegacyProgramRedirect';

/** 旧URL `/live/program/:id` → 新URL `/qsheet/live/:projectId`（ダッシュボード） */
export default function RedirectFromProgram() {
  const { programId } = useParams<{ programId: string }>();
  const target = useLegacyProgramRedirect(programId, '');
  return <RedirectView target={target} />;
}
