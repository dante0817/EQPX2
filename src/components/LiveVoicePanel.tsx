import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Send, Volume2 } from 'lucide-react';
import { EQPEvent } from '../data/eqpData';

interface LiveVoicePanelProps {
  event: EQPEvent;
  eventContextText: string;
}

interface TranscriptEntry {
  id: string;
  speaker: 'You' | 'Gemini Live' | 'System';
  text: string;
  timestamp: string;
}

const VOICES = ['Zephyr', 'Kore', 'Fenrir', 'Charon', 'Puck'] as const;

function float32ToInt16Base64(floatData: Float32Array): { base64: string; rms: number } {
  const int16 = new Int16Array(floatData.length);
  let sumSq = 0;
  for (let i = 0; i < floatData.length; i++) {
    const clamped = Math.max(-1, Math.min(1, floatData[i]));
    sumSq += clamped * clamped;
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const rms = Math.sqrt(sumSq / Math.max(1, floatData.length));
  return { base64: btoa(binary), rms };
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
}

export const LiveVoicePanel: React.FC<LiveVoicePanelProps> = ({ event, eventContextText }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [voiceName, setVoiceName] = useState<(typeof VOICES)[number]>('Zephyr');
  const [isMuted, setIsMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef<boolean>(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const appendTranscript = useCallback(
    (speaker: TranscriptEntry['speaker'], text: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      const now = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.speaker === speaker && speaker !== 'System') {
          return [
            ...prev.slice(0, -1),
            { ...last, text: `${last.text} ${cleaned}`, timestamp: now },
          ];
        }
        return [
          ...prev,
          { id: `tr-${Date.now()}-${Math.random()}`, speaker, text: cleaned, timestamp: now },
        ];
      });
    },
    []
  );

  const stopAllPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // already ended
      }
    });
    activeSourcesRef.current = [];
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }, []);

  const playPcmChunk = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const samples = base64PcmToFloat32(base64Audio);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.02, nextStartTimeRef.current);
    src.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.push(src);
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((item) => item !== src);
    };
  }, []);

  const cleanupSession = useCallback(() => {
    stopAllPlayback();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close();
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setMicLevel(0);
  }, [stopAllPlayback]);

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, [cleanupSession]);

  const startVoiceSession = async () => {
    cleanupSession();
    setErrorMsg(null);
    setStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'start',
            voiceName,
            eventContext: eventContextText,
            systemInstruction:
              'You are the EQP Seismic Duty Officer voice assistant using Gemini Live. Keep spoken answers crisp, operational, and grounded in the active earthquake telemetry.',
          })
        );
      };

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data as string) as {
          type?: string;
          data?: string;
          text?: string;
          message?: string;
          voiceName?: string;
        };

        if (msg.type === 'ready') {
          setStatus('connected');
          appendTranscript('System', `Connected to gemini-3.8-live (${msg.voiceName || voiceName}) for ${event.filename}`);

          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          sourceNodeRef.current = source;
          processorRef.current = processor;

          processor.onaudioprocess = (audioEvent) => {
            if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) {
              setMicLevel(0);
              return;
            }
            const channel = audioEvent.inputBuffer.getChannelData(0);
            const { base64, rms } = float32ToInt16Base64(channel);
            setMicLevel(Math.min(100, Math.round(rms * 420)));
            ws.send(JSON.stringify({ type: 'audio', data: base64 }));
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);
          return;
        }

        if (msg.type === 'audio' && msg.data) {
          playPcmChunk(msg.data);
          return;
        }
        if (msg.type === 'interrupted') {
          stopAllPlayback();
          return;
        }
        if (msg.type === 'inputTranscript' && msg.text) {
          appendTranscript('You', msg.text);
          return;
        }
        if (msg.type === 'outputTranscript' && msg.text) {
          appendTranscript('Gemini Live', msg.text);
          return;
        }
        if (msg.type === 'error') {
          setErrorMsg(msg.message || 'Live voice session error.');
          setStatus('error');
          cleanupSession();
          return;
        }
        if (msg.type === 'closed') {
          setStatus('idle');
          cleanupSession();
        }
      };

      ws.onerror = () => {
        setErrorMsg('WebSocket connection error while connecting to Gemini Live.');
        setStatus('error');
        cleanupSession();
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
      };
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Microphone access or audio initialization failed.'
      );
      setStatus('error');
      cleanupSession();
    }
  };

  const endVoiceSession = () => {
    cleanupSession();
    setStatus('idle');
    appendTranscript('System', 'Voice session ended.');
  };

  const handleSendTextCue = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
    appendTranscript('You', trimmed);
    setTextInput('');
  };

  return (
    <section className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg overflow-hidden flex flex-col h-[640px] shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      <div className="px-4 py-3 border-b border-indigo-800/60 bg-[#e5e1f7] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-indigo-800" />
            <div>
              <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                Real-Time Voice Briefing
              </h2>
              <p className="text-[11px] text-slate-600 font-mono">
                gemini-3.8-live · 16 kHz PCM in / 24 kHz PCM out
              </p>
            </div>
          </div>

          <span
            className={`text-xs font-mono font-semibold ${
              status === 'connected'
                ? 'text-emerald-700'
                : status === 'connecting'
                  ? 'text-amber-700'
                  : status === 'error'
                    ? 'text-rose-700'
                    : 'text-slate-500'
            }`}
          >
            {status === 'connected'
              ? 'LIVE AUDIO ACTIVE'
              : status === 'connecting'
                ? 'CONNECTING...'
                : status === 'error'
                  ? 'SESSION ERROR'
                  : 'STANDBY'}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-slate-600 font-medium">Voice:</span>
            <select
              aria-label="Live Voice Persona"
              value={voiceName}
              disabled={status === 'connected' || status === 'connecting'}
              onChange={(e) => setVoiceName(e.target.value as (typeof VOICES)[number])}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            >
              {VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            {status === 'connected' && (
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                  isMuted
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                {isMuted ? 'Muted' : 'Mic On'}
              </button>
            )}

            {status === 'connected' || status === 'connecting' ? (
              <button
                type="button"
                onClick={endVoiceSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                End Call
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startVoiceSession()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                Start Voice Call
              </button>
            )}
          </div>
        </div>

        {/* Live Microphone Input Level Meter */}
        <div className="space-y-1 bg-[#dcd6f3] border border-indigo-800/50 rounded px-2.5 py-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-700">
            <span>Microphone Input Level</span>
            <span>{status === 'connected' ? (isMuted ? 'MUTED' : `${micLevel}%`) : '0%'}</span>
          </div>
          <div className="w-full h-1.5 bg-[#c5bce9] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                isMuted ? 'bg-slate-400' : 'bg-blue-600'
              }`}
              style={{ width: `${status === 'connected' && !isMuted ? micLevel : 0}%` }}
            />
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-rose-100/80 border border-rose-700/60 text-xs text-rose-900">
          {errorMsg}
        </div>
      )}

      {/* Live Transcript Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#f8f7fd]">
        {transcripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-2">
            <Mic className="w-7 h-7 text-indigo-400" />
            <p className="text-xs font-medium text-slate-700">
              Start a live voice session with Gemini Live ({voiceName})
            </p>
            <p className="text-xs text-slate-500 max-w-xs">
              Speak directly about {event.filename} — ask for quick residual diagnostics, magnitude justification, or nearest impacted towns in real time.
            </p>
          </div>
        ) : (
          transcripts.map((item) => (
            <div
              key={item.id}
              className={`p-2.5 rounded-md border text-xs space-y-1 ${
                item.speaker === 'You'
                  ? 'bg-[#dce9f8] border-sky-800/55 text-slate-900'
                  : item.speaker === 'Gemini Live'
                    ? 'bg-[#e5e1f7] border-indigo-800/55 text-slate-800'
                    : 'bg-[#dfe6f0] border-slate-700/55 text-slate-700 font-mono text-[11px]'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-600">
                <span className="font-semibold text-slate-800">{item.speaker}</span>
                <span>{item.timestamp}</span>
              </div>
              <p className="leading-relaxed">{item.text}</p>
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Mid-Call Text Prompt Cue */}
      <form
        onSubmit={handleSendTextCue}
        className="p-3 border-t border-indigo-800/60 bg-[#e5e1f7] flex gap-2"
      >
        <input
          type="text"
          value={textInput}
          disabled={status !== 'connected'}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder={
            status === 'connected'
              ? 'Send a text cue mid-call (e.g. "Summarize nearest towns")...'
              : 'Connect Live Audio above to speak or send live cues...'
          }
          className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={status !== 'connected' || !textInput.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Cue
        </button>
      </form>
    </section>
  );
};
