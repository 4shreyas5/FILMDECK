# Source ingestion (Phase 2, Step 2)

Turns a document into one **normalized source**: a list of sections, each with its text exactly as written and the place it came from. It does extraction only. No AI, no network, no summarising, no interpretation.

```
PDF / PPTX / DOCX / TXT / MD  ->  tools/ingest-source.mjs  ->  normalized source (JSON)
                                  tools/source-to-prompt.mjs  ->  labelled text
                                  tools/generate-storyboard.mjs  ->  storyboard  ->  validator  ->  recipes  ->  deck  ->  QA
```

## Usage

```
node tools/ingest-source.mjs report.pdf --out generated/sources/report.json [--fictional]
node tools/source-to-prompt.mjs generated/sources/report.json [--out prompt.txt]
node tools/generate-storyboard.mjs generated/sources/report.json --out sb.json --mock     # or report.pdf / .pptx / .docx directly
```

The type comes from the extension (`.pdf .pptx .docx .txt .md .markdown`, case-insensitive) and is then checked against the content. Exit codes of `ingest-source`: 0 ok, 1 failed (message on stderr, **no file written**), 2 usage. `--fictional` marks the document fictional (Markdown front matter `fictional: true` does the same). It is never inferred from the text.

## Dependencies

None added. The repository still has no `package.json`. PPTX and DOCX are ZIP files of XML, so `tools/ingest/zip.mjs` (about 40 lines on `node:zlib`) and `tools/ingest/xml.mjs` (a small tolerant XML reader) are enough. The PDF reader, `tools/ingest/pdf.mjs`, is written for this project (object parsing, Flate/ASCIIHex/ASCII85, object streams, font encodings and ToUnicode maps, text positioning). Tests use `playwright-core` only to *build* the Chromium-printed fixture PDFs, which are committed.

## Normalized source (`schemas/source.schema.json`)

```json
{
  "sourceVersion": 1,
  "document": { "id": "deck", "name": "deck.pptx", "type": "pptx", "title": "...", "slideCount": 5, "fictional": true },
  "sections": [
    { "id": "slide-2-b1", "type": "list", "text": "- Revenue reached $4.2 million\n- ...", "items": ["..."], "ordered": false,
      "headingPath": ["Revenue grew 18% year on year"],
      "location": { "id": "slide-2", "kind": "slide", "number": 2 } }
  ],
  "warnings": ["slide 4 has no extractable text (image-only slide?)"],
  "stats": { "sections": 11, "characters": 476, "tables": 1 }
}
```

Section `type`: `heading` (with `level` 1-6), `paragraph`, `list` (`items`, `ordered`), `table` (`headers`, `rows`), `notes` (PPTX speaker notes). `text` is always present (lists as `- item` lines, tables as ` | `-joined rows with the header row first) so every section can be quoted and number-checked the same way. Markers such as "1." are never added to text, so no digit appears that was not in the document.

## Source locations

Every section has a unique, citable `id` and a `location`. Both match the storyboard id pattern (`^[a-z0-9][a-z0-9-]{0,40}$`), so the generator can use a section id **directly** as `sources[].id` and `facts[].sourceRef`.

| Format | Section id | `location` | Notes |
|---|---|---|---|
| PDF | `page-14-b3` (3rd block on page 14) | `{id:"page-14", kind:"page", number:14}` | physical page order |
| PPTX | `slide-7-title`, `slide-7-b2`, `slide-7-notes` | `{id:"slide-7", kind:"slide", number:7}` | slide number is the position in the presentation, not the file name; hidden slides get `hidden:true` |
| DOCX | `p12` | `{id:"p12", kind:"paragraph", number:12}` | number counts extracted blocks in document order; DOCX has no reliable page numbers |
| Markdown / text | `p5` | `{id:"p5", kind:"paragraph", number:5, line:21}` | `line` is the 1-based line in the original file |

Headings give `headingPath` (for example `["Sales","Sales by channel"]`); on slides the path is the slide title. `source-to-prompt` prints a block like:

```
[slide-3-b1] (slide 3 · table (first row = column headers))
Region | Revenue ($M) | Growth
North | 1.9 | 21%
```

The grounding gate (`groundCheck`) is unchanged: a fact's digits must literally appear in the cited section, so "62%" cited to the wrong slide is rejected.

## Text normalization

Done: CRLF/CR to LF, tabs and runs of spaces to one space, Unicode spaces (NBSP, thin space...) to a plain space, zero-width characters and control characters removed, three or more newlines to one blank line, trimming. Not done, by design: no change to numbers, percentages, currency, dates or words, no spelling correction, no de-hyphenation, no dropping repeated headers or footers.

## Format notes and limitations

**Markdown/text.** Front matter, ATX headings (`#`), bullet/numbered lists, pipe tables, fenced code (kept as inert text). Plain text has no headings (it is not guessed). Setext headings and indented code are treated as paragraphs.

**DOCX.** Headings (style name or outline level), paragraphs, lists (numbering), tables, in body order, content controls included. Tracked deletions are excluded and insertions included (the visible text). Not extracted: footnotes/endnotes (a warning is added), headers/footers, text boxes, comments, images. Macros (`vbaProject.bin`) are never read.

**PPTX.** Per slide: title, text boxes and placeholders, bullet lists, tables, speaker notes, grouped shapes. Auto slide-number and date placeholders are skipped (their digits are not content). Reading order is the shape order in the file, which can differ from visual order. Whether a body is a list is inferred from bullet markup or body-placeholder structure. Not extracted: charts, SmartArt, images, text inside pictures. A slide with no text produces a warning, not content.

**PDF.** Text is rebuilt from glyph positions: lines, paragraphs (a line is joined to the next only when it wrapped at the right margin), headings (larger or bold short lines, level by size rank), bullet and vector-bullet lists, and tables (rows of 2+ aligned cells, at least 2 rows). Heuristics, so expect mistakes on complex layouts: multi-column pages are read line by line across columns, rotated pages are not corrected, multi-line table cells are split, and headers/footers/page numbers appear as ordinary text.
- Glyph codes are turned into text **only** through the file's own ToUnicode map, `/Encoding` or embedded Type 1 encoding. Fonts with none of these (some CFF/Type1C and CID fonts) are *not guessed*: that text is left out, the page is listed in `document.pagesWithoutText` and a warning names it. Isolated unmapped glyphs inside readable text appear as U+FFFD so a damaged number can never look valid.
- **No OCR.** If no page has readable text the ingestion fails: `the PDF has no extractable text (scanned or image-only?). FilmDeck does not run OCR`.
- Encrypted PDFs are refused. JavaScript, forms and embedded files in a PDF are never read or run.

## Tables

Kept as structure: `headers` (the first row) and `rows` (arrays of strings), plus `text` for quoting. DOCX and PPTX tables are exact. Markdown pipe tables are exact. PDF tables are detected from alignment, so borderless tables with irregular columns may come out as paragraphs or with merged cells; a table the detector misses is still present as text.

## Errors

All are `IngestError` with a `code`; the CLI prints `INGESTION FAILED [code]: message` and exits 1 without writing a file.

| code | when |
|---|---|
| `unsupported` | other extension (legacy `.doc/.ppt`, `.xlsx`, `.rtf`...); message tells the user to save as PPTX, DOCX or PDF |
| `empty` | zero bytes, whitespace only, a presentation with no slides, a DOCX/Markdown without text |
| `corrupt` | truncated or damaged file, wrong content for the extension, old binary or password-protected Office file under a `.docx/.pptx` name, ZIP that is not the expected format |
| `no-text` | scanned/image-only PDF, or only unreadable fonts, or no text in any slide |
| `encrypted` | encrypted PDF |
| `too-large` | over 100 MB |

## Safety

Documents are treated as hostile data. Nothing is executed, no external resource is fetched. XML is parsed by a small reader that expands only the five predefined entities and numeric references (no DTD, no external entities). ZIP entries are read in memory with a cap on entries (5,000), per-entry size (64 MB) and total expanded size (256 MB). HTML, scripts and code inside a document stay plain text in `text`, and the output is JSON data only. `source-to-prompt` refuses sources above 120,000 characters rather than summarising them.

## Chunking (Phase 3)

`node tools/chunk-source.mjs source.json --out chunks.json [--max-chars 24000]` splits a normalized source into ordered chunks of at most 24,000 characters (about 6,700 tokens) for a future model call. Rules: whole sections stay together; an oversized section is split into labelled parts (`[page-3-b2] (page 3 · paragraph · part 2/3)`) at sentence ends, then newlines, then a space that does not touch a digit, currency sign, `%`, `.`, `,` or sign, so a number is never separated from its unit; tables split on row boundaries. Each chunk lists its section ids and the first and last location and carries a character and token estimate. The text is verbatim: concatenating each section's parts reproduces the original exactly (tested on every fixture and the 178,000-character corpus report). Deterministic, no summarising, no model. `filmdeck` always writes `chunks.json`. Mock mode and all validation use the full source; a live call still refuses a source over 120,000 characters until multi-chunk generation exists.

## Tests

`node tests/ingestion/ingestion-tests.mjs` (deterministic, offline; includes a PDF decompression-bomb case) and `node tests/ingestion/chunk-tests.mjs`. Fixtures are in `tests/ingestion/fixtures/`, all fictional ("Northwind Foods"): Markdown (simple, tables, headings and lists, many numbers), plain text with CRLF and odd spacing, PDFs (a Chromium-printed 3-page report with headings, bullets, a table and rupee amounts; a hand-built PDF; scanned/image-only PDFs), a 5-slide PPTX (title, bullets, table, notes, image-only slide, hidden slide, slides deliberately out of file order), a DOCX (title, headings, table, list, tracked changes) and corrupt/empty/unsupported files. `tests/ingestion/make-fixtures.mjs` rebuilds the non-Chromium binaries.

## Future AI integration

`ingest-source -> source-to-prompt -> Claude -> storyboard -> validator -> repair loop` is already wired through `generate-storyboard.mjs` (all three input modes work in `--mock`). When a key exists, nothing in this layer changes: the same labelled text becomes the user message. The generator prompt tells the model to use block ids exactly as given and to set `kind` to `slide`, `page` or `table`.
