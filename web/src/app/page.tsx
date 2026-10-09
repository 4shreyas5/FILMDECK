import UploadForm from '@/components/UploadForm'; import { listSamples, liveAvailable, liveModel } from '@/lib/jobs';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const live = { available: liveAvailable(), model: liveAvailable() ? await liveModel() : null }; // booleans and a model name only: the key stays on the server
  return (<>
    <section className="hero">
      <p className="eyebrow">Document in, film-deck out</p>
      <h1>Turn a document into a <em>cinematic</em> presentation.</h1>
      <p className="lede">Upload a PowerPoint, Word file, PDF or text document. FilmDeck plans the story, checks every number against your source, builds the deck and tests it in a real browser. You present it from the browser, offline.</p>
      <p className="facts-line" data-testid="limits"><b>Accepts</b> .pptx .docx .pdf .md .txt &nbsp;·&nbsp; <b>Up to</b> 25 MB &nbsp;·&nbsp; <b>Takes</b> about 1 to 4 minutes</p>
      <ol className="how"><li><i>01</i><b>Upload</b>Drop your document. It stays on this computer in Mock mode.</li><li><i>02</i><b>Generate</b>The story is planned and every figure is tied to a quote from your document.</li><li><i>03</i><b>Present</b>Play it here, open it full screen, or download one HTML file.</li></ol>
    </section>
    <UploadForm samples={listSamples()} live={live} />
  </>);
}
