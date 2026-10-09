import './globals.css'; import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = { title: 'FilmDeck', description: 'Turn a document into a cinematic presentation. Runs on your computer.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>
    <a className="skip" href="#main">Skip to content</a>
    <header className="top"><a href="/" className="brand">FILM<span>DECK</span></a><span className="tag">Local only · runs on this computer</span></header>
    <main id="main">{children}</main>
    <footer className="foot">FilmDeck runs on this computer and listens on 127.0.0.1 only. Files are stored in generated/web until you delete them or the server restarts. It is a single-user tool: do not expose it to a network.</footer>
  </body></html>);
}
