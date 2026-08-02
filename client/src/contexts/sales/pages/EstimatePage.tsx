import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Project } from "@/types";
import { Loader2 } from "lucide-react";
import BusinessProjectView from "@/contexts/production/components/episodes/BusinessProjectView";

export default function EstimatePage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data.data as Project,
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center text-muted-foreground">案件が見つかりません</div>
    );
  }

  return <BusinessProjectView project={project} projectId={projectId!} isEstimateMode />;
}
