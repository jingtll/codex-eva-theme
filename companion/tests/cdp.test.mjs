import test from 'node:test';
import assert from 'node:assert/strict';
import { connectCdp } from '../src/cdp.mjs';

class Socket extends EventTarget {
  static instances = [];
  constructor() { super(); Socket.instances.push(this); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
  send(text) { this.sent ??= []; this.sent.push(JSON.parse(text)); }
  reply(message) { this.dispatchEvent(new MessageEvent('message', {data: JSON.stringify(message)})); }
  close() { this.dispatchEvent(new Event('close')); }
}
test('本机调试请求乱序响应仍与调用匹配，关闭后拒绝请求', async () => {
  const client = await connectCdp('ws://127.0.0.1:19327/devtools/page/test', {WebSocketImpl: Socket});
  const a = client.send('Runtime.enable'); const b = client.send('Page.enable');
  const socket = Socket.instances.at(-1);
  socket.reply({id:socket.sent[1].id,result:{page:true}});
  socket.reply({id:socket.sent[0].id,result:{runtime:true}});
  assert.deepEqual(await a,{runtime:true}); assert.deepEqual(await b,{page:true});
  client.close(); await assert.rejects(client.send('Runtime.enable'), /CLOSED/);
});
test('超时和断开使所有请求结束', async () => {
  const client = await connectCdp('ws://127.0.0.1:19327/devtools/page/test', {WebSocketImpl:Socket, timeoutMs:15});
  await assert.rejects(client.send('Runtime.enable'), /TIMEOUT/);
  const pending = client.send('Page.enable'); client.close(); await assert.rejects(pending, /CLOSED/);
});
test('拒绝远程、带凭据及非调试路径', async () => {
  for (const url of ['ws://192.168.1.2:9222/devtools/page/a','ws://user@127.0.0.1:9222/devtools/page/a','ws://127.0.0.1:9222/login']) {
    await assert.rejects(connectCdp(url,{WebSocketImpl:Socket}), /INVALID_ENDPOINT/);
  }
});
