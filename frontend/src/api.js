import axios from 'axios';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

function buildConnectionHint() {
  if (!import.meta.env.DEV) {
    return 'Could not reach the API. Make sure the backend is running and reachable.';
  }

  if (import.meta.env.VITE_API_BASE_URL) {
    return `Could not reach the API at ${import.meta.env.VITE_API_BASE_URL}. Make sure that backend is running.`;
  }

  return 'Could not reach the API at http://localhost:3001. Start the Node backend with `cd node-express && npm start`, or set `VITE_API_BASE_URL` before `npm run dev` if you want Flask, Nginx, or Apache.';
}

const api = axios.create({
  baseURL: apiBaseUrl
});

api.interceptors.request.use(
  function attachToken(config) {
    const token = localStorage.getItem('redirectiq_token');

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  function handleRequestError(error) {
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error) {
  if (error.response && error.response.data) {
    return (
      error.response.data.error ||
      error.response.data.message ||
      'Request failed'
    );
  }

  if (error.request) {
    return buildConnectionHint();
  }

  return error.message || 'Something went wrong';
}

export function buildShortUrl(slug) {
  const resolvedBaseUrl = new URL(api.defaults.baseURL || window.location.origin, window.location.origin)
    .toString()
    .replace(/\/$/, '');
  const normalizedSlug = String(slug || '').replace(/^\/+/, '');

  return `${resolvedBaseUrl}/${normalizedSlug}`;
}

export default api;
