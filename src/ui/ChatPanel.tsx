import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH, EMOTES, type ChatMessage, type EmoteId } from '../net/protocol';
import type { PlayerId } from '../rules/game';
import { Icon, type IconName } from './icons';

/** Quick emotes are Lucide icons (GG is styled text). */
const EMOTE_ICON: Record<EmoteId, IconName | null> = {
  gg: null, clap: 'thumbs-up', wow: 'zap', lol: 'laugh', fire: 'flame', oops: 'frown', respect: 'handshake', niceReverse: 'reverse',
};

function Emote({ id, full }: { id: EmoteId; full?: boolean }) {
  const icon = EMOTE_ICON[id];
  if (!icon) return <b className="emote-gg">{EMOTES[id]}</b>;
  return <span className={`emote-chip emote-${id}`}><Icon name={icon} size={full ? 20 : 18} />{full && <span className="emote-label">{EMOTES[id]}</span>}</span>;
}

interface Props {
  messages: ChatMessage[];
  you: PlayerId | null;
  readOnly: boolean;
  onSend: (text: string) => void;
  onEmote: (e: EmoteId) => void;
}

export function ChatPanel({ messages, you, readOnly, onSend, onEmote }: Props) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages.length]);
  return (
    <div className="chat" data-testid="chat">
      <div className="chat-list" ref={list}>
        {messages.length === 0 && <div className="chat-empty">{readOnly ? 'No messages yet.' : 'Say hi, or send a quick emote'}</div>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.seat === you && you !== null ? 'mine' : ''} ${m.emote ? 'emote' : ''}`}>
            <span className="chat-name">{m.name}</span>
            <span className="chat-text">{m.emote ? <Emote id={m.emote} full /> : m.text}</span>
          </div>
        ))}
      </div>
      {readOnly ? (
        <div className="chat-readonly">Spectators can read the chat</div>
      ) : (
        <>
          <div className="emote-row">
            {(Object.keys(EMOTES) as EmoteId[]).map((e) => (
              <button key={e} className={`emote-btn ${EMOTE_ICON[e] ? 'icon-only' : ''}`} onClick={() => onEmote(e)} data-emote={e} aria-label={EMOTES[e]} title={EMOTES[e]}><Emote id={e} /></button>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!text.trim()) return;
              onSend(text);
              setText('');
            }}
          >
            <input
              value={text}
              maxLength={CHAT_MAX_LENGTH}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message…"
              aria-label="Chat message"
            />
            <button className="btn primary small" type="submit">Send</button>
          </form>
        </>
      )}
    </div>
  );
}
