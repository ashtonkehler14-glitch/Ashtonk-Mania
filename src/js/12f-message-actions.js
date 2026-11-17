/* Only the author gets controls; the server checks ownership again before changing a message. */
const ChatMessageUI = {
  same(a,b) { return b.mid ? a.mid === b.mid : (a.at ?? a.ts) === (b.at ?? b.ts) && (a.from?.pid || a.pid || a.from) === (b.from?.pid || b.pid || b.from); },
  merge(local, remote) {
    const all = new Map();
    for (const l of [...local,...remote]) if (l && typeof l.text === 'string') all.set(l.mid || `${l.at ?? l.ts}|${l.from?.pid || l.pid || l.from}|${l.text}`, l);
    return [...all.values()].filter(l=>!l.deleted).sort((a,b)=>(a.at ?? a.ts)-(b.at ?? b.ts));
  },
  patch(list, update) {
    return list.flatMap(l=>this.same(l,update.line || update) ? update.deleted ? [] : [update.line] : [l]);
  },
  attach(el, line, channel) {
    if (!el || line.deleted || el.matches('.sys,.local,.suggest')) return;
    if (line.editedAt) el.querySelector('.chat-copy > span, .ch-text')?.append(h('small.chat-edited', ' (edited)'));
    const from = typeof line.from === 'object' ? line.from : line;
    const mine = from.pid ? from.pid === Presence.pid() : typeof line.from === 'string' ? line.from === Multiplayer.me : !!from.id && from.id === Presence.me;
    if (!mine || !line.mid && !Number.isFinite(line.at ?? line.ts) || channel.readOnly) return;
    const send = action => {
      const packet = { t:'chatChange', scope:channel.scope, to:channel.to, mid:line.mid, at:line.at ?? line.ts, ...action };
      const connection = channel.send ? Multiplayer.ws : Presence.ws;
      if (!connection || connection.readyState !== 1) { Toast.err('Chat is offline', 'Reconnect before changing your message.'); return; }
      if (channel.send) channel.send(packet); else Presence.send(packet);
    };
    const open = e => {
      e.preventDefault();e.stopPropagation();
      showMenu(e.clientX,e.clientY,[
        {label:'Edit message',icon:'edit',onClick:async()=>{const text=await Dialog.prompt('Edit message',line.text,{ok:'Save',maxlength:300});if(text===null || text===line.text)return;if(!text.trim()){Toast.err('Message can’t be empty');return;}send({action:'edit',text});}},
        {label:'Delete message',icon:'trash',danger:true,onClick:async()=>{if(await Dialog.confirm('Delete this message?',line.text,{ok:'Delete',danger:true}))send({action:'delete'});}}
      ]);
    };
    el.classList.add('chat-own-message');el.addEventListener('contextmenu',open);
    el.append(h('button.chat-message-actions',{type:'button','aria-label':'Message actions',title:'Edit or delete your message',onclick:open},'⋯'));
  },
};
