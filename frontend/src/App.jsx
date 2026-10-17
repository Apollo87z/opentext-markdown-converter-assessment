import { useMemo, useState } from 'react';
import { parseMarkdownMetadata } from './utils/markdown';

const DEFAULT_URL = 'https://my.opentext.com/support/article/1986936';

function formatMetadataValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ') : 'None';
  }

  if (value === null || value === undefined || value === '') {
    return 'Not available';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [markdownOutput, setMarkdownOutput] = useState('');
  const [metadata, setMetadata] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const metadataEntries = useMemo(
    () => Object.entries(metadata).filter(([key]) => key !== 'products'),
    [metadata],
  );

  const handleConvert = async (event) => {
    event.preventDefault();
    setError('');
    setCopied(false);
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/markdown',
        },
        body: JSON.stringify({ url }),
      });

      const text = await response.text();

      if (!response.ok) {
        let message = 'Conversion failed.';

        try {
          const payload = JSON.parse(text);
          message = payload.message || payload.error || message;
        } catch {
          message = text || message;
        }

        throw new Error(message);
      }

      const parsed = parseMarkdownMetadata(text);

      setMarkdownOutput(text);
      setMetadata(parsed.metadata);
    } catch (conversionError) {
      setMarkdownOutput('');
      setMetadata({});
      setError(conversionError.message || 'Something went wrong while converting the article.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!markdownOutput) {
      return;
    }

    try {
      await navigator.clipboard.writeText(markdownOutput);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access is unavailable in this browser.');
    }
  };

  const handleDownload = () => {
    if (!markdownOutput) {
      return;
    }

    const slug = (metadata.title || 'converted-article')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'converted-article';

    const blob = new Blob([markdownOutput], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);

    link.href = objectUrl;
    link.download = `${slug}.md`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <main className="app-shell">
      <section className="panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">OpenText</p>
            <h1>Markdown Converter</h1>
          </div>
          <div className="status-pill">Base UI</div>
        </header>

        <form className="convert-form" onSubmit={handleConvert}>
          <label className="field-label" htmlFor="article-url">
            Article URL
          </label>
          <div className="input-row">
            <input
              id="article-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://my.opentext.com/support/article/123456"
              autoComplete="off"
            />
            <button type="submit" className="primary-button" disabled={isLoading}>
              {isLoading ? 'Converting…' : 'Convert'}
            </button>
          </div>
        </form>

        {error ? (
          <div className="alert error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="content-grid">
          <div className="markdown-panel">
            <div className="panel-header">
              <h2>Markdown output</h2>
              <div className="actions">
                <button type="button" className="secondary-button" onClick={handleCopy} disabled={!markdownOutput}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="secondary-button" onClick={handleDownload} disabled={!markdownOutput}>
                  Download .md
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="empty-state loading-state">Preparing article…</div>
            ) : markdownOutput ? (
              <pre className="markdown-output">{markdownOutput}</pre>
            ) : (
              <div className="empty-state">
                Enter an OpenText article URL and convert it to Markdown.
              </div>
            )}
          </div>

          <aside className="meta-panel">
            <h2>Article metadata</h2>
            {metadataEntries.length ? (
              <ul className="metadata-list">
                {metadataEntries.map(([key, value]) => (
                  <li key={key}>
                    <span>{key}</span>
                    <strong>{formatMetadataValue(value)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state slim">No metadata available yet.</div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

export default App;
