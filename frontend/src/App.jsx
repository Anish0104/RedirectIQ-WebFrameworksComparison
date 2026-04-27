import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LinkStats from './pages/LinkStats';
import BenchmarkResults from './pages/BenchmarkResults';

function hasToken() {
  return Boolean(localStorage.getItem('redirectiq_token'));
}

function RootRedirect() {
  return <Navigate to={hasToken() ? '/dashboard' : '/login'} replace />;
}

function ProtectedRoute({ children }) {
  return hasToken() ? children : <Navigate to="/login" replace />;
}

function App() {
  useEffect(function refreshRestoredPages() {
    function handlePageShow(event) {
      if (event.persisted) {
        window.location.reload();
      }
    }

    window.addEventListener('pageshow', handlePageShow);

    return function cleanupPageShowListener() {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/links/:id/stats"
          element={
            <ProtectedRoute>
              <LinkStats />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results"
          element={
            <ProtectedRoute>
              <BenchmarkResults />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
