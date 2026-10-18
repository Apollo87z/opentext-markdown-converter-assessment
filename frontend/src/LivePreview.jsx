
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseMarkdownMetadata } from './utils/markdown';

const DEFAULT_URL =
  'https://my.opentext.com/support/article/1986936';

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date);
}

function formatTimeAgo(value, now = Date.now()) {
  if (!value) return 'Unknown';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const seconds = Math.max(
    0,
    Math.floor((now - date.getTime()) / 1000),
  );

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export default function LivePreview() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [markdown, setMarkdown] = useState('');
  const [raw, setRaw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [notice, setNotice] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const { metadata, body } = parseMarkdownMetadata(markdown);

  const generateKey = async () => {
    setGeneratingKey(true);
    setError('');
    setNotice('');
    setApiKey('');
    setMarkdown('');
    setFetchedAt('');

    try {
      const res = await fetch('/api/v1/generate-key', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });

      const text = await res.text();
      let data = {};

      try {
        data = JSON.parse(text);
      } catch {
        // Handle non-JSON responses below.
      }

      if (!res.ok) {
        throw new Error(
          data.message ?? 'Failed to generate temporary access.',
        );
      }

      if (!data.apiKey) {
        throw new Error('The server did not return an API key.');
      }

      setApiKey(data.apiKey);
      setNotice('Temporary access is ready.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate temporary access.',
      );
    } finally {
      setGeneratingKey(false);
    }
  };

  const fetchArticle = async (forceRefresh = false) => {
    if (!apiKey) {
      setError('Generate temporary access before converting an article.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const params = new URLSearchParams({ url: url.trim() });

      if (forceRefresh) {
        params.set('forceRefresh', 'true');
      }

      const res = await fetch(`/api/v1/articles?${params.toString()}`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          Accept: 'text/markdown',
        },
      });

      const text = await res.text();

      if (!res.ok) {
        let message = 'Failed to convert article.';

        try {
          message = JSON.parse(text).message ?? message;
        } catch {
          // Keep the default message.
        }

        if (res.status === 401 || res.status === 403) {
          setApiKey('');
          message =
            'Temporary access expired or is invalid. Generate a new key.';
        }

        throw new Error(message);
      }

      // A successful response becomes the currently displayed article.
      setMarkdown(text);
      setRaw(false);
      setFetchedAt(res.headers.get('x-article-fetched-at') || '');
      setNotice(
        forceRefresh
          ? 'Article refreshed successfully.'
          : 'Article converted successfully.',
      );
    } catch (err) {
      // Keep the existing preview and timestamp if a refresh fails.
      if (!forceRefresh) {
        setMarkdown('');
        setFetchedAt('');
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to convert article.',
      );
    } finally {
      setLoading(false);
    }
  };

  const convert = async (event) => {
    event.preventDefault();
    await fetchArticle(false);
  };

  const refreshArticle = async () => {
    await fetchArticle(true);
  };

  const handleUrlChange = (event) => {
    const nextUrl = event.target.value;
    setUrl(nextUrl);

    // Do not show the previous article or its timestamp for a new URL.
    setMarkdown('');
    setFetchedAt('');
    setRaw(false);
    setError('');
    setNotice('');
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setNotice('Markdown copied to clipboard.');
      setError('');
    } catch {
      setError('Unable to copy. Check your browser clipboard permissions.');
    }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([markdown], {
      type: 'text/markdown;charset=utf-8',
    });

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = objectUrl;
    link.download = 'article.md';
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    setNotice('Download started: article.md');
    setError('');
  };

  const formatMetadataValue = (value) => {
    if (value === null || value === undefined || value === '') return '—';

    if (Array.isArray(value)) {
      if (!value.length) return '—';

      return value
        .map((item) =>
          typeof item === 'object' && item !== null
            ? JSON.stringify(item)
            : String(item),
        )
        .join(', ');
    }

    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  };

  const renderMetadataValue = (key, value) => {
    if (key === 'createdAt' || key === 'updatedAt') {
      return (
        <strong className="metadata-date">{formatDate(value)}</strong>
      );
    }

    if (key === 'products') {
      if (!Array.isArray(value) || !value.length) {
        return <div className="metadata-empty">No products available.</div>;
      }

      return (
        <div className="metadata-subsection">
          {value.map((product, index) => {
            const productId = product?.id ?? `product-${index + 1}`;
            const productName = product?.name ?? 'Unnamed product';
            const versions = Array.isArray(product?.versions)
              ? product.versions
              : [];

            return (
              <div
                key={`${key}-${productId}`}
                className="metadata-group"
              >
                <div className="metadata-subheader">
                  <span>{productName}</span>
                  <small>{productId}</small>
                </div>

                {versions.length ? (
                  <ul className="metadata-sublist">
                    {versions.map((version, versionIndex) => (
                      <li key={`${productId}-version-${versionIndex}`}>
                        {formatMetadataValue(version)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="metadata-empty">No versions listed.</div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (key === 'attachments') {
      if (!Array.isArray(value) || !value.length) {
        return (
          <div className="metadata-empty">No attachments available.</div>
        );
      }

      return (
        <div className="metadata-subsection">
          {value.map((attachment, index) => {
            const attachmentId =
              attachment?.id ?? `attachment-${index + 1}`;
            const attachmentName =
              attachment?.name ?? 'Unnamed attachment';
            const attachmentUrl = attachment?.url ?? '';
            const attachmentType =
              attachment?.contentType ?? 'Unknown type';
            const attachmentSize =
              attachment?.size !== null && attachment?.size !== undefined
                ? `${String(attachment.size)} bytes`
                : 'Unknown size';
            const isExternal = attachment?.isExternalAttachment === true;

            return (
              <div
                key={`${key}-${attachmentId}`}
                className="metadata-group"
              >
                <div className="metadata-subheader">
                  <span>{attachmentName}</span>
                  <small>{attachmentId}</small>
                </div>

                <ul className="metadata-detail-list">
                  <li>
                    <span>Type</span>
                    <strong>{attachmentType}</strong>
                  </li>
                  <li>
                    <span>Size</span>
                    <strong>{attachmentSize}</strong>
                  </li>
                  <li>
                    <span>External</span>
                    <strong>{isExternal ? 'Yes' : 'No'}</strong>
                  </li>
                  {attachmentUrl && (
                    <li>
                      <span>Download</span>
                      <strong>
                        <a
                          className="metadata-link"
                          href={attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open attachment ↗
                        </a>
                      </strong>
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      );
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        return <div className="metadata-empty">No values.</div>;
      }

      return (
        <ul className="metadata-sublist">
          {value.map((item, index) => (
            <li key={`${key}-${index}`}>{formatMetadataValue(item)}</li>
          ))}
        </ul>
      );
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <pre className="metadata-object">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    return (
      <strong className="metadata-value">
        {formatMetadataValue(value)}
      </strong>
    );
  };

  const metadataEntries = Object.entries(metadata);

  const attachmentCount = Array.isArray(metadata.attachments)
    ? metadata.attachments.length
    : 0;

  const accessStatus = apiKey
    ? 'Ready to convert'
    : generatingKey
      ? 'Generating access'
      : 'Access required';

  return (
    <main className="page-shell live-preview-page">
      <div className="container">
        <header className="preview-hero">
          <div>
            <div className="preview-eyebrow">
              <span className="preview-eyebrow-dot" />
              MARKDOWN CONVERTER
            </div>
            <h1>Live Preview</h1>
            <p className="preview-subtitle">
              Convert an OpenText support article into Markdown.
              Preview the content, inspect its metadata, or download
              the result as a file.
            </p>
          </div>

          <div
            className={`preview-hero-badge ${
              apiKey ? 'is-ready' : 'is-required'
            }`}
          >
            <span className="preview-hero-badge-dot" />
            {accessStatus}
          </div>
        </header>

        <section className="converter-panel">
          <div className="converter-panel-heading">
            <div className="converter-step">01</div>
            <div>
              <h2>Prepare your conversion</h2>
              <p>Generate temporary access, then enter an article URL.</p>
            </div>
          </div>

          <div className="access-row">
            <div className="access-indicator">
              <span
                className={`access-indicator-dot ${apiKey ? 'is-ready' : ''}`}
              />
              <div>
                <strong>
                  {apiKey ? 'Temporary access ready' : 'Access required'}
                </strong>
                <span>
                  {apiKey
                    ? 'You can convert an article.'
                    : 'Generate temporary access to continue.'}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="secondary-button access-button"
              onClick={generateKey}
              disabled={generatingKey || loading}
            >
              {generatingKey ? (
                <>
                  <span className="button-spinner" />
                  Generating…
                </>
              ) : apiKey ? (
                '↻ Generate new access'
              ) : (
                '+ Get temporary access'
              )}
            </button>
          </div>

          <form className="converter-form" onSubmit={convert}>
            <label className="field-label" htmlFor="article-url">
              Article URL
            </label>

            <div className="input-row preview-input-row">
              <div className="url-input-wrap">
                <span className="url-input-icon" aria-hidden="true">↗</span>
                <input
                  id="article-url"
                  className="text-input"
                  type="url"
                  value={url}
                  onChange={handleUrlChange}
                  placeholder="https://example.com/support/article/123"
                  aria-label="Article URL"
                  required
                />
              </div>

              <button
                type="submit"
                className="primary-button convert-button"
                disabled={!apiKey || loading || generatingKey}
              >
                {loading ? (
                  <>
                    <span className="button-spinner" />
                    Converting…
                  </>
                ) : (
                  <>Convert article <span aria-hidden="true"> →</span></>
                )}
              </button>
            </div>

            <p className="field-hint">
              Enter the full URL of the support article you want to convert.
            </p>
          </form>
        </section>

        {error && (
          <div className="preview-feedback preview-feedback-error" role="alert">
            <span className="feedback-icon" aria-hidden="true">!</span>
            <span>{error}</span>
            <button
              type="button"
              className="feedback-dismiss"
              onClick={() => setError('')}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {notice && !error && (
          <div
            className="preview-feedback preview-feedback-success"
            role="status"
          >
            <span className="feedback-icon" aria-hidden="true">✓</span>
            <span>{notice}</span>
            <button
              type="button"
              className="feedback-dismiss"
              onClick={() => setNotice('')}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {loading && (
          <section className="conversion-loading" aria-live="polite">
            <span className="loading-spinner" />
            <div>
              <strong>
                {markdown ? 'Refreshing your article' : 'Converting your article'}
              </strong>
              <p>
                {markdown
                  ? 'Fetching the latest source content…'
                  : 'Fetching the source content and generating Markdown…'}
              </p>
            </div>
          </section>
        )}

        {!markdown && !loading && (
          <section className="preview-empty-state">
            <div className="empty-state-icon" aria-hidden="true">
              <svg
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M13 5.5H28L38 15.5V40C38 41.4 36.9 42.5 35.5 42.5H13C11.6 42.5 10.5 41.4 10.5 40V8C10.5 6.6 11.6 5.5 13 5.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M27.5 6V16H37.5M17 24H31M17 30H31M17 36H26"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2>Your converted article will appear here</h2>
            <p>
              Generate temporary access and convert an article to see
              the Markdown preview, metadata, and download options.
            </p>
            <div className="empty-state-features">
              <span>✓ Rendered preview</span>
              <span>✓ Raw Markdown</span>
              <span>✓ Downloadable file</span>
            </div>
          </section>
        )}

        {markdown && (
          <section className="preview-results">
            <div className="results-heading">
              <div className="results-title">
                <div className="converter-step">02</div>
                <div>
                  <h2>Converted article</h2>
                  <p>Your Markdown is ready to inspect or export.</p>
                </div>
              </div>

              <div className="results-badges">
                <span className="result-badge">
                  <span className="result-badge-dot" />
                  Markdown ready
                </span>
                {attachmentCount > 0 && (
                  <span className="result-badge">
                    {attachmentCount} attachment{attachmentCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>

            <div className="access-row article-refresh-row">
              <div className="access-indicator">
                <span className="access-indicator-dot is-ready" />
                <div>
                  <strong>Last refreshed {formatTimeAgo(fetchedAt, now)}</strong>
                  <span>
                    {fetchedAt
                      ? formatDate(fetchedAt)
                      : 'The server did not provide a refresh timestamp.'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="secondary-button access-button"
                onClick={refreshArticle}
                disabled={!apiKey || loading || generatingKey}
                title="Fetch the latest article and invalidate its cached response"
              >
                {loading ? (
                  <>
                    <span className="button-spinner" />
                    Refreshing…
                  </>
                ) : (
                  '↻ Refresh article'
                )}
              </button>
            </div>

            <div className="preview-layout">
              <section className="markdown-card">
                <div className="card-toolbar preview-card-toolbar">
                  <div className="tab-group preview-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!raw}
                      className={!raw ? 'tab-button active' : 'tab-button'}
                      onClick={() => setRaw(false)}
                    >
                      <span aria-hidden="true">◉</span> Preview
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={raw}
                      className={raw ? 'tab-button active' : 'tab-button'}
                      onClick={() => setRaw(true)}
                    >
                      <span aria-hidden="true">{'</>'}</span> Markdown
                    </button>
                  </div>

                  <div className="action-group preview-actions">
                    <button
                      type="button"
                      className="secondary-button preview-action-button"
                      onClick={copyMarkdown}
                      title="Copy Markdown to clipboard"
                    >
                      <span aria-hidden="true">▣</span> Copy
                    </button>
                    <button
                      type="button"
                      className="primary-button preview-download-button"
                      onClick={downloadMarkdown}
                      title="Download article.md"
                    >
                      <span aria-hidden="true">↓</span> Download .md
                    </button>
                  </div>
                </div>

                <div className="preview-source-bar">
                  <span className="source-file-icon" aria-hidden="true">MD</span>
                  <span className="source-filename">article.md</span>
                  <span className="source-file-type">text/markdown</span>
                </div>

                <div className="card-body scroll-panel preview-card-body">
                  {raw ? (
                    <pre className="markdown-output scroll-content">{markdown}</pre>
                  ) : (
                    <article className="rendered-markdown scroll-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {body}
                      </ReactMarkdown>
                    </article>
                  )}
                </div>

                <footer className="preview-card-footer">
                  <span>{raw ? 'Raw Markdown source' : 'Rendered Markdown'}</span>
                  <span>{markdown.length.toLocaleString()} characters</span>
                </footer>
              </section>

              <aside className="meta-panel preview-meta-panel">
                <div className="metadata-heading">
                  <div>
                    <span className="metadata-eyebrow">ARTICLE DETAILS</span>
                    <h2>Metadata</h2>
                  </div>
                  <span className="metadata-count">{metadataEntries.length}</span>
                </div>

                {metadataEntries.length ? (
                  <ul className="metadata-list">
                    {metadataEntries.map(([key, value]) => (
                      <li
                        key={key}
                        className={
                          key === 'products' || key === 'attachments'
                            ? 'metadata-item nested'
                            : 'metadata-item'
                        }
                      >
                        <span className="metadata-key">{key}</span>
                        {renderMetadataValue(key, value)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="metadata-empty">No article metadata is available.</p>
                )}
              </aside>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
