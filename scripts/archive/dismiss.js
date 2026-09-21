const http = require('http');
const WebSocket = require('ws');

http.get('http://127.0.0.1:35207/json/list', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const page = targets.find(t => t.type === 'page');
    console.log('Connecting to', page.webSocketDebuggerUrl);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Input.dispatchKeyEvent',
        params: {
          type: 'rawKeyDown',
          key: 'Escape',
          code: 'Escape',
          windowsVirtualKeyCode: 27
        }
      }));
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: 'document.querySelector("div[data-animate-modal-popup=\'true\'] button")?.click() || document.querySelector("button")?.click()'
          }
        }));
      }, 500);
      setTimeout(() => {
        ws.close();
        process.exit(0);
      }, 1500);
    });
    ws.on('message', data => console.log('CDP response:', data.toString()));
  });
});
