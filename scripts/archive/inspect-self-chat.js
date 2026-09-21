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
        try {
          const wid = window.Store.WidFactory.createWid('919972967530@c.us');
          const chat = await window.Store.Chat.find(wid);
          const msgs = chat?.msgs?.getModelsArray() || [];
          return {
            chatFound: !!chat,
            title: chat?.formattedTitle,
            msgCount: msgs.length,
            lastMsgs: msgs.slice(-3).map(m => ({
              id: m.id?._serialized,
              body: m.body?.substring(0, 40),
              fromMe: m.id?.fromMe,
              ack: m.ack,
              timestamp: m.t
            }))
          };
        } catch(e) {
          return { error: e.message };
        }
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
      console.log('Self chat inspection:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
