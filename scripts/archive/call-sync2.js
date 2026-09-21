const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:40431/json/list', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: '(() => { window.Store.User.getMeUser = () => window.Store.User.getMeUserOrThrow(); return window.onAppStateHasSyncedEvent(); })()',
          awaitPromise: true,
          returnByValue: true
        }
      }));
    });
    ws.on('message', data => {
      console.log('Polyfilled call result:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
