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
          expression: '(() => { const selfChat = window.Store.Chat.models.find(c => c.name && c.name.includes("You")); return { id: selfChat?.id?._serialized, name: selfChat?.name }; })()',
          returnByValue: true
        }
      }));
    });
    ws.on('message', data => {
      console.log('Self chat:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
