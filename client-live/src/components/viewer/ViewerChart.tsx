import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { format } from './chartUtils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Snapshot {
  captured_at: string;
  youtube_count: number;
  jstream_count: number;
  total_count: number;
}

interface Props {
  snapshots: Snapshot[];
}

export default function ViewerChart({ snapshots }: Props) {
  if (snapshots.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        データがありません
      </div>
    );
  }

  const labels = snapshots.map(s => format(s.captured_at));
  const data = {
    labels,
    datasets: [
      {
        label: 'YouTube',
        data: snapshots.map(s => s.youtube_count),
        borderColor: '#ff0000',
        backgroundColor: 'rgba(255,0,0,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: 'Jstream',
        data: snapshots.map(s => s.jstream_count),
        borderColor: '#00b4d8',
        backgroundColor: 'rgba(0,180,216,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: '合計',
        data: snapshots.map(s => s.total_count),
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168,85,247,0.08)',
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
        borderDash: [4, 2],
      },
    ],
  };

  return (
    <Line
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } }, title: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' } },
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 8 } },
        },
      }}
      style={{ height: '200px' }}
    />
  );
}
