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
        const models = window.Store.Chat.getModelsArray();
        const meChat = models.find(c => c.isMe || (c.formattedTitle && c.formattedTitle.includes("You")) || (c.name && c.name.includes("You")));
        const byPn = models.find(c => c.id?._serialized && c.id._serialized.includes("99729"));
        return {
          meChat: meChat ? { id: meChat.id?._serialized, title: meChat.formattedTitle } : null,
          byPn: byPn ? { id: byPn.id?._serialized, title: byPn.formattedTitle } : null,
          meUser: window.Store.User.getMeUser?.()
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
      console.log('Self check:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
