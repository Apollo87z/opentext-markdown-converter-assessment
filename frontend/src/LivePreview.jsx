import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseMarkdownMetadata } from './utils/markdown';

export default function LivePreview() {
  const [url, setUrl] = useState(
    'https://my.opentext.com/support/article/1986936'
  );
  const [markdown, setMarkdown] = useState('');
  const [raw, setRaw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);

  const { metadata, body } = parseMarkdownMetadata(markdown);

  const generateKey = async () => {
    setGeneratingKey(true);
    setError('');
    setApiKey('');
    setMarkdown('');

    try {
      const res = await fetch('/api/v1/generate-key', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      });

      const text = await res.text();

      if (!res.ok) {
        let message = 'Failed to generate temporary access.';
        try {
          message = JSON.parse(text).message ?? message;
        } catch {
          // Keep the default message.
        }
        throw new Error(message);
      }

      const data = JSON.parse(text);

      if (!data.apiKey) {
        throw new Error('The server did not return an API key.');
      }

      setApiKey(data.apiKey);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate temporary access.'
      );
    } finally {
      setGeneratingKey(false);
    }
  };

  const convert = async (event) => {
    event.preventDefault();

    if (!apiKey) {
      setError('Generate temporary access before converting an article.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ url });

      const res = await fetch(
        `/api/v1/articles?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            Accept: 'text/markdown',
          },
        }
      );

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
          message = 'Temporary access expired or is invalid. Generate a new key.';
        }

        throw new Error(message);
      }

      setMarkdown(text);
    } catch (err) {
      setMarkdown('');
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to convert article.'
      );
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([markdown], { type: 'text/markdown' })
    );
    link.download = 'article.md';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const formatMetadataValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    if (Array.isArray(value)) {
      if (!value.length) return '—';

      return value
        .map((item) =>
          typeof item === 'object' && item !== null
            ? JSON.stringify(item)
            : String(item)
        )
        .join(', ');
    }

    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  };

  const renderMetadataValue = (key, value) => {
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
              <div key={`${key}-${productId}`} className="metadata-group">
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
        return <div className="metadata-empty">No attachments available.</div>;
      }

      return (
        <div className="metadata-subsection">
          {value.map((attachment, index) => {
            const attachmentId = attachment?.id ?? `attachment-${index + 1}`;
            const attachmentName = attachment?.name ?? 'Unnamed attachment';
            const attachmentUrl = attachment?.url ?? '';
            const attachmentType = attachment?.contentType ?? 'Unknown type';
            const attachmentSize =
              attachment?.size !== null && attachment?.size !== undefined
                ? `${String(attachment.size)} bytes`
                : 'Unknown size';
            const isExternal = attachment?.isExternalAttachment === true;

            return (
              <div key={`${key}-${attachmentId}`} className="metadata-group">
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
                          rel="noreferrer"
                        >
                          {attachmentUrl}
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
        <div className="metadata-empty">
          {JSON.stringify(value, null, 2)}
        </div>
      );
    }

    return <strong>{formatMetadataValue(value)}</strong>;
  };

  return (
    <main className="page-shell">
      <div className="container">
        <section className="page-header">
          <h1>Live Preview</h1>
        </section>

        <div className="converter-form">
          <div className="input-row">
            <button
              type="button"
              className="secondary-button"
              onClick={generateKey}
              disabled={generatingKey || loading}
            >
              {generatingKey
                ? 'Generating access…'
                : apiKey
                  ? 'Generate New Access'
                  : 'Get Temporary Access'}
            </button>

            <span>
              {apiKey
                ? 'Temporary access is ready.'
                : 'Generate temporary access to enable conversion.'}
            </span>
          </div>
        </div>

        <form className="converter-form" onSubmit={convert}>
          <div className="input-row">
            <input
              className="text-input"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />

            <button
              type="submit"
              className="primary-button"
              disabled={!apiKey || loading || generatingKey}
            >
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
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => navigator.clipboard.writeText(markdown)}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={download}
                  >
                    Download .md
                  </button>
                </div>
              </div>

              <div className="card-body scroll-panel">
                {raw ? (
                  <pre className="markdown-output scroll-content">
                    {markdown}
                  </pre>
                ) : (
                  <article className="rendered-markdown scroll-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {body}
                    </ReactMarkdown>
                  </article>
                )}
              </div>
            </div>

            <aside className="meta-panel">
              <h2>Article metadata</h2>

              <ul className="metadata-list">
                {Object.entries(metadata).map(([key, value]) => (
                  <li
                    key={key}
                    className={
                      key === 'products' || key === 'attachments'
                        ? 'metadata-item nested'
                        : 'metadata-item'
                    }
                  >
                    <span>{key}</span>
                    {renderMetadataValue(key, value)}
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
