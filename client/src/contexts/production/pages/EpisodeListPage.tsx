import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Project } from "@/types";
import { Loader2 } from "lucide-react";
import BusinessProjectView from "../components/episodes/BusinessProjectView";

export default function EpisodeListPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: projectData, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: !!projectId,
  });
  const project: Project | undefined = projectData?.data;

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

  return <BusinessProjectView project={project} projectId={projectId!} />;
}
