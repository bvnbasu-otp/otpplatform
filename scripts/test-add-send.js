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
          const meUser = window.Store.User.getMeUserOrThrow();
          const newId = await window.Store.MsgKey.newId();
          const newMsgKey = new window.Store.MsgKey({
            from: meUser,
            to: chat.id,
            id: newId,
            selfDir: 'out'
          });
          const message = {
            id: newMsgKey,
            ack: 0,
            body: "Live Diagnostic Test",
            from: meUser,
            to: chat.id,
            local: true,
            self: 'out',
            t: parseInt(new Date().getTime() / 1000),
            isNewMsg: true,
            type: 'chat'
          };
          const res = await window.Store.SendMessage.addAndSendMsgToChat(chat, message);
          return { ok: true, res: res };
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
      console.log('addAndSend result:', data.toString());
      ws.close();
      process.exit(0);
    });
  });
});
