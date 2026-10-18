export default function Docs() {
  const sections = [
    { id: 'convert', label: 'POST /api/v1/convert' },
    { id: 'errors', label: 'Errors' },
    { id: 'health', label: 'GET /api/v1/health' },
  ];

  return (
    <main className="docs-page">
      <div className="container docs-layout">
        <aside className="docs-sidebar">
          <nav className="docs-nav" aria-label="Docs navigation">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="docs-link">
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="docs-content">
          <section id="convert" className="docs-section">
            <h1>Docs</h1>
            <h2>POST /api/v1/convert</h2>
            <p>
              Body: <code>{'{ "url": "https://my.opentext.com/support/article/1986936" }'}</code>
            </p>
            <p>
              Returns Markdown with front matter. Send <code>Accept: application/json</code> for JSON.
            </p>
            <pre className="code-block">{`curl -X POST /api/v1/convert \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://my.opentext.com/support/article/1986936"}'`}</pre>
          </section>

          <section id="errors" className="docs-section">
            <h2>Errors</h2>
            <ul>
              <li>400: missing or invalid url</li>
              <li>406: unsupported Accept header</li>
              <li>502: article could not be loaded</li>
            </ul>
          </section>

          <section id="health" className="docs-section">
            <h2>GET /api/v1/health</h2>
            <p>Returns <code>{'{ "status": "ok" }'}</code></p>
          </section>
        </div>
      </div>
    </main>
  );
}
