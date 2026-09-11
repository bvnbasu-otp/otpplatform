const http = require('http');
const WebSocket = require('ws');

const messageText = `[OTP Platform] Test Verification Message

Hello Baskar,

This is a live test notification from your OTP Platform instance.

* Your Sample Verification PIN: 729401
* Expires in: 10 minutes
* Platform URL: https://incoming-reductions-incoming-stevens.trycloudflare.com

* WhatsApp Gateway: Active & Connected (+91 99729 67530)
* Status: 100% Operational (Zero Cost / Self-Hosted)

If you did not request this code, please ignore this message.`;

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
          await window.Store.Cmd.openChatAt(chat);
          const res = await window.WWebJS.sendMessage(chat, ${JSON.stringify(messageText)});
          return { ok: true, sentTo: chat.id?._serialized, title: chat.formattedTitle, res: res ? res.id?._serialized : 'done' };
        } catch(e) {
          return { ok: false, err: e.message, stack: e.stack };
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
      console.log('Send & Open result:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
