/*
 * Dalqen prototype: sample data. Everything here is synthetic: the people, customers and teams are fictional.
 * Monesco appears only as the organization's name. prototype.js deep-clones this on every scene, so nothing
 * here is ever mutated.
 */
window.DALQEN_DATA = (() => {
  const people = {
    admin:     { name: 'Rhea Santos',     ini: 'RS', role: 'Administrator',   dept: 'admin',     color: '#176B57' },
    layout:    { name: 'Paolo Reyes',     ini: 'PR', role: 'Layout artist',   dept: 'layout',    color: '#7A52A0' },
    printlead: { name: 'Carmela Diaz',    ini: 'CD', role: 'Printing lead',   dept: 'printing',  color: '#1C4E8A', lead: true },
    printcrew: { name: 'Jun Bautista',    ini: 'JB', role: 'Printing crew',   dept: 'printing',  color: '#A55F08' },
    print2:    { name: 'Lito Garcia',     ini: 'LG', role: 'Printing crew',   dept: 'printing',  color: '#8A5A44' },
    press:     { name: 'Ana Villanueva',  ini: 'AV', role: 'Heat Press lead', dept: 'heatpress', color: '#B7392F', lead: true },
    sew:       { name: 'Mylene Torres',   ini: 'MT', role: 'Sewing lead',     dept: 'sewing',    color: '#4D5653', lead: true },
    desk:      { name: 'Grace Mendoza',   ini: 'GM', role: 'Front desk',      dept: 'admin',     color: '#125544' },
  };

  const departments = { layout: 'Layout', printing: 'Printing', heatpress: 'Heat Press', sewing: 'Sewing', admin: 'Administration' };

  // Stage definitions. `dept` is the default responsible Department (Monesco V1 Workflow Content, D3).
  const stages = {
    layout:    { name: 'Layout',            dept: 'layout' },
    approval:  { name: 'Client’s Approval', dept: 'layout' },
    revision:  { name: 'Revision',          dept: 'layout' },
    document:  { name: 'Document',          dept: 'layout' },
    sizing:    { name: 'Sizing',            dept: 'layout' },
    printing:  { name: 'Printing',          dept: 'printing' },
    heatpress: { name: 'Heat Press',        dept: 'heatpress' },
    sewing:    { name: 'Sewing',            dept: 'sewing' },
    packing:   { name: 'Packing',           dept: 'sewing' },
    subcon:    { name: 'Subcontracting',    dept: 'admin' },
    finishing: { name: 'Finishing',         dept: 'printing' },
    qc:        { name: 'Overall QC',        dept: 'printing' },
    release:   { name: 'Release',           dept: null },
  };

  // The five starter Routes (D2). Revision is a return path, never part of the normal path.
  const routes = {
    'full-apparel': { name: 'Full Apparel',       versions: [{ v: 1, stages: ['layout', 'approval', 'document', 'sizing', 'printing', 'heatpress', 'sewing', 'qc', 'release'] }],
      // An unpublished v2 for the Routes builder: one optional stage added after Sewing.
      draft: { v: 2, stages: ['layout', 'approval', 'document', 'sizing', 'printing', 'heatpress', 'sewing', 'packing', 'qc', 'release'], optional: ['packing'] } },
    'print-press':  { name: 'Print & Press',      versions: [{ v: 1, stages: ['layout', 'approval', 'document', 'printing', 'heatpress', 'qc', 'release'] }] },
    'print-only':   { name: 'Print Only / DTF',   versions: [{ v: 1, stages: ['layout', 'approval', 'document', 'printing', 'qc', 'release'] }] },
    'subcon':       { name: 'Subcon',             versions: [{ v: 1, stages: ['layout', 'approval', 'document', 'subcon', 'qc', 'release'] }] },
    'tarpaulin':    { name: 'Tarpaulin',          versions: [{ v: 1, stages: ['layout', 'approval', 'document', 'printing', 'finishing', 'qc', 'release'] }] },
  };

  const orderTypes = {
    'Basketball Uniform': { category: 'Apparel', routes: ['full-apparel', 'subcon'], default: 'full-apparel' },
    'Volleyball Jersey':  { category: 'Apparel', routes: ['full-apparel', 'subcon'], default: 'full-apparel' },
    'Printed Shirt':      { category: 'Apparel', routes: ['print-press', 'print-only'], default: 'print-press' },
    'DTF Transfer':       { category: 'Printing', routes: ['print-only'], default: 'print-only' },
    'Tarpaulin':          { category: 'Printing', routes: ['tarpaulin'], default: 'tarpaulin' },
    'Embroidery':         { category: 'Sewing Services', routes: ['subcon'], default: 'subcon' },
  };

  const customers = {
    kalayaan: { name: 'Kalayaan Hoops Club',        contact: 'Ben Dela Cruz (coach)', channel: 'Messenger' },
    tigers:   { name: 'Tigers Volleyball Club',     contact: 'Liza Ramos',            channel: 'Messenger' },
    runners:  { name: 'Sta. Rosa Runners',          contact: 'Mark Villar',           channel: 'Facebook' },
    kusina:   { name: 'Kusina ni Lola',             contact: 'Tess Navarro',          channel: 'WhatsApp' },
    bayview:  { name: 'Bayview Dental',             contact: 'Dr. Ella Cruz',         channel: 'Email' },
    sanroque: { name: 'San Roque NHS Batch 2027',   contact: 'Jessa Lim',             channel: 'Messenger' },
    bagwis:   { name: 'Bagwis Esports',             contact: 'Kiko Salazar',          channel: 'Messenger' },
    fiesta:   { name: 'Brgy. Malaya Fiesta Committee', contact: 'Nonoy Aquino',       channel: 'Walk-in' },
    habi:     { name: 'Habi Crafts',                contact: 'Rina Flores',           channel: 'Instagram' },
    bayanihan:{ name: 'Bayanihan Credit Coop',      contact: 'Arnel Pascual',         channel: 'Email' },
    lakbay:   { name: 'Lakbay Outing Group',        contact: 'Joy Mercado',           channel: 'Messenger' },
  };

  // Other Job Orders, so Today, Work and the boards have something around JO-0241. `stage` is the current stage;
  // `crew` the assigned people; `handoff` a pending handoff from this stage to the named Department.
  const orders = [
    { ref: 'JO-0229', title: 'Outing shirts, 60 pcs',       customer: 'lakbay',   type: 'Printed Shirt', route: 'print-press', stage: 'release', released: { to: 'Joy Mercado', by: 'desk', at: '2026-10-20 16:10' }, created: '2026-10-08', due: '2026-10-20', priority: 'Normal', payment: 'Paid', crew: [] },
    { ref: 'JO-0231', title: 'Fun run singlets, 120 pcs',   customer: 'runners',  type: 'DTF Transfer',  route: 'print-only',  stage: 'qc',       created: '2026-10-12', due: '2026-10-28', priority: 'Normal', payment: 'Partial', crew: ['printcrew', 'print2'] },
    { ref: 'JO-0233', title: 'Store tarpaulin, 4 × 8 ft',   customer: 'kusina',   type: 'Tarpaulin',     route: 'tarpaulin',   stage: 'release',  created: '2026-10-14', due: '2026-10-27', priority: 'Normal', payment: 'Unpaid', crew: [] },
    { ref: 'JO-0234', title: 'Volleyball jerseys, 14 pcs',  customer: 'tigers',   type: 'Volleyball Jersey', route: 'full-apparel', stage: 'approval', pendingArtwork: true, created: '2026-10-19', due: '2026-11-06', priority: 'Normal', payment: 'Unpaid', crew: ['layout'] },
    { ref: 'JO-0235', title: 'Embroidered caps, 30 pcs',    customer: 'bayview',  type: 'Embroidery',    route: 'subcon',      stage: 'subcon',   created: '2026-10-09', due: '2026-10-24', priority: 'Urgent', payment: 'Partial', crew: ['admin'] },
    { ref: 'JO-0236', title: 'Class shirts, Grade 10',      customer: 'sanroque', type: 'Printed Shirt', route: 'print-press', stage: 'heatpress', created: '2026-10-15', due: '2026-10-29', priority: 'Urgent', payment: 'Paid', crew: ['press'] },
    { ref: 'JO-0238', title: 'Esports jerseys, 8 sets',     customer: 'bagwis',   type: 'Basketball Uniform', route: 'full-apparel', stage: 'sewing', created: '2026-10-16', due: '2026-11-03', priority: 'Normal', payment: 'Partial', crew: ['sew'] },
    { ref: 'JO-0239', title: 'Fiesta tarpaulins, 6 pcs',    customer: 'fiesta',   type: 'Tarpaulin',     route: 'tarpaulin',   stage: 'layout', notStarted: true, created: '2026-10-26', due: '2026-11-08', priority: 'Normal', payment: 'Unpaid', crew: [] },
    { ref: 'JO-0240', title: 'DTF transfers for tote bags', customer: 'habi',     type: 'DTF Transfer',  route: 'print-only',  stage: 'document', handoff: 'printing', created: '2026-10-18', due: '2026-10-30', priority: 'Normal', payment: 'Paid', crew: ['layout'] },
    { ref: 'JO-0242', title: 'Logo polo shirts, 25 pcs',    customer: 'bayanihan', type: 'Printed Shirt', route: 'print-press', stage: 'printing', created: '2026-10-21', due: '2026-11-12', priority: 'Normal', payment: 'Unpaid', crew: ['printcrew', 'print2'] },
  ];

  // JO-0241's 20-player lineup. Two #12s on purpose: the team has twins.
  const lineup = [
    ['Abad', 4, 'M', 'M'], ['Bautista', 5, 'L', 'L'], ['Castro', 6, 'M', 'M'], ['Dizon', 7, 'L', 'L'], ['Enriquez', 8, 'S', 'S'],
    ['Fernando', 9, 'XL', 'XL'], ['Gatchalian', 10, 'M', 'L'], ['Hernandez', 11, 'L', 'L'], ['Ignacio', 12, 'M', 'M'], ['Ignacio', 12, 'M', 'M'],
    ['Javier', 13, 'S', 'M'], ['Katigbak', 14, 'L', 'XL'], ['Lacson', 15, 'M', 'M'], ['Macaraeg', 21, 'XL', 'XL'], ['Navarro', 22, 'L', 'L'],
    ['Ocampo', 23, 'M', 'M'], ['Panganiban', 24, 'S', 'S'], ['Quiambao', 30, 'L', 'L'], ['Rosales', 32, 'M', 'L'], ['Salonga', 33, 'XL', 'XL'],
  ].map(([name, number, top, bottom], i) => ({ n: i + 1, name, number, top, bottom, qty: 1, notes: i === 5 ? 'Long shorts' : '', qc: [] }));

  // Scenes, in story order. Each scene is how far along its path JO-0241 has come (see STEPS in prototype.js).
  const scenes = {
    intake:     'none',
    artwork:    'uploadV1',
    handoff:    'requestPrinting',
    discussion: 'printingTalk',
    qc:         'qcRecorded',
    release:    'recheckPassed',
  };

  const inbox = [
    { id: 'i1', to: 'admin',     kind: 'deadline',       ref: 'JO-0235', reason: 'Due 24 Oct and still with the subcontractor', at: '2026-10-25 08:00', unread: true },
    { id: 'i2', to: 'admin',     kind: 'ready for release', ref: 'JO-0233', reason: 'Passed Overall QC and is ready for pickup', at: '2026-10-26 15:30', unread: true },
    { id: 'i3', to: 'admin',     kind: 'exception',      ref: 'JO-0236', reason: 'Jun skipped Sizing on a reason: “Sizes came with the order”', at: '2026-10-22 11:02', unread: false },
    { id: 'i4', to: 'layout',    kind: 'responsibility', ref: 'JO-0239', reason: 'New in Layout’s Incoming queue', at: '2026-10-26 09:20', unread: true },
    { id: 'i5', to: 'printlead', kind: 'responsibility', ref: 'JO-0240', reason: 'Layout asks Printing to accept a handoff', at: '2026-10-26 10:45', unread: true },
    { id: 'i6', to: 'printcrew', kind: 'responsibility', ref: 'JO-0231', reason: 'You’re on the crew for Overall QC', at: '2026-10-25 13:00', unread: false },
    { id: 'i7', to: 'desk',      kind: 'ready for release', ref: 'JO-0233', reason: 'Ready for pickup', at: '2026-10-26 15:30', unread: true },
  ];

  return { today: '2026-10-27', org: 'Monesco', people, departments, stages, routes, orderTypes, customers, orders, lineup, scenes, inbox };
})();
