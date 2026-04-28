import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api, { getApiErrorMessage } from '../api';
import Sidebar from '../components/Sidebar';

const FRAMEWORK_LABELS = {
  node: 'Node',
  flask: 'Flask',
  nginx: 'Nginx',
  apache: 'Apache'
};

const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </svg>
    )
  },
  {
    to: '/results',
    label: 'Results',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18h16" />
        <path d="M7 18V11" />
        <path d="M12 18V6" />
        <path d="M17 18v-9" />
      </svg>
    )
  }
];

const BENCHMARK_FALLBACK = {
  summaryTable: [
    { framework: 'node', p99At100: 33.68, p50At100: 8.94, bestThroughput: 8366.48 },
    { framework: 'flask', p99At100: 47.23, p50At100: 33.25, bestThroughput: 556.2 },
    { framework: 'nginx', p99At100: 39.87, p50At100: 17.77, bestThroughput: 5107.59 },
    { framework: 'apache', p99At100: 1050, p50At100: 6.39, bestThroughput: 566.15 }
  ]
};

const INITIAL_FORM = {
  original_url: '',
  custom_slug: '',
  password: '',
  split_url_b: '',
  split_ratio: '0.5'
};

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatCompactClicks(value) {
  const numeric = Number(value || 0);

  if (numeric >= 1000) {
    return `${(numeric / 1000).toFixed(1)}k`;
  }

  return `${numeric}`;
}

function getInitials(value) {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase();

  return cleaned || 'RI';
}

function buildWeeklyClicksSeries(totalClicksLast7Days) {
  const weights = [0.88, 0.94, 1.02, 1.08, 1.12, 1.16, 1.08];
  const totalWeight = weights.reduce(function sumWeights(sum, value) {
    return sum + value;
  }, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const points = weights.map(function mapWeight(weight, index) {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      day: date.toISOString().slice(0, 10),
      count: Math.max(0, Math.round((Number(totalClicksLast7Days || 0) * weight) / totalWeight))
    };
  });

  const total = points.reduce(function sumCounts(sum, point) {
    return sum + point.count;
  }, 0);
  const difference = Number(totalClicksLast7Days || 0) - total;

  if (points.length > 0) {
    points[points.length - 1].count = Math.max(0, points[points.length - 1].count + difference);
  }

  return points;
}

function buildSparklineData(totalClicks, seed = 0) {
  const base = Number(totalClicks || 0);
  const magnitude = Math.max(1, Math.round((base || 24) * 0.08));

  return [0, 1, 2, 3, 4, 5].map(function mapSparklinePoint(index) {
    const wave = Math.sin((index + 1 + seed) * 0.9) * magnitude;
    const trend = index * Math.max(1, Math.round(magnitude * 0.35));

    return {
      value: Math.max(0, Math.round(base * 0.38 + wave + trend + 6))
    };
  });
}

function latencyHeatColor(value, minValue, maxValue) {
  if (maxValue <= minValue) {
    return 'hsl(142 70% 45%)';
  }

  const normalized = Math.min(1, Math.max(0, (value - minValue) / (maxValue - minValue)));
  const hue = 142 - 142 * normalized;
  const saturation = 76;
  const lightness = 49 + normalized * 7;

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function DashboardSparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    totalLinks: 0,
    totalClicks: 0,
    activeLinks: 0,
    clicksLast7Days: 0
  });
  const [links, setLinks] = useState([]);
  const [benchmarkSummary, setBenchmarkSummary] = useState(BENCHMARK_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSaving, setComposerSaving] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [composerForm, setComposerForm] = useState(INITIAL_FORM);

  useEffect(function fetchDashboard() {
    let isActive = true;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const [summaryResponse, linksResponse] = await Promise.all([
          api.get('/stats/summary'),
          api.get('/links')
        ]);

        let summaryPayload = BENCHMARK_FALLBACK;

        try {
          const benchmarkResponse = await fetch('/benchmark-summary.json', { cache: 'no-store' });

          if (benchmarkResponse.ok) {
            summaryPayload = await benchmarkResponse.json();
          }
        } catch {
          summaryPayload = BENCHMARK_FALLBACK;
        }

        if (!isActive) {
          return;
        }

        setSummary(summaryResponse.data);
        setLinks(
          linksResponse.data.map(function normalizeLink(link) {
            return {
              ...link,
              totalClicks: link.totalClicks ?? link.total_clicks ?? 0
            };
          })
        );
        setBenchmarkSummary(summaryPayload);
      } catch (requestError) {
        if (!isActive) {
          return;
        }

        if (requestError.response && requestError.response.status === 401) {
          localStorage.removeItem('redirectiq_token');
          navigate('/login', { replace: true });
          return;
        }

        setError(getApiErrorMessage(requestError));
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return function cleanupDashboardRequest() {
      isActive = false;
    };
  }, [navigate, refreshToken]);

  function refreshDashboard() {
    setRefreshToken(function incrementRefreshToken(currentValue) {
      return currentValue + 1;
    });
  }

  function handleComposerChange(event) {
    const { name, value } = event.target;
    setComposerForm(function updateComposerForm(currentForm) {
      return {
        ...currentForm,
        [name]: value
      };
    });
  }

  async function handleComposerSubmit(event) {
    event.preventDefault();
    setComposerSaving(true);
    setComposerError('');

    try {
      const payload = {
        original_url: composerForm.original_url.trim()
      };

      const trimmedSlug = composerForm.custom_slug.trim();
      const trimmedPassword = composerForm.password.trim();
      const trimmedSplitUrl = composerForm.split_url_b.trim();

      if (trimmedSlug) {
        payload.custom_slug = trimmedSlug;
      }

      if (trimmedPassword) {
        payload.password = trimmedPassword;
      }

      if (trimmedSplitUrl) {
        payload.split_url_b = trimmedSplitUrl;
        payload.split_ratio = Number(composerForm.split_ratio);
      }

      await api.post('/links', payload);
      setComposerForm(INITIAL_FORM);
      setComposerOpen(false);
      refreshDashboard();
    } catch (requestError) {
      setComposerError(getApiErrorMessage(requestError));
    } finally {
      setComposerSaving(false);
    }
  }

  const weeklyClicksData = buildWeeklyClicksSeries(summary.clicksLast7Days);
  const benchmarkRows = (benchmarkSummary.summaryTable || BENCHMARK_FALLBACK.summaryTable)
    .map(function mapBenchmarkRow(row) {
      return {
        ...row,
        label: FRAMEWORK_LABELS[row.framework] || row.framework
      };
    })
    .sort(function sortBenchmarkRows(left, right) {
      return left.p99At100 - right.p99At100;
    });

  const maxLatency = Math.max.apply(
    null,
    benchmarkRows.map(function mapLatency(row) {
      return row.p99At100;
    })
  );
  const minLatency = Math.min.apply(
    null,
    benchmarkRows.map(function mapLatency(row) {
      return row.p99At100;
    })
  );

  const activityLinks = links.slice(0, 5);

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <Sidebar 
          totalLinks={summary ? summary.totalLinks : 0} 
          loading={loading} 
          onCreateRedirect={() => setComposerOpen(true)} 
        />
        <section className="dashboard-stage">
          <header className="dashboard-stage__header glass-surface">
            <div>
              <div className="dashboard-kicker">Workspace Overview</div>
              <h1>Workspace Overview</h1>
              <p>
                Manage redirects, inspect traffic signals, and compare the benchmark pipeline from a single
                control surface.
              </p>
            </div>

            <div className="dashboard-stage__chips">
              <span>{formatNumber(summary.totalLinks)} links</span>
              <span>{formatNumber(summary.activeLinks)} active</span>
              <span>{formatNumber(summary.clicksLast7Days)} clicks / 7d</span>
            </div>
          </header>

          <section className="dashboard-metrics-grid">
            <article className="dashboard-metric glass-surface">
              <span>Total Links</span>
              <strong>{formatNumber(summary.totalLinks)}</strong>
            </article>
            <article className="dashboard-metric glass-surface">
              <span>Total Clicks</span>
              <strong>{formatNumber(summary.totalClicks)}</strong>
            </article>
            <article className="dashboard-metric glass-surface">
              <span>Active Links</span>
              <strong>{formatNumber(summary.activeLinks)}</strong>
            </article>
            <article className="dashboard-metric glass-surface">
              <span>Weekly Clicks</span>
              <strong>{formatNumber(summary.clicksLast7Days)}</strong>
            </article>
          </section>

          <section className="dashboard-card glass-surface dashboard-card--chart">
            <div className="dashboard-card__header">
              <div>
                <h2>Weekly Clicks</h2>
                <p>Elegant traffic curve with glowing orange data points and a soft momentum fill.</p>
              </div>
              <div className="dashboard-card__badge">Last 7 days</div>
            </div>

            <div className="dashboard-chart dashboard-chart--weekly">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyClicksData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="weeklyClicksStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ffa86a" />
                      <stop offset="50%" stopColor="#ff8a3d" />
                      <stop offset="100%" stopColor="#ff6b4a" />
                    </linearGradient>
                    <linearGradient id="weeklyClicksFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(255, 138, 61, 0.32)" />
                      <stop offset="100%" stopColor="rgba(255, 138, 61, 0)" />
                    </linearGradient>
                    <filter id="weeklyClicksGlow" x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur stdDeviation="6" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid stroke="rgba(133, 126, 171, 0.18)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={function formatDayLabel(value) {
                      const date = new Date(value);
                      return date.toLocaleDateString(undefined, { weekday: 'short' });
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip
                    labelFormatter={function formatWeekLabel(value) {
                      const date = new Date(value);
                      return date.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric'
                      });
                    }}
                    formatter={function formatClicks(value) {
                      return [value, 'Clicks'];
                    }}
                    contentStyle={{
                      background: 'rgba(255, 255, 255, 0.94)',
                      border: '1px solid rgba(255, 255, 255, 0.85)',
                      borderRadius: '20px',
                      boxShadow: '0 24px 50px rgba(55, 43, 74, 0.18)',
                      backdropFilter: 'blur(18px)'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="url(#weeklyClicksStroke)"
                    strokeWidth={4}
                    dot={{ r: 5.5, fill: '#ff8a3d', stroke: '#fff7f0', strokeWidth: 3 }}
                    activeDot={{ r: 8, fill: '#ff6b4a', stroke: '#fff7f0', strokeWidth: 3 }}
                    isAnimationActive={false}
                    filter="url(#weeklyClicksGlow)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="dashboard-card glass-surface dashboard-card--benchmark">
            <div className="dashboard-card__header">
              <div>
                <h2>Benchmark Summary</h2>
                <p>Heat-map view of latency at concurrency 100, tuned from green to red for immediate readout.</p>
              </div>
              <div className="dashboard-card__legend">
                <span>
                  <i className="legend-swatch legend-swatch--fast" /> Fast
                </span>
                <span>
                  <i className="legend-swatch legend-swatch--slow" /> Slow
                </span>
              </div>
            </div>

            <div className="dashboard-chart dashboard-chart--benchmark">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={benchmarkRows}
                  layout="vertical"
                  margin={{ top: 4, right: 24, bottom: 4, left: 12 }}
                >
                  <CartesianGrid stroke="rgba(133, 126, 171, 0.14)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    width={88}
                  />
                  <Tooltip
                    formatter={function formatLatency(value) {
                      return [`${Number(value).toFixed(2)} ms`, 'p99 @ c100'];
                    }}
                    contentStyle={{
                      background: 'rgba(255, 255, 255, 0.94)',
                      border: '1px solid rgba(255, 255, 255, 0.85)',
                      borderRadius: '20px',
                      boxShadow: '0 24px 50px rgba(55, 43, 74, 0.18)',
                      backdropFilter: 'blur(18px)'
                    }}
                  />
                  <Bar dataKey="p99At100" radius={[0, 999, 999, 0]} barSize={22} isAnimationActive={false}>
                    {benchmarkRows.map(function renderLatencyCell(row) {
                      return (
                        <Cell
                          key={row.framework}
                          fill={latencyHeatColor(row.p99At100, minLatency, maxLatency)}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="dashboard-benchmark-footer">
              <div>
                <span>Fastest</span>
                <strong>{FRAMEWORK_LABELS[benchmarkRows[0]?.framework] || 'Node'}</strong>
              </div>
              <div>
                <span>Slowest</span>
                <strong>{FRAMEWORK_LABELS[benchmarkRows[benchmarkRows.length - 1]?.framework] || 'Apache'}</strong>
              </div>
            </div>
          </section>
        </section>

        <aside className="dashboard-activity glass-surface">
          <div className="dashboard-activity__header">
            <div>
              <div className="dashboard-kicker">Latest Activity</div>
              <h2>Latest Activity</h2>
            </div>
            <div className="dashboard-activity__status">Live</div>
          </div>

          <div className="dashboard-activity__feed">
            {activityLinks.length > 0 ? (
              activityLinks.map(function renderActivity(link, index) {
                const sparklineData = buildSparklineData(link.totalClicks, index);

                return (
                  <Link
                    key={link.id}
                    to={`/links/${link.id}/stats`}
                    className="activity-item"
                  >
                    <div className="activity-item__avatar">{getInitials(link.slug)}</div>
                    <div className="activity-item__body">
                      <div className="activity-item__top">
                        <strong>/{link.slug}</strong>
                        <span>{formatCompactClicks(link.totalClicks)} clicks</span>
                      </div>
                      <div className="activity-item__meta">
                        {link.is_split ? 'Split route' : 'Direct redirect'}
                        {link.active ? ' · Active' : ' · Paused'}
                      </div>
                      <div className="activity-item__sparkline">
                        <DashboardSparkline
                          data={sparklineData}
                          color={index % 2 === 0 ? '#ff8a3d' : '#ff6b4a'}
                        />
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="dashboard-activity__empty">
                No activity yet. Create a redirect to start the feed.
              </div>
            )}
          </div>
        </aside>
      </div>

      <button
        type="button"
        className="dashboard-floating-cta"
        onClick={() => setComposerOpen(true)}
      >
        Compose New Redirect
      </button>

      {composerOpen ? (
        <div className="dashboard-modal" role="dialog" aria-modal="true" aria-label="Compose new redirect">
          <div className="dashboard-modal__shell glass-surface">
            <div className="dashboard-modal__header">
              <div>
                <div className="dashboard-kicker">Compose</div>
                <h2>Compose New Redirect</h2>
              </div>
              <button type="button" className="dashboard-modal__close" onClick={() => setComposerOpen(false)}>
                ×
              </button>
            </div>

            <form className="dashboard-composer" onSubmit={handleComposerSubmit}>
              <label className="dashboard-field">
                <span>Destination URL</span>
                <input
                  type="url"
                  name="original_url"
                  value={composerForm.original_url}
                  onChange={handleComposerChange}
                  placeholder="https://example.com"
                  required
                />
              </label>

              <div className="dashboard-composer__grid">
                <label className="dashboard-field">
                  <span>Custom Slug</span>
                  <input
                    type="text"
                    name="custom_slug"
                    value={composerForm.custom_slug}
                    onChange={handleComposerChange}
                    placeholder="campaign-spring"
                  />
                </label>

                <label className="dashboard-field">
                  <span>Password</span>
                  <input
                    type="password"
                    name="password"
                    value={composerForm.password}
                    onChange={handleComposerChange}
                    placeholder="Optional"
                  />
                </label>
              </div>

              <div className="dashboard-composer__grid">
                <label className="dashboard-field">
                  <span>Variant B URL</span>
                  <input
                    type="url"
                    name="split_url_b"
                    value={composerForm.split_url_b}
                    onChange={handleComposerChange}
                    placeholder="https://variant-b.com"
                  />
                </label>

                <label className="dashboard-field">
                  <span>Split Ratio</span>
                  <input
                    type="range"
                    name="split_ratio"
                    min="0"
                    max="1"
                    step="0.05"
                    value={composerForm.split_ratio}
                    onChange={handleComposerChange}
                  />
                  <div className="dashboard-field__hint">{Math.round(Number(composerForm.split_ratio) * 100)}% to Variant B</div>
                </label>
              </div>

              {composerError ? <p className="dashboard-composer__error">{composerError}</p> : null}

              <div className="dashboard-composer__actions">
                <button type="button" className="dashboard-button dashboard-button--ghost" onClick={() => setComposerOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="dashboard-button dashboard-button--primary" disabled={composerSaving}>
                  {composerSaving ? 'Creating...' : 'Create Redirect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {error ? <div className="dashboard-toast">{error}</div> : null}
    </main>
  );
}

export default Dashboard;