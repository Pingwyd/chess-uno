import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH, EMOTES, type ChatMessage, type EmoteId } from '../net/protocol';
import type { PlayerId } from '../rules/game';

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
        {messages.length === 0 && <div className="chat-empty">{readOnly ? 'No messages yet.' : 'Say hi, or send a quick emote 👋'}</div>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.seat === you && you !== null ? 'mine' : ''} ${m.emote ? 'emote' : ''}`}>
            <span className="chat-name">{m.name}</span>
            <span className="chat-text">{m.emote ? EMOTES[m.emote] : m.text}</span>
          </div>
        ))}
      </div>
      {readOnly ? (
        <div className="chat-readonly">Spectators can read the chat</div>
      ) : (
        <>
          <div className="emote-row">
            {(Object.keys(EMOTES) as EmoteId[]).map((e) => (
              <button key={e} className="emote-btn" onClick={() => onEmote(e)} data-emote={e}>{EMOTES[e]}</button>
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
