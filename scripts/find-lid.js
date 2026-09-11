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
        const contact = window.Store.Contact.get('33251787841621@lid');
        const chat = window.Store.Chat.get('33251787841621@lid');
        return {
          contactName: contact?.name || contact?.pushname || contact?.formattedName,
          chatTitle: chat?.formattedTitle || chat?.name,
          phoneNumber: contact?.phoneNumber
        };
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
      console.log('Contact 33251787841621@lid:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
