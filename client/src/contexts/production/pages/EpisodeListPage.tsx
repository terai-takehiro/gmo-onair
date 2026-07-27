import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Project } from "@/types";
import BusinessProjectView from "../components/episodes/BusinessProjectView";
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';

export default function EpisodeListPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data.data as Project,
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <Delayed><SkeletonRows rows={5} /></Delayed>
    );
  }

  if (!project) {
    return (
      <EmptyState
        title="この案件は見つかりませんでした"
        description="削除された可能性があります。案件一覧から選び直してください。"
      />
    );
  }

  return <BusinessProjectView project={project} projectId={projectId!} />;
}
