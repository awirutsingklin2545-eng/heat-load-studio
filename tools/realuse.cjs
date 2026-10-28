// Real-use scenario: a mechanical engineer builds a cold storage project through the UI.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8766/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e)); p.on('console', m => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && errs.push(m.text()));
  const t0 = Date.now(); const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), ...a);
  await p.goto(BASE + '#/settings'); await p.setInputFiles('#masterfile', process.env.HLS_MASTER); await p.waitForSelector('text=pass · 30.6400 kW'); await p.goto(BASE + '#/'); await p.waitForSelector('text=No projects yet');
  await p.click('#newproject'); await p.waitForSelector('text=Project overview');
  const set = async (scope, label, v, nth = 0) => { const i = scope.getByLabel(label, { exact: true }).nth(nth); await i.fill(String(v)); await i.press('Tab'); };
  const pick = async (scope, label, opt, nth = 0) => scope.getByLabel(label, { exact: true }).nth(nth).selectOption({ label: opt });
  await set(p, 'Project name', 'CS-01 Cold Storage Kabinburi'); await set(p, 'Client', 'Demo Foods'); await set(p, 'Engineer (Excel \'User Name\')', 'Earn');
  const rooms = [
    { name: 'AR-01 Ante Room', type: 'Ante Room', T: 10, RH: 80, H: 5, W: 6, L: 20, ins: 'PU', walls: ['out', 2, 'out', -25],
      doors: [[1, { n: 2, W: 2.4, H: 3, min: 10, E: 'Air curtain / ASRS door (0.7)' }]], workers: 4, fork: { t: 50 } },
    { name: 'CR-01 Chill Pork', type: 'Cold Room', T: 2, RH: 85, H: 6, W: 12, L: 15, ins: 'PU', walls: ['AR-01 Ante Room', 'out', 'out', -25],
      doors: [[1, { n: 1, W: 2.5, H: 3, min: 15, E: 'Plastic curtain, cold room (0.8)' }]], workers: 4, fork: { t: 20 },
      prods: [{ cat: 'Pork', name: 'Carcass', tin: 7, tout: 2, ton: 20, h: 24 }] },
    { name: 'FZ-01 Frozen Store', type: 'Cold Room', T: -25, RH: 90, H: 8, W: 12, L: 20, ins: 'PU', walls: ['AR-01 Ante Room', 'out', 'out', 'CR-01 Chill Pork'],
      doors: [[1, { n: 1, W: 2.4, H: 3, min: 5, E: 'Plastic curtain, cold room (0.8)' }]], workers: 2, fork: { t: 30 },
      prods: [{ cat: 'Poultry Products', name: 'Chicken', tin: -18, tout: -25, ton: 30, h: 24 }] },
    { name: 'ABF-01 Blast', type: 'Freezer - Trolley', T: -35, RH: 90, H: 4, W: 5, L: 6, ins: 'PU', walls: ['AR-01 Ante Room', 'out', 'FZ-01 Frozen Store', 'out'],
      doors: [[1, { n: 1, W: 1.5, H: 2.4, min: 0, E: 'Plastic curtain, cold room (0.8)' }]], workers: 0,
      prods: [{ cat: 'Poultry Products', name: 'Chicken', tin: 5, tout: -18, ton: 4, h: 8 }] },
    { name: 'LD-01 Loading Dock', type: 'Loading Dock', T: 10, RH: 80, H: 6, W: 8, L: 30, ins: 'PU', walls: ['out', 'AR-01 Ante Room', 'out', 'out'],
      doors: [[1, { n: 4, W: 2.4, H: 3, min: 15, E: 'No protection (E = 0)' }]], workers: 6, fork: { t: 50 } },
  ];
  for (const [k, r] of rooms.entries()) {
    const prevHash = await p.evaluate(() => location.hash);
    if (k === 0) await p.click('.node.r a'); else { await p.locator('.flr').nth(0).locator('button.add', { hasText: '+ Room' }).click(); }
    await p.waitForFunction((h) => location.hash !== h && location.hash.includes('/r/') && document.querySelector('.editor')?.dataset.room === location.hash.split('/').pop(), prevHash);
    await set(p, 'Room name', r.name); await pick(p, 'Room type', r.type);
    for (const [l, v] of [['Room temperature', r.T], ['Room RH', r.RH], ['Height H', r.H], ['Width W', r.W], ['Length L', r.L]]) await set(p, l, v);
    await pick(p, 'Insulation (ceiling, walls default)', r.ins);
    for (let i = 0; i < 4; i++) {
      const v = r.walls[i];
      if (typeof v === 'number') await set(p, 'Outside temperature', v, i);
      else { const sel = p.getByLabel('Other side', { exact: true }).nth(i); const opts = await sel.locator('option').allTextContents();
        await sel.selectOption({ label: v === 'out' ? opts.find((o) => o.startsWith('Outside')) : opts.find((o) => o.startsWith(v)) }); }
    }
    let dk = 0;
    for (const [wall, d] of r.doors || []) {
      await p.click(`#adddoor-${wall}`); const c = p.locator('.door').nth(dk++);
      await set(c, 'Number of doors', d.n); await set(c, 'Width', d.W); await set(c, 'Height', d.H); await set(c, 'Opening time', d.min); await pick(c, 'Protection E', d.E); if (d.RH != null) await set(c, 'RH of air coming in', d.RH);
    }
    for (const [j, pr] of (r.prods || []).entries()) {
      await p.click('text=+ Add product'); const c = p.locator('.prod').nth(j);
      await pick(c, 'Category', pr.cat); await pick(c, 'Product', pr.name);
      await set(c, 'Temperature in', pr.tin); await set(c, 'Temperature out', pr.tout); await set(c, 'Weight in', pr.ton); await set(c, 'Cooling time', pr.h);
    }
    await set(p, 'Workers', r.workers);
    if (r.fork) await set(p, 'Product passing / day', r.fork.t);
    const req = await p.textContent('.results .big b'); const w = await p.$$eval('.warns li', l => l.map(x => `[${x.className}] ${x.textContent}`));
    log(`${r.name.padEnd(20)} required ${req} kW`, '|', (await p.$$eval('.results table.parts tr', tr => tr.slice(0, 4).map(x => x.innerText.replace(/\s+/g, ' ')).join(' ; '))));
    w.forEach((x) => log('    ', x));
  }
  // floor 2 processing
  await p.click('button.add:has-text("+ Floor")'); { const h = await p.evaluate(() => location.hash); await p.locator('.flr').nth(1).locator('button.add', { hasText: '+ Room' }).click();
    await p.waitForFunction((h0) => location.hash !== h0 && document.querySelector('.editor')?.dataset.room === location.hash.split('/').pop(), h); }
  await set(p, 'Room name', 'PR-01 Cutting'); await pick(p, 'Room type', 'Processing Area');
  for (const [l, v] of [['Room temperature', 12], ['Room RH', 75], ['Height H', 4], ['Width W', 15], ['Length L', 20]]) await set(p, l, v);
  await pick(p, 'Insulation (ceiling, walls default)', 'PU'); for (let i = 0; i < 4; i++) await set(p, 'Outside temperature', 30, i);
  await set(p, 'Workers', 20);
  for (let i = 0; i < 5; i++) { await p.click('text=+ Add equipment'); await set(p, `Equipment ${i + 1}`, 2.2); await set(p, 'Factor', 1, i); }
  await set(p, 'Air temperature', 35); await set(p, 'Air RH', 60); await set(p, 'Air volume', '2,000');
  log('PR-01 Cutting'.padEnd(20), 'required', await p.textContent('.results .big b'), 'kW | make-up', await p.locator('#sec-air .hint').innerText());
  (await p.$$eval('.warns li', l => l.map(x => x.textContent))).forEach((x) => log('    ', x));
  await p.screenshot({ path: (process.env.OUT || '/tmp/') + 'ru_room.png', fullPage: false });
  await p.click('text=Project overview'); await p.check('#confirmdefaults');
  log('PROJECT', await p.textContent('.big.inline'));
  // change outdoor design → linked walls/doors must follow
  await set(p, 'Outdoor dry bulb', 38); await p.waitForTimeout(300);
  log('PROJECT @38°C outdoor', await p.textContent('.big.inline'));
  await set(p, 'Outdoor dry bulb', 35); await p.waitForTimeout(300);
  log('PROJECT back @35°C', await p.textContent('.big.inline'));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exportxlsx')]); await dl.saveAs((process.env.OUT || '/tmp/') + 'ru.xlsx'); log('export', dl.suggestedFilename());
  await p.screenshot({ path: (process.env.OUT || '/tmp/') + 'ru_overview.png', fullPage: true });
  // tree rename focus test
  await p.locator('.node.r').first().hover(); await p.locator('.node.r').first().locator('button[title="Rename room"]').click();
  log('rename input focused:', await p.evaluate(() => document.activeElement?.classList.contains('ren')));
  await p.keyboard.press('Escape');
  await p.click('text=Project overview'); await p.click('#openreport'); await p.waitForSelector('#printpdf');
  const rtxt = await p.textContent('.report');
  log('report formulas:', rtxt.includes('q_full = 0.221'), '| total', (rtxt.match(/Total required capacity([0-9.,]+) kW/) || [])[1]);
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: (process.env.OUT || '/tmp/') + 'report.pdf', format: 'A4', printBackground: true });
  log('errors', errs); await b.close();
})();
