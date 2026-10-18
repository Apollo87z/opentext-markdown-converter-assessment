import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import LivePreview from './LivePreview';
import Docs from './Docs';
import './styles.css';

function Root() {
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);

  const isDocs = hash.startsWith('#/docs');

  return (
    <>
      <nav className="top-nav">
        <div className="container nav-inner">
          <div className="nav-links">
            <a href="#/" className={isDocs ? 'nav-link' : 'nav-link active'}>
              Live Preview
            </a>
            <a href="#/docs" className={isDocs ? 'nav-link active' : 'nav-link'}>
              Docs
            </a>
          </div>
        </div>
      </nav>
      {isDocs ? <Docs /> : <LivePreview />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
