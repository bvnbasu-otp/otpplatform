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
          expression: `(() => {
            window.Store.User.getMeUser = () => window.Store.User.getMeUserOrThrow();
            if (!window.Store.Call) window.Store.Call = window.Store.WAWebCallCollection || { on: () => {} };
            if (!window.Store.Call.on) window.Store.Call.on = () => {};
            if (!window.Store.Conn.on) window.Store.Conn.on = () => {};
            if (!window.Store.AppState.on) window.Store.AppState.on = () => {};
            return window.onAppStateHasSyncedEvent();
          })()`,
          awaitPromise: true,
          returnByValue: true
        }
      }));
    });
    ws.on('message', data => {
      console.log('Polyfill 3 result:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
