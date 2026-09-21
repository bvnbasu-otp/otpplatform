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
        const msgs = window.Store.Msg.getModelsArray();
        return {
          totalLoaded: msgs.length,
          last5: msgs.slice(-5).map(m => ({
            id: m.id?._serialized,
            to: m.to?._serialized,
            body: m.body?.substring(0, 50),
            ack: m.ack
          }))
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
      console.log('All msgs:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
