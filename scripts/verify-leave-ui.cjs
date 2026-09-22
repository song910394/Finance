// Run only against `npm run dev:isolated`. No production endpoint or real data.
// Optional args: path to an already installed Playwright module, Chrome executable.
const { chromium } = require(process.argv[2] || 'playwright');
const { expect } = require((process.argv[2] || 'playwright') + '/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'http://127.0.0.1:5042';
const output = path.resolve('.finance-review.local', 'leave-' + Date.now());
const financial = ({ leavePeriods, leaveRecords, ...rest }) => rest;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  const errors = [], external = [], passed = [];
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', timezoneId: 'Asia/Taipei' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    assert.equal((await (await context.request.get(origin + '/__mock-cloud/status')).json()).isolated, true);
    const cloud = origin + '/__mock-cloud/leave-ui-' + Date.now();
    let failSave = false;
    await context.route(cloud + '**', route => failSave && route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false}' }) : route.continue());
    const fixture = (await (await context.request.get(cloud)).json()).data;
    fixture.historicalStatementsThrough = '2026-07';
    await context.request.post(cloud, { data: { data: fixture } });
    await context.addInitScript(url => { if (!localStorage.getItem('google_script_url')) localStorage.setItem('google_script_url', url); }, cloud);
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));
    const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true });
    const enterLeave = async () => {
      if (page.viewportSize().width < 1024) await button('更多').click();
      await button('年假管理').click();
      await page.getByRole('heading', { name: '年假管理', exact: true }).waitFor();
    };
    const saved = () => page.getByText(/已同步 \d/).filter({ visible: true }).waitFor();
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('hs-finance:draft:v1:' + encodeURIComponent(localStorage.getItem('google_script_url')))).data);
    const stats = async expected => {
      for (let index = 0; index < expected.length; index++) await expect(page.getByTestId('leave-stat-' + index)).toHaveText(expected[index] + '小時');
    };
    const confirm = async (action, answer, pattern) => {
      const pending = page.waitForEvent('dialog');
      const running = action();
      const dialog = await pending;
      const message = dialog.message();
      if (answer) await dialog.accept(); else await dialog.dismiss();
      await running;
      assert.match(message, pattern);
    };
    const noOverflow = async () => {
      const bad = await page.evaluate(() => [...document.querySelectorAll('main, #main-content > div, body')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ element: element.tagName, width: element.clientWidth, scroll: element.scrollWidth })));
      assert.deepEqual(bad, []);
    };
    const upload = data => page.getByLabel('選擇完整備份檔案').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.goto(origin + '/Finance/'); await saved();
    await page.getByLabel('共用月份').fill('2026-08');
    await enterLeave(); await stats([120, 24, 16, 96, 80]);
    const checkbox = page.getByRole('checkbox', { name: '2026-01-06 8 小時 合成上午 已休畢', exact: true });
    await checkbox.focus(); await page.keyboard.press('Space'); await stats([120, 32, 8, 88, 80]);
    await checkbox.uncheck(); await stats([120, 24, 16, 96, 80]);
    await button('已休畢').click(); assert.equal(await page.locator('main li').count(), 1); await stats([120, 24, 16, 96, 80]);
    await button('全部').click();
    await confirm(() => button('刪除 2026-01-07 8 小時 合成下午').click(), false, /2026-01-07.*8 小時/);
    await stats([120, 24, 16, 96, 80]);
    await confirm(() => button('刪除 2026-01-07 8 小時 合成下午').click(), true, /2026-01-07.*8 小時/);
    await stats([120, 24, 8, 96, 88]);
    await saved();
    assert.deepEqual(financial(await snapshot()), financial(fixture));
    passed.push('指定計算基準、鍵盤勾選／取消、篩選不改統計、刪除確認／取消、財務不變');

    await button('新增休假').click();
    assert.equal(await page.getByLabel('休假時數', { exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('checkbox', { name: '已休畢', exact: true }).isChecked(), false);
    await page.getByLabel('休假日期', { exact: true }).fill('2026-01-06');
    await page.getByLabel('休假時數', { exact: true }).fill('8');
    await page.getByLabel('備註（選填）').fill('同日另一筆');
    await confirm(() => button('儲存休假').click(), false, /可能重複/);
    assert.equal((await snapshot()).leaveRecords.length, 2);
    await confirm(() => button('儲存休假').click(), true, /可能重複/);
    await stats([120, 24, 16, 96, 80]);
    assert.equal(new Set((await snapshot()).leaveRecords.map(item => item.id)).size, 3);
    await button('編輯 2026-01-06 8 小時 同日另一筆').click();
    await page.getByLabel('休假時數', { exact: true }).fill('7.5');
    await button('儲存休假').click();
    await stats([120, 24, 15.5, 96, 80.5]);
    assert.equal((await snapshot()).leaveRecords.find(item => item.note === '同日另一筆').hours, 7.5);

    await button('編輯 2026-01-05 24 小時 合成已休').click();
    await page.getByLabel('休假日期', { exact: true }).fill('2026-12-31');
    await button('儲存休假').click();
    await expect(page.getByRole('alert')).toContainText('先取消已休畢');
    assert.equal(await page.getByRole('checkbox', { name: '已休畢', exact: true }).isChecked(), true);
    assert.equal((await snapshot()).leaveRecords[0].date, '2026-01-05');
    await confirm(() => button('取消').click(), true, /尚未儲存/);
    await button('新增休假').click();
    await page.getByLabel('休假日期', { exact: true }).fill('2026-12-31');
    await page.getByLabel('休假時數', { exact: true }).fill('0.1');
    await page.getByLabel('備註（選填）').fill('未來合成');
    await button('儲存休假').click();
    await expect(page.getByRole('checkbox', { name: '2026-12-31 0.1 小時 未來合成 已休畢', exact: true })).toBeDisabled();
    passed.push('同日多筆與重複輸入確認、未來不可已休、編輯不偷偷取消、起訖邊界');

    await button('編輯年度').click();
    await page.getByLabel('截止日（含當日）').fill('2026-09-01');
    await button('儲存年度').click();
    await expect(page.getByRole('alert')).toContainText('2026-12-31（0.1 小時');
    await confirm(() => button('關閉年假表單').click(), false, /尚未儲存/);
    await expect(page.getByLabel('截止日（含當日）')).toHaveValue('2026-09-01');
    await confirm(() => page.getByLabel('年假年度', { exact: true }).selectOption('leave-cross'), false, /尚未儲存/);
    await expect(page.getByLabel('年假年度', { exact: true })).toHaveValue('leave-2026');
    await confirm(() => button('概覽').click(), false, /尚未儲存/);
    await expect(page.getByRole('heading', { name: '年假管理', exact: true })).toBeVisible();
    await confirm(() => button('關閉年假表單').click(), true, /尚未儲存/);
    await page.getByLabel('年假年度', { exact: true }).selectOption('leave-cross');
    await expect(page.getByText(/期間已結束；餘額僅供紀錄/)).toBeVisible();
    await button('新增年度').click();
    await page.getByLabel('起始日', { exact: true }).fill('2025-09-22');
    await page.getByLabel('截止日（含當日）').fill('2026-09-21');
    await button('儲存年度').click();
    await expect(page.getByRole('alert')).toContainText('時數必須明確');
    await page.getByRole('textbox', { name: '年度總時數', exact: true }).fill('0');
    await button('儲存年度').click();
    await stats([0, 0, 0, 0, 0]);
    await expect(page.getByLabel('年假年度', { exact: true }).locator('option:checked')).toHaveText('2025-09-22 ～ 2026-09-21');
    await button('新增休假').click();
    await page.getByLabel('休假日期', { exact: true }).fill('2025-09-22');
    await page.getByLabel('休假時數', { exact: true }).fill('0.001');
    await button('儲存休假').click();
    await expect(page.getByRole('alert')).toContainText('最多小數 2 位');
    await page.getByLabel('休假時數', { exact: true }).fill('0.3');
    await confirm(() => button('儲存休假').click(), false, /已超出 0.3 小時/);
    await confirm(() => button('儲存休假').click(), true, /已超出 0.3 小時/);
    await stats([0, 0, 0.3, 0, -0.3]);
    await button('編輯年度').click();
    await page.getByRole('textbox', { name: '年度總時數', exact: true }).fill('1.5');
    await button('儲存年度').click();
    await stats([1.5, 0, 0.3, 1.5, 1.2]);
    await saved();
    passed.push('年度新增／編輯／切換、跨年、空白與零、未儲存三種出口、日期衝突、超額取消／保留');

    const preserved = await snapshot();
    await page.reload(); await saved(); await enterLeave();
    assert.deepEqual(await snapshot(), preserved);
    await button('概覽').click(); await page.getByLabel('共用月份').fill('2026-08');
    await enterLeave(); await page.getByLabel('年假年度', { exact: true }).selectOption('leave-cross');
    await button('概覽').click(); await expect(page.getByLabel('共用月份')).toHaveValue('2026-08');
    await button('設定').click();
    await page.getByLabel('預算金額', { exact: true }).fill('31000'); await button('儲存預算').click();
    assert.deepEqual((await snapshot()).leavePeriods, preserved.leavePeriods);
    assert.deepEqual((await snapshot()).leaveRecords, preserved.leaveRecords);
    await saved();
    const backup = await snapshot();
    const downloading = page.waitForEvent('download');
    await page.locator('header').getByRole('button', { name: '匯出完整備份', exact: true }).click();
    const download = await downloading;
    const exportPath = path.join(output, 'synthetic-backup.json');
    await download.saveAs(exportPath);
    const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    assert.equal(exported.format, 'hs-finance-backup');
    assert.deepEqual(exported.data, backup);
    await upload({ ...backup, leaveRecords: [{ ...backup.leaveRecords[0], periodId: 'bad' }] });
    await expect(page.getByRole('alert')).toContainText('找不到休假所屬年度');
    assert.deepEqual(await snapshot(), backup);
    await upload(financial(backup));
    const restore = page.getByRole('dialog', { name: '確認還原完整備份' });
    await expect(restore).toContainText('這份備份沒有年假欄位');
    await expect(restore).toContainText('現有年假也會被清空');
    await restore.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(await snapshot(), backup);
    await upload(financial(backup)); await restore.getByRole('button', { name: '確認還原', exact: true }).click();
    await saved();
    assert.deepEqual((await snapshot()).leavePeriods, []);
    const recoveries = await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes(':recovery:')).map(key => JSON.parse(localStorage.getItem(key)).data));
    assert.ok(recoveries.some(data => JSON.stringify(data) === JSON.stringify(backup)));
    await enterLeave(); await expect(page.getByRole('heading', { name: '尚未設定年假' })).toBeVisible();
    await expect(page.getByTestId('leave-stat-0')).toHaveText('—');
    await button('設定').click(); await upload(exported);
    await restore.getByRole('button', { name: '確認還原', exact: true }).click(); await saved();
    assert.deepEqual(await snapshot(), backup);
    await button('清空並重設帳本').click();
    const reset = page.getByRole('dialog', { name: '確認清空帳本' });
    await expect(reset).toContainText('年假年度與休假明細將清空');
    await reset.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(await snapshot(), backup);
    await button('清空並重設帳本').click(); await reset.getByRole('button', { name: '確認清空', exact: true }).click(); await saved();
    assert.deepEqual((await snapshot()).leavePeriods, []); assert.deepEqual((await snapshot()).leaveRecords, []);
    await upload(exported); await restore.getByRole('button', { name: '確認還原', exact: true }).click(); await saved();
    assert.deepEqual(await snapshot(), backup);
    passed.push('重新載入、月份獨立、財務保留年假、錯誤匯入不變、舊版還原提示與原版本備份、實際下載JSON再還原、重設提示');

    await enterLeave(); await page.getByLabel('年假年度', { exact: true }).selectOption('leave-2026');
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: width >= 768 ? 1000 : 812 });
      if (width < 1024) {
        await expect(button('更多')).toHaveAttribute('aria-current', 'page');
        await button('概覽').click(); await enterLeave();
      }
      await noOverflow();
      await page.locator('main').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: path.join(output, `leave-${width}.png`), fullPage: true });
      if (width === 375) {
        await page.getByRole('heading', { name: '休假明細', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'leave-375-records.png'), fullPage: true });
      }
    }
    await button('新增休假').click();
    await page.getByLabel('休假日期', { exact: true }).fill('2026-09-22');
    await page.getByLabel('休假時數', { exact: true }).fill('1.5');
    await noOverflow();
    await page.getByRole('textbox', { name: '休假時數', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'leave-320-form.png'), fullPage: true });
    await confirm(() => button('概覽').click(), false, /尚未儲存/);
    failSave = true;
    await button('儲存休假').click();
    await expect(page.getByText('已存本機・同步失敗', { exact: true })).toBeVisible();
    const beforeRetry = await snapshot();
    failSave = false; await button('重試同步').click(); await saved();
    assert.deepEqual(await snapshot(), beforeRetry);
    await page.reload(); await saved(); await enterLeave();
    await expect(page.getByRole('checkbox', { name: '2026-09-22 1.5 小時 已休畢', exact: true })).toBeVisible();
    passed.push('桌面／平板／375與320手機入口、更多選取、無橫向溢出、手機新增／未儲存提醒／重開');
    const otherPage = await context.newPage();
    otherPage.on('pageerror', error => errors.push(error.message));
    await otherPage.clock.setFixedTime(new Date('2026-09-22T04:00:00Z'));
    await otherPage.goto(origin + '/Finance/');
    await otherPage.getByText(/已同步 \d/).filter({ visible: true }).waitFor();
    await expect(page.getByRole('alert')).toContainText('另一個分頁已更新帳本');
    await expect(page.getByRole('alert')).toContainText('所選版本沒有年假時現有年假也會清空');
    await otherPage.close(); await button('以雲端版本取代本機').click(); await saved();
    assert.deepEqual(await snapshot(), beforeRetry);
    passed.push('同步失敗狀態／重試、實際分頁衝突與整份替換提示、版本選擇後年假保留');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await button('設定').click();
    const cloudB = cloud + '-empty';
    await context.request.post(cloudB, { data: { data: null } });
    const changeBook = async url => {
      await page.getByLabel('Apps Script 網址', { exact: true }).fill(url);
      await button('從雲端還原').click();
      const dialog = page.getByRole('dialog', { name: '確認從雲端還原' });
      await expect(dialog).toContainText('所選版本沒有年假時');
      await dialog.getByRole('button', { name: '確認下載', exact: true }).click(); await saved();
    };
    await changeBook(cloudB);
    assert.deepEqual((await snapshot()).leavePeriods, []); assert.deepEqual((await snapshot()).leaveRecords, []);
    await enterLeave(); await expect(page.getByRole('heading', { name: '尚未設定年假' })).toBeVisible();
    await button('設定').click(); await changeBook(cloud);
    assert.deepEqual(await snapshot(), beforeRetry);
    passed.push('實際完整重設並復原、A → 空帳本 B → A，年假隔離且原帳本保留');
    const final = await snapshot();
    assert.deepEqual((await (await context.request.get(cloud)).json()).data, final);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    passed.push('真實前端保存至 mock 再載入一致、無頁面錯誤、無外部請求');
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS', passed, errors, external }, null, 2));
    console.log(JSON.stringify({ status: 'PASS', output, passed }, null, 2));
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {}); fs.writeFileSync(path.join(output, 'failure.txt'), await page.locator('body').innerText().catch(() => '')); }
    console.error(error); process.exitCode = 1;
  } finally { await browser.close(); }
})();
