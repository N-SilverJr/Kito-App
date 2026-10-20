import { useId } from 'react';

export interface ChartDatum {
  label: string;
  fullLabel?: string;
  value: number;
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

export function BarChart({
  data,
  goal,
  unit,
  emptyMessage = 'No data for this period yet.',
  tone = 'primary',
  ariaLabel,
}: {
  data: ChartDatum[];
  goal?: number | null;
  unit: string;
  emptyMessage?: string;
  tone?: 'primary' | 'water';
  ariaLabel: string;
}) {
  const gradientId = useId().replace(/:/g, '');
  if (data.length === 0 || data.every((entry) => entry.value === 0)) {
    return <div className="chart-empty">{emptyMessage}</div>;
  }
  const width = 640;
  const height = 210;
  const padding = { top: 16, right: 12, bottom: 30, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = niceMax(Math.max(...data.map((entry) => entry.value), goal ?? 0, 1));
  const barSpace = plotWidth / data.length;
  const barWidth = Math.max(4, barSpace * 0.6);
  const tickCount = 4;
  const labelEvery = Math.ceil(data.length / 7);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tone === 'water' ? 'var(--water)' : 'var(--primary)'} stopOpacity="0.95" />
            <stop offset="1" stopColor={tone === 'water' ? 'var(--water)' : 'var(--primary)'} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {Array.from({ length: tickCount + 1 }).map((_, index) => {
          const value = (maxValue / tickCount) * index;
          const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
          return (
            <g key={index}>
              <line className="chart-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="chart-axis" x={padding.left - 8} y={y + 3} textAnchor="end">
                {Math.round(value)}
              </text>
            </g>
          );
        })}
        {goal && goal > 0 ? (
          <g>
            <line
              className="chart-target"
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + plotHeight - (Math.min(goal, maxValue) / maxValue) * plotHeight}
              y2={padding.top + plotHeight - (Math.min(goal, maxValue) / maxValue) * plotHeight}
            />
            <text className="chart-axis" x={width - padding.right} y={padding.top + plotHeight - (goal / maxValue) * plotHeight - 5} textAnchor="end">
              goal {Math.round(goal)}
            </text>
          </g>
        ) : null}
        {data.map((entry, index) => {
          const barHeight = Math.max(entry.value > 0 ? 2 : 0, (entry.value / maxValue) * plotHeight);
          const x = padding.left + index * barSpace + (barSpace - barWidth) / 2;
          const y = padding.top + plotHeight - barHeight;
          return (
            <g key={`${entry.label}-${index}`}>
              <rect
                className={`chart-bar ${goal && entry.value > goal ? 'over' : ''}`}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={`url(#${gradientId})`}
              >
                <title>{`${entry.fullLabel ?? entry.label}: ${Math.round(entry.value)} ${unit}`}</title>
              </rect>
              {index % labelEvery === 0 ? (
                <text className="chart-axis" x={x + barWidth / 2} y={height - 10} textAnchor="middle">
                  {entry.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <details className="data-details">
        <summary>View data table</summary>
        <table className="chart-table">
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry, index) => (
              <tr key={`${entry.label}-row-${index}`}>
                <td>{entry.fullLabel ?? entry.label}</td>
                <td>{Math.round(entry.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function LineChart({
  data,
  unit,
  emptyMessage = 'Add a couple of entries to see a trend.',
  ariaLabel,
}: {
  data: ChartDatum[];
  unit: string;
  emptyMessage?: string;
  ariaLabel: string;
}) {
  const gradientId = useId().replace(/:/g, '');
  if (data.length < 2) return <div className="chart-empty">{emptyMessage}</div>;
  const width = 640;
  const height = 210;
  const padding = { top: 18, right: 16, bottom: 30, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = data.map((entry) => entry.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, max * 0.1);
  const lower = min - span * 0.15;
  const upper = max + span * 0.15;
  const x = (index: number) => padding.left + (index / (data.length - 1)) * plotWidth;
  const y = (value: number) => padding.top + plotHeight - ((value - lower) / (upper - lower)) * plotHeight;
  const points = data.map((entry, index) => `${x(index)},${y(entry.value)}`).join(' ');
  const area = `${padding.left},${padding.top + plotHeight} ${points} ${padding.left + plotWidth},${padding.top + plotHeight}`;
  const labelEvery = Math.ceil(data.length / 5);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.25" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((fraction) => {
          const value = lower + (upper - lower) * fraction;
          const lineY = padding.top + plotHeight - fraction * plotHeight;
          return (
            <g key={fraction}>
              <line className="chart-grid" x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} />
              <text className="chart-axis" x={padding.left - 8} y={lineY + 3} textAnchor="end">
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}
        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline className="chart-line" points={points} />
        {data.map((entry, index) => (
          <g key={`${entry.label}-${index}`}>
            <circle className="chart-dot" cx={x(index)} cy={y(entry.value)} r="3.5">
              <title>{`${entry.fullLabel ?? entry.label}: ${entry.value} ${unit}`}</title>
            </circle>
            {index % labelEvery === 0 ? (
              <text className="chart-axis" x={x(index)} y={height - 10} textAnchor="middle">
                {entry.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <details className="data-details">
        <summary>View data table</summary>
        <table className="chart-table">
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry, index) => (
              <tr key={`${entry.label}-row-${index}`}>
                <td>{entry.fullLabel ?? entry.label}</td>
                <td>{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
