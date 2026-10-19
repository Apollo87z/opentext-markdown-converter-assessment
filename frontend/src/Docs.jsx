
import { useMemo, useState } from 'react';

const API_BASE_URL = 'https://dizrmwyelhihs.cloudfront.net';
const ARTICLE_URL = 'https://my.opentext.com/support/article/1986936';
const API_KEY = 'YOUR_API_KEY';

function TokenizedCode({ code }) {
  const rendered = useMemo(() => {
    const pattern =
      /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|\b(?:const|let|var|async|await|return|function|import|from|export|default|if|else|new|throw|try|catch)\b|[{}()[\].,:;])/g;

    const tokens = [];
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(code)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({
          text: code.slice(lastIndex, match.index),
          type: 'plain',
        });
      }

      const value = match[0];
      let type = 'punctuation';

      if (/^(\/\/|#)/.test(value)) type = 'comment';
      else if (/^["']/.test(value)) type = 'string';
      else if (/^(true|false|null|undefined)$/.test(value)) {
        type = 'boolean';
      } else if (/^\d/.test(value)) {
        type = 'number';
      } else if (
        /^(const|let|var|async|await|return|function|import|from|export|default|if|else|new|throw|try|catch)$/.test(
          value,
        )
      ) {
        type = 'keyword';
      }

      tokens.push({ text: value, type });
      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < code.length) {
      tokens.push({
        text: code.slice(lastIndex),
        type: 'plain',
      });
    }

    return tokens;
  }, [code]);

  return (
    <code className="code-content">
      {rendered.map((token, index) => (
        <span
          className={`token-${token.type}`}
          key={`${index}-${token.text.slice(0, 8)}`}
        >
          {token.text}
        </span>
      ))}
    </code>
  );
}

function CodeExamplePanel({ examples, id }) {
  const [activeTab, setActiveTab] = useState(
    examples[0]?.label ?? 'cURL',
  );
  const [copied, setCopied] = useState(false);

  const activeExample =
    examples.find((example) => example.label === activeTab) ??
    examples[0];

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(activeExample.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = activeExample.code;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();

      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } finally {
        textArea.remove();
      }
    }
  }

  return (
    <div className="docs-code-panel" id={id}>
      <div className="docs-code-toolbar">
        <div
          className="docs-code-tabs"
          role="tablist"
          aria-label="Code example language"
        >
          {examples.map((example) => (
            <button
              className={`docs-tab${
                activeTab === example.label ? ' active' : ''
              }`}
              key={example.label}
              type="button"
              role="tab"
              aria-selected={activeTab === example.label}
              onClick={() => {
                setActiveTab(example.label);
                setCopied(false);
              }}
            >
              {example.label}
            </button>
          ))}
        </div>

        <button
          className="docs-copy-button"
          type="button"
          onClick={copyCode}
        >
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>

      <pre
        className="docs-code-container"
        aria-label={`${activeExample.label} example`}
      >
        <TokenizedCode code={activeExample.code} />
      </pre>
    </div>
  );
}

function MethodBadge({ method }) {
  return (
    <span
      className={`docs-method docs-method-${method.toLowerCase()}`}
    >
      {method}
    </span>
  );
}

export default function Docs() {
  const [copiedBaseUrl, setCopiedBaseUrl] = useState(false);

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'health', label: 'Health check' },
    { id: 'articles', label: 'Convert article' },
    { id: 'generate-key', label: 'Generate API key' },
    { id: 'errors', label: 'Errors' },
  ];

  async function copyBaseUrl() {
    try {
      await navigator.clipboard.writeText(API_BASE_URL);
      setCopiedBaseUrl(true);
      window.setTimeout(() => setCopiedBaseUrl(false), 1600);
    } catch {
      setCopiedBaseUrl(false);
    }
  }

  function navigateToSection(event, id) {
    event.preventDefault();

    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    window.history.replaceState(null, '', `#${id}`);
  }

  const healthExamples = [
    {
      label: 'cURL',
      code: `curl -i ${API_BASE_URL}/api/v1/health`,
    },
    {
      label: 'JavaScript',
      code: `const response = await fetch('${API_BASE_URL}/api/v1/health');
const data = await response.json();

console.log(data);`,
    },
    {
      label: 'JSON',
      code: `{
  "status": "ok"
}`,
    },
  ];

  const articleExamples = [
    {
      label: 'cURL · Markdown',
      code: `curl -sS -G "${API_BASE_URL}/api/v1/articles" \\
  --data-urlencode "url=${ARTICLE_URL}" \\
  -H "x-api-key: ${API_KEY}" \\
  -H "Accept: text/markdown"`,
    },
    {
      label: 'cURL · JSON',
      code: `curl -sS -G "${API_BASE_URL}/api/v1/articles" \\
  --data-urlencode "url=${ARTICLE_URL}" \\
  -H "x-api-key: ${API_KEY}" \\
  -H "Accept: application/json"`,
    },
    {
      label: 'JavaScript',
      code: `const params = new URLSearchParams({
  url: '${ARTICLE_URL}',
});

const response = await fetch(
  '${API_BASE_URL}/api/v1/articles?' + params,
  {
    headers: {
      'x-api-key': '${API_KEY}',
      Accept: 'text/markdown',
    },
  },
);

if (!response.ok) {
  throw new Error(\`Request failed: \${response.status}\`);
}

const markdown = await response.text();
console.log(markdown);`,
    },
    {
      label: 'Python',
      code: `import requests

response = requests.get(
    '${API_BASE_URL}/api/v1/articles',
    params={'url': '${ARTICLE_URL}'},
    headers={
        'x-api-key': '${API_KEY}',
        'Accept': 'text/markdown',
    },
    timeout=30,
)
response.raise_for_status()
print(response.text)`,
    },
    {
      label: 'JSON Output',
      code: `{
  "url": "${ARTICLE_URL}",
  "title": "Example OpenText support article",
  "markdown": "# Example article\\n\\nConverted article content and attachment links..."
}`,
    },
    {
      label: 'cURL · Force refresh',
      code: `curl -sS -G "${API_BASE_URL}/api/v1/articles" \\
  --data-urlencode "url=${ARTICLE_URL}" \\
  --data-urlencode "forceRefresh=true" \\
  -H "x-api-key: ${API_KEY}" \\
  -H "Accept: text/markdown"`,
    },
    {
      label: 'JavaScript · JSON',
      code: `const params = new URLSearchParams({
  url: '${ARTICLE_URL}',
});

const response = await fetch(
  '${API_BASE_URL}/api/v1/articles?' + params,
  {
    headers: {
      'x-api-key': '${API_KEY}',
      Accept: 'application/json',
    },
  },
);

if (!response.ok) {
  throw new Error(\`Request failed: \${response.status}\`);
}

const article = await response.json();
console.log(article.markdown);`,
    },
    {
      label: 'Python · JSON',
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

article = response.json()
print(article['markdown'])`,
    },
  ];

  const cacheAgeExamples = [
    {
      label: 'cURL',
      code: `curl -sS -D - -o /dev/null -G "${API_BASE_URL}/api/v1/articles" \\
  --data-urlencode "url=${ARTICLE_URL}" \\
  -H "x-api-key: ${API_KEY}" \\
  -H "Accept: application/json" \\
  | grep -i "^age:"`,
    },
    {
      label: 'JavaScript',
      code: `const response = await fetch(
  '${API_BASE_URL}/api/v1/articles?' +
    new URLSearchParams({ url: '${ARTICLE_URL}' }),
  {
    headers: {
      'x-api-key': '${API_KEY}',
      Accept: 'application/json',
    },
  },
);

const age = response.headers.get('Age');

console.log(
  age === null
    ? 'Cache age is unavailable'
    : 'Article cached for ' + age + ' seconds',
);`,
    },
    {
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

age = response.headers.get('Age')
print(
    f'Article cached for {age} seconds'
    if age is not None
    else 'Cache age is unavailable'
)`,
    },
    {
      label: 'Example Header',
      code: `HTTP/2 200
content-type: application/json
cache-control: public, max-age=0, s-maxage=86400
age: 3600`,
    },
  ];

  const refreshExamples = [
    {
      label: 'cURL',
      code: `curl -sS -G "${API_BASE_URL}/api/v1/articles" \\
  --data-urlencode "url=${ARTICLE_URL}" \\
  --data-urlencode "forceRefresh=true" \\
  -H "x-api-key: ${API_KEY}" \\
  -H "Accept: text/markdown"`,
    },
    {
      label: 'JavaScript',
      code: `const params = new URLSearchParams({
  url: '${ARTICLE_URL}',
  forceRefresh: 'true',
});

const response = await fetch(
  '${API_BASE_URL}/api/v1/articles?' + params,
  {
    headers: {
      'x-api-key': '${API_KEY}',
      Accept: 'text/markdown',
    },
  },
);

if (!response.ok) {
  throw new Error(\`Request failed: \${response.status}\`);
}

const markdown = await response.text();
console.log(markdown);`,
    },
    {
      label: 'Python',
      code: `import requests

response = requests.get(
    '${API_BASE_URL}/api/v1/articles',
    params={
        'url': '${ARTICLE_URL}',
        'forceRefresh': 'true',
    },
    headers={
        'x-api-key': '${API_KEY}',
        'Accept': 'text/markdown',
    },
    timeout=30,
)
response.raise_for_status()
print(response.text)`,
    },
  ];

  const keyExamples = [
    {
      label: 'cURL',
      code: `curl -X POST '${API_BASE_URL}/api/v1/generate-key' \\
  -H 'Content-Type: application/json' \\
  -d '{}'`,
    },
    {
      label: 'JavaScript',
      code: `const response = await fetch(
  '${API_BASE_URL}/api/v1/generate-key',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  },
);

const result = await response.json();
console.log(result);`,
    },
    {
      label: 'Python',
      code: `import requests

response = requests.post(
    '${API_BASE_URL}/api/v1/generate-key',
    json={},
    timeout=30,
)
response.raise_for_status()
print(response.json())`,
    },
    {
      label: 'JSON',
      code: `{
  "apiKey": "YOUR_API_KEY"
}`,
    },
  ];

  const errorExamples = [
    {
      label: 'JSON',
      code: `{
  "error": "Bad Request",
  "message": "The url query parameter is required"
}`,
    },
  ];

  return (
    <main className="docs-page">
      <div className="container docs-layout">
        <aside
          className="docs-sidebar"
          aria-label="Documentation navigation"
        >
          <div className="docs-sidebar-heading">
            <span className="docs-sidebar-kicker">
              DEVELOPER GUIDE
            </span>
            <strong>API documentation</strong>
          </div>

          <nav className="docs-nav">
            {sections.map((section) => (
              <a
                className="docs-link"
                href={`#${section.id}`}
                key={section.id}
                onClick={(event) =>
                  navigateToSection(event, section.id)
                }
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className="docs-sidebar-footer">
            <span className="docs-sidebar-status-dot" />
            <span>API reference</span>
          </div>
        </aside>

        <div className="docs-content">
          <section
            className="docs-section docs-overview-section"
            id="overview"
          >
            <div className="docs-intro">
              <p className="docs-eyebrow">
                OPENTEXT · DEVELOPER API
              </p>

              <div className="docs-title-row">
                <div>
                  <h1>OpenText Markdown Converter</h1>
                  <p className="docs-description">
                    Convert OpenText support articles into Markdown
                    for documentation, integrations, and downstream
                    tools. Use the API endpoints below to check
                    service health, retrieve article content, and
                    create an API key.
                  </p>
                </div>

                <span className="docs-version-badge">REST API</span>
              </div>
            </div>

            <div className="docs-api-url">
              <div className="docs-api-url-heading">
                <div>
                  <strong>Base URL</strong>
                  <p>All API requests use this base address.</p>
                </div>

                <span className="docs-api-status">
                  <span className="docs-api-status-dot" />
                  HTTPS
                </span>
              </div>

              <div className="docs-api-url-value">
                <code>{API_BASE_URL}</code>
                <button
                  className="docs-copy-button"
                  type="button"
                  onClick={copyBaseUrl}
                >
                  {copiedBaseUrl ? 'Copied' : 'Copy URL'}
                </button>
              </div>
            </div>

            <div className="docs-endpoints-heading">
              <div>
                <h2>Endpoints</h2>
                <p>
                  Available routes and authentication requirements.
                </p>
              </div>

              <span className="docs-endpoint-count">
                3 endpoints
              </span>
            </div>

            <div className="docs-table-wrap">
              <table className="docs-route-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Endpoint</th>
                    <th>Description</th>
                    <th>Authentication</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td><MethodBadge method="GET" /></td>
                    <td>
                      <a
                        className="docs-endpoint-link"
                        href="#health"
                        onClick={(event) =>
                          navigateToSection(event, 'health')
                        }
                      >
                        <code>/api/v1/health</code>
                      </a>
                    </td>
                    <td>Check API availability</td>
                    <td>
                      <span className="docs-auth-pill docs-auth-public">
                        Public
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td><MethodBadge method="GET" /></td>
                    <td>
                      <a
                        className="docs-endpoint-link"
                        href="#articles"
                        onClick={(event) =>
                          navigateToSection(event, 'articles')
                        }
                      >
                        <code>/api/v1/articles</code>
                      </a>
                    </td>
                    <td>Retrieve an article as Markdown</td>
                    <td>
                      <span className="docs-auth-pill">API key</span>
                    </td>
                  </tr>

                  <tr>
                    <td><MethodBadge method="POST" /></td>
                    <td>
                      <a
                        className="docs-endpoint-link"
                        href="#generate-key"
                        onClick={(event) =>
                          navigateToSection(event, 'generate-key')
                        }
                      >
                        <code>/api/v1/generate-key</code>
                      </a>
                    </td>
                    <td>Generate an API key</td>
                    <td>
                      <span className="docs-auth-pill docs-auth-public">
                        Public
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="docs-notice">
              <span className="docs-notice-icon">i</span>
              <div>
                <strong>Authentication</strong>
                <p>
                  Include your key in the <code>x-api-key</code>{' '}
                  request header when calling protected endpoints.
                  Do not expose production keys in client-side code
                  or public repositories.
                </p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="health">
            <div className="docs-section-header">
              <div>
                <p className="docs-eyebrow">ENDPOINT 01</p>
                <h2>Health check</h2>
              </div>
              <MethodBadge method="GET" />
            </div>

            <p>
              Checks whether the API service is responding. This
              endpoint does not require an API key.
            </p>

            <div className="docs-endpoint-summary">
              <code>GET /api/v1/health</code>
              <span className="docs-auth-pill docs-auth-public">
                No authentication
              </span>
            </div>

            <h3 className="docs-subheading">Example request</h3>
            <CodeExamplePanel
              examples={healthExamples}
              id="health-example"
            />

            <h3 className="docs-subheading">Successful response</h3>
            <p>
              The service returns HTTP <code>200 OK</code> with a
              small JSON status object.
            </p>
          </section>

          <section className="docs-section" id="articles">
            <div className="docs-section-header">
              <div>
                <p className="docs-eyebrow">ENDPOINT 02</p>
                <h2>Convert an article</h2>
              </div>
              <MethodBadge method="GET" />
            </div>

            <p>
              Retrieves an OpenText support article using the
              required <code>url</code> query parameter. Set the{' '}
              <code>Accept</code> header to choose the response format.
            </p>

            <div className="docs-endpoint-summary">
              <code>GET /api/v1/articles</code>
              <span className="docs-auth-pill">
                Authentication required
              </span>
            </div>

            <h3 className="docs-subheading">Request requirements</h3>
            <ul>
              <li>
                <strong>Authentication:</strong> include your API
                key in the <code>x-api-key</code> header.
              </li>
              <li>
                <strong>Required query parameter:</strong>{' '}
                <code>url</code> — an OpenText support article URL.
              </li>
              <li>
                <strong>Optional query parameter:</strong>{' '}
                <code>forceRefresh=true</code> — requests a fresh
                article and triggers the backend cache-invalidation
                workflow.
              </li>
              <li>
                <strong>Example article:</strong>{' '}
                <a
                  href={ARTICLE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="docs-inline-link"
                >
                  {ARTICLE_URL}
                </a>
              </li>
            </ul>

            <h3 className="docs-subheading">Query parameters</h3>
            <div className="docs-table-wrap">
              <table className="docs-route-table docs-parameter-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>url</code></td>
                    <td>string</td>
                    <td>Yes</td>
                    <td>
                      Absolute URL of the OpenText support article
                      to retrieve and convert.
                    </td>
                  </tr>
                  <tr>
                    <td><code>forceRefresh</code></td>
                    <td>boolean</td>
                    <td>No</td>
                    <td>
                      Set to <code>true</code> to request a fresh
                      article and run the backend refresh and
                      cache-invalidation workflow.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="docs-subheading">Choose a response format</h3>
            <div className="docs-table-wrap">
              <table className="docs-route-table docs-parameter-table">
                <thead>
                  <tr>
                    <th>Accept header</th>
                    <th>Response</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>text/markdown</code></td>
                    <td>
                      Returns article front matter, converted
                      article content, and attachment links as
                      Markdown text.
                    </td>
                  </tr>
                  <tr>
                    <td><code>application/json</code></td>
                    <td>
                      Returns article metadata and a{' '}
                      <code>markdown</code> field containing the
                      converted content.
                    </td>
                  </tr>
                  <tr>
                    <td><code>*/*</code> or omitted</td>
                    <td>Defaults to Markdown.</td>
                  </tr>
                  <tr>
                    <td>Unsupported media type</td>
                    <td>
                      Returns HTTP <code>406 Not Acceptable</code>.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="docs-subheading">
              Example requests and response
            </h3>
            <CodeExamplePanel
              examples={articleExamples}
              id="article-example"
            />

            <h3 className="docs-subheading">Cache behavior</h3>
            <p>
              Article responses are cached by CloudFront to reduce
              repeated upstream requests and improve response times.
            </p>

            <ul>
              <li>
                <strong>Normal request:</strong> a cached response
                can be returned when available. The configured
                shared-cache lifetime is 24 hours.
              </li>
              <li>
                <strong>Cache age:</strong> read the CloudFront{' '}
                <code>Age</code> response header to see how many
                seconds the response has been cached. For example,{' '}
                <code>Age: 3600</code> means the cached response is
                approximately one hour old. This is cache age, not
                the article's publication or update time.
              </li>
              <li>
                <strong>Force refresh:</strong> add{' '}
                <code>forceRefresh=true</code> to request a fresh
                article. The backend runs its refresh and
                cache-invalidation workflow.
              </li>
              <li>
                <strong>After refreshing:</strong> the next normal
                request may initially miss the cache while
                CloudFront retrieves and caches the refreshed
                response.
              </li>
            </ul>

            <div className="docs-cache-headers">
              <div>
                <span>Normal response</span>
                <code>
                  Cache-Control: public, max-age=0, s-maxage=86400
                </code>
              </div>
              <div>
                <span>Force-refresh response</span>
                <code>Cache-Control: no-store</code>
              </div>
            </div>

            <h3 className="docs-subheading">Read the cache age</h3>
            <p>
              Use the <code>Age</code> response header to check the
              age of a cached response. It may be absent on a cache
              miss. In browsers, the API must expose this header
              through CORS using{' '}
              <code>Access-Control-Expose-Headers: Age</code>.
            </p>

            <CodeExamplePanel
              examples={cacheAgeExamples}
              id="cache-age-example"
            />

            <h3 className="docs-subheading">Force refresh</h3>
            <p>
              Use force refresh when an article may have changed.
              Normal requests are recommended for routine reads.
              Refreshing cannot guarantee that changes are
              immediately available from the upstream OpenText
              service.
            </p>

            <CodeExamplePanel
              examples={refreshExamples}
              id="refresh-example"
            />

            <div className="docs-notice">
              <span className="docs-notice-icon">i</span>
              <div>
                <strong>Cache invalidation timing</strong>
                <p>
                  A forced refresh starts the backend refresh and
                  cache-invalidation workflow, but it cannot
                  guarantee that the upstream article has already
                  been updated. After refreshing, a subsequent
                  normal request may need to repopulate the
                  CloudFront cache.
                </p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="generate-key">
            <div className="docs-section-header">
              <div>
                <p className="docs-eyebrow">ENDPOINT 03</p>
                <h2>Generate an API key</h2>
              </div>
              <MethodBadge method="POST" />
            </div>

            <p>
              Requests a new API key for accessing protected
              endpoints. Treat the returned key as a secret.
            </p>

            <div className="docs-endpoint-summary">
              <code>POST /api/v1/generate-key</code>
              <span className="docs-auth-pill docs-auth-public">
                No API key required
              </span>
            </div>

            <h3 className="docs-subheading">
              Example request and response
            </h3>
            <CodeExamplePanel
              examples={keyExamples}
              id="key-example"
            />

            <div className="docs-notice docs-notice-warning">
              <span className="docs-notice-icon">!</span>
              <div>
                <strong>Keep your key private</strong>
                <p>
                  Do not commit real API keys to source control,
                  include them in screenshots, or embed them in a
                  public frontend bundle. Store secrets in an
                  appropriate server-side secret store.
                </p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="errors">
            <div className="docs-section-header">
              <div>
                <p className="docs-eyebrow">REFERENCE</p>
                <h2>Errors and status codes</h2>
              </div>
            </div>

            <p>
              When a request fails, the API returns an HTTP status
              code that indicates the category of failure. The
              response body may contain additional details.
            </p>

            <div className="docs-table-wrap">
              <table className="docs-route-table docs-errors-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="docs-status-code">400</span></td>
                    <td>Bad Request</td>
                    <td>A required parameter is missing or invalid.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">401</span></td>
                    <td>Unauthorized</td>
                    <td>Authentication is missing or invalid.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">403</span></td>
                    <td>Forbidden</td>
                    <td>The request is not permitted.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">404</span></td>
                    <td>Not Found</td>
                    <td>The requested route or article could not be found.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">406</span></td>
                    <td>Not Acceptable</td>
                    <td>The requested response format is not supported.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">413</span></td>
                    <td>Payload Too Large</td>
                    <td>The request exceeds the configured size limit.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">429</span></td>
                    <td>Too Many Requests</td>
                    <td>The request rate limit has been exceeded.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">500</span></td>
                    <td>Internal Server Error</td>
                    <td>An unexpected server-side error occurred.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">502</span></td>
                    <td>Bad Gateway</td>
                    <td>An upstream service returned an invalid response.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">503</span></td>
                    <td>Service Unavailable</td>
                    <td>The service is temporarily unavailable.</td>
                  </tr>
                  <tr>
                    <td><span className="docs-status-code">504</span></td>
                    <td>Gateway Timeout</td>
                    <td>An upstream request took too long to complete.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="docs-subheading">Example error response</h3>
            <CodeExamplePanel
              examples={errorExamples}
              id="error-example"
            />

            <div className="docs-section-footer">
              <span className="docs-sidebar-status-dot" />
              End of API reference
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
