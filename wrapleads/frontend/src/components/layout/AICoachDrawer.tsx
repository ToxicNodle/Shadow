import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  'What should I do today?',
  'Which leads are about to go cold?',
  'Why am I losing deals?',
  'How do I close the proposal I sent?',
  "What's my biggest revenue opportunity right now?",
];

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>');
}

export default function AICoachDrawer({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    setError(null);
    const userMsg: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await api.aiCoach(trimmed, messages);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 420,
      background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', zIndex: 1200,
      boxShadow: '-4px 0 24px rgba(0,0,0,0.35)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #4d8af5 0%, #a855f7 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>🤖</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>AI Revenue Coach</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
            Knows your live pipeline · Powered by Claude
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: 'var(--text-faint)', fontSize: 18, lineHeight: 1, borderRadius: 4,
            display: 'flex', alignItems: 'center',
          }}
          aria-label="Close AI Coach"
        >✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-faint)', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
            <p style={{ margin: '0 0 14px' }}>
              Ask me anything about your pipeline, leads, or how to close more deals.
              I have live access to your CRM data.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                    color: 'var(--text-primary)', fontSize: 12, textAlign: 'left',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {m.role === 'assistant' && (
              <div style={{
                width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginRight: 8, marginTop: 2,
                background: 'linear-gradient(135deg, #4d8af5 0%, #a855f7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
              }}>🤖</div>
            )}
            <div style={{
              maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.55,
              background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-hover)',
              color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
              borderBottomRightRadius: m.role === 'user' ? 2 : 10,
              borderBottomLeftRadius: m.role === 'assistant' ? 2 : 10,
            }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
            />
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 2,
              background: 'linear-gradient(135deg, #4d8af5 0%, #a855f7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
            }}>🤖</div>
            <div style={{
              padding: '8px 12px', borderRadius: 10, borderBottomLeftRadius: 2,
              background: 'var(--bg-hover)', display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0, 1, 2].map((d) => (
                <span key={d} style={{
                  width: 6, height: 6, borderRadius: '50%', background: 'var(--text-faint)',
                  animation: 'coach-pulse 1.2s ease-in-out infinite',
                  animationDelay: `${d * 0.2}s`,
                  display: 'inline-block',
                }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12,
          }}>{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: '12px 14px', flexShrink: 0,
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your coach anything… (Enter to send)"
          rows={1}
          style={{
            flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)',
            fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.5,
            minHeight: 36, maxHeight: 120, overflowY: 'auto', fontFamily: 'inherit',
          }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 120) + 'px';
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{
            width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-hover)',
            color: input.trim() && !loading ? '#fff' : 'var(--text-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0, transition: 'background 0.15s, color 0.15s',
          }}
          aria-label="Send message"
        >↑</button>
      </div>

      <style>{`
        @keyframes coach-pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export function AICoachFAB() {
  const { aiCoachOpen, setAiCoachOpen } = useAppStore((s) => ({
    aiCoachOpen: s.aiCoachOpen,
    setAiCoachOpen: s.setAiCoachOpen,
  }));
  return (
    <button
      onClick={() => setAiCoachOpen(!aiCoachOpen)}
      title="AI Revenue Coach"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
        width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: 'linear-gradient(135deg, #4d8af5 0%, #a855f7 100%)',
        color: '#fff', fontSize: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(77,138,245,0.45)',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1)';
        e.currentTarget.style.boxShadow = '0 6px 24px rgba(77,138,245,0.6)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(77,138,245,0.45)';
      }}
      aria-label="Open AI Revenue Coach"
    >
      🤖
    </button>
  );
}
