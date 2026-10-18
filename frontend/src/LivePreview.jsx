import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseMarkdownMetadata } from './utils/markdown';

export default function LivePreview() {
  const [url, setUrl] = useState('https://my.opentext.com/support/article/1986936');
  const [markdown, setMarkdown] = useState('');
  const [raw, setRaw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { metadata, body } = parseMarkdownMetadata(markdown);

  const convert = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v1/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/markdown' },
        body: JSON.stringify({ url }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(JSON.parse(text).message);
      setMarkdown(text);
    } catch (err) {
      setMarkdown('');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    link.download = 'article.md';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <main className="page-shell">
      <div className="container">
        <section className="page-header">
          <h1>Live Preview</h1>
        </section>

        <form className="converter-form" onSubmit={convert}>
          <div className="input-row">
            <input
              className="text-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <button className="primary-button" disabled={loading}>
              {loading ? 'Converting…' : 'Convert'}
            </button>
          </div>
        </form>

        {error && <p className="error-message">{error}</p>}

        {markdown && (
          <div className="preview-layout">
            <div className="markdown-card">
              <div className="card-toolbar">
                <div className="tab-group">
                  <button
                    type="button"
                    className={raw ? 'tab-button' : 'tab-button active'}
                    onClick={() => setRaw(false)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={raw ? 'tab-button active' : 'tab-button'}
                    onClick={() => setRaw(true)}
                  >
                    Markdown
                  </button>
                </div>
                <div className="action-group">
                  <button type="button" className="secondary-button" onClick={() => navigator.clipboard.writeText(markdown)}>
                    Copy
                  </button>
                  <button type="button" className="secondary-button" onClick={download}>
                    Download .md
                  </button>
                </div>
              </div>

              <div className="card-body scroll-panel">
                {raw ? (
                  <pre className="markdown-output scroll-content">{markdown}</pre>
                ) : (
                  <article className="rendered-markdown scroll-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                  </article>
                )}
              </div>
            </div>

            <aside className="meta-panel">
              <h2>Article metadata</h2>
              <ul className="metadata-list">
                {Object.entries(metadata)
                  .filter(([key]) => key !== 'products')
                  .map(([key, value]) => (
                    <li key={key}>
                      <span>{key}</span>
                      <strong>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</strong>
                    </li>
                  ))}
              </ul>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
