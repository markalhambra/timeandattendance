// generate-screenshots.js
// Usage: node generate-screenshots.js
// Requires: npm install (playwright)

const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MOCKUPS_DIR = path.join(ROOT, 'mockups');
const OUT_DIR = path.join(ROOT, 'frontend', 'public', 'screenshots');

const SCREENS = [
  // Employee
  { html: 'login.html',                  out: 'login.png' },
  { html: 'dashboard-employee.html',     out: 'dashboard-employee.png' },
  { html: 'clock-in.html',               out: 'clock-in.png' },
  { html: 'clock-in-active.html',        out: 'clock-in-active.png' },
  { html: 'attendance-list.html',        out: 'attendance-list.png' },
  { html: 'correction-modal.html',       out: 'correction-modal.png' },
  { html: 'leave-form.html',             out: 'leave-form.png' },
  { html: 'leave-balances.html',         out: 'leave-balances.png' },
  { html: 'overtime-form.html',          out: 'overtime-form.png' },
  { html: 'profile.html',                out: 'profile.png' },
  { html: 'notifications.html',          out: 'notifications.png' },
  // Dept Head
  { html: 'depthead-dashboard.html',           out: 'depthead-dashboard.png' },
  { html: 'depthead-approvals-leave.html',     out: 'depthead-approvals-leave.png' },
  { html: 'depthead-approvals-ot.html',        out: 'depthead-approvals-ot.png' },
  { html: 'depthead-approvals-corrections.html', out: 'depthead-approvals-corrections.png' },
  // HR
  { html: 'hr-dashboard.html',           out: 'hr-dashboard.png' },
  { html: 'hr-employee-list.html',       out: 'hr-employee-list.png' },
  { html: 'hr-add-employee.html',        out: 'hr-add-employee.png' },
  { html: 'hr-leave-balances.html',      out: 'hr-leave-balances.png' },
  { html: 'hr-reports.html',             out: 'hr-reports.png' },
  // Admin
  { html: 'admin-dashboard.html',        out: 'admin-dashboard.png' },
  { html: 'admin-departments.html',      out: 'admin-departments.png' },
  { html: 'admin-dept-form.html',        out: 'admin-dept-form.png' },
  { html: 'admin-audit-logs.html',       out: 'admin-audit-logs.png' },
  { html: 'admin-approvals.html',        out: 'admin-approvals.png' },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  let ok = 0, fail = 0;
  for (const { html, out } of SCREENS) {
    const src = `file://${path.join(MOCKUPS_DIR, html)}`;
    const dest = path.join(OUT_DIR, out);
    try {
      await page.goto(src, { waitUntil: 'networkidle' });
      await page.screenshot({ path: dest, fullPage: false });
      console.log(`✓ ${out}`);
      ok++;
    } catch (e) {
      console.error(`✗ ${out}: ${e.message}`);
      fail++;
    }
  }

  await browser.close();
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
