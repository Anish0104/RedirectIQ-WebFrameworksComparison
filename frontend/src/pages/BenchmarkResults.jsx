import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import Navbar from '../components/Navbar';

const FRAMEWORK_LABELS = {
  node: 'Node',
  flask: 'Flask',
  nginx: 'Nginx',
  apache: 'Apache'
};

const FRAMEWORK_COLORS = {
  node: '#2563eb',
  flask: '#db6a4d',
  nginx: '#0f766e',
  apache: '#7c3aed'
};

const BACKEND_TARGETS = [
  { id: 'node', label: 'Node', port: 3001 },
  { id: 'flask', label: 'Flask', port: 3002 },
  { id: 'nginx', label: 'Nginx', port: 3003 },
  { id: 'apache', label: 'Apache', port: 3004 }
];

const BENCHMARK_SUMMARY_STORAGE_KEY = 'redirectiq_benchmark_summary_v1';
const QUALITATIVE_DIMENSIONS = [
  'Setup ease',
  'Config simplicity',
  'Code clarity',
  'Failure handling',
  'Debug/DX',
  'Deploy ease'
];
const QUALITATIVE_SCORES = {
  node: [5, 5, 5, 5, 5, 5],
  flask: [5, 4, 4, 4, 4, 4],
  nginx: [2, 2, 3, 1, 2, 2],
  apache: [2, 2, 3, 3, 2, 2]
};
const QUALITATIVE_EXPLANATIONS = [
  {
    title: 'Setup difficulty',
    text: 'Node and Flask only need npm install or pip install. Nginx requires writing a working nginx.conf with proxy rules and worker tuning. Apache needs an httpd.conf with mod_proxy enabled and VirtualHost blocks.'
  },
  {
    title: 'Code simplicity',
    text: "Node's Express routing is concise and idiomatic. Flask achieves similar clarity with blueprints. The Nginx and Apache variants layer an extra abstraction — a Python app plus a separate reverse proxy config — which doubles the places where things can break."
  },
  {
    title: 'Failure behavior',
    text: 'Under high concurrency, Node degraded gracefully — latency climbed but error rate stayed at 0%. Flask stayed stable but slowly throttled. Nginx hit an 86% error rate at c500, likely from worker/connection limits. Apache showed extreme tail latency (1520ms p99) suggesting queue buildup rather than clean rejection.'
  },
  {
    title: 'Developer experience',
    text: 'Node and Flask both gave clear, readable error messages during development. Nginx and Apache failures were harder to diagnose — errors appeared as generic 502/504 responses with the actual cause buried in server logs, adding significant debugging time.'
  }
];
const ERROR_BREAKDOWN_SERIES = [
  { dataKey: 'status502', label: '502', color: '#b91c1c' },
  { dataKey: 'status504', label: '504', color: '#dc2626' },
  { dataKey: 'status429', label: '429', color: '#ef4444' },
  { dataKey: 'other', label: 'Other', color: '#fca5a5' }
];
const ERROR_BREAKDOWN_EXPLANATIONS = [
  {
    framework: 'node',
    text: "Zero errors recorded. Node's event loop queues excess requests internally and processes them without rejecting connections."
  },
  {
    framework: 'flask',
    text: 'Zero errors at tested concurrency. Gunicorn workers throttle throughput but do not drop connections under this load.'
  },
  {
    framework: 'nginx',
    text: 'High error count driven by upstream connection exhaustion. When Gunicorn worker slots fill, Nginx returns 502 Bad Gateway rather than queuing.'
  },
  {
    framework: 'apache',
    text: "Moderate errors with extreme tail latency. Apache's prefork model holds connections open in queue, causing timeouts before rejecting."
  }
];

const EMPTY_RESULTS = {
  hasData: false,
  generatedAt: null,
  frameworks: ['node', 'flask', 'nginx', 'apache'],
  concurrencyLevels: [1, 10, 50, 100, 250, 500],
  winners: null,
  summaryTable: [],
  series: {},
  cache_impact: null,
  error_breakdown: null,
  system_metrics: null,
  graphs: []
};

function formatTimestamp(value) {
  if (!value) {
    return 'Not generated yet';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatMetric(value, suffix = '') {
  if (value === null || typeof value === 'undefined' || Number.isNaN(Number(value))) {
    return '—';
  }

  return `${Number(value).toFixed(2)}${suffix}`;
}

function getSummaryAgeDetails(value) {
  if (!value) {
    return null;
  }

  const generatedAt = new Date(value);

  if (Number.isNaN(generatedAt.getTime())) {
    return null;
  }

  const ageMs = Date.now() - generatedAt.getTime();

  if (ageMs < 0) {
    return null;
  }

  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 24) {
    return null;
  }

  const ageDays = Math.floor(ageHours / 24);

  return {
    ageDays,
    message:
      ageDays === 1
        ? 'The loaded benchmark summary is 1 day old.'
        : `The loaded benchmark summary is ${ageDays} days old.`
  };
}

function formatTick(value) {
  if (value === null || typeof value === 'undefined' || Number.isNaN(Number(value))) {
    return '0';
  }

  const numeric = Number(value);

  if (numeric >= 1000) {
    return `${(numeric / 1000).toFixed(1)}k`;
  }

  return `${numeric.toFixed(0)}`;
}

function buildHealthUrl(port) {
  const hostname = window.location.hostname || 'localhost';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';

  return `${protocol}//${hostname}:${port}/health`;
}

function normalizeSummary(payload) {
  return {
    ...EMPTY_RESULTS,
    ...payload
  };
}

function hasPersistableResults(summary) {
  return Boolean(
    summary &&
      summary.hasData &&
      summary.winners &&
      Array.isArray(summary.summaryTable) &&
      summary.summaryTable.length > 0
  );
}

function readStoredSummary() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(BENCHMARK_SUMMARY_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = normalizeSummary(JSON.parse(raw));
    return hasPersistableResults(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function storeSummary(summary) {
  if (typeof window === 'undefined' || !hasPersistableResults(summary)) {
    return;
  }

  try {
    window.localStorage.setItem(BENCHMARK_SUMMARY_STORAGE_KEY, JSON.stringify(summary));
  } catch {
    // Ignore storage write failures and keep the in-memory summary.
  }
}

function getFrameworkLabel(framework) {
  return FRAMEWORK_LABELS[framework] || framework;
}

function getFrameworkColor(framework) {
  return FRAMEWORK_COLORS[framework] || '#172033';
}

function withAlpha(hexColor, alpha) {
  const normalized = String(hexColor || '').replace('#', '');

  if (normalized.length !== 6) {
    return hexColor;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getSeriesPoint(summary, framework, concurrency) {
  return (summary.series[framework] || []).find(function findPoint(point) {
    return point.concurrency === concurrency;
  });
}

function buildLineSeries(summary, metricKey) {
  return summary.concurrencyLevels.map(function buildPoint(concurrency) {
    const point = {
      concurrency,
      label: `c${concurrency}`
    };

    summary.frameworks.forEach(function addFrameworkMetric(framework) {
      const seriesPoint = getSeriesPoint(summary, framework, concurrency);
      point[framework] = seriesPoint ? seriesPoint[metricKey] : null;
    });

    return point;
  });
}

function buildThroughputBars(summary) {
  return summary.summaryTable.map(function mapRow(row) {
    return {
      framework: row.framework,
      frameworkLabel: getFrameworkLabel(row.framework),
      value: row.bestThroughput
    };
  });
}

function buildLatencyBars(summary) {
  return summary.summaryTable.map(function mapRow(row) {
    return {
      framework: row.framework,
      frameworkLabel: getFrameworkLabel(row.framework),
      p50: row.p50At100,
      p99: row.p99At100
    };
  });
}

function buildErrorBars(summary) {
  return summary.summaryTable.map(function mapRow(row) {
    return {
      framework: row.framework,
      frameworkLabel: getFrameworkLabel(row.framework),
      errorRate: row.errorRate
    };
  });
}

function buildErrorBreakdownBars(summary) {
  return summary.frameworks.map(function mapFramework(framework) {
    const counts =
      summary.error_breakdown && typeof summary.error_breakdown === 'object'
        ? summary.error_breakdown[framework] || {}
        : {};

    return {
      framework,
      frameworkLabel: getFrameworkLabel(framework),
      status502: Number(counts['502'] || 0),
      status504: Number(counts['504'] || 0),
      status429: Number(counts['429'] || 0),
      other: Number(counts.other || 0)
    };
  });
}

function buildSystemMetricsRows(summary) {
  return summary.frameworks.map(function mapFramework(framework) {
    const metrics =
      summary.system_metrics && typeof summary.system_metrics === 'object'
        ? summary.system_metrics[framework] || {}
        : {};

    return {
      framework,
      frameworkLabel: getFrameworkLabel(framework),
      peakCpu: metrics.peak_cpu ?? null,
      avgCpu: metrics.avg_cpu ?? null,
      peakMemoryMb: metrics.peak_memory_mb ?? null,
      avgMemoryMb: metrics.avg_memory_mb ?? null
    };
  });
}

function normalizeHistory(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter(function isValidEntry(entry) {
      return (
        entry &&
        typeof entry === 'object' &&
        entry.run_id &&
        entry.timestamp &&
        entry.summary &&
        Array.isArray(entry.summary.summaryTable)
      );
    })
    .sort(function sortEntries(left, right) {
      return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
    });
}

function formatHistoryChipLabel(value) {
  if (!value) {
    return 'Unknown run';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function buildSummaryRowLookup(summaryLike) {
  return Object.fromEntries(
    (summaryLike.summaryTable || []).map(function mapRow(row) {
      return [row.framework, row];
    })
  );
}

function buildHistoryDeltaRows(currentSummary, comparisonRun) {
  if (!currentSummary || !comparisonRun || !comparisonRun.summary) {
    return [];
  }

  const currentRows = buildSummaryRowLookup(currentSummary);
  const comparisonRows = buildSummaryRowLookup(comparisonRun.summary);

  return currentSummary.frameworks.map(function mapFramework(framework) {
    const currentRow = currentRows[framework] || {};
    const comparisonRow = comparisonRows[framework] || {};

    return {
      framework,
      frameworkLabel: getFrameworkLabel(framework),
      throughputDelta:
        typeof currentRow.bestThroughput === 'number' && typeof comparisonRow.bestThroughput === 'number'
          ? currentRow.bestThroughput - comparisonRow.bestThroughput
          : null,
      latencyDelta:
        typeof currentRow.p99At100 === 'number' && typeof comparisonRow.p99At100 === 'number'
          ? comparisonRow.p99At100 - currentRow.p99At100
          : null,
      errorRateDelta:
        typeof currentRow.errorRate === 'number' && typeof comparisonRow.errorRate === 'number'
          ? comparisonRow.errorRate - currentRow.errorRate
          : null
    };
  });
}

function formatSignedDelta(value, suffix) {
  if (value === null || typeof value === 'undefined' || Number.isNaN(Number(value))) {
    return '—';
  }

  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '';
  return `${sign}${Math.abs(numeric).toFixed(2)}${suffix}`;
}

function getDeltaTone(value) {
  if (value === null || typeof value === 'undefined' || Number.isNaN(Number(value))) {
    return 'neutral';
  }

  if (Number(value) > 0) {
    return 'positive';
  }

  if (Number(value) < 0) {
    return 'negative';
  }

  return 'neutral';
}

function getGraphUrl(summary, filename) {
  const graph = (summary.graphs || []).find(function findGraph(entry) {
    return entry.file === filename;
  });

  return graph ? graph.url : '';
}

function WinnerCard({ label, value, detail, tone }) {
  return (
    <article className={`winner-card winner-card--${tone}`}>
      <div className="winner-card__label">{label}</div>
      <div className="winner-card__value">{value}</div>
      <div className="winner-card__detail">{detail}</div>
    </article>
  );
}

function HealthCard({ label, port, status, timestamp, error }) {
  return (
    <article className={`card health-card health-card--${status}`}>
      <div className="health-card__top">
        <div>
          <div className="health-card__label">{label}</div>
          <div className="health-card__port">:{port}</div>
        </div>
        <div className={`health-indicator health-indicator--${status}`}>{status}</div>
      </div>
      <div className="health-card__meta">
        {timestamp ? `Health timestamp: ${formatTimestamp(timestamp)}` : error || 'No response yet'}
      </div>
    </article>
  );
}

function MultiFrameworkLineChart({ title, description, data, frameworks, unitSuffix }) {
  return (
    <article className="card chart-card">
      <div className="chart-card__header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="chart-shell chart-shell--tall">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(23, 32, 51, 0.12)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatTick} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              formatter={function formatTooltipValue(value) {
                return formatMetric(value, unitSuffix);
              }}
              labelFormatter={function formatTooltipLabel(label) {
                return `Concurrency ${String(label).replace('c', '')}`;
              }}
            />
            <Legend />
            {frameworks.map(function renderLine(framework) {
              return (
                <Line
                  key={framework}
                  type="monotone"
                  dataKey={framework}
                  name={getFrameworkLabel(framework)}
                  stroke={getFrameworkColor(framework)}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function SingleMetricBarChart({ title, description, data, dataKey, unitSuffix }) {
  return (
    <article className="card chart-card">
      <div className="chart-card__header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(23, 32, 51, 0.12)" vertical={false} />
            <XAxis dataKey="frameworkLabel" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatTick} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              formatter={function formatTooltipValue(value) {
                return formatMetric(value, unitSuffix);
              }}
            />
            <Bar dataKey={dataKey} radius={[12, 12, 4, 4]} isAnimationActive={false}>
              {data.map(function renderCell(entry) {
                return <Cell key={entry.framework} fill={getFrameworkColor(entry.framework)} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function LatencyComparisonChart({ data }) {
  return (
    <article className="card chart-card">
      <div className="chart-card__header">
        <div>
          <h2>Latency snapshot at concurrency 100</h2>
          <p>Lower is better here. This pairs median latency with tail latency so spikes are visible.</p>
        </div>
      </div>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(23, 32, 51, 0.12)" vertical={false} />
            <XAxis dataKey="frameworkLabel" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatTick} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              formatter={function formatTooltipValue(value) {
                return formatMetric(value, ' ms');
              }}
            />
            <Legend />
            <Bar dataKey="p50" name="p50" fill="#93c5fd" radius={[12, 12, 4, 4]} isAnimationActive={false} />
            <Bar dataKey="p99" name="p99" fill="#db6a4d" radius={[12, 12, 4, 4]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function ErrorBreakdownChart({ data }) {
  return (
    <article className="card chart-card">
      <div className="chart-card__header">
        <div>
          <h2>Error status counts</h2>
          <p>
            Each group shows how often 502, 504, 429, and uncategorized errors appeared in the
            dedicated curl status probes.
          </p>
        </div>
      </div>
      <div className="chart-shell">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(23, 32, 51, 0.12)" vertical={false} />
            <XAxis dataKey="frameworkLabel" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatTick} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              formatter={function formatTooltipValue(value) {
                return Number(value || 0).toLocaleString();
              }}
            />
            <Legend />
            {ERROR_BREAKDOWN_SERIES.map(function renderSeries(series) {
              return (
                <Bar
                  key={series.dataKey}
                  dataKey={series.dataKey}
                  name={series.label}
                  fill={series.color}
                  radius={[12, 12, 4, 4]}
                  isAnimationActive={false}
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function polarToCartesian(center, radius, index, total) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;

  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius
  };
}

function buildRadarPolygon(scores, center, radius, maxScore) {
  return scores
    .map(function mapScoreToPoint(score, index) {
      const scaledRadius = (radius * score) / maxScore;
      const point = polarToCartesian(center, scaledRadius, index, scores.length);

      return `${point.x},${point.y}`;
    })
    .join(' ');
}

function QualitativeRadarChart({ frameworks }) {
  const chartSize = 420;
  const center = 210;
  const radius = 128;
  const labelRadius = 164;
  const maxScore = 5;
  const orderedFrameworks = frameworks.filter(function hasScores(framework) {
    return Array.isArray(QUALITATIVE_SCORES[framework]);
  });

  return (
    <article className="card chart-card qualitative-chart-card">
      <div className="chart-card__header">
        <div>
          <h2>Qualitative radar</h2>
          <p>Five is best. This weighs setup, clarity, stability, and day-to-day development friction.</p>
        </div>
      </div>
      <div className="chart-shell chart-shell--qualitative">
        <svg
          className="qualitative-radar"
          viewBox={`0 0 ${chartSize} ${chartSize}`}
          role="img"
          aria-label="Radar chart comparing qualitative framework scores"
        >
          {[1, 2, 3, 4, 5].map(function renderRing(level) {
            const ringPoints = QUALITATIVE_DIMENSIONS.map(function buildRingPoint(_, index) {
              const point = polarToCartesian(center, (radius * level) / maxScore, index, QUALITATIVE_DIMENSIONS.length);
              return `${point.x},${point.y}`;
            }).join(' ');

            return (
              <polygon
                key={level}
                points={ringPoints}
                fill="none"
                stroke="rgba(24, 22, 20, 0.12)"
                strokeWidth="1"
              />
            );
          })}

          {QUALITATIVE_DIMENSIONS.map(function renderAxis(_, index) {
            const point = polarToCartesian(center, radius, index, QUALITATIVE_DIMENSIONS.length);

            return (
              <line
                key={QUALITATIVE_DIMENSIONS[index]}
                x1={center}
                y1={center}
                x2={point.x}
                y2={point.y}
                stroke="rgba(24, 22, 20, 0.12)"
                strokeWidth="1"
              />
            );
          })}

          {[1, 2, 3, 4, 5].map(function renderTick(level) {
            return (
              <text
                key={`tick-${level}`}
                x={center + 8}
                y={center - (radius * level) / maxScore + 4}
                className="qualitative-radar__tick"
              >
                {level}
              </text>
            );
          })}

          {orderedFrameworks.map(function renderFrameworkPolygon(framework) {
            const color = getFrameworkColor(framework);
            const scores = QUALITATIVE_SCORES[framework];

            return (
              <polygon
                key={framework}
                points={buildRadarPolygon(scores, center, radius, maxScore)}
                fill={withAlpha(color, 0.12)}
                stroke={color}
                strokeWidth="2.5"
              />
            );
          })}

          {orderedFrameworks.map(function renderFrameworkDots(framework) {
            const color = getFrameworkColor(framework);

            return QUALITATIVE_SCORES[framework].map(function renderFrameworkDot(score, index) {
              const point = polarToCartesian(center, (radius * score) / maxScore, index, QUALITATIVE_DIMENSIONS.length);

              return (
                <circle
                  key={`${framework}-${QUALITATIVE_DIMENSIONS[index]}`}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill={color}
                />
              );
            });
          })}

          {QUALITATIVE_DIMENSIONS.map(function renderAxisLabel(label, index) {
            const point = polarToCartesian(center, labelRadius, index, QUALITATIVE_DIMENSIONS.length);
            const textAnchor =
              Math.abs(point.x - center) < 10 ? 'middle' : point.x > center ? 'start' : 'end';

            return (
              <text
                key={label}
                x={point.x}
                y={point.y}
                textAnchor={textAnchor}
                className="qualitative-radar__label"
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="qualitative-legend" aria-label="Framework color legend">
        {orderedFrameworks.map(function renderLegendItem(framework) {
          return (
            <div key={framework} className="qualitative-legend__item">
              <span
                className="qualitative-legend__swatch"
                style={{ backgroundColor: getFrameworkColor(framework) }}
                aria-hidden="true"
              />
              <span>{getFrameworkLabel(framework)}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DotScoreCard({ framework }) {
  return (
    <article className="qualitative-score-card">
      <div className="qualitative-score-card__header">
        <span className="qualitative-score-card__eyebrow">Framework</span>
        <strong style={{ color: getFrameworkColor(framework) }}>{getFrameworkLabel(framework)}</strong>
      </div>
      <div className="qualitative-score-list">
        {QUALITATIVE_DIMENSIONS.map(function renderMetric(label, index) {
          const score = QUALITATIVE_SCORES[framework][index];

          return (
            <div key={`${framework}-${label}`} className="qualitative-score-row">
              <span className="qualitative-score-row__label">{label}</span>
              <div className="qualitative-dot-row" aria-label={`${label}: ${score} out of 5`}>
                {[1, 2, 3, 4, 5].map(function renderDot(value) {
                  return (
                    <span
                      key={`${framework}-${label}-${value}`}
                      className={`qualitative-dot ${value <= score ? 'qualitative-dot--filled' : ''}`}
                      style={
                        value <= score
                          ? {
                              backgroundColor: getFrameworkColor(framework),
                              boxShadow: `0 0 0 1px ${withAlpha(getFrameworkColor(framework), 0.35)}`
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function QualitativeExplanationCard({ title, text }) {
  return (
    <article className="card qualitative-explanation-card">
      <div className="section-card__header">
        <div>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
      </div>
    </article>
  );
}

function ErrorBreakdownExplanationCard({ framework, text }) {
  return (
    <article className="card error-breakdown-card">
      <div className="error-breakdown-card__header">
        <span className="error-breakdown-card__eyebrow">Framework</span>
        <strong style={{ color: getFrameworkColor(framework) }}>{getFrameworkLabel(framework)}</strong>
      </div>
      <p>{text}</p>
    </article>
  );
}

function GeneratedBenchmarkImageCard({ title, description, imageUrl, alt }) {
  if (!imageUrl) {
    return null;
  }

  return (
    <article className="card chart-card">
      <div className="chart-card__header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="generated-chart-shell">
        <img className="generated-chart-image" src={imageUrl} alt={alt} loading="lazy" />
      </div>
    </article>
  );
}

function BenchmarkResults() {
  const initialStoredSummary = readStoredSummary();
  const [summary, setSummary] = useState(initialStoredSummary || EMPTY_RESULTS);
  const [historyRuns, setHistoryRuns] = useState([]);
  const [selectedComparisonRunId, setSelectedComparisonRunId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [healthLoading, setHealthLoading] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [summaryNotice, setSummaryNotice] = useState(
    initialStoredSummary ? 'Showing your last saved benchmark run while checking for updates.' : ''
  );
  const [backendHealth, setBackendHealth] = useState(
    BACKEND_TARGETS.map(function buildInitialHealth(target) {
      return {
        ...target,
        status: 'checking',
        timestamp: '',
        error: ''
      };
    })
  );

  async function refreshHistory() {
    try {
      const response = await fetch(`/benchmark-history.json?ts=${Date.now()}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        if (response.status === 404) {
          setHistoryRuns([]);
          return;
        }

        throw new Error('Failed to load benchmark history');
      }

      const payload = await response.json();
      setHistoryRuns(normalizeHistory(payload));
    } catch {
      setHistoryRuns([]);
    }
  }

  useEffect(function initializePage() {
    let isActive = true;

    async function fetchSummary() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/benchmark-summary.json?ts=${Date.now()}`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          if (response.status === 404) {
            if (isActive) {
              const cachedSummary = readStoredSummary();

              if (cachedSummary) {
                setSummary(cachedSummary);
                setSummaryNotice('Showing your last saved benchmark run. Generate a new summary to replace it.');
              } else {
                setSummary(EMPTY_RESULTS);
                setSummaryNotice('');
              }
            }

            return;
          }

          throw new Error('Failed to load benchmark summary');
        }

        const payload = await response.json();
        const nextSummary = normalizeSummary(payload);

        if (isActive) {
          if (hasPersistableResults(nextSummary)) {
            setSummary(nextSummary);
            setSummaryNotice('');
            storeSummary(nextSummary);
          } else {
            const cachedSummary = readStoredSummary();

            if (cachedSummary) {
              setSummary(cachedSummary);
              setSummaryNotice('Showing your last saved benchmark run. Generate a new summary to replace it.');
            } else {
              setSummary(nextSummary);
              setSummaryNotice('');
            }
          }
        }
      } catch (requestError) {
        if (isActive) {
          const cachedSummary = readStoredSummary();

          if (cachedSummary) {
            setSummary(cachedSummary);
            setSummaryNotice('Showing your last saved benchmark run because the latest summary could not be loaded.');
          } else {
            setError(requestError.message || 'Failed to load benchmark summary');
          }
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    async function fetchBackendHealth() {
      setHealthLoading(true);

      try {
        const healthResponses = await Promise.all(
          BACKEND_TARGETS.map(async function fetchTargetHealth(target) {
            try {
              const response = await fetch(buildHealthUrl(target.port), {
                cache: 'no-store'
              });

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }

              const payload = await response.json();

              return {
                ...target,
                status: 'online',
                timestamp: payload.timestamp || '',
                error: ''
              };
            } catch (requestError) {
              return {
                ...target,
                status: 'offline',
                timestamp: '',
                error: requestError.message || 'Unable to reach backend'
              };
            }
          })
        );

        if (isActive) {
          setBackendHealth(healthResponses);
        }
      } finally {
        if (isActive) {
          setHealthLoading(false);
        }
      }
    }

    fetchSummary();
    refreshHistory();
    fetchBackendHealth();

    return function cleanupSummaryRequest() {
      isActive = false;
    };
  }, []);

  useEffect(
    function keepComparisonSelectionFresh() {
      const comparisonCandidates =
        historyRuns.length > 1 ? historyRuns.slice(0, -1).reverse() : [];

      if (comparisonCandidates.length === 0) {
        if (selectedComparisonRunId) {
          setSelectedComparisonRunId('');
        }
        return;
      }

      if (
        !selectedComparisonRunId ||
        !comparisonCandidates.some(function hasSelectedRun(run) {
          return run.run_id === selectedComparisonRunId;
        })
      ) {
        setSelectedComparisonRunId(comparisonCandidates[0].run_id);
      }
    },
    [historyRuns, selectedComparisonRunId]
  );

  async function refreshSummary() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/benchmark-summary.json?ts=${Date.now()}`, {
        cache: 'no-store'
      });

      if (!response.ok) {
        if (response.status === 404) {
          const cachedSummary = readStoredSummary();

          if (cachedSummary) {
            setSummary(cachedSummary);
            setSummaryNotice('Showing your last saved benchmark run. Generate a new summary to replace it.');
          } else {
            setSummary(EMPTY_RESULTS);
            setSummaryNotice('');
          }
          return;
        }

        throw new Error('Failed to load benchmark summary');
      }

      const payload = await response.json();
      const nextSummary = normalizeSummary(payload);

      if (hasPersistableResults(nextSummary)) {
        setSummary(nextSummary);
        setSummaryNotice('');
        storeSummary(nextSummary);
      } else {
        const cachedSummary = readStoredSummary();

        if (cachedSummary) {
          setSummary(cachedSummary);
          setSummaryNotice('Showing your last saved benchmark run. Generate a new summary to replace it.');
        } else {
          setSummary(nextSummary);
          setSummaryNotice('');
        }
      }
    } catch (requestError) {
      const cachedSummary = readStoredSummary();

      if (cachedSummary) {
        setSummary(cachedSummary);
        setSummaryNotice('Showing your last saved benchmark run because the latest summary could not be loaded.');
      } else {
        setError(requestError.message || 'Failed to load benchmark summary');
      }
    } finally {
      setLoading(false);
    }

    await refreshHistory();
  }

  async function refreshBackendHealth() {
    setHealthLoading(true);

    const healthResponses = await Promise.all(
      BACKEND_TARGETS.map(async function fetchTargetHealth(target) {
        try {
          const response = await fetch(buildHealthUrl(target.port), {
            cache: 'no-store'
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const payload = await response.json();

          return {
            ...target,
            status: 'online',
            timestamp: payload.timestamp || '',
            error: ''
          };
        } catch (requestError) {
          return {
            ...target,
            status: 'offline',
            timestamp: '',
            error: requestError.message || 'Unable to reach backend'
          };
        }
      })
    );

    setBackendHealth(healthResponses);
    setHealthLoading(false);
  }

  async function copyBenchmarkCommand() {
    const command = [
      'cd /Users/anish/Documents/redirectiq',
      'bash benchmark/run_bench.sh',
      'python3 benchmark/analyze.py'
    ].join('\n');

    try {
      await navigator.clipboard.writeText(command);
      setCopyFeedback('Benchmark commands copied to your clipboard.');
    } catch {
      setCopyFeedback('Clipboard access failed. Run the commands shown on this page in your terminal.');
    }

    window.setTimeout(function clearFeedback() {
      setCopyFeedback('');
    }, 2500);
  }

  const hasData = summary.hasData && summary.winners;
  const summaryAgeDetails = hasData ? getSummaryAgeDetails(summary.generatedAt) : null;
  const throughputLineData = hasData ? buildLineSeries(summary, 'requestsSec') : [];
  const latencyLineData = hasData ? buildLineSeries(summary, 'p99Ms') : [];
  const throughputBarData = hasData ? buildThroughputBars(summary) : [];
  const latencyBarData = hasData ? buildLatencyBars(summary) : [];
  const errorBarData = hasData ? buildErrorBars(summary) : [];
  const errorBreakdownBarData = hasData ? buildErrorBreakdownBars(summary) : [];
  const systemMetricsRows = hasData ? buildSystemMetricsRows(summary) : [];
  const qualitativeFrameworks = hasData
    ? summary.frameworks.filter(function hasQualitativeScores(framework) {
        return Array.isArray(QUALITATIVE_SCORES[framework]);
      })
    : [];
  const cacheImpactThroughputGraphUrl = hasData ? getGraphUrl(summary, 'cache_impact_throughput.png') : '';
  const cacheImpactLatencyGraphUrl = hasData ? getGraphUrl(summary, 'cache_impact_latency.png') : '';
  const systemCpuGraphUrl = hasData ? getGraphUrl(summary, 'system_cpu.png') : '';
  const systemMemoryGraphUrl = hasData ? getGraphUrl(summary, 'system_memory.png') : '';
  const comparisonCandidates = hasData && historyRuns.length > 1 ? historyRuns.slice(0, -1).reverse() : [];
  const selectedComparisonRun =
    comparisonCandidates.find(function findSelectedRun(run) {
      return run.run_id === selectedComparisonRunId;
    }) || comparisonCandidates[0];
  const historyDeltaRows = hasData ? buildHistoryDeltaRows(summary, selectedComparisonRun) : [];

  return (
    <div className="page-shell">
      <Navbar />

      <main className="page-content">
        <section className="results-hero card">
          <div>
            <div className="eyebrow">Benchmark center</div>
            <h1>Compare the four RedirectIQ stacks under the same load.</h1>
            <p>
              Run the suite once, generate the analyzer output, and this page updates with winners,
              summaries, and charts from the saved benchmark files.
            </p>
          </div>
          <div className="results-hero__actions">
            <Link to="/dashboard" className="button button--ghost">
              Back to Dashboard
            </Link>
            <button type="button" className="button" onClick={copyBenchmarkCommand}>
              Copy Benchmark Commands
            </button>
            <button type="button" className="button button--secondary" onClick={refreshSummary}>
              Refresh Results
            </button>
            <button type="button" className="button button--ghost" onClick={refreshBackendHealth}>
              {healthLoading ? 'Checking Backends...' : 'Refresh Backend Status'}
            </button>
            <a href="/benchmark-summary.json" className="button button--secondary">
              Open Summary JSON
            </a>
          </div>
        </section>

        {copyFeedback ? <p className="inline-feedback">{copyFeedback}</p> : null}
        {summaryNotice ? <p className="inline-feedback inline-feedback--soft">{summaryNotice}</p> : null}
        {summaryAgeDetails ? (
          <p className="inline-feedback inline-feedback--warning">
            {summaryAgeDetails.message} Run `bash benchmark/run_bench.sh`, then `python3 benchmark/analyze.py`, and refresh this page to load newer results.
          </p>
        ) : null}
        {loading && summary.hasData ? (
          <p className="inline-feedback inline-feedback--soft">Refreshing benchmark results...</p>
        ) : null}
        {!loading && !hasData ? (
          <section className="card section-card">
            <div className="section-card__header">
              <div>
                <h2>No benchmark summary yet</h2>
                <p>
                  This page is only showing backend status and setup information because the benchmark
                  run has not finished cleanly yet. Restart the backends, run the benchmark again, then
                  run the analyzer and refresh this page.
                </p>
              </div>
            </div>
            <div className="command-stack">
              <div className="command-card">
                <div className="command-card__label">1. Restart all 4 backends</div>
                <code>Node 3001, Flask 3002, Nginx 3003, Apache 3004</code>
              </div>
              <div className="command-card">
                <div className="command-card__label">2. Run the benchmark again</div>
                <code>bash benchmark/run_bench.sh</code>
              </div>
              <div className="command-card">
                <div className="command-card__label">3. Generate the summary</div>
                <code>python3 benchmark/analyze.py</code>
              </div>
            </div>
          </section>
        ) : null}

        {loading && !hasData ? (
          <section className="card loading-card">
            <p>Loading benchmark results...</p>
          </section>
        ) : error && !hasData ? (
          <section className="card loading-card">
            <p className="feedback feedback--error">{error}</p>
          </section>
        ) : !hasData ? (
          <section className="results-empty-grid">
            <article className="card section-card">
              <div className="section-card__header">
                <div>
                  <h2>No benchmark results yet</h2>
                  <p>Run the benchmark workflow once, then refresh this page.</p>
                </div>
              </div>
              <div className="command-stack">
                <div className="command-card">
                  <div className="command-card__label">1. Start all backends</div>
                  <code>node:3001, flask:3002, nginx:3003, apache:3004</code>
                </div>
                <div className="command-card">
                  <div className="command-card__label">2. Run the load suite</div>
                  <code>bash benchmark/run_bench.sh</code>
                </div>
                <div className="command-card">
                  <div className="command-card__label">3. Generate graphs + summary</div>
                  <code>python3 benchmark/analyze.py</code>
                </div>
              </div>
            </article>

            <article className="card section-card">
              <div className="section-card__header">
                <div>
                  <h2>Where to look</h2>
                  <p>Once analysis finishes, you can see the outputs in three places.</p>
                </div>
              </div>
              <ul className="quick-list">
                <li>`results/graphs/` contains the generated PNG charts and summary JSON.</li>
                <li>This page will automatically show the winner cards and interactive charts after refresh.</li>
                <li>`results/node/`, `results/flask/`, `results/nginx/`, and `results/apache/` contain raw `wrk` and `ab` outputs.</li>
              </ul>
            </article>
          </section>
        ) : (
          <>
            <section className="results-support-grid">
              <article className="card support-card">
                <div className="section-card__header">
                  <div>
                    <h2>Target health</h2>
                    <p>Quick visibility into the four benchmark backends.</p>
                  </div>
                </div>
                <div className="support-pill-row">
                  {backendHealth.map(function renderTargetPill(target) {
                    return (
                      <div key={target.id} className={`support-pill support-pill--${target.status}`}>
                        <span>{target.label}</span>
                        <strong>{target.status}</strong>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="card support-card">
                <div className="section-card__header">
                  <div>
                    <h2>Quick runbook</h2>
                    <p>Rerun the suite or open the machine-readable summary without leaving this page.</p>
                  </div>
                </div>
                <div className="benchmark-panel__actions">
                  <code>bash benchmark/run_bench.sh</code>
                  <code>python3 benchmark/analyze.py</code>
                </div>
              </article>
            </section>

            <section className="winner-grid">
              <WinnerCard
                label="Overall winner"
                value={getFrameworkLabel(summary.winners.overall.framework)}
                detail="Combined throughput and latency score"
                tone="overall"
              />
              <WinnerCard
                label="Throughput winner"
                value={getFrameworkLabel(summary.winners.throughput.framework)}
                detail={`${formatMetric(summary.winners.throughput.value, ' req/s')} at c${summary.winners.throughput.concurrency}`}
                tone="throughput"
              />
              <WinnerCard
                label="Latency winner"
                value={getFrameworkLabel(summary.winners.latency.framework)}
                detail={`${formatMetric(summary.winners.latency.value, ' ms')} p99 at c${summary.winners.latency.concurrency}`}
                tone="latency"
              />
            </section>

            <section className="results-meta-row">
              <div className="results-meta-chip">
                <span>Generated</span>
                <strong>{formatTimestamp(summary.generatedAt)}</strong>
                {summaryAgeDetails ? <em>{summaryAgeDetails.message}</em> : null}
              </div>
              <div className="results-meta-chip">
                <span>Frameworks</span>
                <strong>{summary.frameworks.map(getFrameworkLabel).join(', ')}</strong>
              </div>
              <div className="results-meta-chip">
                <span>Concurrency levels</span>
                <strong>{summary.concurrencyLevels.join(', ')}</strong>
              </div>
            </section>

            <section className="card section-card">
              <div className="section-card__header">
                <div>
                  <h2>Summary table</h2>
                  <p>Best throughput and key latency checkpoints for each target.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Framework</th>
                      <th>Best Throughput</th>
                      <th>p50 @ c100</th>
                      <th>p99 @ c100</th>
                      <th>p99 @ c500</th>
                      <th>Error Rate @ c500</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.summaryTable.map(function renderRow(row) {
                      return (
                        <tr key={row.framework}>
                          <td className="summary-framework">{getFrameworkLabel(row.framework)}</td>
                          <td>{formatMetric(row.bestThroughput, ' req/s')}</td>
                          <td>{formatMetric(row.p50At100, ' ms')}</td>
                          <td>{formatMetric(row.p99At100, ' ms')}</td>
                          <td>{formatMetric(row.p99At500, ' ms')}</td>
                          <td>{formatMetric(row.errorRate, ' %')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="chart-grid">
              <MultiFrameworkLineChart
                title="Throughput scaling curve"
                description="Higher is better. This shows how many redirect requests each framework sustains as concurrency rises."
                data={throughputLineData}
                frameworks={summary.frameworks}
                unitSuffix=" req/s"
              />
              <MultiFrameworkLineChart
                title="Tail latency scaling curve"
                description="Lower is better. This tracks p99 latency, which usually exposes bottlenecks first."
                data={latencyLineData}
                frameworks={summary.frameworks}
                unitSuffix=" ms"
              />
              <SingleMetricBarChart
                title="Best throughput by framework"
                description="This compares the strongest req/sec each framework reached across the tested concurrency levels."
                data={throughputBarData}
                dataKey="value"
                unitSuffix=" req/s"
              />
              <LatencyComparisonChart data={latencyBarData} />
              <SingleMetricBarChart
                title="Error rate at concurrency 500"
                description="Lower is better. Any non-2xx or non-3xx responses get counted here."
                data={errorBarData}
                dataKey="errorRate"
                unitSuffix=" %"
              />
            </section>

            <section className="card section-card qualitative-section">
              <div className="section-card__header">
                <div>
                  <h2>Qualitative Analysis</h2>
                  <p>
                    The throughput winner is only part of the story. This compares each stack on setup,
                    clarity, resilience, and day-to-day developer experience.
                  </p>
                </div>
              </div>

              <div className="qualitative-layout">
                <QualitativeRadarChart frameworks={qualitativeFrameworks} />

                <div className="qualitative-score-grid">
                  {qualitativeFrameworks.map(function renderScoreCard(framework) {
                    return <DotScoreCard key={framework} framework={framework} />;
                  })}
                </div>

                <div className="qualitative-explanation-grid">
                  {QUALITATIVE_EXPLANATIONS.map(function renderExplanationCard(card) {
                    return (
                      <QualitativeExplanationCard
                        key={card.title}
                        title={card.title}
                        text={card.text}
                      />
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="card section-card cache-impact-section">
              <div className="section-card__header">
                <div>
                  <h2>Cache Impact</h2>
                  <p className="cache-impact-note">
                    The warm-cache runs reflect steady-state performance after the in-memory slug cache is populated. The cold-cache runs reflect first-hit behavior where each redirect requires a SQLite lookup. The delta between the two shows how much each framework benefits from caching.
                  </p>
                </div>
              </div>

              <div className="chart-grid cache-impact-grid">
                <GeneratedBenchmarkImageCard
                  title="Cold vs warm throughput"
                  description="Grouped req/sec output from the dedicated cache-impact benchmark run."
                  imageUrl={cacheImpactThroughputGraphUrl}
                  alt="Cache impact throughput chart"
                />
                <GeneratedBenchmarkImageCard
                  title="Cold vs warm tail latency"
                  description="Grouped p99 output from the same first-hit versus steady-state comparison."
                  imageUrl={cacheImpactLatencyGraphUrl}
                  alt="Cache impact latency chart"
                />
              </div>
            </section>

            <section className="card section-card error-breakdown-section">
              <div className="section-card__header">
                <div>
                  <h2>Error Breakdown</h2>
                  <p>
                    These counts come from the dedicated curl-based status probes that run alongside
                    the benchmark suite and capture which failures each stack actually emits.
                  </p>
                </div>
              </div>

              <div className="error-breakdown-layout">
                <ErrorBreakdownChart data={errorBreakdownBarData} />

                <div className="error-breakdown-card-grid">
                  {ERROR_BREAKDOWN_EXPLANATIONS.map(function renderErrorBreakdownCard(card) {
                    return (
                      <ErrorBreakdownExplanationCard
                        key={card.framework}
                        framework={card.framework}
                        text={card.text}
                      />
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="card section-card system-metrics-section">
              <div className="section-card__header">
                <div>
                  <h2>System Metrics</h2>
                  <p>
                    These process-level samples were captured every 500ms during each framework run so
                    you can compare backend CPU pressure and memory growth under load.
                  </p>
                </div>
              </div>

              <div className="chart-grid system-metrics-grid">
                <GeneratedBenchmarkImageCard
                  title="CPU usage over time"
                  description="Line chart showing backend CPU utilization throughout the benchmark run."
                  imageUrl={systemCpuGraphUrl}
                  alt="System CPU usage chart"
                />
                <GeneratedBenchmarkImageCard
                  title="Memory usage over time"
                  description="Line chart showing RSS memory usage across the same benchmark window."
                  imageUrl={systemMemoryGraphUrl}
                  alt="System memory usage chart"
                />
              </div>

              <div className="table-wrap">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Framework</th>
                      <th>Peak CPU</th>
                      <th>Avg CPU</th>
                      <th>Peak Memory</th>
                      <th>Avg Memory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemMetricsRows.map(function renderRow(row) {
                      return (
                        <tr key={row.framework}>
                          <td className="summary-framework">{row.frameworkLabel}</td>
                          <td>{formatMetric(row.peakCpu, ' %')}</td>
                          <td>{formatMetric(row.avgCpu, ' %')}</td>
                          <td>{formatMetric(row.peakMemoryMb, ' MB')}</td>
                          <td>{formatMetric(row.avgMemoryMb, ' MB')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card section-card">
              <div className="section-card__header">
                <div>
                  <h2>Generated exports</h2>
                  <p>If you want the saved chart images or machine-readable summary, open them directly.</p>
                </div>
              </div>
              <div className="export-list">
                <a href="/benchmark-summary.json" className="export-link">
                  benchmark-summary.json
                </a>
                {summary.graphs.map(function renderGraphLink(graph) {
                  return (
                    <a key={graph.file} href={graph.url} className="export-link">
                      {graph.file}
                    </a>
                  );
                })}
              </div>
            </section>

            <section className="card section-card benchmark-history-section">
              <div className="section-card__header">
                <div>
                  <h2>Benchmark History</h2>
                  <p>
                    Positive values mean the current run improved versus the selected earlier run:
                    higher throughput, lower p99 latency, and lower error rate.
                  </p>
                </div>
              </div>

              {comparisonCandidates.length === 0 ? (
                <p className="history-empty-note">Run the benchmark again to start seeing history and regressions.</p>
              ) : (
                <>
                  <div className="history-chip-row" role="tablist" aria-label="Benchmark run history">
                    {comparisonCandidates.map(function renderHistoryChip(run) {
                      const isActive = run.run_id === selectedComparisonRun.run_id;

                      return (
                        <button
                          key={run.run_id}
                          type="button"
                          className={`history-chip ${isActive ? 'history-chip--active' : ''}`}
                          onClick={function chooseComparisonRun() {
                            setSelectedComparisonRunId(run.run_id);
                          }}
                        >
                          {formatHistoryChipLabel(run.timestamp)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="table-wrap">
                    <table className="data-table data-table--compact">
                      <thead>
                        <tr>
                          <th>Framework</th>
                          <th>Throughput delta</th>
                          <th>p99 latency delta</th>
                          <th>Error rate delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyDeltaRows.map(function renderDeltaRow(row) {
                          return (
                            <tr key={row.framework}>
                              <td className="summary-framework">{row.frameworkLabel}</td>
                              <td className={`delta-cell delta-cell--${getDeltaTone(row.throughputDelta)}`}>
                                {formatSignedDelta(row.throughputDelta, ' req/s')}
                              </td>
                              <td className={`delta-cell delta-cell--${getDeltaTone(row.latencyDelta)}`}>
                                {formatSignedDelta(row.latencyDelta, ' ms')}
                              </td>
                              <td className={`delta-cell delta-cell--${getDeltaTone(row.errorRateDelta)}`}>
                                {formatSignedDelta(row.errorRateDelta, ' %')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {!hasData ? (
          <>
            <section className="backend-health-grid">
              {backendHealth.map(function renderHealthCard(target) {
                return (
                  <HealthCard
                    key={target.id}
                    label={target.label}
                    port={target.port}
                    status={target.status}
                    timestamp={target.timestamp}
                    error={target.error}
                  />
                );
              })}
            </section>

            <section className="benchmark-flow">
              <article className="card flow-card">
                <div className="flow-card__step">1</div>
                <h2>Setup per framework</h2>
                <p>
                  The script creates a user, logs in, creates a short link, and saves the slug for each
                  target on ports 3001 through 3004.
                </p>
              </article>

              <article className="card flow-card">
                <div className="flow-card__step">2</div>
                <h2>Warmup + redirect hits</h2>
                <p>
                  It fires warmup GET requests to `/:slug`, then runs load tools directly against that same
                  redirect endpoint.
                </p>
              </article>

              <article className="card flow-card">
                <div className="flow-card__step">3</div>
                <h2>Measure and compare</h2>
                <p>
                  `wrk` captures req/sec and latency, `ab` adds a second load run, and the analyzer picks
                  throughput, latency, and overall winners.
                </p>
              </article>
            </section>

            <section className="benchmark-explainer">
              <article className="card section-card">
                <div className="section-card__header">
                  <div>
                    <h2>How requests are actually sent</h2>
                    <p>These are the real request types that hit each framework during benchmarking.</p>
                  </div>
                </div>
                <p className="subtle-status benchmark-note">
                  The browser cannot safely execute your local shell scripts directly, so this page gives
                  you copy and refresh controls while the actual load test still runs from your terminal.
                </p>
                <div className="command-stack">
                  <div className="command-card">
                    <div className="command-card__label">Create benchmark identity</div>
                    <code>curl -X POST http://127.0.0.1:3001/auth/register</code>
                    <code>curl -X POST http://127.0.0.1:3001/auth/login</code>
                    <code>curl -X POST http://127.0.0.1:3001/links</code>
                  </div>
                  <div className="command-card">
                    <div className="command-card__label">Primary traffic test with wrk</div>
                    <code>wrk -t4 -c100 -d30s --latency http://127.0.0.1:3001/&lt;slug&gt;</code>
                  </div>
                  <div className="command-card">
                    <div className="command-card__label">Secondary traffic test with ab</div>
                    <code>ab -n 1000 -c 100 http://127.0.0.1:3001/&lt;slug&gt;</code>
                  </div>
                </div>
                <ul className="quick-list">
                  <li>`benchmark/run_bench.sh` loops through `node`, `flask`, `nginx`, and `apache`.</li>
                  <li>Each framework gets its own user, token, slug, warmup hits, and concurrency runs.</li>
                  <li>The main endpoint being stress-tested is `GET /:slug`, which exercises redirect logic and click logging.</li>
                </ul>
              </article>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default BenchmarkResults;
