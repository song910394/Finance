import { createServer } from 'vite';

const port = 5042;
const prefix = '/__mock-cloud';
const transaction = (id, date, amount, extra = {}) => ({ id, date, amount, paymentMethod: '刷卡', cardBank: '測試卡', category: '食', description: '合成測試 ' + id, isReconciled: false, ...extra });
const fixture = () => ({
  transactions: [
    transaction('sample-1', '2026-09-01', 100), transaction('sample-2', '2026-09-02', 200),
    transaction('sample-cash', '2026-09-03', 80, { paymentMethod: '現金', cardBank: '-' }),
    transaction('sample-legacy', '2026-05-01', 500, { isReconciled: true, reconciledDate: '2026-09-01T00:00:00Z' }),
    transaction('sample-recurring', '2026-09-04', 499, { isRecurring: true, recurringGroupId: 'test-recurring', description: '合成訂閱' }),
    transaction('sample-recurring-2', '2026-10-04', 499, { isRecurring: true, recurringGroupId: 'test-recurring', description: '合成訂閱' }),
    ...[1, 2, 3].map(n => transaction('sample-installment-' + n, '2026-' + String(n + 8).padStart(2, '0') + '-05', n === 1 ? 334 : 333, { isInstallment: true, installmentGroupId: 'test-installment', installmentNumber: n, installmentCount: 3, description: '合成家電 (' + n + '/3)' })),
  ],
  categories: ['食', '衣', '住', '行', '育', '樂', '其他'], budget: 30000, cardBanks: ['-', '測試卡', '另一張測試卡'],
  cardSettings: { '測試卡': { statementDay: 15, isNextMonth: false }, '另一張測試卡': { statementDay: 3, isNextMonth: true } },
  incomeSources: [{ id: 'source-1', name: '合成薪資' }],
  budgets: [{ month: '2026-09', openingBalance: 10000, incomes: [{ sourceId: 'source-1', amount: 40000 }], loan: 5000, creditCards: [] }],
  salaryAdjustments: [],
});
const books = new Map();
const counts = { loads: 0, saves: 0 };
const server = await createServer({
  envFile: false,
  server: { host: '127.0.0.1', port, strictPort: true, open: false, watch: { ignored: ['**/*.local/**'] }, headers: {
    'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5042; worker-src 'none'; form-action 'none'; base-uri 'self'",
  } },
  plugins: [{
    name: 'finance-isolated-preview', enforce: 'pre',
    transform(code, id) {
      if (id.replaceAll('\\', '/').split('?')[0].endsWith('/constants.ts')) {
        return code.replace(/export const GOOGLE_SCRIPT_URL\s*=\s*'[^']*';/, "export const GOOGLE_SCRIPT_URL = 'http://127.0.0.1:5042/__mock-cloud';");
      }
    },
    transformIndexHtml(html) { return html.replace('<title>H&S記帳</title>', '<title>H&S記帳｜合成資料預覽</title>')
      .replace(/<script>\s*if \('serviceWorker' in navigator\)[\s\S]*?<\/script>/, ''); },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1:' + port);
        if (!url.pathname.startsWith(prefix)) return next();
        res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        if (url.pathname === prefix + '/status') { res.end(JSON.stringify({ isolated: true, ...counts })); return; }
        const key = url.pathname;
        if (!books.has(key)) books.set(key, fixture());
        const delay = Math.min(15000, Math.max(0, Number(url.searchParams.get('delay')) || 0));
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (url.searchParams.get('fail') === '1') { res.statusCode = 503; res.end(JSON.stringify({ success: false, message: '合成測試：模擬連線失敗' })); return; }
        try {
          if (req.method === 'POST') {
            let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 20 * 1024 * 1024) throw new Error('payload too large'); }
            books.set(key, JSON.parse(body).data); counts.saves++;
          } else counts.loads++;
          res.end(JSON.stringify({ success: true, data: books.get(key) }));
        } catch { res.statusCode = 400; res.end(JSON.stringify({ success: false, message: '合成請求格式錯誤' })); }
      });
    },
  }],
});
await server.listen();
console.log('ISOLATED_PREVIEW http://127.0.0.1:' + port + '/Finance/');
console.log('只使用合成資料；API 在記憶體模擬，CSP 禁止外部連線。停止程序後模擬雲端重置；瀏覽器草稿仍依正常機制保留。');
process.on('SIGINT', async () => { await server.close(); process.exit(0); });
