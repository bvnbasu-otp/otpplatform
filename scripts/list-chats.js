const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:40431/json/list', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', async () => {
    const targets = JSON.parse(body);
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => {
      const code = `(() => {
        return window.Store.Chat.getModelsArray().slice(0, 10).map(c => ({
          id: c.id?._serialized,
          name: c.name,
          formattedTitle: c.formattedTitle,
          isUser: c.isUser,
          isGroup: c.isGroup
        }));
      })()`;
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: code,
          returnByValue: true
        }
      }));
    });
    ws.on('message', data => {
      console.log('Chats:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
