
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { parseMarkdownMetadata } from './utils/markdown';
import './LivePreview.css';

const DEFAULT_URL = 'https://my.opentext.com/support/article/1986936';
const RETRY_INTERVAL = 10000;

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

function formatCacheAge(seconds) {
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function getCloudFrontAge(res) {
  const value = res.headers.get('age');
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const age = Number(value);
  return Number.isSafeInteger(age) ? age : null;
}

function getResponseMessage(text, fallback) {
  try {
    const data = JSON.parse(text);
    return data.error ?? data.message ?? fallback;
  } catch {
    return fallback;
  }
}

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  const paths = {
    document: <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8" />
    </>,
    shield: <>
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </>,
    copy: <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>,
    download: <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5M12 15V3" />
    </>,
    refresh: <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M5.6 9A7 7 0 0 1 17.2 6L20 12M4 12l2.8 6a7 7 0 0 0 11.6-3" />
    </>,
    eye: <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>,
    code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" />,
    lock: <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>,
    link: <>
      <path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7" />
    </>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    key: <>
      <circle cx="8" cy="15" r="5" />
      <path d="m11.5 11.5 8-8L22 6l-3 3 2 2-3 3-2-2-2 2" />
    </>,
  };

  return <svg {...common}>{paths[name] ?? paths.document}</svg>;
}

export default function LivePreview() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [markdown, setMarkdown] = useState('');
  const [convertedUrl, setConvertedUrl] = useState('');
  const [raw, setRaw] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [showKeySetup, setShowKeySetup] = useState(true);
  const [showExistingKeyInput, setShowExistingKeyInput] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [waitingForPropagation, setWaitingForPropagation] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(RETRY_INTERVAL / 1000);

  const [cacheAge, setCacheAge] = useState(null);
  const [cacheAgeReceivedAt, setCacheAgeReceivedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  const retryCancelledRef = useRef(false);
  const retryTimerRef = useRef(null);
  const retryWaitResolveRef = useRef(null);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      activeRequestRef.current += 1;

      if (retryTimerRef.current !== null) {
        window.clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      retryWaitResolveRef.current?.();
      retryWaitResolveRef.current = null;
    };
  }, []);

  const { metadata, body } = parseMarkdownMetadata(markdown);
  const metadataEntries = Object.entries(metadata);
  const attachmentCount = Array.isArray(metadata.attachments)
    ? metadata.attachments.length
    : 0;

  const displayedCacheAge =
    cacheAge !== null && cacheAgeReceivedAt !== null
      ? cacheAge + Math.floor((now - cacheAgeReceivedAt) / 1000)
      : null;

  const accessStatus = !apiKey
    ? 'Access required'
    : waitingForPropagation
      ? 'Connecting'
      : 'Key available';

  const updateCacheAge = (res) => {
    setCacheAge(getCloudFrontAge(res));
    setCacheAgeReceivedAt(Date.now());
  };

  const clearRetryWait = () => {
    if (retryTimerRef.current !== null) {
      window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (retryWaitResolveRef.current) {
      const resolve = retryWaitResolveRef.current;
      retryWaitResolveRef.current = null;
      resolve();
    }
  };

  const cancelPropagationWait = () => {
    retryCancelledRef.current = true;
    activeRequestRef.current += 1;
    clearRetryWait();
    setLoading(false);
    setWaitingForPropagation(false);
    setNotice('Automatic retry cancelled. Your API key is still available.');
  };

  const waitForRetry = () =>
    new Promise((resolve) => {
      let remaining = RETRY_INTERVAL / 1000;
      setRetryCountdown(remaining);
      retryWaitResolveRef.current = resolve;

      retryTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        setRetryCountdown(Math.max(remaining, 0));
        if (remaining <= 0) clearRetryWait();
      }, 1000);
    });

  const generateKey = async () => {
    setGeneratingKey(true);
    setError('');
    setNotice('');

    try {
      const res = await fetch('/api/v1/generate-key', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      const text = await res.text();

      if (!res.ok) {
        throw new Error(getResponseMessage(text, 'Failed to generate an API key.'));
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('The server returned an invalid response.');
      }

      if (!data.apiKey) throw new Error('The server did not return an API key.');

      setApiKey(data.apiKey);
      setShowKeySetup(false);
      setShowExistingKeyInput(false);
      setKeyInput('');
      setNotice('API key generated. Checking access when you convert an article.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate an API key.');
    } finally {
      setGeneratingKey(false);
    }
  };

  const useExistingKey = (event) => {
    event.preventDefault();
    const key = keyInput.trim();

    if (!key) {
      setError('Enter an API key first.');
      return;
    }

    retryCancelledRef.current = true;
    activeRequestRef.current += 1;
    clearRetryWait();

    setLoading(false);
    setWaitingForPropagation(false);
    setRetryAttempt(0);
    setApiKey(key);
    setKeyInput('');
    setShowKeySetup(false);
    setShowExistingKeyInput(false);
    setShowKey(false);
    setError('');
    setNotice('API key saved for this session. Try converting your article.');
  };

  const changeKey = () => {
    if (loading) cancelPropagationWait();
    setShowKeySetup(true);
    setShowExistingKeyInput(false);
    setKeyInput('');
    setError('');
    setNotice('');
  };

  const copyText = async (value, successMessage) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
      setError('');
    } catch {
      setError('Unable to copy. Check your browser clipboard permissions.');
    }
  };

  const fetchArticleForUrl = async (requestedUrl, forceRefresh = false) => {
    const articleUrl = requestedUrl.trim();

    if (!apiKey) {
      setError('Generate or enter an API key before converting.');
      setShowKeySetup(true);
      return;
    }

    if (!articleUrl) {
      setError('Enter an article URL before converting.');
      return;
    }

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    retryCancelledRef.current = false;

    clearRetryWait();
    setRetryAttempt(0);
    setRetryCountdown(RETRY_INTERVAL / 1000);
    setWaitingForPropagation(false);
    setLoading(true);
    setError('');
    setNotice('');

    const params = new URLSearchParams({ url: articleUrl });
    if (forceRefresh) params.set('forceRefresh', 'true');

    try {
      while (
        !retryCancelledRef.current &&
        activeRequestRef.current === requestId
      ) {
        let res;
        let text;

        try {
          res = await fetch(`/api/v1/articles?${params.toString()}`, {
            method: 'GET',
            headers: {
              'x-api-key': apiKey,
              Accept: 'text/markdown',
            },
          });
          text = await res.text();
        } catch {
          if (
            retryCancelledRef.current ||
            activeRequestRef.current !== requestId
          ) break;

          throw new Error('Network error. Check your connection and try again.');
        }

        if (
          retryCancelledRef.current ||
          activeRequestRef.current !== requestId
        ) break;

        if (res.ok) {
          setMarkdown(text);
          setConvertedUrl(articleUrl);
          updateCacheAge(res);
          setRaw(false);
          setWaitingForPropagation(false);
          setNotice(forceRefresh ? 'Article refreshed successfully.' : 'Article converted successfully.');
          return;
        }

        const message = getResponseMessage(
          text,
          forceRefresh ? 'Failed to refresh article.' : 'Failed to convert article.',
        );

        const isPropagationError =
          res.status === 401 &&
          message.toLowerCase().includes('invalid api key');

        if (isPropagationError) {
          setWaitingForPropagation(true);
          setNotice('Your API key has not been accepted yet. Retrying automatically.');
          await waitForRetry();

          if (
            retryCancelledRef.current ||
            activeRequestRef.current !== requestId
          ) break;

          setRetryAttempt((attempt) => attempt + 1);
          continue;
        }

        if (res.status === 401 || res.status === 403) {
          setApiKey('');
          setShowKeySetup(true);
          setShowExistingKeyInput(false);
          throw new Error('The API key was rejected. Enter a valid key and try again.');
        }

        if (res.status === 503) {
          throw new Error('CloudFront authentication is temporarily unavailable. Please try again.');
        }

        throw new Error(message);
      }
    } catch (err) {
      if (
        !retryCancelledRef.current &&
        activeRequestRef.current === requestId
      ) {
        setError(err instanceof Error ? err.message : 'Failed to convert article.');
      }
    } finally {
      if (activeRequestRef.current === requestId) {
        setLoading(false);
        setWaitingForPropagation(false);
        clearRetryWait();
      }
    }
  };

  const convert = async (event) => {
    event.preventDefault();
    await fetchArticleForUrl(url);
  };

  const refreshArticle = async () => {
    if (convertedUrl) await fetchArticleForUrl(convertedUrl, true);
  };

  const handleUrlChange = (event) => {
    setUrl(event.target.value);
    setError('');
    setNotice('');
  };

  const copyMarkdown = () => copyText(markdown, 'Markdown copied to clipboard.');

  const downloadMarkdown = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
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
      return value.map((item) =>
        typeof item === 'object' && item !== null
          ? JSON.stringify(item)
          : String(item),
      ).join(', ');
    }

    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const renderMetadataValue = (key, value) => {
    if (key === 'createdAt' || key === 'updatedAt') {
      return <strong className="metadata-date">{formatDate(value)}</strong>;
    }

    if (key === 'products') {
      if (!Array.isArray(value) || !value.length) {
        return <div className="metadata-empty">No products available.</div>;
      }

      return (
        <div className="metadata-subsection">
          {value.map((product, index) => {
            const id = product?.id ?? `product-${index + 1}`;
            const versions = Array.isArray(product?.versions) ? product.versions : [];

            return (
              <section className="metadata-group" key={id}>
                <div className="metadata-subheader">
                  <span>{product?.name ?? 'Unnamed product'}</span>
                  <small>{id}</small>
                </div>
                {versions.length ? (
                  <ul className="metadata-sublist">
                    {versions.map((version, versionIndex) => (
                      <li key={`${id}-version-${versionIndex}`}>
                        {formatMetadataValue(version)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="metadata-empty">No versions listed.</div>
                )}
              </section>
            );
          })}
        </div>
      );
    }

    if (key === 'attachments') {
      if (!Array.isArray(value) || !value.length) {
        return <div className="metadata-empty">No attachments available.</div>;
      }

      return (
        <div className="metadata-subsection">
          {value.map((attachment, index) => {
            const id = attachment?.id ?? `attachment-${index + 1}`;
            const attachmentUrl = attachment?.url ?? '';

            return (
              <section className="metadata-group" key={id}>
                <div className="metadata-subheader">
                  <span>{attachment?.name ?? 'Unnamed attachment'}</span>
                  <small>{id}</small>
                </div>
                <ul className="metadata-detail-list">
                  <li>
                    <span>Type</span>
                    <strong>{attachment?.contentType ?? 'Unknown type'}</strong>
                  </li>
                  <li>
                    <span>Size</span>
                    <strong>{attachment?.size != null ? `${attachment.size} bytes` : 'Unknown size'}</strong>
                  </li>
                  <li>
                    <span>External</span>
                    <strong>{attachment?.isExternalAttachment === true ? 'Yes' : 'No'}</strong>
                  </li>
                  {attachmentUrl && (
                    <li>
                      <span>Download</span>
                      <a className="metadata-link" href={attachmentUrl} target="_blank" rel="noopener noreferrer">
                        Open attachment ↗
                      </a>
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      );
    }

    if (Array.isArray(value)) {
      if (!value.length) return <div className="metadata-empty">No values.</div>;
      return (
        <ul className="metadata-sublist">
          {value.map((item, index) => (
            <li key={`${key}-${index}`}>{formatMetadataValue(item)}</li>
          ))}
        </ul>
      );
    }

    if (typeof value === 'object' && value !== null) {
      return <pre className="metadata-object">{JSON.stringify(value, null, 2)}</pre>;
    }

    return <strong className="metadata-value">{formatMetadataValue(value)}</strong>;
  };

  return (
    <main className="modern-page">
      <div className="modern-container">
        <header className="modern-header">
          <a className="brand-mark" href="/" aria-label="Markdown Converter home">
            <span className="brand-icon"><Icon name="document" size={22} /></span>
            <span className="brand-copy">
              <strong>MARKDOWN CONVERTER</strong>
             
            </span>
          </a>
          <div className="header-status">
            <span className={`status-dot ${apiKey ? 'online' : ''}`} />
            {accessStatus}
          </div>
        </header>

        <section className="modern-hero">
          <div className="hero-copy">
            <span className="hero-eyebrow">SUPPORT CONTENT TOOLKIT</span>
            <h1>From support page<br />to <span>Markdown.</span></h1>
            <p>Convert OpenText support articles into clean, portable Markdown. Preview content, inspect metadata, and export in seconds.</p>
          </div>
          <div className="hero-graphic" aria-hidden="true">
            <div className="graphic-orbit orbit-one" />
            <div className="graphic-orbit orbit-two" />
            <div className="graphic-document">
              <div className="graphic-doc-top"><span /><span /><span /></div>
              <div className="graphic-code-mark">MD</div>
              <div className="graphic-line line-long" />
              <div className="graphic-line line-medium" />
              <div className="graphic-line line-short" />
              <div className="graphic-convert">↗</div>
            </div>
          </div>
        </section>

        <section className="workspace-card">
          <div className="workspace-heading">
            <div>
              <span className="section-eyebrow">01 / CONFIGURATION</span>
              <h2>Your workspace</h2>
              <p>Set up access, then choose an article to convert.</p>
            </div>
            <div className="workspace-heading-icon"><Icon name="shield" size={23} /></div>
          </div>

          {apiKey && !showKeySetup ? (
            <div className="connected-key-card">
              <div className="connected-key-icon"><Icon name="check" size={21} /></div>
              <div className="connected-key-copy">
                <strong>API key added</strong>
                <span>{showKey ? apiKey : `••••••••${apiKey.slice(-6)}`}</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowKey((visible) => !visible)} aria-label={showKey ? 'Hide API key' : 'Show API key'} title={showKey ? 'Hide key' : 'Show key'}>
                <Icon name="eye" />
              </button>
              <button type="button" className="button button-secondary compact-button" onClick={() => copyText(apiKey, 'API key copied to clipboard.')}>
                <Icon name="copy" size={16} /> Copy
              </button>
              <button type="button" className="text-button" onClick={changeKey} disabled={loading || generatingKey}>Change key</button>
            </div>
          ) : (
            <div className="key-setup">
              <div className="key-setup-intro">
                <div className="key-setup-icon"><Icon name="lock" size={21} /></div>
                <div>
                  <h3>{apiKey ? 'Update your API key' : 'Connect with an API key'}</h3>
                  <p>{apiKey ? 'Enter a different key or keep your current one.' : 'Generate a key for this session or use one you already have.'}</p>
                </div>
              </div>

              <div className="key-setup-actions">
                <button type="button" className="button button-primary" onClick={generateKey} disabled={generatingKey || loading}>
                  {generatingKey ? <><span className="button-spinner" />Generating…</> : <><Icon name="key" size={17} />Generate API key</>}
                </button>
                {apiKey ? (
                  <button type="button" className="button button-secondary" onClick={() => { setShowKeySetup(false); setShowExistingKeyInput(false); }} disabled={loading || generatingKey}>
                    Keep current key
                  </button>
                ) : (
                  <button type="button" className="button button-secondary" onClick={() => setShowExistingKeyInput((visible) => !visible)} disabled={loading || generatingKey} aria-expanded={showExistingKeyInput}>
                    {showExistingKeyInput ? 'Cancel' : 'Enter existing key'}
                  </button>
                )}
              </div>

              {showExistingKeyInput && (
                <form className="existing-key-form" onSubmit={useExistingKey}>
                  <label htmlFor="existing-api-key">Existing API key</label>
                  <div className="field-with-action">
                    <input
                      id="existing-api-key"
                      type="password"
                      autoComplete="off"
                      value={keyInput}
                      onChange={(event) => setKeyInput(event.target.value)}
                      placeholder="Paste your API key"
                      autoFocus
                    />
                    <button type="submit" className="button button-secondary" disabled={!keyInput.trim() || loading || generatingKey}>
                      Use key <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="workspace-divider" />

          <form className="article-form" onSubmit={convert}>
            <label htmlFor="article-url">ARTICLE URL</label>
            <div className="article-url-field">
              <span className="article-url-icon"><Icon name="link" size={19} /></span>
              <input id="article-url" type="url" value={url} onChange={handleUrlChange} placeholder="https://example.com/support/article/123" required />
              <button type="submit" className="button button-primary convert-button" disabled={!apiKey || loading || generatingKey}>
                {loading ? <><span className="button-spinner" />{waitingForPropagation ? 'Connecting…' : 'Converting…'}</> : <>Convert article <span aria-hidden="true">→</span></>}
              </button>
            </div>
            <div className="article-form-footer">
              <span><Icon name="shield" size={14} />Your key is used for requests from this session.</span>
              <span>Supports Markdown export</span>
            </div>
          </form>
        </section>

        {error && (
          <div className="modern-feedback feedback-error" role="alert">
            <span className="feedback-symbol">!</span><span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" size={17} /></button>
          </div>
        )}

        {notice && !error && (
          <div className="modern-feedback feedback-success" role="status">
            <span className="feedback-symbol"><Icon name="check" size={16} /></span><span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><Icon name="close" size={17} /></button>
          </div>
        )}

        {loading && (
          <section className="progress-card" aria-live="polite">
            <div className="progress-icon"><span className="loading-spinner" /></div>
            <div className="progress-copy">
              <div className="progress-title">
                <strong>{waitingForPropagation ? 'Waiting for key propagation' : markdown ? 'Updating your article' : 'Converting your article'}</strong>
                {waitingForPropagation && <span className="progress-attempt">Attempt {retryAttempt + 1}</span>}
              </div>
              <p>{waitingForPropagation ? `Checking again in ${retryCountdown} second${retryCountdown === 1 ? '' : 's'}.` : 'Fetching the source and preparing your Markdown preview.'}</p>
              {waitingForPropagation && <div className="retry-track"><div className="retry-track-fill" style={{ width: `${((10 - retryCountdown) / 10) * 100}%` }} /></div>}
            </div>
            {waitingForPropagation && <button type="button" className="button button-secondary" onClick={cancelPropagationWait}>Cancel retry</button>}
          </section>
        )}

        {!markdown && !loading && (
          <section className="modern-empty-state">
            <div className="empty-art">
              <div className="empty-art-sheet">
                <div className="empty-art-badge">MD</div>
                <div className="empty-art-line" /><div className="empty-art-line" /><div className="empty-art-line short" />
              </div>
              <div className="empty-art-spark">✦</div>
            </div>
            <span className="section-eyebrow">READY WHEN YOU ARE</span>
            <h2>Your next article starts here.</h2>
            <p>Add your API key and convert a support article to see its Markdown preview and structured metadata.</p>
            <div className="empty-benefits">
              <span><Icon name="eye" size={16} /> Live preview</span>
              <span><Icon name="code" size={16} /> Raw Markdown</span>
              <span><Icon name="download" size={16} /> File export</span>
            </div>
          </section>
        )}

        {markdown && (
          <section className="results-section">
            <div className="results-section-heading">
              <div>
                <span className="section-eyebrow">02 / OUTPUT</span>
                <h2>Your converted article</h2>
                <p className="results-source-url">{convertedUrl}</p>
              </div>
              <button type="button" className="button button-secondary" onClick={refreshArticle} disabled={loading || generatingKey}>
                <Icon name="refresh" size={17} /> Refresh
              </button>
            </div>

            <div className="results-stats">
              <div className="stat-card"><span className="stat-label">STATUS</span><strong className="stat-success"><span className="status-dot online" />Markdown ready</strong></div>
              <div className="stat-card"><span className="stat-label">CONTENT SIZE</span><strong>{markdown.length.toLocaleString()} characters</strong></div>
              <div className="stat-card"><span className="stat-label">ARTICLE LAST REFRESHED</span><strong>{displayedCacheAge === null ? 'Just now' : formatCacheAge(displayedCacheAge)}</strong></div>
              <div className="stat-card"><span className="stat-label">ATTACHMENTS</span><strong>{attachmentCount}</strong></div>
            </div>

            <div className="results-layout">
              <section className="editor-card">
                <div className="editor-toolbar">
                  <div className="editor-file-label">
                    <span className="file-type-icon">MD</span>
                    <div><strong>article.md</strong><small>Markdown document</small></div>
                  </div>
                  <div className="editor-actions">
                    <button type="button" className={`editor-tab ${!raw ? 'active' : ''}`} onClick={() => setRaw(false)} aria-pressed={!raw}><Icon name="eye" size={16} />Preview</button>
                    <button type="button" className={`editor-tab ${raw ? 'active' : ''}`} onClick={() => setRaw(true)} aria-pressed={raw}><Icon name="code" size={16} />Source</button>
                  </div>
                </div>

                <div className="editor-content">
                  {raw ? <pre className="raw-markdown">{markdown}</pre> : (
                    <article className="rendered-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{body}</ReactMarkdown>
                    </article>
                  )}
                </div>

                <div className="editor-footer">
                  <span>{raw ? 'Raw source' : 'Rendered preview'}</span>
                  <div>
                    <button type="button" className="button button-secondary" onClick={copyMarkdown}><Icon name="copy" size={16} />Copy Markdown</button>
                    <button type="button" className="button button-primary" onClick={downloadMarkdown}><Icon name="download" size={16} />Download</button>
                  </div>
                </div>
              </section>

              <aside className="metadata-card">
                <div className="metadata-card-heading">
                  <div><span className="section-eyebrow">SOURCE DETAILS</span><h3>Metadata</h3></div>
                  <span className="metadata-total">{metadataEntries.length}</span>
                </div>

                {metadataEntries.length ? (
                  <ul className="metadata-list">
                    {metadataEntries.map(([key, value]) => (
                      <li key={key} className={`metadata-item ${key === 'products' || key === 'attachments' ? 'nested' : ''}`}>
                        <span className="metadata-key">{key}</span>
                        {renderMetadataValue(key, value)}
                      </li>
                    ))}
                  </ul>
                ) : <p className="metadata-empty metadata-no-data">No article metadata is available.</p>}
              </aside>
            </div>
          </section>
        )}

        <footer className="modern-footer">
          <span>MARKDOWN CONVERTER</span><span>Markdown conversion workspace</span>
        </footer>
      </div>
    </main>
  );
}
