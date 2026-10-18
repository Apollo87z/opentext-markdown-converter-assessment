import { useMemo, useState } from 'react';

const API_BASE_URL = 'https://dizrmwyelhihs.cloudfront.net';
const ARTICLE_URL = 'https://my.opentext.com/support/article/1986936';
const API_KEY = 'YOUR_API_KEY';

function TokenizedCode({ code }) {
  const rendered = useMemo(() => {
    const pattern =
      /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|#[^\n]*|\b(?:true|false|null)\b|\b(?:const|let|var|await|async|import|from|return|if|else|for|while|try|catch|class|def|print|curl|GET|POST|Accept|Content-Type|application|json)\b|\b\d+(?:\.\d+)?\b|[{}\[\]():,])|(\s+)|(\S+)/g;

    const segments = [];
    let match;

    while ((match = pattern.exec(code)) !== null) {
      const token = match[0];
      let className = 'token-default';

      if (match[2]) {
        className = 'token-plain';
      } else if (/^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)$/.test(token)) {
        className = 'token-string';
      } else if (/^(?:true|false|null)$/.test(token)) {
        className = 'token-boolean';
      } else if (/^\d+(?:\.\d+)?$/.test(token)) {
        className = 'token-number';
      } else if (/^(?:\/\/[^\n]*|#[^\n]*)$/.test(token)) {
        className = 'token-comment';
      } else if (/^(?:const|let|var|await|async|import|from|return|if|else|for|while|try|catch|class|def|print|curl|GET|POST|Accept|Content-Type|application|json)$/.test(token)) {
        className = 'token-keyword';
      } else if (/^[{}\[\]():,]$/.test(token)) {
        className = 'token-punctuation';
      }

      segments.push(
        <span key={`token-${match.index}`} className={className}>
          {token}
        </span>,
      );
    }

    return segments;
  }, [code]);

  return <code className="code-content">{rendered}</code>;
}

function CodeExamplePanel({ examples, id }) {
  const [activeLanguage, setActiveLanguage] = useState(
    examples[0]?.language ?? 'bash',
  );
  const [copied, setCopied] = useState(false);

  const activeExample =
    examples.find((example) => example.language === activeLanguage) ??
    examples[0];

  const handleCopy = async () => {
    if (!activeExample) return;

    try {
      await navigator.clipboard.writeText(activeExample.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  if (!activeExample) return null;

  return (
    <div className="docs-code-panel">
      <div className="docs-code-toolbar">
        <div className="docs-code-tabs" role="tablist" aria-label="Code examples">
          {examples.map((example) => (
            <button
              key={example.language}
              id={`${id}-tab-${example.language}`}
              type="button"
              role="tab"
              aria-selected={activeLanguage === example.language}
              aria-controls={`${id}-panel-${example.language}`}
              className={`docs-tab ${
                activeLanguage === example.language ? 'active' : ''
              }`}
              onClick={() => {
                setActiveLanguage(example.language);
                setCopied(false);
              }}
            >
              {example.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="docs-copy-button"
          onClick={handleCopy}
          aria-label="Copy code example"
        >
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>

      <div
        id={`${id}-panel-${activeExample.language}`}
        className="docs-code-container"
        role="tabpanel"
        aria-labelledby={`${id}-tab-${activeExample.language}`}
      >
        <TokenizedCode code={activeExample.code} />
      </div>
    </div>
  );
}

export default function Docs() {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'health', label: 'GET /api/v1/health' },
    { id: 'articles', label: 'GET /api/v1/articles' },
    { id: 'generate-key', label: 'POST /api/v1/generate-key' },
    { id: 'errors', label: 'Errors' },
  ];

  const navigateToSection = (event, sectionId) => {
    event.preventDefault();
    event.stopPropagation();

    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(API_BASE_URL);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1500);
    } catch {
      setCopiedUrl(false);
    }
  };

  const healthExamples = [
    {
      language: 'bash',
      label: 'cURL',
      code: `curl -X GET "${API_BASE_URL}/api/v1/health"`,
    },
    {
      language: 'json',
      label: 'JSON Output',
      code: '{\n  "status": "ok"\n}',
    },
  ];

  const articleExamples = [
    {
      language: 'bash-markdown',
      label: 'cURL · Markdown',
      code: `curl -G "${API_BASE_URL}/api/v1/articles" \\
  --data-urlencode "url=${ARTICLE_URL}" \\
  -H "x-api-key: ${API_KEY}" \\
  -H "Accept: text/markdown"`,
    },
    {
      language: 'bash-json',
      label: 'cURL · JSON',
      code: `curl -G "${API_BASE_URL}/api/v1/articles" \\
  --data-urlencode "url=${ARTICLE_URL}" \\
  -H "x-api-key: ${API_KEY}" \\
  -H "Accept: application/json"`,
    },
    {
      language: 'javascript',
      label: 'JavaScript',
      code: `const articleUrl = '${ARTICLE_URL}';

const response = await fetch(
  '${API_BASE_URL}/api/v1/articles?url=' +
    encodeURIComponent(articleUrl),
  {
    headers: {
      'x-api-key': '${API_KEY}',
      Accept: 'application/json',
    },
  },
);

if (!response.ok) {
  throw new Error('Request failed: ' + response.status);
}

const data = await response.json();
console.log(data.article.title);
console.log(data.markdown);`,
    },
    {
      language: 'python',
      label: 'Python',
      code: `import requests

response = requests.get(
    '${API_BASE_URL}/api/v1/articles',
    params={'url': '${ARTICLE_URL}'},
    headers={
        'x-api-key': '${API_KEY}',
        'Accept': 'application/json',
    },
    timeout=30,
)
response.raise_for_status()
data = response.json()
print(data['article']['title'])
print(data['markdown'])`,
    },
    {
      language: 'json',
      label: 'JSON Output',
      code: `{
  "status": "success",
  "sourceUrl": "${ARTICLE_URL}",
  "contentType": "text/markdown",
  "article": {
    "id": "1986936",
    "title": "Example article",
    "type": "Article",
    "views": 42,
    "createdAt": null,
    "updatedAt": null,
    "products": [],
    "attachments": [],
    "relatedArticles": []
  },
  "markdown": "---\\nstatus: success\\n---\\n\\n# Example article"
}`,
    },
    {
      language: 'markdown',
      label: 'Markdown Output',
      code: `---
status: success
id: "1986936"
title: "Example article"
type: "Article"
views: 42
createdAt: null
updatedAt: null
sourceUrl: "${ARTICLE_URL}"
products: []
attachments: []
---

# Example article

Example Markdown content`,
    },
  ];

  const keyExamples = [
    {
      language: 'bash',
      label: 'cURL',
      code: `curl -X POST "${API_BASE_URL}/api/v1/generate-key"`,
    },
    {
      language: 'javascript',
      label: 'JavaScript',
      code: `const response = await fetch('${API_BASE_URL}/api/v1/generate-key', {
  method: 'POST',
});

if (!response.ok) {
  throw new Error('Request failed: ' + response.status);
}

const data = await response.json();
console.log(data.apiKey);`,
    },
    {
      language: 'python',
      label: 'Python',
      code: `import requests

response = requests.post(
    '${API_BASE_URL}/api/v1/generate-key',
    timeout=30,
)
response.raise_for_status()
print(response.json()['apiKey'])`,
    },
    {
      language: 'json',
      label: 'JSON Output',
      code: '{\n  "apiKey": "<example-api-key>"\n}',
    },
  ];

  const errorExamples = [
    {
      language: 'json',
      label: '400 Example',
      code: '{\n  "status": "error",\n  "error": "Validation failed",\n  "message": "Please provide a valid article URL."\n}',
    },
    {
      language: 'json-404',
      label: '404 Example',
      code: '{\n  "status": "error",\n  "error": "Route not found",\n  "message": "Route not found"\n}',
    },
    {
      language: 'json-502',
      label: '502 Example',
      code: '{\n  "status": "error",\n  "error": "Bad gateway",\n  "message": "Failed to load article."\n}',
    },
  ];

  return (
    <main className="docs-page">
      <div className="container docs-layout">
        <aside className="docs-sidebar">
          <nav className="docs-nav" aria-label="Docs navigation">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="docs-link"
                onClick={(event) => navigateToSection(event, section.id)}
              >
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="docs-content">
          <section id="overview" className="docs-section">
            <div className="docs-intro">
              <p className="docs-eyebrow">API REFERENCE</p>
              <h1>OpenText Markdown Converter</h1>
              <p className="docs-description">
                Retrieve OpenText support articles as Markdown or structured
                JSON for applications and AI agents.
              </p>
            </div>

            <div className="docs-api-url">
              <div className="docs-api-url-heading">
                <div>
                  <strong>Base URL</strong>
                  <p>Use this URL to access the API endpoints.</p>
                </div>
                <span className="docs-api-status">
                  <span className="docs-api-status-dot" />
                  API
                </span>
              </div>

              <div className="docs-api-url-value">
                <code>{API_BASE_URL}</code>
                <button
                  type="button"
                  className="docs-copy-button"
                  onClick={handleCopyUrl}
                >
                  {copiedUrl ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            </div>

            <div className="docs-endpoints">
              <div className="docs-endpoints-heading">
                <div>
                  <h2>Endpoints</h2>
                  <p>Available API operations</p>
                </div>
                <span className="docs-endpoint-count">3 endpoints</span>
              </div>

              <table className="docs-route-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Endpoint</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['GET', 'health', '/api/v1/health', 'Check service health.'],
                    ['GET', 'articles', '/api/v1/articles', 'Retrieve an article as JSON or Markdown.'],
                    ['POST', 'generate-key', '/api/v1/generate-key', 'Request an API key.'],
                  ].map(([method, id, path, description]) => (
                    <tr key={id}>
                      <td>
                        <span className={`docs-method docs-method-${method.toLowerCase()}`}>
                          {method}
                        </span>
                      </td>
                      <td>
                        <a
                          className="docs-endpoint-link"
                          href={`#${id}`}
                          onClick={(event) => navigateToSection(event, id)}
                        >
                          <code>{path}</code>
                        </a>
                      </td>
                      <td>{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="docs-auth-notice">
              <h2>API authentication</h2>
              <p>
                The articles endpoint requires an API key. Include your key
                in the <code>x-api-key</code> request header. Requests without
                a valid key receive HTTP <code>401</code>.
              </p>
              <p>
                The health endpoint remains public. Do not put API keys in
                URLs or commit real keys to source control.
              </p>
              <p>
                Replace <code>YOUR_API_KEY</code> in the examples with your
                actual key.
              </p>
            </div>
          </section>

          <section id="health" className="docs-section">
            <div className="docs-section-header">
              <div>
                <p className="docs-eyebrow">Endpoint · Public</p>
                <h2>GET /api/v1/health</h2>
              </div>
            </div>
            <p>Returns the application status as JSON. No API key is required.</p>
            <CodeExamplePanel id="health" examples={healthExamples} />
          </section>

          <section id="articles" className="docs-section">
            <div className="docs-section-header">
              <div>
                <p className="docs-eyebrow">Endpoint · Authentication required</p>
                <h2>GET /api/v1/articles</h2>
              </div>
            </div>

            <p>
              Retrieves an OpenText support article using the required{' '}
              <code>url</code> query parameter. Set the <code>Accept</code>{' '}
              header to choose the response format.
            </p>

            <ul>
              <li><strong>Authentication:</strong> <code>x-api-key</code> header</li>
              <li><strong>Query parameter:</strong> <code>url</code> — an OpenText support article URL</li>
              <li><strong>Markdown:</strong> <code>Accept: text/markdown</code></li>
              <li><strong>JSON:</strong> <code>Accept: application/json</code></li>
              <li><strong>Default:</strong> Markdown when the header is omitted or accepts <code>*/*</code>.</li>
              <li><strong>Unsupported format:</strong> HTTP <code>406</code>.</li>
              <li><strong>Example article:</strong> <code>{ARTICLE_URL}</code></li>
            </ul>

            <h3>Response formats</h3>
            <p>
              Markdown responses contain article front matter, converted
              article content, and attachment links. JSON responses contain
              the article metadata and a <code>markdown</code> field with the
              converted content.
            </p>

            <CodeExamplePanel id="articles" examples={articleExamples} />
          </section>

          <section id="generate-key" className="docs-section">
            <div className="docs-section-header">
              <div>
                <p className="docs-eyebrow">Endpoint</p>
                <h2>POST /api/v1/generate-key</h2>
              </div>
            </div>

            <p>
              Requests an API key. The example response is illustrative;
              actual key generation and access policies depend on the backend.
            </p>

            <CodeExamplePanel id="generate-key" examples={keyExamples} />
          </section>

          <section id="errors" className="docs-section">
            <div className="docs-section-header">
              <div>
                <p className="docs-eyebrow">Errors</p>
                <h2>Error responses</h2>
              </div>
            </div>

            <p>
              Error responses contain an error description. The exact response
              fields depend on the error handler and endpoint.
            </p>

            <ul>
              <li><strong>400</strong> — invalid URL or malformed request.</li>
              <li><strong>401</strong> — missing or invalid API key.</li>
              <li><strong>403</strong> — forbidden.</li>
              <li><strong>404</strong> — route not found.</li>
              <li><strong>406</strong> — unsupported response format.</li>
              <li><strong>413</strong> — request body too large.</li>
              <li><strong>429</strong> — too many requests.</li>
              <li><strong>500</strong> — internal server error.</li>
              <li><strong>502</strong> — upstream service failure.</li>
              <li><strong>503</strong> — authentication service unavailable.</li>
              <li><strong>504</strong> — upstream timeout.</li>
            </ul>

            <CodeExamplePanel id="errors" examples={errorExamples} />
          </section>
        </div>
      </div>
    </main>
  );
}
