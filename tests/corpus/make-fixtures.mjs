// Writes the mock storyboard fixtures of the corpus (tests/corpus/fixtures/<doc>.json). Hand-planned scenes; sourceRef and evidence are found
// MECHANICALLY in what the ingestion layer extracted from each document (first section containing the number; shortest sentence/line quoting it).
// These are mock fixtures: not AI output. usage: node tests/corpus/make-fixtures.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { ingestFile } from '../../tools/ingest/index.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), D = path.join(here, 'docs'), FX = path.join(here, 'fixtures');
const toks = s => (String(s).match(/\d[\d,.]*/g) || []).map(t => t.replace(/[.,]+$/, '').replace(/,/g, ''));
const sentences = text => text.split(/(?<=[.!?])\s+|\n/).map(x => x.trim()).filter(Boolean);
function quote(text, display) {
  const want = toks(display), ss = sentences(text); const has = s => want.every(t => toks(s).includes(t));
  let c = ss.filter(has).sort((a, b) => a.length - b.length)[0];
  if (!c) for (let i = 0; i + 1 < ss.length && !c; i++) if (has(ss[i] + ' ' + ss[i + 1])) c = text.slice(text.indexOf(ss[i]), text.indexOf(ss[i + 1]) + ss[i + 1].length);
  return c && c.length <= 300 ? c : null;
}
const clean = s => s.replace(/\s+/g, ' ');
const mood = { q: 'quiet', c: 'calm', t: 'tense', r: 'rising', w: 'triumphant' };

function build(file, plan) {
  const doc = ingestFile(path.join(D, file), { fictional: true }); const used = new Map(); const facts = [];
  const F = (id, display, value, o = {}) => {
    const want = toks(display); const sec = doc.sections.find(s => (!o.near || s.text.includes(o.near)) && s.type !== 'notes' && want.every(t => toks(s.text).includes(t)));
    if (!sec) throw new Error(`${file}: no section contains ${display}${o.near ? ' near ' + o.near : ''}`);
    const ev = quote(sec.text, display); if (!ev) throw new Error(`${file}: no quotable sentence for ${display} in ${sec.id}`);
    used.set(sec.id, sec); facts.push({ id, kind: o.range ? 'range' : 'number', value: o.range ? { lo: o.range[0], hi: o.range[1] } : value, display, ...(o.unit ? { unit: o.unit } : {}), sourceRef: sec.id, evidence: ev });
    return { fact: id };
  };
  const scenes = []; const S = (id, chapter, kicker, title, md, recipe, inputs, notes) => scenes.push({ id, chapter, kicker, ...(title ? { title } : {}), mood: mood[md], recipe, inputs, beats: notes.map((t, i) => ({ n: i + 1, notes: t })) });
  const T = (a, b) => b; void T;
  const api = { F, S,
    open: (l1, l2, emph, big, cap) => S('open', 'THE STORY', 'Opening', null, 'q', 'minimal-close', { variant: 'open', line1: l1, line2: l2, emphasis: emph, bigWord: big, caption: cap }, ['This is a fictional case written to test the deck.', 'We look at what the document says.', 'Every figure comes from the source.']),
    close: (l1, l2, emph, big, cap) => S('close', 'THE POINT', 'Closing', null, 'q', 'minimal-close', { variant: 'close', line1: l1, line2: l2, emphasis: emph, bigWord: big, caption: cap, thanks: 'Thank you.' }, ['That is the picture the document gives.', 'The details are in the source.', 'Thank you. This was a fictional case.']),
    big: (id, chap, title, label, v, ctx, cmp, notes) => S(id, chap, chap.charAt(0) + chap.slice(1).toLowerCase(), title, 'r', 'big-number', { label, value: v, context: ctx, ...(cmp ? { compare: cmp } : {}) }, notes),
    cmp: (id, chap, title, L, R, verdict, notes) => S(id, chap, chap.charAt(0) + chap.slice(1).toLowerCase(), title, 't', 'comparison', { left: L, right: R, verdict }, notes),
    bars: (id, chap, title, rows, scale, word, sub, notes) => S(id, chap, chap.charAt(0) + chap.slice(1).toLowerCase(), title, 't', 'range-bar-chart', { scale, rows, verdict: { kicker: 'THE READING', word, sub } }, notes),
    gauge: (id, chap, title, lb, la, a, b, scale, cap, notes) => S(id, chap, chap.charAt(0) + chap.slice(1).toLowerCase(), title, 't', 'gauge-needle', { scale, before: a, after: b, labelBefore: lb, labelAfter: la, afterTone: 'accent', caption: cap }, notes),
    rows: (id, chap, title, rows, stamp, ranked, notes) => S(id, chap, chap.charAt(0) + chap.slice(1).toLowerCase(), title, 'r', 'icon-rows-ranked-bars', { rows, stamp, ranked }, notes),
    pillars: (id, chap, title, roof, ps, notes) => S(id, chap, chap.charAt(0) + chap.slice(1).toLowerCase(), title, 'c', 'pillars-roof', { roofLabel: roof, pillars: ps.map(([h, items]) => ({ heading: h, items })) }, notes),
    strike: (id, chap, lead, struck, sub, moves, list, notes) => S(id, chap, chap.charAt(0) + chap.slice(1).toLowerCase(), null, 'r', 'strike-three-moves-checklist', { headlineLead: lead, headlineStruck: struck, sub, moves, checklist: list }, notes) };
  const meta = plan(api, doc);
  const sources = [...used.values()].map(s => ({ id: s.id, kind: s.location.kind === 'slide' ? 'slide' : s.location.kind === 'page' ? 'page' : s.type === 'table' ? 'table' : 'document', label: clean(s.text).slice(0, 60) || s.id, locator: s.location.id }));
  if (!sources.length) { const s = doc.sections.find(x => x.type === 'paragraph'); sources.push({ id: s.id, kind: 'document', label: clean(s.text).slice(0, 60), locator: s.location.id }); }
  const sb = { storyboardVersion: 1, deck: { id: meta.id, title: meta.title, subtitle: 'Fictional case, not real data', intro: 'A fictional case written only to test FilmDeck. Every figure comes from the source. Sound is on, best viewed fullscreen.', language: 'en', theme: 'ink-ember', fictional: true, ...(meta.accent ? { titleAccent: meta.accent } : {}) }, sources, facts, scenes };
  const out = path.join(FX, file.replace(/\.[^.]+$/, '') + '.json');
  fs.writeFileSync(out, JSON.stringify({ mock: true, note: `Hand-planned mock fixture for tests/corpus/docs/${file}. NOT an AI result. sourceRef and evidence were located mechanically in the ingested document.`, responses: [JSON.stringify(sb)] }, null, 1));
  console.log(`${file}: ${scenes.length} scenes, ${facts.length} facts -> ${path.relative(process.cwd(), out)}`);
}

const sc = (min, max, major, step, unit = '') => ({ min, max, majorStep: major, step, unit });
build('01-consulting-deck.pptx', ({ F, open, close, big, cmp, bars, pillars }) => {
  open('A good year online.', 'A harder year in the shops.', 'harder year', 'Two speeds.', 'HALDEN RETAIL · FICTIONAL');
  const on = F('online-growth', '23%', 23, { unit: '%' }), st = F('store-drop', '6%', 6, { unit: '%' }), sm = F('small-loss', '14%', 14, { unit: '%' }), lg = F('large-loss', '5%', 5, { unit: '%' }), cl = F('close-n', '12', 12), pk = F('pickup-n', '40', 40);
  big('online', 'THE SHIFT', 'Online keeps growing.', 'ONLINE SALES, YEAR ON YEAR', on, 'Shops are moving the other way.', { label: 'STORES FELL BY', value: st }, ['Online sales are the bright spot.', 'They grew by 23% year on year.', 'Store sales fell by 6% in the same period.']);
  cmp('footfall', 'THE VISITS', 'Small stores suffer most.', { heading: 'SMALL STORES', metrics: [{ label: 'VISITS LOST', value: sm }] }, { heading: 'LARGE STORES', metrics: [{ label: 'VISITS LOST', value: lg }] }, 'Footfall is falling fastest in small stores.', ['Footfall fell in every store type.', 'Small stores lost 14% of visits.', 'Large stores lost 5%.']);
  bars('plan', 'THE PLAN', 'Close some, open more.', [{ label: 'CLOSE', value: cl, tone: 'negative' }, { label: 'OPEN', value: pk, tone: 'positive' }], sc(0, 50, 10, 10), 'SHIFT.', 'Fewer shops, more pickup points.', ['The recommendation has two parts.', 'Close 12 of the weakest stores.', 'Open 40 pickup points near transit.', 'The network gets smaller and faster.']);
  pillars('how', 'THE HOW', 'How the plan works.', 'A SMALLER, FASTER NETWORK', [['CLOSE', ['Agree the list with the board']], ['OPEN', ['Choose pickup sites near transit']], ['REINVEST', ['Put savings into delivery speed']]], ['The plan rests on three pillars.', 'First, close the weakest stores.', 'Second, open pickup points.', 'Third, reinvest the savings.', 'Together they make a smaller, faster network.']);
  close('The shops are changing,', 'and the network can change with them.', 'change with them', 'Adapt.', 'HALDEN RETAIL · FICTIONAL');
  return { id: 'halden-review', title: 'Halden adapts its shops', accent: 'adapts' };
});
build('02-dense-corporate.pptx', ({ F, open, close, big, gauge, bars, strike }) => {
  open('Deliveries are close to target.', 'Costs are heading the right way.', 'right way', 'Steady.', 'ORBIT LOGISTICS · FICTIONAL');
  const ot = F('on-time', '94.2%', 94.2, { unit: '%' }), tg = F('target', '96%', 96, { unit: '%' }), c1 = F('cost-now', '$3.41', 3.41), c0 = F('cost-before', '$3.67', 3.67);
  big('ontime', 'THE SCORE', 'On time, nearly.', 'ON-TIME DELIVERY', ot, 'Close to the goal, not yet there.', { label: 'TARGET', value: tg }, ['On-time delivery is the headline measure.', 'It reached 94.2%.', 'The target is 96%.']);
  gauge('cost', 'THE COST', 'Cost per parcel falls.', 'COST PER PARCEL · BEFORE', 'COST PER PARCEL · NOW', c0, c1, sc(0, 5, 1, 1), 'Cheaper to deliver each parcel.', ['Cost per parcel is the efficiency measure.', 'It was $3.67.', 'It is now $3.41.']);
  const n = F('north', '95.1%', 95.1, { unit: '%' }), s = F('south', '93.4%', 93.4, { unit: '%' }), e = F('east', '92.8%', 92.8, { unit: '%' }), w = F('west', '95.6%', 95.6, { unit: '%' });
  bars('regions', 'THE REGIONS', 'Regions differ.', [{ label: 'NORTH', value: n, tone: 'positive' }, { label: 'SOUTH', value: s, tone: 'secondary' }, { label: 'EAST', value: e, tone: 'negative' }, { label: 'WEST', value: w, tone: 'positive' }], sc(90, 100, 5, 5, ''), 'GAPS.', 'The east trails the other regions.', ['On-time delivery by region.', 'The north is at 95.1%, the south at 93.4%.', 'The east is lowest at 92.8%, the west highest at 95.6%.', 'The east needs the most attention.']);
  strike('next', 'NEXT QUARTER', "DON'T JUST", 'WAIT.', { lead: 'Lift the ', accent: 'weak spots.' }, [{ head: 'RAISE', text: 'Lift on-time delivery toward the target.' }, { head: 'RETAIN', text: 'Keep more drivers for longer.' }, { head: 'COMPLETE', text: 'Finish the platform migration.' }], ['Lift on-time delivery', 'Reduce driver turnover', 'Complete the migration'], ['Waiting will not close the gap.', 'The sub line frames the priority.', 'Three moves for next quarter.', 'This is the checklist.']);
  close('Close to target,', 'and moving the right way.', 'right way', 'Finish.', 'ORBIT LOGISTICS · FICTIONAL');
  return { id: 'orbit-review', title: 'Orbit stays on course', accent: 'course' };
});
build('03-annual-report.pdf', ({ F, open, close, big, gauge, rows }) => {
  open('A year of steady progress.', 'Growth that customers can feel.', 'customers can feel', 'Bluewater.', 'BLUEWATER FOODS · FICTIONAL');
  const rev = F('revenue', '₹4,200 crore', 4200, { unit: 'crore' }), gr = F('growth', '12.5%', 12.5, { unit: '%' }), d0 = F('dc-before', '42', 42), d1 = F('dc-now', '60', 60), nd = F('dc-new', '18', 18), ns = F('states-new', '6', 6), wg = F('wellness-growth', '31%', 31, { unit: '%' }), wsh = F('wellness-share', '22%', 22, { unit: '%' });
  big('revenue', 'THE YEAR', 'Revenue reaches a high.', 'REVENUE', rev, 'Up on last year.', { label: 'GROWTH', value: gr }, ['Revenue is the headline.', 'It reached ₹4,200 crore.', 'That is growth of 12.5%.']);
  gauge('centres', 'THE NETWORK', 'The network grows.', 'DISTRIBUTION CENTRES · BEFORE', 'DISTRIBUTION CENTRES · NOW', d0, d1, sc(0, 80, 20, 10), 'More centres, closer to customers.', ['The network is the backbone.', 'It had 42 distribution centres.', 'It now has 60.']);
  rows('expand', 'THE EXPANSION', 'Opened and entered.', [{ head: 'OPENED', text: 'new distribution centres', count: nd, tone: 'neutral' }, { head: 'ENTERED', text: 'new states', count: ns, tone: 'positive' }], 'GROWING FAST', { kicker: 'WELLNESS RANGE', note: 'Healthier products are winning.', items: [{ label: 'GROWTH', value: wg, tag: 'FASTEST GROWING' }, { label: 'SHARE', value: wsh, tag: 'OF TOTAL REVENUE' }] }, ['The company opened 18 new distribution centres.', 'It also entered 6 new states.', 'The wellness range grew 31% and is now 22% of revenue.']);
  close('Steady progress,', 'built on what customers choose.', 'what customers choose', 'Healthy.', 'BLUEWATER FOODS · FICTIONAL');
  return { id: 'bluewater-year', title: 'Bluewater grows steadily', accent: 'grows' };
});
build('04-multi-column.pdf', ({ F, open, close, big, gauge, cmp }) => {
  open('Waits are shorter.', 'More people are screened and vaccinated.', 'screened and vaccinated', 'Access.', 'MERIDIAN HEALTH · FICTIONAL');
  const w0 = F('wait-before', '19', 19), w1 = F('wait-now', '11', 11), sat = F('booking-sat', '87%', 87, { unit: '%' }), vac = F('vaccination', '93%', 93, { unit: '%' }), goal = F('goal', '90%', 90, { unit: '%' }), dig = F('digital', '28%', 28, { unit: '%' });
  gauge('wait', 'THE WAIT', 'First appointments come sooner.', 'DAYS TO FIRST APPOINTMENT · BEFORE', 'DAYS TO FIRST APPOINTMENT · NOW', w0, w1, sc(0, 25, 5, 5), 'The new booking system helped.', ['Waiting time is the access measure.', 'It used to be 19 days.', 'It is now 11 days.']);
  cmp('vax', 'THE COVERAGE', 'Vaccination beats the goal.', { heading: 'REGIONAL GOAL', metrics: [{ label: 'COVERAGE', value: goal }] }, { heading: 'ACHIEVED', metrics: [{ label: 'COVERAGE', value: vac }] }, 'Coverage is above the regional goal.', ['The goal was set regionally.', 'The goal is 90%.', 'Actual coverage reached 93%.']);
  big('digital', 'THE SHIFT', 'Digital visits grow.', 'DIGITAL SHARE OF CONSULTATIONS', dig, 'Patients are choosing remote visits.', { label: 'BOOKING SATISFACTION', value: sat }, ['More consultations are digital.', 'They make up 28% of the total.', 'Satisfaction with booking is 87%.']);
  close('Care is easier to reach,', 'and more people are protected.', 'more people are protected', 'Access.', 'MERIDIAN HEALTH · FICTIONAL');
  return { id: 'meridian-bulletin', title: 'Meridian opens access', accent: 'access' };
});
build('05-text-heavy.docx', ({ F, open, close, gauge, big, pillars }) => {
  open('Improvement is a habit.', 'It starts with teachers.', 'teachers', 'Lakeside.', 'LAKESIDE SCHOOLS · FICTIONAL');
  const a = F('meet-before', '61%', 61, { unit: '%' }), b = F('meet-now', '74%', 74, { unit: '%' }), min = F('minutes', '12 minutes', 12), app = F('app', '15%', 15, { unit: '%' });
  gauge('standard', 'THE RESULT', 'More pupils meet the standard.', 'MEETING THE STANDARD · BEFORE', 'MEETING THE STANDARD · NOW', a, b, sc(0, 100, 25, 5, '%'), 'Coaching teachers paid off.', ['Pupil attainment is the result that matters.', 'It was 61%.', 'It is now 74%.']);
  big('time', 'THE ROUTINE', 'Routines give time back.', 'LEARNING TIME RECOVERED PER DAY', min, 'Calmer starts and transitions.', { label: 'APP USED BY', value: app }, ['Predictable routines save time.', 'About 12 minutes are recovered each day.', 'A costly homework app was used by only 15% of pupils.']);
  pillars('lessons', 'THE LESSONS', 'Three lessons.', 'HOW SCHOOLS IMPROVE', [['TEACHERS', ['Coach them, one change at a time']], ['ROUTINES', ['Predictable starts and transitions']], ['FAMILIES', ['Positive contact first']]], ['The leaders drew three lessons.', 'Teachers come first.', 'Routines come second.', 'Families are partners.', 'Together they explain the improvement.']);
  close('Steady attention wins,', 'more than a single bold move.', 'single bold move', 'Simple.', 'LAKESIDE SCHOOLS · FICTIONAL');
  return { id: 'lakeside-essay', title: 'Lakeside schools improve', accent: 'improve' };
});
build('06-tables.docx', ({ F, open, close, big, gauge, bars, cmp }) => {
  open('Three tariffs.', 'Fewer complaints.', 'Fewer complaints', 'Tariffs.', 'PINEWOOD ENERGY · FICTIONAL');
  const st = F('std-price', '24.5', 24.5), fx = F('fix-price', '22.0', 22), gr = F('green-price', '26.8', 26.8, {}), sc1 = F('std-cust', '41,200', 41200), gc = F('green-cust', '9,300', 9300), c1 = F('c-q1', '312', 312), c3 = F('c-q3', '204', 204), fall = F('c-fall', '35%', 35, { unit: '%' });
  bars('prices', 'THE PRICES', 'Unit prices differ.', [{ label: 'STANDARD', value: st, tone: 'secondary' }, { label: 'FIXED', value: fx, tone: 'positive' }, { label: 'GREEN', value: gr, tone: 'accent' }], sc(0, 30, 10, 10), 'FIXED.', 'The fixed tariff has the lowest price.', ['Unit prices in cents.', 'Standard is 24.5 and fixed is 22.0.', 'Green is 26.8.', 'Fixed is the cheapest per unit.']);
  cmp('base', 'THE BASE', 'Standard is the big one.', { heading: 'STANDARD', metrics: [{ label: 'UNIT PRICE', value: st }, { label: 'CUSTOMERS', value: sc1 }] }, { heading: 'GREEN', metrics: [{ label: 'UNIT PRICE', value: gr }, { label: 'CUSTOMERS', value: gc }] }, 'Standard has far more customers than green.', ['Two tariffs side by side.', 'Standard: 24.5 and 41,200 customers.', 'Green: 26.8 and 9,300 customers.']);
  gauge('complaints', 'THE COMPLAINTS', 'Complaints fall.', 'COMPLAINTS · FIRST QUARTER', 'COMPLAINTS · THIRD QUARTER', c1, c3, sc(0, 400, 100, 50), 'Resolution is getting faster.', ['Complaints are a service measure.', 'The first quarter had 312.', 'The third quarter had 204.']);
  big('fall', 'THE TREND', 'A third fewer.', 'FALL IN COMPLAINTS', fall, 'Between the first and third quarter.', null, ['The fall is the headline.', 'Complaints fell by 35%.', 'Service is improving.']);
  close('Prices vary,', 'and service is improving.', 'service is improving', 'Better.', 'PINEWOOD ENERGY · FICTIONAL');
  return { id: 'pinewood-tariffs', title: 'Pinewood tariffs and service', accent: 'service' };
});
build('07-financial-report.md', ({ F, open, close, big, gauge, bars, cmp }) => {
  open('Revenue is up.', 'Margins are up too.', 'Margins are up too', 'Crestline.', 'CRESTLINE CAPITAL · FICTIONAL');
  const rev = F('rev', '$128.4M', 128.4), prev = F('rev-prev', '$117.2M', 117.2), g = F('rev-growth', '9.6%', 9.6, { unit: '%' }), m0 = F('gm-before', '39.8%', 39.8, { unit: '%' }), m1 = F('gm-now', '41.3%', 41.3, { unit: '%' });
  const cr = F('seg-consumer', '61.2', 61.2, { near: 'Consumer' }), br = F('seg-business', '47.5', 47.5), pr = F('seg-public', '19.7', 19.7, { near: 'Public' }), cg = F('g-consumer', '11.4%', 11.4, { unit: '%' }), bg = F('g-business', '8.1%', 8.1, { unit: '%' });
  big('revenue', 'THE QUARTER', 'Revenue grows.', 'NET REVENUE', rev, 'Up on the same quarter last year.', { label: 'LAST YEAR', value: prev }, ['Revenue is the headline.', 'Net revenue was $128.4 million.', 'The same quarter last year was $117.2 million.']);
  gauge('margin', 'THE MARGIN', 'Gross margin improves.', 'GROSS MARGIN · LAST YEAR', 'GROSS MARGIN · NOW', m0, m1, sc(30, 50, 10, 5, '%'), 'Better mix lifts the margin.', ['Margin shows profitability.', 'It was 39.8% last year.', 'It is now 41.3%.']);
  bars('segments', 'THE SEGMENTS', 'Consumer leads.', [{ label: 'CONSUMER', value: cr, tone: 'accent' }, { label: 'BUSINESS', value: br, tone: 'secondary' }, { label: 'PUBLIC', value: pr, tone: 'secondary' }], sc(0, 80, 20, 20), 'CONSUMER.', 'Consumer is the largest segment.', ['Revenue by segment, in millions of dollars.', 'Consumer: 61.2. Business: 47.5.', 'Public: 19.7.', 'Consumer is the largest.']);
  cmp('growth', 'THE GROWTH', 'Consumer grows faster.', { heading: 'CONSUMER', metrics: [{ label: 'GROWTH', value: cg }] }, { heading: 'BUSINESS', metrics: [{ label: 'GROWTH', value: bg }] }, 'Consumer is growing faster than business.', ['Growth rates compared.', 'Consumer grew 11.4%.', 'Business grew 8.1%.']);
  close('Revenue and margin both rose,', 'a solid quarter.', 'solid quarter', 'Solid.', 'CRESTLINE CAPITAL · FICTIONAL');
  void g; return { id: 'crestline-quarter', title: 'Crestline has a solid quarter', accent: 'solid' };
});
build('08-marketing-case.txt', ({ F, open, close, big, gauge, cmp, strike }) => {
  open('A loyalty app,', 'relaunched with one simple offer.', 'one simple offer', 'Spark.', 'SPARK COFFEE · FICTIONAL');
  const mem = F('members', '120,000', 120000), v1 = F('visits-members', '2.3', 2.3), v0 = F('visits-non', '1.4', 1.4), e0 = F('expiry-before', '14', 14), e1 = F('expiry-now', '30', 30), open9 = F('open-rate', '9%', 9, { unit: '%' });
  big('members', 'THE SIGNUPS', 'Members flood in.', 'NEW MEMBERS IN EIGHT WEEKS', mem, 'Far more than the team forecast.', null, ['The app launch beat the forecast.', 'It gained 120,000 new members.', 'That was far above plan.']);
  cmp('visits', 'THE VISITS', 'Members visit more.', { heading: 'NON-MEMBERS', metrics: [{ label: 'VISITS A WEEK', value: v0 }] }, { heading: 'MEMBERS', metrics: [{ label: 'VISITS A WEEK', value: v1 }] }, 'Members visit far more often.', ['Visits per week compared.', 'Non-members visit 1.4 times.', 'Members visit 2.3 times.']);
  gauge('expiry', 'THE FIX', 'The free drink lasts longer.', 'DAYS TO USE A FREE DRINK · BEFORE', 'DAYS TO USE A FREE DRINK · NOW', e0, e1, sc(0, 40, 10, 5), 'Members said it expired too fast.', ['Members complained about expiry.', 'It was 14 days.', 'The team extended it to 30 days.']);
  strike('lesson', 'THE LESSON', "DON'T RELY ON", 'EMAIL.', { lead: 'Keep the ', accent: 'offer simple.' }, [{ head: 'OFFER', text: 'A free drink after every seventh purchase.' }, { head: 'MESSAGE', text: 'Your seventh is on us beat Join the club.' }, { head: 'FIX', text: 'Give members longer to use rewards.' }], ['Keep the offer simple', 'Test two messages', 'Extend the expiry'], ['Email open rates were only 9%.', 'The sub line states the lesson.', 'Three moves worked.', 'This is the checklist.']);
  close('A simple offer won members,', 'and fixes kept them.', 'fixes kept them', 'Simple.', 'SPARK COFFEE · FICTIONAL');
  void open9; return { id: 'spark-relaunch', title: 'Spark wins its members', accent: 'wins' };
});
build('09-hr-case.docx', ({ F, open, close, gauge, bars, big, cmp }) => {
  open('People were leaving.', 'The company chose to act.', 'chose to act', 'Tidewater.', 'TIDEWATER LABS · FICTIONAL');
  const a0 = F('attr-before', '18%', 18, { unit: '%' }), a1 = F('attr-now', '13%', 13, { unit: '%' }), r1 = F('r-growth', '41%', 41, { unit: '%' }), r2 = F('r-pay', '27%', 27, { unit: '%' }), r3 = F('r-mgr', '19%', 19, { unit: '%' }), r4 = F('r-other', '13%', 13, { unit: '%', near: 'other reasons' });
  const e0 = F('eng-before', '6.8', 6.8), e1 = F('eng-now', '7.4', 7.4), cost = F('cost', '$1.9 million', 1.9), avoid = F('avoid', '$3.4 million', 3.4);
  gauge('attrition', 'THE PROBLEM', 'Attrition falls.', 'ATTRITION · LAST YEAR', 'ATTRITION · NOW', a0, a1, sc(0, 20, 5, 5, '%'), 'The actions are working.', ['Attrition was the problem.', 'It reached 18% last year.', 'It has now fallen to 13%.']);
  bars('reasons', 'THE REASONS', 'Why people left.', [{ label: 'GROWTH', value: r1, tone: 'negative' }, { label: 'PAY', value: r2, tone: 'secondary' }, { label: 'MANAGER', value: r3, tone: 'secondary' }, { label: 'OTHER', value: r4, tone: 'secondary' }], sc(0, 50, 10, 10), 'GROWTH.', 'Career growth was the top reason.', ['Exit interviews gave the reasons.', 'Growth: 41%. Pay: 27%.', 'Manager: 19%. Other: 13%.', 'Career growth was cited most.']);
  cmp('engagement', 'THE MOOD', 'Engagement rises.', { heading: 'BEFORE', metrics: [{ label: 'ENGAGEMENT SCORE', value: e0 }] }, { heading: 'NOW', metrics: [{ label: 'ENGAGEMENT SCORE', value: e1 }] }, 'Engagement scores improved.', ['Engagement is scored out of ten.', 'It was 6.8.', 'It is now 7.4.']);
  big('cost', 'THE COST', 'It paid for itself.', 'PROGRAMME COST', cost, 'Less than replacing leavers would have cost.', { label: 'REPLACEMENT COST', value: avoid }, ['The programme had a cost.', 'It cost $1.9 million.', 'Replacing leavers would have cost $3.4 million.']);
  close('Visible growth kept people,', 'and the company saved money.', 'saved money', 'Retain.', 'TIDEWATER LABS · FICTIONAL');
  return { id: 'tidewater-retention', title: 'Tidewater keeps its people', accent: 'keeps' };
});
build('10-qualitative-narrative.md', ({ open, close, pillars, strike }) => {
  open('A street went quiet.', 'Then people began to meet.', 'people began to meet', 'Home.', 'A FICTIONAL STORY');
  pillars('learned', 'WHAT THEY LEARNED', 'Three things.', 'REBUILT BY THE PEOPLE WHO STAY', [['GATHER', ['Small gatherings matter']], ['WELCOME', ['Welcome is a skill']], ['PATIENCE', ['Nothing changes quickly']]], ['The residents learned three things.', 'Small gatherings matter.', 'Welcome is a skill.', 'Patience is needed.', 'Together they rebuild a place.']);
  strike('hope', 'LOOKING AHEAD', "DON'T LOSE", 'THE WARMTH.', { lead: 'Keep the ', accent: 'market friendly.' }, [{ head: 'GROW', text: 'Let the market grow slowly.' }, { head: 'WELCOME', text: 'Help newcomers feel at home.' }, { head: 'REMEMBER', text: 'Keep old friends close.' }], ['Grow slowly', 'Welcome newcomers', 'Remember old friends'], ['Growth must not cost the warmth.', 'The sub line states the hope.', 'Three promises.', 'This is the checklist.']);
  close('A place is rebuilt', 'by the people who stay.', 'people who stay', 'Stay.', 'A FICTIONAL STORY');
  return { id: 'long-walk-home', title: 'The long walk home', accent: 'walk' };
});
build('11-long-report.md', ({ F, open, close, big }) => {
  open('Many services.', 'One year of results.', 'One year of results', 'Evergreen.', 'EVERGREEN MUNICIPAL · FICTIONAL');
  const sat = F('sat', '70%', 70, { unit: '%' }), req = F('requests', '100', 100);
  big('water', 'THE SERVICE', 'Water supply reports in.', 'SATISFACTION SCORE', sat, 'From the first reporting period.', { label: 'REQUESTS COMPLETED', value: req }, ['The report covers many services.', 'The first period shows a satisfaction score of 70%.', 'It completed 100 requests.']);
  close('Many services,', 'steady progress.', 'steady progress', 'Steady.', 'EVERGREEN MUNICIPAL · FICTIONAL');
  return { id: 'evergreen-report', title: 'Evergreen services report', accent: 'services' };
});
build('12-messy-mixed.docx', ({ F, open, close, big, bars, cmp }) => {
  open('Rough notes,', 'from four depots.', 'four depots', 'Field.', 'FIELD NOTES · FICTIONAL');
  const a = F('depot-a', '1,250', 1250), b = F('depot-b', '980', 980), t = F('throughput', '8%', 8, { unit: '%' }), cost = F('cost', '$2.3M', 2.3), bud = F('budget', '$2.5M', 2.5);
  big('throughput', 'THE WEEK', 'Throughput rises.', 'THROUGHPUT THIS WEEK', t, 'Though some depots report delays.', null, ['Throughput is up.', 'The rise is 8%.', 'Some depots still report delays.']);
  bars('depots', 'THE DEPOTS', 'Depot output differs.', [{ label: 'DEPOT A', value: a, tone: 'accent' }, { label: 'DEPOT B', value: b, tone: 'secondary' }], sc(0, 1500, 500, 500), 'A LEADS.', 'Depot A moves more pallets.', ['Pallets per day by depot.', 'Depot A moves 1,250.', 'Depot B moves 980.', 'Depot A leads.']);
  cmp('cost', 'THE COST', 'Under budget.', { heading: 'BUDGET', metrics: [{ label: 'MONTHLY COST', value: bud }] }, { heading: 'ACTUAL', metrics: [{ label: 'MONTHLY COST', value: cost }] }, 'The network came in under budget.', ['Network cost for the month.', 'Budget: $2.5M.', 'Actual: $2.3M.']);
  close('Messy notes,', 'a clear picture.', 'clear picture', 'Clear.', 'FIELD NOTES · FICTIONAL');
  return { id: 'field-notes', title: 'Field notes make sense', accent: 'sense' };
});
