import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ExternalLink,
  Loader2,
  MapPin,
  RotateCcw,
  Send,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import { EQPEvent } from '../data/eqpData';
import { MarkdownContent } from './MarkdownContent';
import type { MapsGroundingLink } from './MapsGroundingPanel';

type ChatModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-argon'
  | 'gemini-4-carbon';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
  groundingLinks?: MapsGroundingLink[];
  isError?: boolean;
}

interface SeismologyChatPanelProps {
  event: EQPEvent;
  eventContextText: string;
}

const MODEL_OPTIONS: Array<{
  id: ChatModelId;
  label: string;
  tier: string;
  summary: string;
}> = [
  {
    id: 'gemini-4-hydrogen',
    label: 'gemini-4-hydrogen',
    tier: 'General & Maps',
    summary: 'Balanced analysis + Google Maps Grounding support',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'gemini-3.1-flash-lite',
    tier: 'Fast Triage',
    summary: 'Ultra-low latency for rapid quick checks',
  },
  {
    id: 'gemini-4-argon',
    label: 'gemini-4-argon',
    tier: 'Complex Interactive',
    summary: 'Multi-variable interactive diagnostics (billing key required)',
  },
  {
    id: 'gemini-4-carbon',
    label: 'gemini-4-carbon',
    tier: 'Deep Reasoning',
    summary: 'Deep crustal/hypocenter inversion reasoning (billing key required)',
  },
];

const SYSTEM_ROLES: Array<{ id: string; label: string; instruction: string }> = [
  {
    id: 'duty-seismologist',
    label: 'Duty Seismologist (EQP)',
    instruction:
      'You are a Duty Seismologist operating the Earthquake Processor (EQP) workstation. Analyze P/S arrival residuals, azimuthal coverage, depth stability, outlier magnitude rejection (K*sigma), and PEIS/tsunami advisories concisely and precisely based on the active event telemetry.',
  },
  {
    id: 'tectonic-analyst',
    label: 'Tectonic & Hazard Analyst',
    instruction:
      'You are a regional seismotectonic and hazard specialist for the Philippine archipelago. Assess fault generator associations (Philippine Fault Zone, Philippine Trench, Manila/Negros/Cotabato trenches), aftershock expectations, and populated-area impact.',
  },
  {
    id: 'bulletin-editor',
    label: 'Bulletin & Advisory Editor',
    instruction:
      'You are an Earthquake Bulletin Communications Officer. Draft accurate, plain-language bulletin remarks, PEIS summaries, and tsunami advisory wording consistent with official PHIVOLCS EQP bulletin standards.',
  },
];

export const SeismologyChatPanel: React.FC<SeismologyChatPanelProps> = ({
  event,
  eventContextText,
}) => {
  const [selectedModel, setSelectedModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [selectedRoleId, setSelectedRoleId] = useState<string>(SYSTEM_ROLES[0].id);
  const [systemInstruction, setSystemInstruction] = useState<string>(SYSTEM_ROLES[0].instruction);
  const [showSystemEditor, setShowSystemEditor] = useState(false);
  const [useMapsGrounding, setUseMapsGrounding] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'model',
      modelUsed: 'gemini-4-hydrogen',
      timestamp: 'Session Ready',
      text: 'EQP Multi-Turn Analyst ready. Ask about station residuals, outlier thresholds, crustal velocity interpretation, bulletin drafting, or toggle **Google Maps Grounding** for real-world geographic context around the epicenter.',
    },
  ]);

  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const quickPrompts = useMemo(
    () => [
      `Review high-residual stations on ${event.filename} and recommend which P/S picks to exclude.`,
      `Evaluate the ${event.preferredScale} distribution and suggest an optimal K·σ outlier threshold.`,
      `Draft concise official bulletin remarks for ${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E (${event.depthKm.toFixed(1)} km depth).`,
    ],
    [event.filename, event.preferredScale, event.lat, event.lon, event.depthKm]
  );

  const handleRoleChange = (roleId: string) => {
    setSelectedRoleId(roleId);
    const matched = SYSTEM_ROLES.find((r) => r.id === roleId);
    if (matched) {
      setSystemInstruction(matched.instruction);
    }
  };

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: timeLabel,
    };

    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setInput('');
    setIsSending(true);

    // Build clean multi-turn history excluding initial local welcome/error cards
    const apiMessages = nextThread
      .filter((m) => m.id !== 'welcome-msg' && !m.isError)
      .map((m) => ({
        role: m.role,
        text: m.text,
      }));

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: useMapsGrounding ? 'gemini-4-hydrogen' : selectedModel,
          systemInstruction,
          eventContext: eventContextText,
          useMapsGrounding,
          latLng: { latitude: event.lat, longitude: event.lon },
        }),
      });

      const data = (await response.json()) as {
        text?: string;
        modelUsed?: string;
        groundingLinks?: MapsGroundingLink[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || `Chat request failed (${response.status})`);
      }

      const replyTime = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          text: data.text || '(No text returned)',
          modelUsed: data.modelUsed ?? (useMapsGrounding ? 'gemini-4-hydrogen' : selectedModel),
          groundingLinks: data.groundingLinks ?? [],
          timestamp: replyTime,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reach Gemini API.';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text: message,
          isError: true,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome-msg',
        role: 'model',
        modelUsed: useMapsGrounding ? 'gemini-4-hydrogen' : selectedModel,
        timestamp: 'New Thread',
        text: `Started a fresh conversation anchored to **${event.filename}** (${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E).`,
      },
    ]);
  };

  return (
    <section className="bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden flex flex-col h-[640px] shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      {/* Header & Controls */}
      <div className="px-4 py-3 border-b border-sky-800/60 bg-[#dce9f8] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-sky-800" />
            <div>
              <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                Multi-Turn Seismic Chat Assistant
              </h2>
              <p className="text-[11px] text-slate-600 font-mono">
                Active event: {event.filename} · {event.picks.length} picks
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setUseMapsGrounding((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                useMapsGrounding
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Maps Grounding {useMapsGrounding ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={() => setShowSystemEditor((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                showSystemEditor
                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              System Role
            </button>

            <button
              type="button"
              onClick={handleResetChat}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        </div>

        {/* Model & Role selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-slate-600 font-medium shrink-0">Model:</span>
            <select
              aria-label="Gemini Chat Model"
              value={useMapsGrounding ? 'gemini-4-hydrogen' : selectedModel}
              disabled={useMapsGrounding}
              onChange={(e) => setSelectedModel(e.target.value as ChatModelId)}
              className="flex-1 min-w-0 px-2.5 py-1 bg-white border border-slate-300 rounded font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.tier}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-slate-600 font-medium shrink-0">Role:</span>
            <select
              aria-label="Chatbot System Role"
              value={selectedRoleId}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="flex-1 min-w-0 px-2.5 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SYSTEM_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showSystemEditor && (
          <div className="mt-1 p-2 rounded bg-[#cfe0f5] border border-sky-800/55">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              System Instruction (prepended with active EQP telemetry):
            </label>
            <textarea
              rows={2}
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-sky-800/45 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Scrollable Conversation Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f5f9fe]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'model' && (
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 space-y-2 ${
                msg.role === 'user'
                  ? 'bg-blue-700 text-white border border-blue-900/40 shadow-xs'
                  : msg.isError
                    ? 'bg-rose-100/80 border border-rose-700/60 text-rose-900'
                    : 'bg-[#e3edf9] border border-sky-800/50 text-slate-800 shadow-2xs'
              }`}
            >
              <div
                className={`flex items-center justify-between gap-4 text-[10px] font-mono ${
                  msg.role === 'user' ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                <span>
                  {msg.role === 'user' ? 'Analyst' : msg.modelUsed || 'Gemini'}
                </span>
                <span>{msg.timestamp}</span>
              </div>

              {msg.role === 'user' ? (
                <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              ) : msg.isError ? (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed">{msg.text}</p>
                  {selectedModel !== 'gemini-4-hydrogen' && (
                    <button
                      type="button"
                      onClick={() => setSelectedModel('gemini-4-hydrogen')}
                      className="px-2.5 py-1 rounded bg-white border border-rose-300 text-rose-800 text-[11px] font-medium hover:bg-rose-100 transition-colors"
                    >
                      Switch to gemini-4-hydrogen
                    </button>
                  )}
                </div>
              ) : (
                <MarkdownContent content={msg.text} />
              )}

              {msg.groundingLinks && msg.groundingLinks.length > 0 && (
                <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Google Maps Sources
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.groundingLinks.map((link) => (
                      <a
                        key={link.uri}
                        href={link.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-slate-200 hover:border-blue-300 text-[11px] text-blue-700 font-medium transition-colors"
                      >
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[200px]">{link.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-2.5 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span className="font-mono">
              Generating response with {useMapsGrounding ? 'gemini-4-hydrogen (Maps Grounded)' : selectedModel}...
            </span>
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Quick Prompts & Composer */}
      <div className="p-3 border-t border-sky-800/60 bg-[#dce9f8] space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((promptText, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isSending}
              onClick={() => void sendMessage(promptText)}
              className="px-2.5 py-1 rounded border border-sky-800/45 bg-[#eef5fd] hover:bg-[#cfe0f5] text-[11px] text-slate-800 transition-colors text-left truncate max-w-full disabled:opacity-50"
            >
              {promptText}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about residuals, outlier rejection, tectonic setting, or bulletin text..."
            className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </form>
      </div>
    </section>
  );
};
