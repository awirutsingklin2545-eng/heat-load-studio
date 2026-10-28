const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e)); p.on('console', m => m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && errs.push(m.text()));
  const step = async (n, f) => { try { await f(); console.log('ok  ', n); } catch (e) { console.log('FAIL', n, e.message.split('\n')[0]); } };
  await p.goto((process.env.BASE || 'http://localhost:8766/'));
  await step('opens without master', () => p.waitForSelector('text=No projects yet', { timeout: 8000 }));
  await step('built-in tables self-test', async () => { await p.goto((process.env.BASE || 'http://localhost:8766/') + '#/settings'); await p.waitForSelector('text=built in (V1.25)'); await p.waitForSelector('text=pass · 30.6400 kW'); await p.click('text=Go to projects'); });
  // the master is loaded later, at the first Excel export
  await step('new project', async () => { await p.click('#newproject'); await p.waitForSelector('text=Project overview'); });
  await step('project name', async () => { const i = p.getByLabel('Project name'); await i.fill('E2E Cold Store'); await i.press('Tab'); await p.getByLabel('Engineer (Excel \'User Name\')').fill('Earn'); await p.keyboard.press('Tab'); });
  await step('open room 1', async () => { await p.click('.node.r a'); await p.waitForSelector('#sec-general'); });
  const fill = async (label, v, nth = 0) => { const i = p.getByLabel(label, { exact: true }).nth(nth); await i.fill(String(v)); await i.press('Tab'); };
  await step('fill golden room', async () => {
    await p.getByLabel('Room type').selectOption({ label: 'Cold Room' });
    await fill('Room temperature', 2); await fill('Room RH', 85); await fill('Height H', 4); await fill('Width W', 8); await fill('Length L', 10);
    await p.getByLabel('Insulation (ceiling, walls default)').selectOption({ label: 'PU' });
    for (let i = 0; i < 4; i++) await fill('Outside temperature', 35, i);
    await p.click('#adddoor-1');
    await fill('Width', 2.5, 0); await fill('Height', 3, 0); await fill('Opening time', 15, 0);
    await p.getByLabel('Protection E').first().selectOption({ label: 'Plastic curtain, cold room (0.8)' });
    await fill('RH of air coming in', 60, 0);
    await p.click('text=+ Add product');
    await p.getByLabel('Category').selectOption({ label: 'Poultry Products' }); await p.getByLabel('Product', { exact: true }).selectOption({ label: 'Chicken' });
    await fill('Temperature in', 10); await fill('Temperature out', 2); await fill('Weight in', 5); await fill('Cooling time', 24);
    await fill('Workers', 2);
  });
  await step('result = 30.64', async () => { await p.waitForFunction(() => document.querySelector('.results .big b')?.textContent === '30.64', null, { timeout: 5000 }); });
  console.log('     results:', (await p.textContent('.results .big b')), '| warnings:', await p.$$eval('.warns li', l => l.map(x => x.textContent)));
  await p.screenshot({ path: (process.env.OUT || '/tmp/') + 'v02_room.png', fullPage: true });
  await step('add floor + room', async () => {
    await p.click('text=+ Floor'); await p.locator('.flr').nth(1).locator('text=+ Room').click(); await p.waitForSelector('#sec-general');
    await p.getByLabel('Room type').selectOption({ label: 'Freezer - IQF' }); await fill('Room temperature', -35); await fill('Room RH', 90); await fill('Height H', 4); await fill('Width W', 6); await fill('Length L', 8);
    await p.getByLabel('Room name').fill('Freezer A'); await p.keyboard.press('Tab');
  });
  await step('overview summary', async () => { await p.click('text=Project overview'); await p.waitForSelector('caption:has-text("Floor 2")'); });
  await step('confirm defaults', async () => { await p.check('#confirmdefaults'); });
  await step('export xlsx asks for master once', async () => { await p.click('#exportxlsx'); const [dl] = await Promise.all([p.waitForEvent('download'), p.setInputFiles('#exportmaster', process.env.HLS_MASTER)]); await dl.saveAs((process.env.OUT || '/tmp/') + 'v02.xlsx'); console.log('     file', dl.suggestedFilename());
    const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#exportxlsx')]); console.log('     second export without asking:', dl2.suggestedFilename()); });
  await p.screenshot({ path: (process.env.OUT || '/tmp/') + 'v02_overview.png', fullPage: true });
  await step('persist after reload', async () => { await p.waitForTimeout(800); await p.reload(); await p.waitForSelector('text=Saved ✓'); await p.goto((process.env.BASE || 'http://localhost:8766/') + '#/'); await p.waitForSelector('text=E2E Cold Store'); console.log('     card:', (await p.textContent('.pcard .kpi'))); });
  await step('export .hlp + duplicate', async () => { const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Export .hlp')]); await dl.saveAs((process.env.OUT || '/tmp/') + 'v02.hlp'); await p.click('text=Duplicate'); await p.waitForSelector('text=E2E Cold Store (copy)'); });
  await step('import .hlp', async () => { await p.setInputFiles('#importfile', (process.env.OUT || '/tmp/') + 'v02.hlp'); await p.waitForSelector('text=(imported)'); });
  await step('mobile layout', async () => { await p.setViewportSize({ width: 390, height: 844 }); await p.click('.pcard a.ptitle >> nth=0'); await p.waitForSelector('text=Project overview'); const w = await p.evaluate(() => document.documentElement.scrollWidth); console.log('     scrollWidth', w); if (w > 392) throw new Error('page scrolls sideways on a phone'); await p.screenshot({ path: (process.env.OUT || '/tmp/') + 'v02_mobile.png', fullPage: false }); });
  console.log('errors', errs); await b.close();
})();
