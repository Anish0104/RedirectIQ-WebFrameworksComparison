import { Link, useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 18h16" />
        <path d="M7 18V11" />
        <path d="M12 18V6" />
        <path d="M17 18v-9" />
      </svg>
    )
  }
];

export default function Sidebar({ totalLinks = 0, loading = false, onCreateRedirect = () => {} }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar__top">
        <Link to="/dashboard" className="dashboard-brand">
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
            <div className="dashboard-brand__title">RedirectIQ</div>
            <div className="dashboard-brand__subtitle">Link management system</div>
          </div>
        </Link>

        {location.pathname !== '/results' && (
          <button type="button" className="dashboard-sidebar__primary" onClick={onCreateRedirect}>
            Create Redirect +
          </button>
        )}

        <nav className="dashboard-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`dashboard-nav__item${isActive ? ' is-active' : ''}`}
              >
                <span className="dashboard-nav__icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="dashboard-sidebar__footer">
        <div className="dashboard-sidebar__status">
          <span className="dashboard-sidebar__status-dot" />
          <div>
            <strong>{loading ? 'Syncing...' : 'Workspace ready'}</strong>
            <span>{totalLinks ? `${totalLinks} redirects tracked` : 'System online'}</span>
          </div>
        </div>
        <button
          type="button"
          className="dashboard-sidebar__logout"
          onClick={() => {
            localStorage.removeItem('redirectiq_token');
            navigate('/login', { replace: true });
          }}
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
