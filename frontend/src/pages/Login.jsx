import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api, { getApiErrorMessage } from '../api';

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-panel__intro card auth-story">
          <div className="eyebrow">Redirect intelligence</div>
          <h1>Build, guard, and benchmark every short link from one calmer workspace.</h1>
          <p>
            Create redirects, lock sensitive destinations, spin up split tests, and watch clicks land
            in real time.
          </p>
          <div className="auth-story__list">
            <div className="auth-story__item">
              <strong>4 frameworks</strong>
              <span>Same RedirectIQ product, benchmarked across Node, Flask, Nginx, and Apache.</span>
            </div>
            <div className="auth-story__item">
              <strong>1 shared schema</strong>
              <span>Every backend uses the same SQLite shape so the comparison stays honest.</span>
            </div>
            <div className="auth-story__item">
              <strong>Live analytics</strong>
              <span>Track clicks, inspect traffic sources, and compare throughput from one place.</span>
            </div>
          </div>
        </div>

        <section className="auth-card card">
          <div className="auth-card__header">
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p>{mode === 'login' ? 'Sign in to manage your links.' : 'Register to start shortening URLs.'}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="anish@test.com"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="password123"
                required
              />
            </label>

            {error ? <p className="feedback feedback--error">{error}</p> : null}

            <button type="submit" className="button button--full" disabled={loading}>
              {loading ? 'Working...' : mode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>

          <button
            type="button"
            className="auth-switch"
            onClick={function toggleMode() {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
          </button>
        </section>
      </div>
    </main>
  );
}

export default Login;
