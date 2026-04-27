import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api, { getApiErrorMessage } from '../api';
import Navbar from '../components/Navbar';
import ClickChart from '../components/ClickChart';

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buildSevenDaySeries(sourceData) {
  const countsByDay = new Map(
    (sourceData || []).map(function toEntry(item) {
      return [item.day, Number(item.count)];
    })
  );
  const result = [];
  const currentDate = new Date();

  currentDate.setHours(0, 0, 0, 0);

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() - index);

    const isoDay = date.toISOString().slice(0, 10);

    result.push({
      day: isoDay,
      count: countsByDay.get(isoDay) || 0
    });
  }

  return result;
}

function buildDeviceData(sourceData) {
  const deviceCounts = {
    Mobile: 0,
    Desktop: 0
  };

  (sourceData || []).forEach(function consumeItem(item) {
    deviceCounts[item.device] = Number(item.count);
  });

  return [
    { device: 'Mobile', count: deviceCounts.Mobile || 0 },
    { device: 'Desktop', count: deviceCounts.Desktop || 0 }
  ];
}

function LinkStats() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const lastSevenDayClicks = stats
    ? buildSevenDaySeries(stats.last7Days).reduce(function countClicks(total, item) {
        return total + Number(item.count || 0);
      }, 0)
    : 0;

  useEffect(
    function fetchStats() {
      async function loadStats() {
        setLoading(true);
        setError('');

        try {
          const response = await api.get(`/links/${id}/stats`);
          setStats(response.data);
        } catch (requestError) {
          if (requestError.response && requestError.response.status === 401) {
            localStorage.removeItem('redirectiq_token');
            navigate('/login', { replace: true });
            return;
          }

          setError(getApiErrorMessage(requestError));
        } finally {
          setLoading(false);
        }
      }

      loadStats();
    },
    [id, navigate]
  );

  return (
    <div className="page-shell">
      <Navbar />

      <main className="page-content">
        {loading ? (
          <section className="card loading-card">
            <p>Loading link analytics...</p>
          </section>
        ) : error ? (
          <section className="card loading-card">
            <p className="feedback feedback--error">{error}</p>
          </section>
        ) : stats ? (
          <>
            <section className="analytics-hero card">
              <div className="analytics-hero__copy">
                <div className="eyebrow">Link analytics</div>
                <h1>/{stats.link.slug}</h1>
                <p>
                  Inspect redirect activity, referrers, device mix, and geography for this short link
                  from a single live dashboard.
                </p>
                <div className="hero-actions">
                  <Link to="/dashboard" className="button button--ghost">
                    Back to Dashboard
                  </Link>
                  <a href={stats.link.short_url} target="_blank" rel="noreferrer" className="button button--secondary">
                    Open Short URL
                  </a>
                </div>
              </div>
              <aside className="analytics-hero__summary">
                <div className="analytics-summary-card analytics-summary-card--dark">
                  <span>Total clicks</span>
                  <strong>{stats.totalClicks}</strong>
                </div>
                <div className="analytics-summary-grid">
                  <div className="analytics-summary-card">
                    <span>Status</span>
                    <strong>{stats.link.active ? 'Active' : 'Paused'}</strong>
                  </div>
                  <div className="analytics-summary-card">
                    <span>Last 7 days</span>
                    <strong>{lastSevenDayClicks}</strong>
                  </div>
                  <div className="analytics-summary-card analytics-summary-card--wide">
                    <span>Short URL</span>
                    <strong>{stats.link.short_url}</strong>
                  </div>
                </div>
              </aside>
            </section>

            <section className="details-grid">
              <article className="card section-card">
                <div className="section-card__header">
                  <div>
                    <h2>Link Details</h2>
                    <p>Core properties for this redirect.</p>
                  </div>
                </div>

                <dl className="details-list">
                  <div>
                    <dt>Slug</dt>
                    <dd>{stats.link.slug}</dd>
                  </div>
                  <div>
                    <dt>Original URL</dt>
                    <dd>
                      <a href={stats.link.original_url} target="_blank" rel="noreferrer" className="table-link">
                        {stats.link.original_url}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Short URL</dt>
                    <dd>
                      <a href={stats.link.short_url} target="_blank" rel="noreferrer" className="table-link">
                        {stats.link.short_url}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Created At</dt>
                    <dd>{formatDate(stats.link.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Active</dt>
                    <dd>{stats.link.active ? 'Yes' : 'No'}</dd>
                  </div>
                </dl>
              </article>

              <article className="card section-card">
                <div className="section-card__header">
                  <div>
                    <h2>Clicks Over 7 Days</h2>
                    <p>Daily trend line for the last week.</p>
                  </div>
                </div>
                <ClickChart data={buildSevenDaySeries(stats.last7Days)} />
              </article>
            </section>

            <section className="details-grid details-grid--stacked">
              <article className="card section-card">
                <div className="section-card__header">
                  <div>
                    <h2>Top Referrers</h2>
                    <p>Where your traffic is coming from.</p>
                  </div>
                </div>
                <div className="mini-table">
                  <table className="data-table data-table--compact">
                    <thead>
                      <tr>
                        <th>Referrer</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.topReferrers || []).length ? (
                        stats.topReferrers.map(function renderReferrer(item) {
                          return (
                            <tr key={item.referrer}>
                              <td>{item.referrer}</td>
                              <td>{item.count}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="2">No referrer data yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="card section-card">
                <div className="section-card__header">
                  <div>
                    <h2>Device Breakdown</h2>
                    <p>Mobile versus desktop visits.</p>
                  </div>
                </div>
                <div className="chart-shell">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={buildDeviceData(stats.deviceBreakdown)}>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                      <XAxis
                        dataKey="device"
                        stroke="#6b7280"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        stroke="#6b7280"
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={function formatCount(value) {
                          return [value, 'Clicks'];
                        }}
                        contentStyle={{
                          background: '#fffdf8',
                          border: '1px solid rgba(15, 23, 42, 0.08)',
                          borderRadius: '14px',
                          boxShadow: '0 18px 38px rgba(15, 23, 42, 0.12)'
                        }}
                      />
                      <Bar dataKey="count" fill="#1d4ed8" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="card section-card">
                <div className="section-card__header">
                  <div>
                    <h2>Geo Breakdown</h2>
                    <p>Top countries generating clicks.</p>
                  </div>
                </div>
                <div className="mini-table">
                  <table className="data-table data-table--compact">
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.geoBreakdown || []).length ? (
                        stats.geoBreakdown.map(function renderCountry(item) {
                          return (
                            <tr key={item.country}>
                              <td>{item.country}</td>
                              <td>{item.count}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="2">No geo data yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default LinkStats;
