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
          expression: `(async () => {
            try {
              const chat = await window.WWebJS.getChat('919972967530@c.us', { getAsModel: false });
              const res = await window.WWebJS.sendMessage(chat, 'Testing direct CDP send to myself from OTP Platform');
              return { ok: true, res: res ? { id: res.id?._serialized, ack: res.ack } : 'sent' };
            } catch(e) {
              return { ok: false, err: e.message, stack: e.stack };
            }
          })()`,
          awaitPromise: true,
          returnByValue: true
        }
      }));
    });
    ws.on('message', data => {
      console.log('Direct send result:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
