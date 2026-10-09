// Builds the fictional document CORPUS: 12 documents with realistic shapes (not realistic facts) plus a hand-written mock storyboard for each.
// Every document says it is fictional. Documents are committed; storyboards are generated here so their sourceRefs and evidence quotes are
// taken mechanically from what the ingestion layer actually extracts (a mock fixture is authoring, never validator output).
// usage: node tests/corpus/make-corpus.mjs [--docs] [--pdf]   (--docs rebuilds documents; --pdf needs FILMDECK_QA_MODULES for Chromium)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module';
import { pptx, docx } from '../support/office-build.mjs'; import { ingestFile } from '../../tools/ingest/index.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), D = path.join(here, 'docs'), FX = path.join(here, 'fixtures');
const FICT = 'This document is fictional and was written only to test FilmDeck. All names and figures are made up.';
const docs = {};

// ---------- documents ----------
docs['01-consulting-deck.pptx'] = { kind: 'pptx', title: 'Halden Retail store network review (fictional)', fictional: true, slides: [
  { title: 'Halden Retail: store network review', paras: ['Fictional case prepared for FilmDeck testing'] },
  { title: 'Store sales fell 6% while online sales grew 23%', bullets: ['Store sales are down 6% year on year', 'Online sales are up 23% year on year', 'Online now makes up 31% of total sales'], notes: 'Online share crossed 30% for the first time.' },
  { title: 'Rent is the largest fixed cost', table: [['Cost line', 'Share of costs', 'Change'], ['Rent', '38%', '+4%'], ['Staff', '31%', '+2%'], ['Logistics', '14%', '+9%']] },
  { title: 'Footfall is falling fastest in small stores', bullets: ['Small stores lost 14% of visits', 'Large stores lost 5% of visits', 'Customers still value local pickup'] },
  { title: 'Recommendation: close weak stores, grow pickup points', bullets: ['Close 12 of the weakest stores', 'Open 40 pickup points near transit', 'Reinvest the savings in delivery speed'], notes: 'The closures are phased over two years.' },
  { title: 'Next steps', bullets: ['Agree the closure list with the board', 'Select pickup point sites', 'Report progress each quarter'] }] };
docs['02-dense-corporate.pptx'] = { kind: 'pptx', title: 'Orbit Logistics operating review (fictional)', fictional: true, slides: [
  { title: 'Orbit Logistics: Q2 operating review', paras: ['Fictional company, fictional figures, for FilmDeck testing', 'Confidential draft'], footer: 'Orbit Logistics | Fictional | Confidential' },
  { title: 'Operational scorecard', bullets: ['On-time delivery reached 94.2% against a target of 96%', 'Average cost per parcel was $3.41, down from $3.67', 'Damage claims fell to 0.8% of parcels', 'Driver turnover stayed high at 28% annualised', 'Warehouse utilisation averaged 81% across 14 sites', 'Customer complaints per 1,000 parcels fell to 5.6', 'Fleet fuel use improved by 7% per kilometre'], footer: 'Orbit Logistics | Fictional | Confidential' },
  { title: 'Regional performance', table: [['Region', 'Parcels (M)', 'On-time', 'Cost per parcel', 'Claims'], ['North', '12.4', '95.1%', '$3.22', '0.7%'], ['South', '9.8', '93.4%', '$3.58', '0.9%'], ['East', '7.1', '92.8%', '$3.71', '1.1%'], ['West', '10.3', '95.6%', '$3.12', '0.6%']], footer: 'Orbit Logistics | Fictional | Confidential' },
  { title: 'Cost drivers and mitigation', bullets: ['Fuel: price volatility offset by route optimisation, saving $1.2M in the quarter', 'Labour: overtime fell 11% after the new shift pattern was introduced in the East', 'Maintenance: predictive servicing cut unplanned downtime by 18%', 'Technology: platform migration is 63% complete and on budget at $4.5M'], notes: 'Platform migration completes next quarter.' },
  { title: 'Risks', bullets: ['Peak season capacity: forecast demand exceeds capacity by 6% in the final week', 'Carrier dependency: two partners carry 40% of long-haul volume', 'Regulatory: new emissions rules apply from January'] },
  { title: 'Priorities for next quarter', bullets: ['Lift on-time delivery to 96%', 'Reduce driver turnover below 24%', 'Complete the platform migration', 'Add peak capacity of 8%'] }] };
docs['03-annual-report.pdf'] = { kind: 'pdf', fictional: true, html: `<h1>Bluewater Foods annual report</h1><p>${FICT}</p><h2>Letter from the chair</h2><p>Bluewater Foods had a year of steady progress. Revenue reached ₹4,200 crore, an increase of 12.5% over the previous year, and operating profit rose to ₹630 crore. We opened 18 new distribution centres and expanded into 6 new states.</p><p>Our customers increasingly choose healthier products. Sales of the wellness range grew by 31% and now account for 22% of revenue.</p><div class="pb"></div><h2>Financial highlights</h2><table><tr><th>Measure</th><th>This year</th><th>Last year</th></tr><tr><td>Revenue (₹ crore)</td><td>4,200</td><td>3,733</td></tr><tr><td>Operating profit (₹ crore)</td><td>630</td><td>541</td></tr><tr><td>Operating margin</td><td>15.0%</td><td>14.5%</td></tr><tr><td>Employees</td><td>8,150</td><td>7,420</td></tr></table><p>Operating margin improved by 0.5 percentage points.</p><div class="pb"></div><h2>Operations</h2><ul><li>Distribution centres increased from 42 to 60</li><li>Average delivery time fell to 2.4 days</li><li>Order accuracy reached 99.2%</li></ul><p>Investment in cold-chain capacity continued, with ₹210 crore committed over three years.</p><h2>Outlook</h2><p>We expect revenue growth of 10% to 12% next year and plan to add 25 distribution centres.</p>` };
docs['04-multi-column.pdf'] = { kind: 'pdf', fictional: true, html: `<h1>Meridian Health bulletin</h1><p>${FICT}</p><div class="cols"><h2>Clinic access</h2><p>Average waiting time for a first appointment fell from 19 days to 11 days after the new booking system launched. Satisfaction with booking reached 87%.</p><h2>Staffing</h2><p>The network now employs 1,240 clinicians. Nurse vacancies dropped to 6.5% from 9.1% a year earlier, helped by a retention bonus of $1,500.</p><h2>Prevention programmes</h2><p>Screening uptake rose to 64% among adults over 50. Vaccination coverage for children reached 93%, above the regional goal of 90%.</p><h2>Finance</h2><p>Operating costs were $82.5 million, 3.2% below budget. Digital visits now make up 28% of all consultations.</p><h2>Looking ahead</h2><p>Next year the network will open 5 community clinics and extend evening hours at 12 sites.</p></div>`, css: '.cols{column-count:2;column-gap:40px}' };
docs['05-text-heavy.docx'] = { kind: 'docx', title: 'Lakeside Schools leadership essay (fictional)', fictional: true, blocks: [{ title: 'What makes a school improve' }, { p: FICT }, { h: 1, t: 'Introduction' }, { p: 'Lakeside Schools is a fictional network of twelve schools. Over the last five years its leaders have tried many reforms, and some of them worked. This essay describes what the leaders believe made the difference.' }, { h: 1, t: 'Teachers first' }, { p: 'The first lesson was that improvement starts with teachers. When the network invested in coaching, teachers reported that they felt supported and more willing to try new methods. Within two years, reading scores rose by 9 points and the share of pupils meeting the standard climbed from 61% to 74%.' }, { p: 'Coaching was not a one-off event. Each teacher received six short observations a year, followed by a conversation focused on one change at a time. Leaders learned to resist the temptation to fix everything at once.' }, { h: 1, t: 'Clear routines' }, { p: 'The second lesson concerned routines. Classrooms with predictable starts and transitions recovered about 12 minutes of learning time each day. Attendance improved from 92% to 95% in the same period, which leaders linked to a calmer atmosphere.' }, { h: 1, t: 'Families as partners' }, { p: 'The third lesson was that families respond to specific, positive contact. Schools that phoned families with good news before any bad news saw parent meeting attendance double. Leaders say the surprising result was how cheap this was.' }, { h: 2, t: 'What did not work' }, { p: 'Not every idea succeeded. A costly new timetable confused staff and was dropped after one term. A homework app was used by only 15% of pupils. Leaders now test ideas in two schools before spreading them.' }, { h: 1, t: 'Conclusion' }, { p: 'In the leaders\' words, improvement is less about a single bold move than about steady attention to teachers, routines and families. The network plans to keep its approach simple.' }] };
docs['06-tables.docx'] = { kind: 'docx', title: 'Pinewood Energy tariff review (fictional)', fictional: true, blocks: [{ title: 'Pinewood Energy tariff review' }, { p: FICT }, { h: 1, t: 'Tariffs' }, { p: 'The table compares the three household tariffs offered this year.' }, { table: [['Tariff', 'Unit price (cents)', 'Standing charge ($/day)', 'Customers'], ['Standard', '24.5', '0.62', '41,200'], ['Fixed', '22.0', '0.70', '18,650'], ['Green', '26.8', '0.58', '9,300']] }, { h: 1, t: 'Complaints' }, { table: [['Quarter', 'Complaints', 'Resolved in 5 days'], ['Q1', '312', '71%'], ['Q2', '268', '78%'], ['Q3', '204', '85%']] }, { p: 'Complaints fell by 35% between the first and third quarter.' }, { h: 1, t: 'Outlook' }, { p: 'The company will move 10,000 Standard customers to a cheaper tariff if they ask.' }] };
docs['07-financial-report.md'] = { kind: 'md', fictional: true, text: `---
title: Crestline Capital quarterly report (fictional)
fictional: true
---
# Crestline Capital quarterly report

${FICT}

## Results

Net revenue was $128.4 million, up 9.6% from $117.2 million in the same quarter last year. Gross margin was 41.3% (prior year 39.8%). Operating expenses rose 5.1% to $38.9 million.

Net income reached $19.7 million, or $0.82 per diluted share, compared with $15.1 million, or $0.63 per share.

## Segments

| Segment | Revenue ($M) | Growth | Margin |
|---------|-------------:|-------:|-------:|
| Consumer | 61.2 | 11.4% | 44.0% |
| Business | 47.5 | 8.1% | 39.5% |
| Public | 19.7 | 6.2% | 35.2% |

## Balance sheet

Cash and equivalents were $214.6 million. Total debt was $96.0 million, giving net cash of $118.6 million. The board declared a dividend of $0.20 per share, payable on 15 December 2025.

## Guidance

Management expects full-year revenue between $505 million and $515 million and operating margin of 18% to 19%.
` };
docs['08-marketing-case.txt'] = { kind: 'txt', fictional: true, text: `Spark Coffee relaunch case (fictional)

${FICT}

Spark Coffee is a made-up chain of 60 cafes. Last spring it relaunched its loyalty app with a simple offer: a free drink after every seventh purchase.

In the first 8 weeks the app gained 120,000 new members, three times the forecast. Members visited 2.3 times a week on average, compared with 1.4 for non-members.

The team tested two messages. "Your seventh is on us" beat "Join the club" by 18 percentage points in sign-ups. Social posts reached 2.1 million people at a cost of $0.012 per view.

Not everything worked. Email reminders had an open rate of only 9%, and several members complained that the free drink expired too quickly. The team extended the expiry from 14 to 30 days.

The campaign cost $340,000 and the marketing lead estimates it returned $1.1 million in extra sales over the quarter.
` };
docs['09-hr-case.docx'] = { kind: 'docx', title: 'Tidewater Labs retention case (fictional)', fictional: true, blocks: [{ title: 'Retention at Tidewater Labs' }, { p: FICT }, { h: 1, t: 'Background' }, { p: 'Tidewater Labs is a fictional engineering company with 450 employees. Voluntary attrition reached 18% last year, well above the 11% the leadership team had planned for.' }, { h: 1, t: 'What exit interviews said' }, { li: '41% cited limited career growth' }, { li: '27% cited pay' }, { li: '19% cited their manager' }, { li: '13% cited other reasons' }, { h: 1, t: 'Actions' }, { p: 'The company launched a career ladder, ran manager training for 60 managers, and adjusted pay for roles that were more than 8% below market. Internal moves doubled to 52 in six months.' }, { h: 1, t: 'Results so far' }, { p: 'Annualised attrition has fallen to 13% after two quarters. Engagement scores rose from 6.8 to 7.4 out of 10. The programme cost $1.9 million; the company estimates that replacing leavers would have cost $3.4 million.' }, { h: 1, t: 'Lessons' }, { p: 'Leaders say the most valued change was the career ladder, because it made growth visible. They warn that results depend on keeping managers accountable.' }] };
docs['10-qualitative-narrative.md'] = { kind: 'md', fictional: true, text: `---
title: The long walk home (fictional)
fictional: true
---
# The long walk home

${FICT}

## A neighbourhood changes

When the old mill closed, the street went quiet. Shopkeepers looked at their empty counters and wondered who would come. For a long while nobody did.

Then a few residents began meeting on the corner to talk. They shared tea, stories and worries. Slowly the corner became a habit, and the habit became a market.

## What people noticed

Neighbours said the street felt friendlier. Children played outside again. Older residents said they no longer felt invisible. Shop owners spoke about trust, not about sales.

## What the residents learned

They learned that small gatherings matter, that welcome is a skill, and that a place is rebuilt by the people who stay. They also learned patience, because nothing changed quickly.

## Looking ahead

The residents hope the market will grow without losing its warmth. They want newcomers to feel at home and old friends to feel remembered.
` };
// long report: ~150,000 characters, 40 sections with distinct figures
{ let t = `---\ntitle: Evergreen Municipal long report (fictional)\nfictional: true\n---\n# Evergreen Municipal annual performance report\n\n${FICT}\n\n`;
  const topics = ['Water supply', 'Road maintenance', 'Public transport', 'Waste collection', 'Parks and recreation', 'Libraries', 'Housing services', 'Emergency response'];
  for (let i = 0; i < 40; i++) { const tp = topics[i % topics.length], n = 1 + Math.floor(i / topics.length); t += `## ${tp}, year ${n}\n\n`;
    for (let p = 0; p < 6; p++) t += `The ${tp.toLowerCase()} service reported ${100 + i * 7 + p * 3} completed requests in period ${p + 1} of year ${n}, with a satisfaction score of ${70 + ((i + p) % 25)}%. ` + 'Staff described steady progress, noted a few delays caused by weather and supplier lead times, and recorded suggestions from residents for clearer communication, simpler forms and shorter waiting times. '.repeat(3) + '\n\n';
    t += `| Measure | Value |\n|---|---:|\n| Requests closed | ${900 + i * 11} |\n| Average days to close | ${(3 + (i % 7) * 0.4).toFixed(1)} |\n\n`; }
  docs['11-long-report.md'] = { kind: 'md', fictional: true, text: t }; }
docs['12-messy-mixed.docx'] = { kind: 'docx', title: 'Field notes, mixed formats (fictional)', fictional: true, blocks: [{ p: 'FIELD NOTES   -   DRAFT 3' }, { p: FICT }, { h: 2, t: 'summary' }, { p: 'Visited   4 depots   this week.  Throughput  is up  8%  but   some depots   report   delays.' }, { p: '• Depot A: 1,250 pallets/day' }, { p: '• Depot B: 980 pallets/day' }, { p: '• Depot C: closed for repairs (reopens 3 March 2026)' }, { h: 1, t: 'TABLE OF OUTPUT' }, { table: [['Depot', 'Pallets', 'Delay'], ['A', '1,250', '2%'], ['B', '980', '7%'], ['', '', ''], ['C', '0', 'n/a']] }, { p: 'page 2' }, { raw: '<w:p><w:r><w:t xml:space="preserve">Keep: </w:t></w:r><w:del><w:r><w:delText>old plan 99%</w:delText></w:r></w:del><w:ins><w:r><w:t>new plan</w:t></w:r></w:ins></w:p>' }, { h: 3, t: 'questions' }, { li: 'Why is Depot B slower?' }, { li: 'Can Depot A take 15% more?' }, { p: '' }, { p: 'Total network cost this month: $2.3M (budget $2.5M).' }] };

// ---------- build documents ----------
const wantDocs = process.argv.includes('--docs');
if (wantDocs) {
  const pdfJobs = [];
  for (const [file, d] of Object.entries(docs)) {
    const out = path.join(D, file);
    if (d.kind === 'pptx') fs.writeFileSync(out, pptx(d.slides, d.title));
    else if (d.kind === 'docx') fs.writeFileSync(out, docx(d.blocks, d.title));
    else if (d.kind === 'md' || d.kind === 'txt') fs.writeFileSync(out, d.text);
    else pdfJobs.push([file, d]);
  }
  if (pdfJobs.length && process.argv.includes('--pdf')) {
    const { chromium } = createRequire(path.join(process.env.FILMDECK_QA_MODULES, 'x.js'))('playwright-core'); const b = await chromium.launch(); const pg = await b.newPage();
    const css = 'body{font-family:Arial,Helvetica,sans-serif;font-size:12pt} h1{font-size:26pt} h2{font-size:18pt} table{border-collapse:collapse;margin:10px 0} td,th{border:1px solid #444;padding:4px 10px} .pb{page-break-after:always}';
    for (const [file, d] of pdfJobs) { await pg.setContent(`<style>${css}${d.css || ''}</style>${d.html}`); fs.writeFileSync(path.join(D, file), await pg.pdf({ format: 'Letter', margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' } })); }
    await b.close();
  }
  console.log('documents built in', D);
}
export { docs };
