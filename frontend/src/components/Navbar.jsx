import { Link, useLocation, useNavigate } from 'react-router-dom';

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = [
    { to: '/dashboard', label: 'Dashboard', order: '01' },
    { to: '/results', label: 'Benchmark Results', order: '02' }
  ];

  const currentSection =
    navItems.find(function findNavItem(item) {
      return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    }) || navItems[0];

  const topbarLabel = location.pathname.startsWith('/links/') ? 'Link analytics' : currentSection.label;
  const topbarCaption = location.pathname.startsWith('/links/')
    ? 'Inspect one short link, its traffic mix, and its redirect performance.'
    : location.pathname.startsWith('/results')
      ? 'Compare throughput, latency, and stability across all four targets.'
      : 'Create short links, monitor activity, and keep the benchmark workflow close.';

  function handleLogout() {
    localStorage.removeItem('redirectiq_token');
    navigate('/login', { replace: true });
  }

  return (
    <>
      <aside className="app-sidebar card">
        <div className="app-sidebar__inner">
          <Link to="/dashboard" className="app-sidebar__brand">
            <span className="app-sidebar__mark">RI</span>
            <div>
              <div className="app-sidebar__title">RedirectIQ</div>
              <div className="app-sidebar__subtitle">URL control workspace</div>
            </div>
          </Link>

          <div className="app-sidebar__section-label">Workspace</div>

          <nav className="app-sidebar__nav" aria-label="Primary">
            {navItems.map(function renderNavItem(item) {
              const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`app-sidebar__link${isActive ? ' app-sidebar__link--active' : ''}`}
                >
                  <span className="app-sidebar__link-order">{item.order}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="app-sidebar__stack">
            <div className="app-sidebar__info card">
              <div className="eyebrow">Workspace</div>
              <h3>One product. Four backend targets.</h3>
              <p>Manage links, inspect traffic, and benchmark the same redirect path without leaving the app.</p>
            </div>

            <button type="button" className="button app-sidebar__logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </aside>

      <header className="topbar card">
        <div className="topbar__page">
          <div className="topbar__eyebrow">RedirectIQ workspace</div>
          <div className="topbar__title">{topbarLabel}</div>
          <div className="topbar__caption">{topbarCaption}</div>
        </div>

        <div className="topbar__meta">
          <div className="topbar__chip topbar__chip--status">4 targets ready</div>
          <div className="topbar__chip">SQLite shared</div>
          <div className="topbar__avatar">RI</div>
        </div>
      </header>
    </>
  );
}

export default Navbar;
