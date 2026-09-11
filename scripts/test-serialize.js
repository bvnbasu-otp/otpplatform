const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:35207/json/list', (res) => {
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
          expression: '(() => { try { return { ok: true, data: { ...window.Store.Conn.serialize(), wid: window.Store.User.getMeUser() } }; } catch(e) { return { ok: false, err: e.message, stack: e.stack }; } })()',
          returnByValue: true
        }
      }));
    });
    ws.on('message', data => {
      console.log('Conn serialize test:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
