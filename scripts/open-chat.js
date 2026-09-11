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
      const code = `(async () => {
        const chat = await window.WWebJS.getChat('919972967530@c.us', { getAsModel: false });
        if (window.Store.Cmd?.openChatAt) {
          window.Store.Cmd.openChatAt(chat);
        } else if (chat?.open) {
          chat.open();
        }
        return true;
      })()`;
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: code,
          awaitPromise: true,
          returnByValue: true
        }
      }));
    });
    ws.on('message', data => {
      console.log('Open chat result:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
