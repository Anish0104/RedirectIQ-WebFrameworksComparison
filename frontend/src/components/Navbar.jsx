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
            <svg className="brand-logo-svg" width="46" height="46" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="12" fill="#111" />
              <path d="M12 26 C 12 16, 20 16, 20 16 L 28 16" stroke="url(#paint0_linear)" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M24 12 L 29 16 L 24 20" stroke="#FF4D00" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="26" r="3" fill="#FFF" />
              <defs>
                <linearGradient id="paint0_linear" x1="12" y1="26" x2="28" y2="16" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FFF" />
                  <stop offset="1" stopColor="#FF4D00" />
                </linearGradient>
              </defs>
            </svg>
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
