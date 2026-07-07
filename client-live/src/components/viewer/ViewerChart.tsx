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
  zoom_count?: number;
  teams_count?: number;
  total_count: number;
}

interface Visible { youtube?: boolean; jstream?: boolean; zoom?: boolean; teams?: boolean }

interface Props {
  snapshots: Snapshot[];
  /** プラットフォームごとの表示可否 (省略時は全表示) */
  visible?: Visible;
}

export default function ViewerChart({ snapshots, visible }: Props) {
  if (snapshots.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
        データがありません
      </div>
    );
  }

  const show = (key: keyof Visible) => visible?.[key] ?? true;

  const labels = snapshots.map(s => format(s.captured_at));
  const data = {
    labels,
    datasets: [
      ...(show('youtube') ? [{
        label: 'YouTube',
        data: snapshots.map(s => s.youtube_count),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 1,
        borderWidth: 1.5,
      }] : []),
      ...(show('jstream') ? [{
        label: 'Jstream',
        data: snapshots.map(s => s.jstream_count),
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6,182,212,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 1,
        borderWidth: 1.5,
      }] : []),
      ...(show('zoom') && snapshots.some(s => (s.zoom_count ?? 0) > 0) ? [{
        label: 'Zoom',
        data: snapshots.map(s => s.zoom_count ?? 0),
        borderColor: '#2D8CFF',
        backgroundColor: 'rgba(45,140,255,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 1,
        borderWidth: 1.5,
      }] : []),
      ...(show('teams') && snapshots.some(s => (s.teams_count ?? 0) > 0) ? [{
        label: 'Teams',
        data: snapshots.map(s => s.teams_count ?? 0),
        borderColor: '#6264A7',
        backgroundColor: 'rgba(98,100,167,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 1,
        borderWidth: 1.5,
      }] : []),
      {
        label: '合計',
        data: snapshots.map(s => s.total_count),
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168,85,247,0.06)',
        fill: false,
        tension: 0.3,
        pointRadius: 1,
        borderWidth: 2,
        borderDash: [4, 2],
      },
    ],
  };

  return (
    <div className="w-full h-36 sm:h-52">
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 8,
                boxHeight: 8,
                font: { size: 10 },
                padding: 8,
              },
            },
            title: { display: false },
            tooltip: {
              bodyFont: { size: 11 },
              titleFont: { size: 11 },
              padding: 8,
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(128,128,128,0.1)' },
              ticks: { font: { size: 9 }, maxTicksLimit: 4 },
            },
            x: {
              grid: { display: false },
              ticks: { font: { size: 9 }, maxTicksLimit: 5, maxRotation: 0 },
            },
          },
        }}
      />
    </div>
  );
}
