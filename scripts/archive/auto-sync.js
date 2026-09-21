const http = require('http');
const WebSocket = require('ws');
const { execSync } = require('child_process');

try {
  const ss = execSync('ss -tlpn', { encoding: 'utf8' });
  const match = ss.match(/127\.0\.0\.1:(\d+)\s+.*"chromium"/);
  if (!match) {
    console.error('Chromium port not found');
    process.exit(1);
  }
  const port = match[1];
  console.log('Connecting to Chromium on port:', port);

  http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      const targets = JSON.parse(body);
      const page = targets.find(t => t.type === 'page');
      if (!page) {
        console.error('No page target found');
        process.exit(1);
      }
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      ws.on('open', () => {
        const expression = `(() => {
          try {
            if (window.Store && window.Store.User) {
              window.Store.User.getMeUser = () => window.Store.User.getMeUserOrThrow();
              if (window.Store.User.getMaybeMePnUser) {
                window.Store.User.getMaybeMeUser = () => window.Store.User.getMaybeMePnUser();
              }
            }
            if (window.Store) {
              if (!window.Store.Call) window.Store.Call = window.Store.WAWebCallCollection || { on: () => {} };
              if (!window.Store.Call.on) window.Store.Call.on = () => {};
              if (window.Store.Conn && !window.Store.Conn.on) window.Store.Conn.on = () => {};
              if (window.Store.AppState && !window.Store.AppState.on) window.Store.AppState.on = () => {};
            }
            if (typeof window.onAppStateHasSyncedEvent === 'function') {
              window.onAppStateHasSyncedEvent();
            }
            return { ok: true, status: 'synced' };
          } catch(e) {
            return { ok: false, err: e.message };
          }
        })()`;
        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true }
        }));
      });
      ws.on('message', data => {
        console.log('Auto-sync result:', data.toString());
        ws.close();
        process.exit(0);
      });
    });
  });
} catch(err) {
  console.error(err);
  process.exit(1);
}
