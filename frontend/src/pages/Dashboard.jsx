import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getApiErrorMessage } from '../api';
import Navbar from '../components/Navbar';
import StatsCard from '../components/StatsCard';
import CreateLinkForm from '../components/CreateLinkForm';
import LinkTable from '../components/LinkTable';

function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    totalLinks: 0,
    totalClicks: 0,
    activeLinks: 0,
    clicksLast7Days: 0
  });
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(function fetchDashboard() {
    let isActive = true;
    const showInitialLoader = refreshToken === 0;

    if (showInitialLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError('');

    async function loadDashboard() {
      try {
        const [summaryResponse, linksResponse] = await Promise.all([
          api.get('/stats/summary'),
          api.get('/links')
        ]);

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
          setRefreshing(false);
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

  const heroMetrics = [
    {
      label: 'Backends',
      value: '4 ready'
    },
    {
      label: 'Storage',
      value: 'SQLite shared'
    },
    {
      label: 'Benchmark',
      value: 'Traffic suite ready'
    }
  ];

  return (
    <div className="page-shell">
      <Navbar />

      <main className="page-content">
        <section className="dashboard-hero card">
          <div className="dashboard-hero__intro">
            <div className="eyebrow">Overview</div>
            <h1>Short links, live analytics, and benchmark control in one place.</h1>
            <p>
              Build redirects, track click activity, and compare the same workload across Node, Flask,
              Nginx, and Apache from one quieter dashboard.
            </p>
            <div className="hero-actions">
              <a href="#create-link" className="button">
                Create link
              </a>
              <Link to="/results" className="button button--secondary">
                Benchmark results
              </Link>
            </div>
            <div className="dashboard-hero__notes">
              <span>Redirects</span>
              <span>QR codes</span>
              <span>Password gates</span>
              <span>A/B splits</span>
            </div>
          </div>

          <aside className="dashboard-hero__rail">
            <div className="dashboard-pulse">
              <span className="dashboard-pulse__label">Workspace pulse</span>
              <strong>{loading ? '...' : summary.totalClicks}</strong>
              <p>Total redirect clicks captured across your full RedirectIQ workspace.</p>
            </div>

            <div className="dashboard-brief">
              {heroMetrics.map(function renderMetric(metric) {
                return (
                  <div key={metric.label} className="dashboard-brief__row">
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                );
              })}
            </div>

            {refreshing ? <div className="subtle-status subtle-status--panel">Refreshing dashboard...</div> : null}
          </aside>
        </section>

        {loading ? (
          <section className="card loading-card">
            <p>Loading your dashboard...</p>
          </section>
        ) : error ? (
          <section className="card loading-card">
            <p className="feedback feedback--error">{error}</p>
          </section>
        ) : (
          <>
            <section className="stats-grid stats-grid--dashboard">
              <StatsCard title="Total Links" value={summary.totalLinks} />
              <StatsCard title="Total Clicks" value={summary.totalClicks} />
              <StatsCard title="Active Links" value={summary.activeLinks} />
              <StatsCard title="Clicks Last 7 Days" value={summary.clicksLast7Days} />
            </section>

            <section className="dashboard-layout">
              <div className="dashboard-layout__main">
                <div id="create-link">
                  <CreateLinkForm
                    onCreated={function refreshAfterCreate() {
                      refreshDashboard();
                    }}
                  />
                </div>

                <LinkTable
                  links={links}
                  onRefresh={function refreshAfterAction() {
                    refreshDashboard();
                  }}
                />
              </div>

              <aside className="dashboard-layout__aside">
                <section className="benchmark-panel card">
                  <div>
                    <div className="eyebrow">Benchmark runway</div>
                    <h2>Run one suite, then compare all four stacks side by side.</h2>
                    <p>
                      The benchmark hits the same redirect route on every target so the winner is based
                      on real throughput and latency, not different app behavior.
                    </p>
                    <div className="benchmark-panel__checklist">
                      <span>Creates a test user and slug</span>
                      <span>Warms the redirect route first</span>
                      <span>Measures with `wrk` and `ab`</span>
                    </div>
                  </div>
                  <div className="benchmark-panel__aside">
                    <div className="framework-pill-row">
                      <span className="framework-pill">Node :3001</span>
                      <span className="framework-pill">Flask :3002</span>
                      <span className="framework-pill">Nginx :3003</span>
                      <span className="framework-pill">Apache :3004</span>
                    </div>
                    <div className="benchmark-panel__actions">
                      <code>bash benchmark/run_bench.sh</code>
                      <code>python benchmark/analyze.py</code>
                    </div>
                  </div>
                </section>
              </aside>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
