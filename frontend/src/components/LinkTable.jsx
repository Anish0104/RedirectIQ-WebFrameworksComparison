import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { buildShortUrl, getApiErrorMessage } from '../api';

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

function LinkTable({ links, onRefresh }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [copiedSlug, setCopiedSlug] = useState('');

  async function handleCopy(slug) {
    const link = links.find(function findLinkBySlug(item) {
      return item.slug === slug;
    });
    const shortUrl = (link && link.short_url) || buildShortUrl(slug);

    await navigator.clipboard.writeText(shortUrl);
    setCopiedSlug(slug);
    window.setTimeout(function clearCopied() {
      setCopiedSlug('');
    }, 1800);
  }

  async function handleToggle(link) {
    setBusyId(link.id);
    setError('');

    try {
      await api.put(`/links/${link.id}`, {
        active: link.active ? 0 : 1
      });

      await onRefresh();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(link) {
    const shouldDelete = window.confirm(`Delete ${link.slug}?`);

    if (!shouldDelete) {
      return;
    }

    setBusyId(link.id);
    setError('');

    try {
      await api.delete(`/links/${link.id}`);
      await onRefresh();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card section-card">
      <div className="section-card__header">
        <div>
          <h2>Your Links</h2>
          <p>Manage slugs, copy launch URLs, and jump into link-level analytics.</p>
        </div>
        <div className="section-chip">{links.length} saved</div>
      </div>

      {error ? <p className="feedback feedback--error">{error}</p> : null}

      {links.length === 0 ? (
        <div className="empty-state">
          <h3>No links yet</h3>
          <p>Create your first redirect above to start collecting traffic and benchmark data.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Original URL</th>
                <th>Created At</th>
                <th>Active</th>
                <th>Clicks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map(function renderLink(link) {
                const isBusy = busyId === link.id;

                return (
                  <tr key={link.id}>
                    <td>
                      <div className="slug-cell">
                        <div className="slug-cell__value">{link.slug}</div>
                        <div className="slug-cell__meta">{link.short_url || buildShortUrl(link.slug)}</div>
                      </div>
                    </td>
                    <td>
                      <a href={link.original_url} target="_blank" rel="noreferrer" className="table-link">
                        {link.original_url}
                      </a>
                    </td>
                    <td>{formatDate(link.created_at)}</td>
                    <td>
                      <span className={`status-badge ${link.active ? 'status-badge--live' : 'status-badge--muted'}`}>
                        {link.active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td>
                      <span className="metric-badge">{link.totalClicks ?? 0}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link to={`/links/${link.id}/stats`} className="button button--ghost button--small">
                          View Stats
                        </Link>
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          onClick={function onCopy() {
                            handleCopy(link.slug);
                          }}
                        >
                          {copiedSlug === link.slug ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={function onToggle() {
                            handleToggle(link);
                          }}
                          disabled={isBusy}
                        >
                          {isBusy ? 'Saving...' : link.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="button button--danger button--small"
                          onClick={function onDelete() {
                            handleDelete(link);
                          }}
                          disabled={isBusy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default LinkTable;
