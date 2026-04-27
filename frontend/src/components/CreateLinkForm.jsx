import { useEffect, useRef, useState } from 'react';
import api, { getApiErrorMessage } from '../api';

const initialForm = {
  original_url: '',
  custom_slug: '',
  expires_at: '',
  password: '',
  split_url_b: '',
  split_ratio: '0.5'
};

function isValidCustomSlug(value) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function CreateLinkForm({ onCreated }) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdLink, setCreatedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const intentionalFieldEdits = useRef({
    custom_slug: false,
    password: false
  });

  useEffect(
    function cleanupQrPreview() {
      return function revokeQrPreviewOnUnmount() {
        if (qrPreviewUrl) {
          window.URL.revokeObjectURL(qrPreviewUrl);
        }
      };
    },
    [qrPreviewUrl]
  );

  function replaceQrPreviewUrl(nextUrl) {
    setQrPreviewUrl(function updateQrPreviewUrl(currentUrl) {
      if (currentUrl) {
        window.URL.revokeObjectURL(currentUrl);
      }

      return nextUrl;
    });
  }

  function handleChange(event) {
    const fieldName = event.target.dataset.field || event.target.name;
    const { value } = event.target;
    setForm(function updateForm(current) {
      return {
        ...current,
        [fieldName]: value
      };
    });
  }

  function markFieldIntent(event) {
    const fieldName = event.target.dataset.field;

    if (!fieldName) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(intentionalFieldEdits.current, fieldName)) {
      intentionalFieldEdits.current[fieldName] = true;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setCopied(false);
    replaceQrPreviewUrl('');

    try {
      const trimmedCustomSlug = form.custom_slug.trim();
      const trimmedPassword = form.password.trim();
      const shouldIgnoreAutofilledCustomSlug =
        trimmedCustomSlug.includes('@') && !intentionalFieldEdits.current.custom_slug;
      const shouldIgnoreAutofilledPassword =
        shouldIgnoreAutofilledCustomSlug &&
        trimmedPassword &&
        !intentionalFieldEdits.current.password;
      const effectiveCustomSlug = shouldIgnoreAutofilledCustomSlug ? '' : trimmedCustomSlug;

      if (shouldIgnoreAutofilledCustomSlug || shouldIgnoreAutofilledPassword) {
        setForm(function clearUnexpectedAutofill(current) {
          return {
            ...current,
            custom_slug: shouldIgnoreAutofilledCustomSlug ? '' : current.custom_slug,
            password: shouldIgnoreAutofilledPassword ? '' : current.password
          };
        });
      }

      if (effectiveCustomSlug && !isValidCustomSlug(effectiveCustomSlug)) {
        const looksLikeAutofill = effectiveCustomSlug.includes('@');

        setError(
          looksLikeAutofill
            ? 'Your browser autofilled the Custom Slug field with an email address. Clear Custom Slug or enter only letters, numbers, underscores, and hyphens.'
            : 'Custom Slug may only contain letters, numbers, underscores, and hyphens.'
        );
        return;
      }

      const payload = {
        original_url: form.original_url.trim()
      };

      if (effectiveCustomSlug) {
        payload.custom_slug = effectiveCustomSlug;
      }

      if (form.expires_at) {
        payload.expires_at = new Date(form.expires_at).toISOString();
      }

      if (trimmedPassword && !shouldIgnoreAutofilledPassword) {
        payload.password = form.password;
      }

      if (form.split_url_b.trim()) {
        payload.split_url_b = form.split_url_b.trim();
        payload.split_ratio = form.split_ratio === '' ? 0.5 : Number(form.split_ratio);
      }

      const response = await api.post('/links', payload);
      setCreatedLink(response.data);
      setForm(initialForm);
      intentionalFieldEdits.current = {
        custom_slug: false,
        password: false
      };

      if (onCreated) {
        await onCreated();
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyShortUrl() {
    if (!createdLink) {
      return;
    }

    await navigator.clipboard.writeText(createdLink.short_url);
    setCopied(true);
  }

  async function handleOpenQr() {
    if (!createdLink) {
      return;
    }

    setQrLoading(true);
    setError('');

    try {
      const response = await api.get(`/links/${createdLink.id}/qr`, {
        responseType: 'blob'
      });
      const objectUrl = window.URL.createObjectURL(response.data);
      replaceQrPreviewUrl(objectUrl);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <section className="card section-card">
      <div className="section-card__header">
        <div>
          <h2>Create a Short Link</h2>
          <p>Launch a new redirect, then optionally add expiry, password protection, or split testing.</p>
        </div>
        <div className="section-chip">Core + advanced</div>
      </div>

      <form
        className="form-grid"
        onSubmit={handleSubmit}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
      >
        <div className="autofill-trap" aria-hidden="true">
          <input
            type="text"
            name="username"
            tabIndex="-1"
            autoComplete="username"
          />
          <input
            type="password"
            name="current-password"
            tabIndex="-1"
            autoComplete="current-password"
          />
        </div>

        <label className="field">
          <span>Original URL</span>
          <input
            type="url"
            name="link_original_url"
            data-field="original_url"
            value={form.original_url}
            onChange={handleChange}
            placeholder="https://example.com"
            autoComplete="url"
            required
          />
        </label>

        <label className="field">
          <span>Custom Slug</span>
          <input
            type="text"
            name="link_custom_slug"
            data-field="custom_slug"
            value={form.custom_slug}
            onChange={handleChange}
            onFocus={markFieldIntent}
            placeholder="campaign-spring"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
            data-lpignore="true"
            data-1p-ignore="true"
          />
        </label>

        <label className="field">
          <span>Expiry Date</span>
          <input
            type="datetime-local"
            name="link_expires_at"
            data-field="expires_at"
            value={form.expires_at}
            onChange={handleChange}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            name="link_password"
            data-field="password"
            value={form.password}
            onChange={handleChange}
            onFocus={markFieldIntent}
            placeholder="Optional protection"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
          />
        </label>

        <label className="field">
          <span>Split URL B</span>
          <input
            type="url"
            name="link_split_url_b"
            data-field="split_url_b"
            value={form.split_url_b}
            onChange={handleChange}
            placeholder="https://variant-b.com"
            autoComplete="url"
          />
        </label>

        <label className="field">
          <span>Split Ratio</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            name="link_split_ratio"
            data-field="split_ratio"
            value={form.split_ratio}
            onChange={handleChange}
            placeholder="0.5"
          />
        </label>

        <div className="form-actions">
          <button type="submit" className="button" disabled={loading}>
            {loading ? 'Creating...' : 'Create Link'}
          </button>
        </div>
      </form>

      {error ? <p className="feedback feedback--error">{error}</p> : null}

      {createdLink ? (
        <div className="success-panel">
          <div>
            <div className="success-panel__label">Short URL ready</div>
            <div className="success-panel__value">{createdLink.short_url}</div>
          </div>
          <div className="success-panel__actions">
            <button type="button" className="button button--secondary" onClick={handleCopyShortUrl}>
              {copied ? 'Copied' : 'Copy Link'}
            </button>
            <button type="button" className="button button--ghost" onClick={handleOpenQr} disabled={qrLoading}>
              {qrLoading ? 'Generating QR...' : 'Generate QR Code'}
            </button>
          </div>
        </div>
      ) : null}

      {qrPreviewUrl ? (
        <div className="qr-preview card">
          <div className="qr-preview__content">
            <div>
              <div className="success-panel__label">QR code ready</div>
              <div className="subtle-status">
                Scan it directly here, or open the image in a new tab.
              </div>
            </div>
            <div className="qr-preview__actions">
              <a href={qrPreviewUrl} target="_blank" rel="noreferrer" className="button button--secondary">
                Open Image
              </a>
            </div>
          </div>
          <div className="qr-preview__image-shell">
            <img src={qrPreviewUrl} alt="QR code for the created short link" className="qr-preview__image" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default CreateLinkForm;
