import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api, { getApiErrorMessage } from '../api';
import './Login.css';

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isLoginMode = mode === 'login';

  if (localStorage.getItem('redirectiq_token')) {
    return <Navigate to="/dashboard" replace />;
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm(function updateForm(current) {
      return {
        ...current,
        [name]: value
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    let existingAccount = false;

    try {
      if (mode === 'register') {
        try {
          await api.post('/auth/register', form);
        } catch (registerError) {
          if (registerError.response && registerError.response.status === 409) {
            existingAccount = true;
          } else {
            throw registerError;
          }
        }
      }

      const loginResponse = await api.post('/auth/login', form);
      localStorage.setItem('redirectiq_token', loginResponse.data.token);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      if (existingAccount) {
        setMode('login');

        if (requestError.response && requestError.response.status === 401) {
          setError(
            'That email is already registered. Use the existing password to log in, or choose a different email to create a new account.'
          );
          return;
        }
      }

      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="split-layout">
      {/* Left Side: 60% Width */}
      <section className="split-left">
        <div className="brand-minimal">
          <svg className="brand-logo-svg" width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <span className="brand-text">RedirectIQ</span>
        </div>
        
        {/* Enriched 3D Glass Sculpture Representation */}
        <div className="sculpture-container">
          <div className="glass-sculpture base-layer"></div>
          <div className="glass-sculpture mid-layer"></div>
          <div className="glass-sculpture top-layer"></div>
          
          {/* Decorative glowing pathways */}
          <div className="glow-path glow-1"></div>
          <div className="glow-path glow-2"></div>
        </div>

        <div className="hero-copy">
          <h2>Production URL Routing</h2>
          <p>Benchmark, manage, and analyze your links with a high-fidelity workspace designed for performance testing.</p>
        </div>
      </section>

      {/* Right Side: 40% Width */}
      <section className="split-right">
        <div className="login-card">
          <div className="login-card-header">
            <h1>{isLoginMode ? 'Welcome to RedirectIQ' : 'Welcome to RedirectIQ'}</h1>
          </div>
          

          {error && <div className="auth-error">{error}</div>}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                className="minimal-input"
                placeholder="Enter your email"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                name="password"
                className="minimal-input"
                placeholder="Enter your password"
                value={form.password}
                onChange={handleChange}
                autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                required
              />
            </div>

            <button type="submit" className="btn-coral" disabled={loading}>
              {loading ? 'Working...' : isLoginMode ? 'Log In' : 'Register'}
            </button>
          </form>

          {isLoginMode && (
            <button type="button" className="forgot-password">
              Forgot password?
            </button>
          )}

          <div className="toggle-mode">
            {isLoginMode ? "Don't have an account?" : "Already have an account?"}
            <button
              type="button"
              onClick={() => {
                setMode(isLoginMode ? 'register' : 'login');
                setError('');
              }}
            >
              {isLoginMode ? 'Sign up' : 'Log In'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Login;
