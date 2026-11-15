import { ArrowDown, ArrowUpRight, Asterisk, Plus, Search } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import overlayCss from '../assets/style.css?inline';
import { App } from '../components/App';
import { type Bridge, copyImageLocally, downloadLocally } from '../lib/bridge';
import { readKeybindings } from '../lib/keybindings';
import { readTheme } from '../lib/theme';
import { emptySession, isSession, readPalette } from '../lib/types';
import './style.css';

function Playground() {
  const cards = [
    ['01', 'A quieter kind of living', 'Interiors · 24 references', 'room'],
    ['02', 'Objects with intention', 'Still life · 18 references', 'objects'],
    ['03', 'The shape of a letter', 'Typography · 32 references', 'type'],
    ['04', 'Somewhere, outside', 'Architecture · 12 references', 'building'],
  ];
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Forma home">
          <Asterisk size={29} strokeWidth={1.7} /> forma
        </a>
        <nav>
          <a href="#collections">Discover</a>
          <a href="#collections">Collections</a>
          <a href="#about">Journal</a>
        </nav>
        <div className="site-search">
          <Search size={16} />
          <span>Find a little inspiration</span>
          <kbd>⌘ K</kbd>
        </div>
        <button
          type="button"
          id="create-button"
          className="create-button"
          onClick={() => {
            document.body.dataset.clicked = 'true';
          }}
        >
          <Plus size={16} />
          Create collection
        </button>
        <span className="avatar">F</span>
      </header>
      <section className="intro" id="top">
        <div>
          <p className="eyebrow">A place for a fresh perspective</p>
          <h1>
            Good things
            <br />
            catch your eye.
          </h1>
        </div>
        <p className="intro-description">
          A collection of spaces, objects, and ideas.
          <br />
          For the things you’re dreaming up next.
          <ArrowDown size={19} />
        </p>
      </section>
      <div className="category-nav">
        <button type="button" className="current">
          For you
        </button>
        {[
          'Interiors',
          'Objects',
          'Graphic design',
          'Architecture',
          'Photography',
          'Art',
          'Typography',
        ].map((name) => (
          <button type="button" key={name}>
            {name}
          </button>
        ))}
      </div>
      <section id="collections">
        <div className="section-heading">
          <h2>Worth a closer look</h2>
          <a href="#explore">
            View all collections <ArrowUpRight size={15} />
          </a>
        </div>
        <div className="collection-grid">
          {cards.map(([number, title, description, image]) => (
            <article className="collection-card" key={number} id={`card-${number}`}>
              <div className={`card-image image-${image}`}>
                <img
                  src={`/src/preview/images/${image === 'type' ? 'room' : image}.jpg`}
                  alt={title}
                />
                <span className="card-number">{number}</span>
                {image === 'type' && (
                  <span className="type-sample">
                    Aa
                    <span>
                      A study
                      <br />
                      in balance.
                    </span>
                  </span>
                )}
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="explore" id="explore">
        <div className="section-heading">
          <h2>Follow your curiosity</h2>
          <span>A few things to get lost in</span>
        </div>
        <div className="topic-list">
          {[
            'Quiet corners',
            'Everyday rituals',
            'Warm minimalism',
            'Honest materials',
            'Words & shapes',
            'Natural light',
          ].map((topic) => (
            <a href="#collections" key={topic}>
              {topic}
              <ArrowUpRight size={14} />
            </a>
          ))}
        </div>
        <div className="large-grid">
          <div className="large-image">
            <img src="/src/preview/images/building.jpg" alt="A sunlit architectural detail" />
          </div>
          <div className="quote-card">
            <span>Field notes / 001</span>
            <p>
              Notice the
              <br />
              little things.
            </p>
            <ArrowUpRight size={38} />
          </div>
          <div className="large-image">
            <img src="/src/preview/images/room.jpg" alt="A thoughtfully arranged living space" />
          </div>
        </div>
      </section>
      <footer id="about">
        <span>forma — a place to gather ideas.</span>
        <span>Made for curious minds.</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('playground')!).render(<Playground />);
const storageKey = 'qritique:preview-session';
let initial = emptySession(
  readPalette(JSON.parse(localStorage.getItem('qritique:palette') ?? 'null')),
);
try {
  const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  if (isSession(stored)) initial = stored;
} catch {
  /* Fresh playground. */
}
const bridge: Bridge = {
  async loadTheme() {
    return readTheme(localStorage.getItem('qritique:theme'));
  },
  async saveTheme(theme) {
    localStorage.setItem('qritique:theme', theme);
  },
  async loadPalette() {
    return readPalette(JSON.parse(localStorage.getItem('qritique:palette') ?? 'null'));
  },
  async savePalette(colors) {
    localStorage.setItem('qritique:palette', JSON.stringify(colors));
  },
  async loadKeybindings() {
    return readKeybindings(JSON.parse(localStorage.getItem('qritique:keybindings') ?? 'null'));
  },
  async saveKeybindings(bindings) {
    localStorage.setItem('qritique:keybindings', JSON.stringify(bindings));
  },
  async load() {
    return initial;
  },
  async save(session) {
    localStorage.setItem(storageKey, JSON.stringify(session));
  },
  async capture() {
    // Screenshot capture is a privileged extension API, available in the installed extension.
    throw new Error(
      'Image capture is available in the installed extension. Copy notes works in this preview.',
    );
  },
  copyImage: copyImageLocally,
  async copyText(text) {
    await navigator.clipboard.writeText(text);
  },
  async download(dataUrl, filename) {
    downloadLocally(dataUrl, filename);
  },
};
const host = document.createElement('qritique-overlay');
document.body.append(host);
const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = overlayCss;
shadow.append(style);
const container = document.createElement('div');
shadow.append(container);
const root = createRoot(container);
const mount = () =>
  root.render(
    <App
      host={host}
      bridge={bridge}
      initial={initial}
      onClose={() => {
        root.render(null);
        const raw = localStorage.getItem(storageKey);
        if (raw) initial = JSON.parse(raw);
      }}
    />,
  );
mount();
window.addEventListener('keydown', (event) => {
  if (event.altKey && event.shiftKey && event.code === 'KeyQ') {
    event.preventDefault();
    mount();
  }
});
