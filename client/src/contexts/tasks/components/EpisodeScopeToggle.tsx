import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { Episode } from "@gmo-onair/shared/src/types";

interface Props {
  projectId: string;
  selectedEpisodeId: string | null;
  onChange: (episodeId: string | null) => void;
}

export default function EpisodeScopeToggle({ projectId, selectedEpisodeId, onChange }: Props) {
  const { data: episodes = [] } = useQuery({
    queryKey: ["episodes", projectId],
    queryFn: async () => {
      const res = await api.get<{ data: Episode[] }>(
        `/projects/${projectId}/episodes`
      );
      return res.data.data ?? [];
    },
    staleTime: 30_000,
  });

  return (
    <div
      role="group"
      aria-label="スコープ切替"
      className="flex flex-wrap gap-1"
    >
      <Button
        type="button"
        size="sm"
        variant={selectedEpisodeId === null ? "default" : "outline"}
        className="h-7 text-xs"
        onClick={() => onChange(null)}
      >
        全体
      </Button>
      {episodes.map((ep) => (
        <Button
          key={ep.id}
          type="button"
          size="sm"
          variant={selectedEpisodeId === ep.id ? "default" : "outline"}
          className="h-7 text-xs"
          onClick={() => onChange(ep.id)}
        >
          #{ep.episode_number}
          {ep.broadcast_date ? ` (${ep.broadcast_date.slice(5)})` : ""}
        </Button>
      ))}
    </div>
  );
}
