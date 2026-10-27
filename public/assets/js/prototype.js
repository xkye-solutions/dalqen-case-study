/*
 * Dalqen interactive prototype.
 *
 * One in-memory state (S), a hash router, and an action map (ACTIONS) wired to `data-act` attributes; navigation
 * uses `data-go="/path"`. The case study drives it with `dalqen:goto` messages (see the kit's Prototype contract).
 *
 * The story order, JO-0241, is rebuilt from scratch by running its STEPS up to a scene's stop, so any chapter can
 * be shown in any order and every Try button replays cleanly. Everything resets on reload.
 */
(() => {
  'use strict';

  const D = window.DALQEN_DATA;
  const EMBEDDED = window.self !== window.top;
  const TODAY = D.today;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const S = {
    signedIn: EMBEDDED,
    me: 'admin',
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    path: '/today',
    views: { work: 'list', order: 'details' },
    filter: null,
    q: '',
    boardDept: null,
    panel: null,
    db: null,
  };

  // ------------------------------------------------------------------ helpers --

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (d) => { const [, m, dd] = d.slice(0, 10).split('-'); return `${+dd} ${MONTHS[+m - 1]}`; };
  const when = (t) => (t.length > 10 ? `${day(t)}, ${t.slice(11, 16)}` : day(t));
  const days = (d) => Math.round(Date.parse(d.slice(0, 10)) / 864e5);
  const person = (id) => D.people[id];
  const me = () => person(S.me);
  const dept = (id) => D.departments[id] || '';
  const stageName = (k) => D.stages[k].name;
  const routeOf = (o) => S.db.routes[o.route];
  const pathOf = (o) => routeOf(o).versions.find((v) => v.v === o.routeV).stages;
  const order = (ref) => S.db.orders.find((o) => o.ref === ref);
  const customer = (id) => D.customers[id];

  const av = (id, size = '') => { const p = person(id); return `<span class="av ${size}" style="--c:${p.color}" title="${esc(p.name)}" aria-hidden="true">${p.ini}</span>`; };
  const names = (ids) => ids.map((id) => person(id).name).join(', ');

  function stageDept(o) { return D.stages[o.stage].dept; }

  function status(o) {
    if (o.released) return 'Released';
    if (o.stage === 'release') return 'Ready for Pickup';
    if (!o.started) return 'Not Started';
    const last = o.artwork[o.artwork.length - 1];
    if (o.stage === 'approval' && last && last.status === 'Pending') return 'Waiting on Client Approval';
    if (o.stage === 'subcon') return 'Waiting on Subcontractor';
    return 'In Progress';
  }
  const STATUS_TONE = { 'Released': 'ok', 'Ready for Pickup': 'ok', 'Not Started': 'neutral', 'Waiting on Client Approval': 'warn', 'Waiting on Subcontractor': 'warn', 'In Progress': 'info' };
  const pill = (text, tone) => `<span class="pill ${tone}">${esc(text)}</span>`;
  const statusPill = (o, attr = '') => `<span class="pill ${STATUS_TONE[status(o)]}" ${attr}>${status(o)}</span>`;

  function responsibleText(o) {
    if (o.released) return 'Handed over';
    if (o.stage === 'release') return 'Release · anyone with release permission';
    const d = dept(stageDept(o));
    return o.crew.length ? `${d} · ${names(o.crew)}` : `${d} · unassigned`;
  }

  // What each person can see (permission key × scope, simplified to the people in this story).
  function visible(o) {
    const p = me();
    if (S.me === 'admin' || S.me === 'desk') return true;
    if (p.lead) return stageDept(o) === p.dept || (o.handoff && o.handoff.state === 'pending' && o.handoff.to === p.dept);
    return o.crew.includes(S.me);
  }

  // Filters behind Today's widgets and Work's saved views: one predicate each, so a widget's count is its drill-down.
  const FILTERS = {
    'mine':             { label: 'My queue',                   fn: (o) => !o.released && o.crew.includes(S.me) },
    'my-dept':          { label: 'My department',              fn: (o) => !o.released && stageDept(o) === me().dept },
    'incoming':         { label: 'Incoming',                   fn: (o) => !o.released && (!o.started || (o.handoff && o.handoff.state === 'pending')) },
    'unassigned':       { label: 'Unassigned',                 fn: (o) => !o.released && o.stage !== 'release' && !o.crew.length },
    'overdue':          { label: 'Overdue',                    fn: (o) => !o.released && o.due < TODAY },
    'due-soon':         { label: 'Due soon',                   fn: (o) => !o.released && o.due >= TODAY && days(o.due) - days(TODAY) <= 3 },
    'waiting-approval': { label: 'Waiting on client approval', fn: (o) => status(o) === 'Waiting on Client Approval' },
    'qc':               { label: 'QC / rework',                fn: (o) => !o.released && o.stage === 'qc' },
    'ready-pickup':     { label: 'Ready for pickup',           fn: (o) => status(o) === 'Ready for Pickup' },
    'released':         { label: 'Released',                   fn: (o) => !!o.released },
    'unpaid':           { label: 'Unpaid',                     fn: (o) => o.payment === 'Unpaid' },
  };
  const WIDGETS = [
    ['overdue', 'alert-triangle', 'danger'], ['due-soon', 'clock', 'warn'], ['waiting-approval', 'message-2-question', 'warn'],
    ['qc', 'list-check', 'info'], ['ready-pickup', 'package', 'ok'], ['unpaid', 'cash-off', 'neutral'], ['incoming', 'inbox', 'info'],
  ];

  function rowsFor(filter) {
    const q = S.q.trim().toLowerCase();
    return S.db.orders
      .filter(visible)
      .filter((o) => !filter || FILTERS[filter].fn(o))
      .filter((o) => !q || [o.ref, o.title, customer(o.customer).name, o.type].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (+!!a.released - +!!b.released) || ((b.due < TODAY && !b.released) - (a.due < TODAY && !a.released)) || a.due.localeCompare(b.due));
  }

  // ------------------------------------------------------------------ the story order --

  function act(o, group, text, by, at) { o.activity.push({ group, text, by, at }); }
  function enter(o, stage, at, by, ret = false) { o.stage = stage; o.visits.push({ stage, at, by, ret }); }
  function comment(o, c) { o.comments.push({ id: 'c' + (o.comments.length + 1), ...c }); }

  // JO-0241's path from intake to handover. Scenes stop after a named step; actions run the next steps.
  const STEPS = [
    ['create', (o) => {
      act(o, 'Creation', 'Created on Full Apparel v1 · Apparel · Basketball Uniform', 'admin', '2026-10-20 09:12');
      enter(o, 'layout', '2026-10-20 09:12', 'admin');
    }],
    ['start', (o) => {
      o.started = true; o.crew = ['layout'];
      act(o, 'Assignment', 'Assigned Layout to Paolo Reyes', 'admin', '2026-10-20 09:20');
    }],
    ['uploadV1', (o) => {
      o.artwork.push({ v: 1, status: 'Pending', by: 'layout', at: '2026-10-21 14:05', file: 'kalayaan-v1-proof.pdf', scaled: true, notes: 'Green body, white numbers front and back.' });
      act(o, 'Artwork', 'Uploaded artwork v1 for client approval', 'layout', '2026-10-21 14:05');
      enter(o, 'approval', '2026-10-21 14:05', 'layout');
    }],
    ['rejectV1', (o, d = {}) => {
      const v = o.artwork.find((a) => a.v === 1);
      Object.assign(v, { status: 'Rejected', reason: d.reason || 'Bigger numbers, and the sponsor logo moves to the back.', decidedBy: 'layout', decidedAt: '2026-10-22 10:30' });
      act(o, 'Artwork', `Client rejected v1: “${v.reason}”`, 'layout', '2026-10-22 10:30');
      enter(o, 'revision', '2026-10-22 10:30', 'layout', true);
      comment(o, { by: 'layout', at: '2026-10-22 10:35', text: 'Coach Ben replied on Messenger: bigger numbers, and the sponsor logo goes on the back. Revising now.', chip: 'v1' });
    }],
    ['uploadV2', (o) => {
      o.artwork.push({ v: 2, status: 'Pending', by: 'layout', at: '2026-10-22 16:40', file: 'kalayaan-v2-proof.pdf', scaled: true, notes: 'Numbers 10 in on the back, 4 in on the front. Sponsor logo on the back.' });
      act(o, 'Artwork', 'Uploaded artwork v2 for client approval', 'layout', '2026-10-22 16:40');
      enter(o, 'approval', '2026-10-22 16:40', 'layout');
    }],
    ['approveV2', (o) => {
      Object.assign(o.artwork.find((a) => a.v === 2), { status: 'Current Approved', decidedBy: 'layout', decidedAt: '2026-10-23 11:15' });
      act(o, 'Artwork', 'Client approved v2 · now the Current Approved version', 'layout', '2026-10-23 11:15');
      enter(o, 'document', '2026-10-23 11:15', 'layout');
    }],
    ['documentDone', (o) => {
      o.files.push({ name: 'kalayaan-production-doc.pdf', role: 'Production', size: '2.4 MB', by: 'layout', at: '2026-10-23 17:05' });
      act(o, 'Route & stage', 'Moved Document → Sizing', 'layout', '2026-10-23 17:05');
      enter(o, 'sizing', '2026-10-23 17:05', 'layout');
    }],
    ['requestPrinting', (o) => {
      o.handoff = { to: 'printing', from: 'sizing', by: 'layout', at: '2026-10-24 10:10', state: 'pending' };
      act(o, 'Route & stage', 'Requested handoff Sizing → Printing', 'layout', '2026-10-24 10:10');
      comment(o, { by: 'printlead', at: '2026-10-24 11:05', text: '@Paolo Reyes the lineup has two #12s. Is that right?', mentions: ['layout'] });
      comment(o, { by: 'layout', at: '2026-10-24 11:20', text: 'Yes, the Ignacio twins. Both confirmed with Coach Ben.', replyTo: 'c2' });
    }],
    ['acceptPrinting', (o, d = {}) => {
      const crew = d.crew && d.crew.length >= 2 ? d.crew : ['printcrew', 'print2'];
      o.handoff = null; o.crew = crew;
      act(o, 'Route & stage', 'Printing accepted the handoff · Sizing → Printing', 'printlead', '2026-10-24 13:20');
      act(o, 'Assignment', `Printing crew: ${names(crew)}`, 'printlead', '2026-10-24 13:20');
      enter(o, 'printing', '2026-10-24 13:20', 'printlead');
    }],
    ['printingTalk', (o) => {
      comment(o, { by: 'printcrew', at: '2026-10-25 09:10', text: 'Printing starts after lunch. @Ana Villanueva heads-up: 20 sets come to Heat Press tomorrow.', mentions: ['press'], chip: 'v2' });
    }],
    ['toHeatPress', (o) => {
      act(o, 'Route & stage', 'Heat Press accepted the handoff · Printing → Heat Press', 'press', '2026-10-25 17:30');
      o.crew = ['press', 'print2']; enter(o, 'heatpress', '2026-10-25 17:30', 'press');
    }],
    ['toSewing', (o) => {
      act(o, 'Route & stage', 'Sewing accepted the handoff · Heat Press → Sewing', 'sew', '2026-10-26 11:00');
      o.crew = ['sew']; enter(o, 'sewing', '2026-10-26 11:00', 'sew');
    }],
    ['toQc', (o) => {
      act(o, 'Route & stage', 'Printing accepted the handoff · Sewing → Overall QC', 'printlead', '2026-10-26 17:15');
      o.crew = ['printcrew', 'print2']; enter(o, 'qc', '2026-10-26 17:15', 'printlead');
    }],
    ['qcRecorded', (o) => {
      o.lineup.forEach((it) => { if (it.n !== 7) it.qc.push({ result: 'Pass', by: 'printcrew', at: '2026-10-27 09:40' }); });
      act(o, 'QC', 'Recorded Pass for 19 of 20 lineup items', 'printcrew', '2026-10-27 09:40');
    }],
    ['qcFail7', (o, d = {}) => {
      const issue = d.issue || 'Number 7 pressed off-centre on the back.';
      o.lineup[6].qc.push({ result: 'Fail', issue, by: 'printcrew', at: '2026-10-27 09:44' });
      act(o, 'QC', `Item 7 (Dizon #7) failed: “${issue}”`, 'printcrew', '2026-10-27 09:44');
    }],
    ['recheckPassed', (o) => {
      o.lineup[6].qc.push({ result: 'Pass', by: 'printcrew', at: '2026-10-27 14:10' });
      act(o, 'QC', 'Item 7 rechecked: Pass · every item passes', 'printcrew', '2026-10-27 14:10');
      o.crew = []; enter(o, 'release', '2026-10-27 14:10', 'printcrew');
    }],
    ['released', (o, d = {}) => {
      o.payment = d.payment || o.payment;
      o.released = { to: d.receivedBy, by: S.me, at: '2026-10-27 17:30', notes: d.notes || '' };
      act(o, 'Release', `Released to ${d.receivedBy} · payment ${o.payment}`, S.me, '2026-10-27 17:30');
    }],
  ];
  const stepIndex = (name) => STEPS.findIndex(([n]) => n === name);

  function storyOrder() {
    return {
      ref: 'JO-0241', title: 'Basketball uniforms, 20 players', customer: 'kalayaan', type: 'Basketball Uniform', category: 'Apparel',
      route: 'full-apparel', routeV: 1, stage: 'layout', started: false, created: '2026-10-20', due: '2026-11-05', priority: 'Normal',
      payment: 'Partial', notes: 'Club colours: green and white. Sponsor: Kalayaan Hardware.', crew: [], handoff: null,
      artwork: [], lineup: clone(D.lineup), sizes: { S: 3, M: 8, L: 6, XL: 3 }, comments: [], activity: [], files: [], visits: [], released: null,
    };
  }

  function seedOrder(s) {
    const stagesOf = D.routes[s.route].versions[0].stages;
    const o = {
      ...clone(s), category: D.orderTypes[s.type].category, routeV: 1, started: !s.notStarted, notes: '', comments: [], activity: [], files: [],
      lineup: [], sizes: {}, artwork: [{ v: 1, status: s.pendingArtwork ? 'Pending' : 'Current Approved', by: 'layout', at: s.created + ' 15:00', file: `${s.ref.toLowerCase()}-v1-proof.pdf`, scaled: true }],
      handoff: s.handoff ? { to: s.handoff, from: s.stage, by: 'layout', at: '2026-10-26 10:45', state: 'pending' } : null,
      visits: stagesOf.slice(0, stagesOf.indexOf(s.stage) + 1).map((st) => ({ stage: st, at: s.created, by: 'admin', ret: false })),
      released: s.released || null,
    };
    act(o, 'Creation', `Created on ${D.routes[s.route].name} v1`, 'admin', s.created + ' 09:00');
    return o;
  }

  // Rebuild everything, with JO-0241 brought up to the scene's stop (or absent at intake).
  function applyScene(name) {
    const stop = D.scenes[name];
    S.db = { orders: D.orders.map(seedOrder), routes: clone(D.routes), inbox: clone(D.inbox), drafts: {} };
    if (stop !== 'none') S.db.orders.push(runSteps(storyOrder(), stop));
  }

  function runSteps(o, until, data = {}) {
    for (const [n, fn] of STEPS.slice(0, stepIndex(until) + 1)) fn(o, data[n]);
    return o;
  }

  // ------------------------------------------------------------------ router --

  function nav(path, view) {
    if (view) S.views[path.startsWith('/work/') ? 'order' : 'work'] = view;
    if (location.hash !== '#' + path) location.hash = path; else render();
  }
  window.addEventListener('hashchange', () => { S.path = location.hash.slice(1) || '/today'; S.panel = null; render(); });

  const SCREENS = [
    [/^\/today$/, () => today()],
    [/^\/work$/, () => work()],
    [/^\/work\/new$/, () => newOrder()],
    [/^\/work\/([\w-]+)$/, (ref) => (order(ref) ? orderPage(order(ref)) : notFound())],
    [/^\/inbox$/, () => inboxPage()],
    [/^\/customers$/, () => customers()],
    [/^\/customers\/(\w+)$/, (id) => (customer(id) ? customerPage(id) : notFound())],
    [/^\/routes$/, () => placeholder('Routes')],
    [/^\/routes\/([\w-]+)$/, () => placeholder('Route builder')],
    [/^\/admin$/, () => admin()],
  ];

  // ------------------------------------------------------------------ shell --

  const NAV = [['/today', 'sun', 'Today'], ['/work', 'list-details', 'Work'], ['/inbox', 'inbox', 'Inbox'], ['/customers', 'users', 'Customers'], ['/routes', 'route', 'Routes'], ['/admin', 'settings', 'Administration']];

  function shell(main) {
    const unread = myInbox().filter((i) => i.unread).length;
    const section = '/' + S.path.split('/')[1];
    return `<div class="app">
      <aside class="side">
        <div class="org"><img src="assets/brand/dalqen-symbol-color.svg" alt="" width="28" height="28" /><div><strong>${D.org}</strong><span>Dalqen workspace</span></div></div>
        <button class="btn primary new" data-go="/work/new"><i class="ti ti-plus" aria-hidden="true"></i>New Job Order</button>
        <nav aria-label="Main">${NAV.map(([p, i, l]) => `<a href="#${p}" data-go="${p}" ${section === p ? 'aria-current="page"' : ''}><i class="ti ti-${i}" aria-hidden="true"></i><span>${l}</span>${p === '/inbox' && unread ? `<span class="count">${unread}</span>` : ''}</a>`).join('')}</nav>
        ${EMBEDDED ? '' : '<a class="back" href="./"><i class="ti ti-arrow-left" aria-hidden="true"></i>Back to case study</a>'}
      </aside>
      <div class="col">
        <header class="top">
          <form class="search" data-form="search" role="search"><i class="ti ti-search" aria-hidden="true"></i><input name="q" value="${esc(S.q)}" placeholder="Search reference, customer, title" aria-label="Search Job Orders" /></form>
          <div class="top-right">
            <button class="icon-btn" data-act="theme" aria-label="Switch to ${S.theme === 'dark' ? 'light' : 'dark'} theme"><i class="ti ti-${S.theme === 'dark' ? 'sun' : 'moon'}" aria-hidden="true"></i></button>
            <button class="icon-btn" data-act="bell" aria-label="Inbox${unread ? `, ${unread} unread` : ''}" aria-expanded="${S.panel === 'inbox'}"><i class="ti ti-bell" aria-hidden="true"></i>${unread ? `<span class="dot">${unread}</span>` : ''}</button>
            <div class="me" data-me="${S.me}">${av(S.me)}<div><strong>${esc(me().name)}</strong><span>${esc(me().role)}</span></div></div>
          </div>
        </header>
        <main id="main">${main}</main>
      </div>
      ${S.panel === 'inbox' ? `<aside class="panel" aria-label="Inbox"><div class="panel-head"><h2>Inbox</h2><button class="icon-btn" data-act="closePanel" aria-label="Close inbox"><i class="ti ti-x" aria-hidden="true"></i></button></div>${inboxList()}<a class="panel-foot" href="#/inbox" data-go="/inbox">Open the full inbox</a></aside>` : ''}
    </div>`;
  }

  const pageHead = (title, sub = '', right = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
  const placeholder = (t) => pageHead(esc(t), 'Coming up in this prototype.');
  const notFound = () => `<div class="empty"><i class="ti ti-map-question" aria-hidden="true"></i><h1>Not found</h1><p>That page isn’t in this workspace.</p><a class="btn" href="#/today" data-go="/today">Go to Today</a></div>`;

  function signIn() {
    return `<div class="signin"><form data-form="signin" class="card signin-card">
      <img src="assets/brand/dalqen-horizontal-color.svg" alt="Dalqen" width="174" height="39" class="signin-logo" />
      <h1>Sign in to ${D.org}</h1>
      <p class="muted">Accounts are created by your administrator. There’s no sign-up.</p>
      <label>Email<input type="email" name="email" value="rhea@example.com" autocomplete="username" /></label>
      <label>Password<input type="password" name="password" value="demo-password" autocomplete="current-password" /></label>
      <button class="btn primary" type="submit">Sign in</button>
      <p class="note">Prototype: any details sign you in as ${esc(person('admin').name)}, the Administrator. Sample data is synthetic.</p>
      <a class="back" href="./"><i class="ti ti-arrow-left" aria-hidden="true"></i>Back to case study</a>
    </form></div>`;
  }

  // ------------------------------------------------------------------ Today --

  function today() {
    const p = me();
    const tiered = S.me === 'admin' || S.me === 'desk' || p.lead;
    const scope = S.me === 'admin' || S.me === 'desk' ? `everything at ${D.org}` : p.lead ? `${dept(p.dept)}’s work` : 'your work';
    const head = pageHead(`Good morning, ${esc(p.name.split(' ')[0])}`, `${day(TODAY)} · showing ${scope}`);
    if (!tiered) {
      const rows = rowsFor('mine');
      return head + `<section class="card"><h2 class="card-title">My work</h2>${table(rows)}</section><section class="card"><h2 class="card-title">Inbox</h2>${inboxList()}</section>`;
    }
    const widgets = WIDGETS.map(([k, icon, tone]) => {
      const n = rowsFor(k).length;
      return `<button class="widget ${tone}" data-widget="${k}" data-act="drill" data-filter="${k}"><i class="ti ti-${icon}" aria-hidden="true"></i><span class="w-label">${FILTERS[k].label}</span><span class="w-count mono" data-count>${n}</span></button>`;
    }).join('');
    const active = S.db.orders.filter(visible).filter((o) => !o.released);
    const spread = ['layout', 'approval', 'revision', 'document', 'sizing', 'printing', 'heatpress', 'sewing', 'subcon', 'finishing', 'qc', 'release']
      .map((k) => [k, active.filter((o) => o.stage === k).length]).filter(([, n]) => n);
    const attention = rowsFor(null).filter((o) => FILTERS.overdue.fn(o) || FILTERS['due-soon'].fn(o) || o.priority === 'Urgent').slice(0, 5);
    return head + `<div class="widgets">${widgets}</div>
      <section class="card"><h2 class="card-title">Where work is</h2><div class="spread">${spread.map(([k, n]) => `<div class="spread-cell" style="flex:${n}"><span class="mono">${n}</span><span>${stageName(k)}</span></div>`).join('')}</div></section>
      <section class="card"><h2 class="card-title">Needs attention</h2>${table(attention)}</section>`;
  }

  // ------------------------------------------------------------------ Work --

  function table(rows) {
    if (!rows.length) return `<p class="empty-row">Nothing here. Work that matches will show up as it arrives.</p>`;
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Reference</th><th>Job Order</th><th>Stage</th><th>Responsible</th><th>Due</th><th>Payment</th><th>Status</th></tr></thead><tbody>${rows.map((o) => {
      const late = !o.released && o.due < TODAY;
      return `<tr data-ref="${o.ref}" data-go="/work/${o.ref}" tabindex="0">
        <td class="mono ref">${o.ref}</td>
        <td><strong>${esc(o.title)}</strong><span class="sub">${esc(customer(o.customer).name)}${o.priority === 'Urgent' ? ` · ${pill('Urgent', 'danger')}` : ''}</span></td>
        <td>${stageName(o.stage)}${o.handoff && o.handoff.state === 'pending' ? `<span class="sub">Handoff to ${dept(o.handoff.to)} pending</span>` : ''}</td>
        <td class="resp">${esc(responsibleText(o))}</td>
        <td class="mono ${late ? 'late' : ''}">${day(o.due)}${late ? '<span class="sub">Overdue</span>' : ''}</td>
        <td>${o.payment}</td>
        <td>${statusPill(o)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function work() {
    const view = S.views.work;
    const tabs = `<div class="seg" role="tablist" aria-label="Work view">${[['list', 'list', 'List'], ['board', 'layout-kanban', 'Board']].map(([v, i, l]) => `<button role="tab" aria-selected="${view === v}" data-act="workView" data-view="${v}"><i class="ti ti-${i}" aria-hidden="true"></i>${l}</button>`).join('')}</div>`;
    const head = pageHead('Work', 'One list of every Job Order you can see. List and Board show the same work.', tabs);
    if (view === 'board') return head + board();
    const views = Object.entries(FILTERS).map(([k, f]) => `<button class="chip" aria-pressed="${S.filter === k}" data-act="drill" data-filter="${k}">${f.label}</button>`).join('');
    const rows = rowsFor(S.filter);
    return head + `<div class="views" aria-label="Saved views"><button class="chip" aria-pressed="${!S.filter}" data-act="drill" data-filter="">All</button>${views}</div>
      <p class="count-line">${rows.length} Job Order${rows.length === 1 ? '' : 's'}${S.filter ? ` · ${FILTERS[S.filter].label}` : ''}${S.q ? ` · matching “${esc(S.q)}”` : ''}</p>
      <section class="card flush">${table(rows)}</section>`;
  }

  function board() {
    const d = S.boardDept || (me().dept === 'admin' ? 'printing' : me().dept);
    const mine = S.db.orders.filter((o) => !o.released);
    const pendingTo = (o) => o.handoff && o.handoff.state === 'pending';
    const cols = {
      incoming: mine.filter((o) => (pendingTo(o) && o.handoff.to === d) || (!o.started && stageDept(o) === d)),
      active: mine.filter((o) => o.started && stageDept(o) === d && !pendingTo(o)),
      waiting: mine.filter((o) => o.started && stageDept(o) === d && pendingTo(o)),
    };
    const label = { incoming: 'Incoming', active: 'Active', waiting: 'Waiting for Handoff' };
    const picker = `<label class="dept-pick">Department <select data-change="boardDept">${['layout', 'printing', 'heatpress', 'sewing', 'admin'].map((k) => `<option value="${k}" ${k === d ? 'selected' : ''}>${dept(k)}</option>`).join('')}</select></label>`;
    return `<div class="board-bar">${picker}<span class="muted">Tiles open the Job Order. Handoffs are accepted there, after checking the package.</span></div>
      <div class="board">${Object.keys(cols).map((k) => `<section class="column" data-column="${k}"><h2>${label[k]} <span class="mono">${cols[k].length}</span></h2>${cols[k].map(tile).join('') || '<p class="empty-row">Nothing here.</p>'}</section>`).join('')}</div>`;
  }

  function tile(o) {
    return `<a class="tile" href="#/work/${o.ref}" data-go="/work/${o.ref}" data-ref="${o.ref}">
      <span class="tile-top"><span class="mono">${o.ref}</span>${statusPill(o)}</span>
      <strong>${esc(o.title)}</strong><span class="sub">${esc(customer(o.customer).name)}</span>
      <span class="tile-foot"><span>${stageName(o.stage)}</span><span class="mono ${o.due < TODAY ? 'late' : ''}">Due ${day(o.due)}</span></span>
      ${o.crew.length ? `<span class="crew">${o.crew.map((id) => av(id, 'sm')).join('')}</span>` : ''}</a>`;
  }

  // ------------------------------------------------------------------ New Job Order --

  function nextRef() {
    if (!order('JO-0241')) return 'JO-0241';
    return 'JO-0' + (Math.max(...S.db.orders.map((o) => +o.ref.slice(3))) + 1);
  }

  function draft() {
    if (!S.draft) S.draft = { customer: 'kalayaan', title: 'Basketball uniforms, 20 players', due: '2026-11-05', type: 'Basketball Uniform', route: 'full-apparel', priority: 'Normal', quantity: '20', notes: 'Club colours: green and white. Sponsor: Kalayaan Hardware.' };
    return S.draft;
  }

  function newOrder() {
    const d = draft();
    const allowed = D.orderTypes[d.type].routes;
    if (!allowed.includes(d.route)) d.route = D.orderTypes[d.type].default;
    const field = (label, html, hint = '') => `<label class="field"><span>${label}</span>${html}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
    const opts = (pairs, v) => pairs.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const types = Object.entries(D.orderTypes).map(([t, x]) => [t, `${t} · ${x.category}`]);
    return `<a class="crumb" href="#/work" data-go="/work"><i class="ti ti-arrow-left" aria-hidden="true"></i>Work</a>` +
      pageHead('New Job Order', `It gets reference <span class="mono">${nextRef()}</span> and starts at the Route’s first stage.`) +
      `<form class="card form" data-form="newOrder" novalidate>
        <div class="form-grid">
          ${field('Customer', `<select name="customer">${opts(Object.entries(D.customers).map(([k, c]) => [k, c.name]), d.customer)}</select>`)}
          ${field('Title', `<input name="title" value="${esc(d.title)}" required aria-describedby="title-err" />`, '<span id="title-err" class="err" role="alert"></span>')}
          ${field('Order Type', `<select name="type" data-change="draft">${opts(types, d.type)}</select>`, `Category: ${D.orderTypes[d.type].category}`)}
          ${field('Route', `<select name="route">${opts(allowed.map((r) => [r, `${D.routes[r].name} v${D.routes[r].versions.length}${r === D.orderTypes[d.type].default ? ' · default' : ''}`]), d.route)}</select>`, allowed.length === 1 ? 'The only Route this Order Type allows.' : `${allowed.length} Routes allowed for this Order Type.`)}
          ${field('Due date', `<input name="due" type="date" value="${d.due}" required />`)}
          ${field('Priority', `<select name="priority">${opts([['Normal', 'Normal'], ['Urgent', 'Urgent']], d.priority)}</select>`)}
          ${field('Quantity <span class="muted">(optional)</span>', `<input name="quantity" inputmode="numeric" value="${esc(d.quantity)}" />`)}
          ${field('Notes <span class="muted">(optional)</span>', `<textarea name="notes" rows="2">${esc(d.notes)}</textarea>`)}
        </div>
        <p class="muted small">Sizing, the lineup, artwork, files and the first assignment happen on the Job Order.</p>
        <div class="form-actions"><a class="btn" href="#/work" data-go="/work">Cancel</a><button class="btn primary" type="submit">Create Job Order</button></div>
      </form>`;
  }

  function createOrder(form) {
    const f = Object.fromEntries(new FormData(form));
    const err = form.querySelector('#title-err');
    if (!f.title.trim()) { err.textContent = 'Give the Job Order a title.'; form.title.focus(); return; }
    const o = storyOrder();
    Object.assign(o, { ref: nextRef(), title: f.title.trim(), customer: f.customer, type: f.type, category: D.orderTypes[f.type].category, route: f.route, routeV: S.db.routes[f.route].versions.length, due: f.due, priority: f.priority, notes: f.notes });
    if (o.ref !== 'JO-0241' || f.type !== 'Basketball Uniform') { o.lineup = []; o.sizes = {}; o.payment = 'Unpaid'; }
    runSteps(o, 'create');
    o.activity[0].text = `Created on ${D.routes[o.route].name} v${o.routeV} · ${o.category} · ${o.type}`;
    S.db.orders.push(o); S.draft = null;
    nav('/work/' + o.ref, 'details');
  }

  // ------------------------------------------------------------------ Job Order --

  const TABS = [['details', 'Details'], ['artwork', 'Artwork'], ['sizing', 'Sizing & Lineup'], ['discussion', 'Discussion'], ['activity', 'Activity'], ['files', 'Files']];

  function stepper(o) {
    const path = pathOf(o).slice();
    if (o.visits.some((v) => v.stage === 'revision')) path.splice(path.indexOf('approval') + 1, 0, 'revision');
    let n = 0;
    return `<ol class="stepper" data-stepper aria-label="Stages">${path.map((k) => {
      const visits = o.visits.filter((v) => v.stage === k).length;
      const isCur = k === o.stage && !o.released;
      const ret = k === 'revision';
      const state = isCur ? 'current' : ret ? 'return' : (o.skipped || []).includes(k) ? 'skipped' : visits || (k === 'release' && o.released) ? 'done' : 'todo';
      if (!ret) n += 1;
      const mark = state === 'done' ? '<i class="ti ti-check" aria-hidden="true"></i>' : ret ? '↺' : state === 'skipped' ? '–' : n;
      const label = k === 'release' ? `Release${o.released ? ' → Released' : ''}` : stageName(k);
      const sub = ret ? 'return path' : state === 'skipped' ? 'skipped' : state === 'todo' ? 'not reached' : state === 'current' ? (D.stages[k].dept ? dept(D.stages[k].dept) : 'Handover') : 'done';
      return `<li data-stage="${k}" data-state="${state}" ${isCur ? 'aria-current="step"' : ''}><span class="mk">${mark}</span><span class="nm">${label}${visits > 1 ? ` <span class="mono visits">×${visits}</span>` : ''}</span><span class="st">${sub}</span></li>`;
    }).join('')}</ol>`;
  }

  // The one action that moves this order forward, for whoever is looking. Later tasks fill in the stages.
  function primaryAction(o) {
    if (o.released) return '';
    const fn = PRIMARY[o.stage];
    return fn ? fn(o) : '';
  }
  const PRIMARY = {};

  function orderPage(o) {
    const view = S.views.order;
    const r = routeOf(o);
    const header = `<header class="card order-head" data-header>
      <div class="oh-top"><a class="crumb" href="#/work" data-go="/work"><i class="ti ti-arrow-left" aria-hidden="true"></i>Work</a></div>
      <div class="oh-main">
        <div><div class="oh-ref"><span class="mono">${o.ref}</span>${statusPill(o, 'data-status-pill')}${o.priority === 'Urgent' ? pill('Urgent', 'danger') : `<span class="muted small">Normal</span>`}</div>
          <h1>${esc(o.title)}</h1>
          <dl class="oh-meta"><div><dt>Customer</dt><dd><a href="#/customers/${o.customer}" data-go="/customers/${o.customer}">${esc(customer(o.customer).name)}</a></dd></div><div><dt>Due</dt><dd class="mono ${!o.released && o.due < TODAY ? 'late' : ''}">${day(o.due)}</dd></div><div><dt>Order</dt><dd>${o.category} · ${esc(o.type)} · ${r.name} v${o.routeV}</dd></div></dl>
        </div>
        <div class="oh-side"><div class="resp-box" data-responsible><span class="label">${o.released ? 'Released' : 'Now at ' + stageName(o.stage)}</span><span class="resp-line">${o.crew.length ? `<span class="crew">${o.crew.map((id) => av(id, 'sm')).join('')}</span>` : ''}${esc(responsibleText(o))}</span></div><div class="primary-action">${primaryAction(o)}</div></div>
      </div>
      ${stepper(o)}
    </header>`;
    const tabs = `<div class="tabs" role="tablist" aria-label="Job Order sections">${TABS.map(([k, l]) => `<button role="tab" id="tab-${k}" data-view="${k}" aria-selected="${view === k}" aria-controls="panel-${k}" tabindex="${view === k ? 0 : -1}" data-act="tab">${l}${k === 'discussion' && o.comments.length ? ` <span class="mono tab-count">${o.comments.length}</span>` : ''}</button>`).join('')}</div>`;
    return header + tabs + `<section class="card tab-panel" role="tabpanel" id="panel-${view}" aria-labelledby="tab-${view}" data-view="${view}">${PANELS[view](o)}</section>`;
  }

  const PANELS = {
    details: (o) => `<div class="details">
      <div><h2 class="card-title">Notes</h2><p>${esc(o.notes) || '<span class="muted">No notes.</span>'}</p></div>
      <dl class="kv">
        <div><dt>Payment signal</dt><dd>${o.payment} <span class="muted small">· a manual signal, never an invoice and never a release gate</span></dd></div>
        <div><dt>Contact</dt><dd>${esc(customer(o.customer).contact)} · <span class="mono">${customer(o.customer).phone}</span> · ${customer(o.customer).channel}</dd></div>
        <div><dt>Created</dt><dd class="mono">${day(o.created)}</dd></div>
        <div><dt>Current Approved artwork</dt><dd>${(() => { const a = o.artwork.find((x) => x.status === 'Current Approved'); return a ? `v${a.v} · ${esc(a.file)}` : '<span class="muted">None yet</span>'; })()}</dd></div>
      </dl></div>`,
    artwork: (o) => `<ul class="plain">${o.artwork.map((a) => `<li data-version="${a.v}">v${a.v} · <span data-status>${a.status}</span></li>`).join('') || '<li class="muted">No artwork yet.</li>'}</ul>`,
    sizing: (o) => sizingPanel(o),
    discussion: (o) => `<ul class="plain">${o.comments.map((c) => `<li data-comment>${esc(person(c.by).name)}: ${esc(c.text)}</li>`).join('') || '<li class="muted">No comments yet.</li>'}</ul>`,
    activity: (o) => `<ul class="plain">${o.activity.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul>`,
    files: (o) => {
      const files = [...o.artwork.map((a) => ({ name: a.file, role: `Artwork v${a.v} · proof`, size: '1.1 MB', by: a.by, at: a.at })), ...o.files];
      return files.length ? `<ul class="files">${files.map((f) => `<li><i class="ti ti-file-type-pdf" aria-hidden="true"></i><span><strong>${esc(f.name)}</strong><span class="sub">${f.role} · ${f.size} · ${esc(person(f.by).name)}, ${when(f.at)}</span></span></li>`).join('')}</ul>` : '<p class="muted">No files yet.</p>';
    },
  };

  function qcText(it) {
    const last = it.qc[it.qc.length - 1];
    if (!last) return '';
    if (last.result === 'Fail') return 'Awaiting Recheck';
    return last.result;
  }

  function sizingPanel(o) {
    const sizes = Object.entries(o.sizes);
    const sizeLine = sizes.length ? `<p class="mono sizes">${sizes.map(([k, n]) => `${k} ${n}`).join(' · ')} <span class="muted">· ${sizes.reduce((t, [, n]) => t + n, 0)} pcs</span></p>` : '<p class="muted">No per-size counts.</p>';
    if (!o.lineup.length) return `<h2 class="card-title">Sizes</h2>${sizeLine}<p class="muted">No lineup on this order.</p>`;
    return `<h2 class="card-title">Sizes</h2>${sizeLine}<h2 class="card-title">Lineup <span class="muted small">${o.lineup.length} items</span></h2>
      <div class="table-wrap"><table class="table lineup"><thead><tr><th>#</th><th>Name</th><th>Number</th><th>Top</th><th>Bottom</th><th>Qty</th><th>Notes</th><th>QC</th></tr></thead><tbody>${o.lineup.map((it) => `<tr data-item="${it.n}"><td class="mono">${it.n}</td><td>${esc(it.name)}</td><td class="mono">${it.number}</td><td class="mono">${it.top}</td><td class="mono">${it.bottom}</td><td class="mono">${it.qty}</td><td>${esc(it.notes)}</td><td data-qc>${qcText(it)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ------------------------------------------------------------------ Inbox --

  function myInbox() { return S.db.inbox.filter((i) => i.to === S.me); }

  function inboxList() {
    const items = myInbox();
    if (!items.length) return '<p class="empty-row">You’re all caught up.</p>';
    return `<ul class="inbox">${items.map((i) => `<li class="${i.unread ? 'unread' : ''}"><a href="#/work/${i.ref}" data-act="openInbox" data-id="${i.id}">
      <span class="kind">${esc(i.kind)}</span><span class="mono">${i.ref}</span><span class="reason">${esc(i.reason)}</span><span class="when mono">${when(i.at)}</span>${i.unread ? '<span class="sr">Unread</span>' : ''}</a></li>`).join('')}</ul>`;
  }

  function inboxPage() {
    const unread = myInbox().filter((i) => i.unread).length;
    return pageHead('Inbox', `${unread} unread · nudges, responsibilities, exceptions and deadlines for you`, unread ? '<button class="btn" data-act="readAll">Mark all read</button>' : '') + `<section class="card flush">${inboxList()}</section>`;
  }

  // ------------------------------------------------------------------ Customers --

  function customers() {
    return pageHead('Customers', 'People and businesses who order from Monesco. No logins, no pipeline.') + `<section class="card flush"><div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th>Contact</th><th>Channel</th><th>Job Orders</th></tr></thead><tbody>${Object.entries(D.customers).map(([id, c]) => `<tr data-go="/customers/${id}" tabindex="0"><td><strong>${esc(c.name)}</strong></td><td>${esc(c.contact)}<span class="sub mono">${c.phone}</span></td><td>${c.channel}</td><td class="mono">${S.db.orders.filter((o) => o.customer === id).length}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function customerPage(id) {
    const c = customer(id);
    return `<a class="crumb" href="#/customers" data-go="/customers"><i class="ti ti-arrow-left" aria-hidden="true"></i>Customers</a>` + pageHead(esc(c.name), `${esc(c.contact)} · <span class="mono">${c.phone}</span> · ${c.channel}`) +
      `<section class="card flush"><h2 class="card-title pad">Job Order history</h2>${table(S.db.orders.filter((o) => o.customer === id))}</section>`;
  }

  // ------------------------------------------------------------------ Administration --

  function admin() {
    const sections = [['users-group', 'Members & roles', 'Invite people, assign a seeded role and a Department.'], ['building', 'Departments & units', 'Layout, Printing, Heat Press, Sewing and Administration.'], ['category', 'Categories', 'Apparel, Printing, Sewing Services.'], ['tags', 'Order Types', 'Each with its allowed Routes and a default.'], ['route', 'Routes', 'Build and publish production paths.', '/routes'], ['typography', 'Labels & numbering', 'Reference format: JO-0000.'], ['message-report', 'Reason policy', 'Which actions need a recorded reason.'], ['history', 'Audit', 'Organization and security history.']];
    return pageHead('Administration', 'One hub for how Monesco runs in Dalqen.') + `<div class="admin-grid">${sections.map(([i, t, d, go]) => `<${go ? `a href="#${go}" data-go="${go}"` : 'div'} class="card admin-card"><i class="ti ti-${i}" aria-hidden="true"></i><h2>${t}</h2><p>${d}</p>${go ? '' : '<span class="muted small">Not in this prototype</span>'}</${go ? 'a' : 'div'}>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------ render & events --

  function render() {
    document.documentElement.dataset.theme = S.theme;
    const app = document.getElementById('app');
    if (!S.signedIn) { app.innerHTML = signIn(); report(); return; }
    let main = null;
    for (const [re, fn] of SCREENS) { const m = S.path.match(re); if (m) { main = fn(...m.slice(1)); break; } }
    app.innerHTML = shell(main ?? notFound());
    report();
  }

  function report() {
    if (EMBEDDED) parent.postMessage({ type: 'dalqen:status', url: S.path, theme: S.theme, href: 'prototype.html#' + S.path }, '*');
  }

  const ACTIONS = {
    theme: () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; render(); },
    bell: () => { S.panel = S.panel === 'inbox' ? null : 'inbox'; render(); },
    closePanel: () => { S.panel = null; render(); },
    drill: (el) => { S.filter = el.dataset.filter || null; nav('/work', 'list'); },
    workView: (el) => nav('/work', el.dataset.view),
    openInbox: (el) => { const i = S.db.inbox.find((x) => x.id === el.dataset.id); i.unread = false; S.panel = null; nav('/work/' + i.ref); },
    readAll: () => { myInbox().forEach((i) => { i.unread = false; }); render(); },
    tab: (el) => { S.views.order = el.dataset.view; render(); document.getElementById('tab-' + el.dataset.view)?.focus(); },
    createOrder: () => { const f = document.querySelector('form[data-form="newOrder"]'); if (f) createOrder(f); },
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a && ACTIONS[a.dataset.act]) { e.preventDefault(); ACTIONS[a.dataset.act](a); return; }
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); if (g.dataset.go === '/work') S.filter = null; nav(g.dataset.go); }
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest('[role="tab"][data-act="tab"]');
    if (t && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const i = TABS.findIndex(([k]) => k === t.dataset.view) + (e.key === 'ArrowRight' ? 1 : -1);
      ACTIONS.tab({ dataset: { view: TABS[(i + TABS.length) % TABS.length][0] } }); return;
    }
    const g = e.target.closest('tr[data-go]');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nav(g.dataset.go); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.dataset.form; if (!f) return;
    e.preventDefault();
    if (f === 'signin') { S.signedIn = true; if (!location.hash || location.hash === '#') nav('/today'); else render(); }
    if (f === 'newOrder') createOrder(e.target);
    if (f === 'search') { S.q = new FormData(e.target).get('q'); S.filter = null; nav('/work', 'list'); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.change === 'boardDept') { S.boardDept = e.target.value; render(); }
    if (e.target.dataset.change === 'draft') { Object.assign(draft(), Object.fromEntries(new FormData(e.target.form))); render(); }
  });

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.type !== 'dalqen:goto') return;
    S.signedIn = true;
    if (m.scene && D.scenes[m.scene]) applyScene(m.scene);
    if (m.as && D.people[m.as]) { S.me = m.as; S.boardDept = null; }
    if (m.theme) S.theme = m.theme;
    S.filter = null; S.q = ''; S.panel = null; if (m.scene) S.draft = null;
    if (m.path) { S.path = m.path; nav(m.path, m.view); } else render();
    if (m.action && ACTIONS[m.action]) setTimeout(() => ACTIONS[m.action](m.data || {}), 160);
  });

  applyScene('discussion');
  S.path = location.hash.slice(1) || '/today';
  if (!location.hash && S.signedIn) location.replace('#/today');
  render();
  if (EMBEDDED) parent.postMessage({ type: 'dalqen:ready' }, '*');
})();
