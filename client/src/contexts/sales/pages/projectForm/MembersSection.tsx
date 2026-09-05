/**
 * 担当メンバー (v4)
 *
 * 主担当（1人）とは別に、複数人・社外の方も入れられます。
 * **案件を保存してからでないと足せません** — メンバーは案件の id にぶら下がるので、
 * 保存前は付ける先がありません。新規のときはその旨だけ出します。
 */
import ProjectMembersEditor from '../../components/ProjectMembersEditor';
import { FormSection } from './FormSection';

export function MembersSection({ projectId }: { projectId: string | undefined }) {
  return (
    <FormSection title="担当メンバー">
      {projectId ? (
        <ProjectMembersEditor projectId={projectId} />
      ) : (
        <p className="text-sub text-muted-foreground">
          担当メンバー（複数人・社外の方の手入力）は、案件を保存してから追加できます。
        </p>
      )}
    </FormSection>
  );
}
