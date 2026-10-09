# Vendored third-party assets

Generated FilmDeck decks embed these so they work offline. Refreshed with `node tools/vendor/fetch-assets.mjs`.

| Asset | Version | License | Notes |
|---|---|---|---|
| GSAP (`gsap.min.js`) | 3.12.5 | GreenSock "Standard No Charge" license (https://gsap.com/standard-license) | Same version the reference decks load from cdnjs. **Review the license terms before any commercial launch** (they restrict use inside tools that compete with Webflow's no-code animation builders; self-hosting and redistribution inside a deck are allowed). |
| Barlow Condensed 500/700/800/900 | Google Fonts | SIL Open Font License 1.1 (https://openfontlicense.org) | (c) The Barlow Project Authors (Jeremy Tribby) |
| Instrument Serif 400 + italic | Google Fonts | SIL OFL 1.1 | (c) The Instrument Serif Project Authors |
| JetBrains Mono 400/500 | Google Fonts | SIL OFL 1.1 | (c) The JetBrains Mono Project Authors |

Only the `latin` and `latin-ext` subsets are embedded (covers Western European text, currency signs and punctuation). Text in other scripts falls back to system fonts. OFL permits embedding fonts in documents, and these fonts are not renamed or modified.
