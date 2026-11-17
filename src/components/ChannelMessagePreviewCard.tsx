import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MessageCircle,
  ShieldAlert,
} from 'lucide-react';
import {
  type CanonicalBulletinSource,
  CHANNEL_LABELS,
  type CommunicationChannel,
  type CommunicationTemplateId,
  MOBILE_RECOMMENDED_CHARS,
  validateMobileMessageLength,
  validateXPostLength,
} from '../utils/socialMediaComms';

export type PreviewCardMode = 'x_and_viber' | CommunicationChannel;

interface ChannelMessagePreviewCardProps {
  source: CanonicalBulletinSource;
  subject: string;
  body: string;
  templateId: CommunicationTemplateId;
  previewMode: PreviewCardMode;
  onChangePreviewMode: (mode: PreviewCardMode) => void;
  xMaxChars: number;
  operatorLabel: string;
  xHandle?: string;
  handoffNote: string;
  onSwitchToXShortTemplate?: () => void;
  onSwitchToViberTemplate?: () => void;
  onSwitchToMessengerTemplate?: () => void;
}

const CHANNEL_TABS: ReadonlyArray<{ id: PreviewCardMode; label: string }> = [
  { id: 'x_and_viber', label: 'X & Viber Side-by-Side' },
  { id: 'x_twitter', label: 'X / Twitter' },
  { id: 'viber', label: 'Viber' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'email', label: 'Email' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'other', label: 'Other' },
];

export const ChannelMessagePreviewCard: React.FC<ChannelMessagePreviewCardProps> = ({
  source,
  subject,
  body,
  templateId,
  previewMode,
  onChangePreviewMode,
  xMaxChars,
  operatorLabel,
  xHandle,
  handoffNote,
  onSwitchToXShortTemplate,
  onSwitchToViberTemplate,
  onSwitchToMessengerTemplate,
}) => {
  const xCheck = validateXPostLength(body, xMaxChars);
  const viberCheck = validateMobileMessageLength('viber', body, MOBILE_RECOMMENDED_CHARS.viber);
  const messengerCheck = validateMobileMessageLength(
    'messenger',
    body,
    MOBILE_RECOMMENDED_CHARS.messenger
  );
  const viberLineCount = body ? body.split(/\r?\n/).length : 0;
  const xProgressPct = Math.min(
    100,
    Math.round((xCheck.length / Math.max(1, xCheck.maxChars)) * 100)
  );

  const renderXPostCard = () => (
    <div
      data-testid="x-preview-card"
      className="rounded-md border border-slate-300 bg-white overflow-hidden shadow-2xs flex flex-col"
    >
      <div className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-500 flex items-center justify-center text-xs font-extrabold shrink-0">
            X
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold truncate">
              <span>{operatorLabel || 'Earthquake Monitoring Desk'}</span>
              {source.isReleasedSource ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-emerald-600 text-white font-bold">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  WEB-PUBLISHED
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-bold">
                  <ShieldAlert className="w-2.5 h-2.5" />
                  DRAFT
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-300 font-mono truncate">
              {xHandle?.trim() ? (xHandle.trim().startsWith('@') ? xHandle.trim() : `@${xHandle.trim()}`) : '@eqp_bulletin'} &bull; {source.bulletinRevision}
            </div>
          </div>
        </div>
        <span
          data-testid="x-char-counter"
          className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border shrink-0 ${
            xCheck.valid
              ? 'bg-emerald-950/60 border-emerald-400 text-emerald-200'
              : 'bg-rose-950/80 border-rose-400 text-rose-200'
          }`}
        >
          {xCheck.length} / {xCheck.maxChars} chars
        </span>
      </div>

      <div className="p-3 space-y-2 flex-1 bg-white">
        <pre className="font-sans text-xs whitespace-pre-wrap break-words text-slate-900 leading-relaxed">
          {body || '(Empty message body)'}
        </pre>
      </div>

      <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 space-y-1.5">
        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              !xCheck.valid
                ? 'bg-rose-600'
                : xProgressPct >= 85
                ? 'bg-amber-500'
                : 'bg-sky-600'
            }`}
            style={{ width: `${xProgressPct}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span
            className={`font-semibold ${
              xCheck.valid ? 'text-slate-700' : 'text-rose-800 font-bold'
            }`}
          >
            {xCheck.valid
              ? `${xCheck.maxChars - xCheck.length} characters remaining within X limit`
              : `Exceeds X limit by ${xCheck.overflow} character(s)`}
          </span>
          {!xCheck.valid && templateId !== 'x_short' && onSwitchToXShortTemplate && (
            <button
              type="button"
              onClick={onSwitchToXShortTemplate}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
            >
              <AlertTriangle className="w-3 h-3" />
              Use X/Twitter Short Template
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderViberMessageCard = () => (
    <div
      data-testid="viber-preview-card"
      className="rounded-md border border-[#5a45d6] bg-[#edeaf9] overflow-hidden shadow-2xs flex flex-col"
    >
      <div className="bg-[#7360f2] text-white px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold truncate">Viber Mobile Chat Preview</div>
            <div className="text-[10px] text-violet-100 truncate">
              {source.eventKey} &bull; Recommended &le; {viberCheck.maxRecommended} chars
            </div>
          </div>
        </div>
        <span
          data-testid="viber-char-counter"
          className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border shrink-0 ${
            viberCheck.fits
              ? 'bg-emerald-950/35 border-emerald-300 text-white'
              : 'bg-amber-950/60 border-amber-300 text-amber-100'
          }`}
        >
          {viberCheck.length} / {viberCheck.maxRecommended} chars &bull; {viberLineCount}L
        </span>
      </div>

      <div className="p-3 flex-1">
        <div className="bg-white border border-violet-200 rounded-lg rounded-tl-xs p-2.5 shadow-2xs space-y-1.5">
          <div className="text-[11px] font-bold text-[#4c38c7] border-b border-violet-100 pb-1">
            {subject}
          </div>
          <pre className="font-sans text-xs whitespace-pre-wrap break-words text-slate-900 leading-snug">
            {body || '(Empty message body)'}
          </pre>
          <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500 font-mono">
            <span>{source.originDateTimePht}</span>
            <span>{source.isReleasedSource ? 'Prepared from released bulletin' : 'Draft preview'}</span>
          </div>
        </div>
      </div>

      <div className="px-3 py-1.5 bg-[#e3def8] border-t border-violet-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#3a2a9e]">
        <span className="font-semibold">
          {viberCheck.fits
            ? `Fits mobile single-screen limit (${viberCheck.maxRecommended - viberCheck.length} chars spare)`
            : `Exceeds mobile quick-read target by ${viberCheck.overflow} chars`}
        </span>
        {templateId !== 'concise_viber' && onSwitchToViberTemplate && (
          <button
            type="button"
            onClick={onSwitchToViberTemplate}
            className="font-bold underline hover:text-[#24196b] cursor-pointer"
          >
            Load Mobile Viber Template
          </button>
        )}
      </div>
    </div>
  );

  const renderMessengerCard = () => (
    <div
      data-testid="messenger-preview-card"
      className="rounded-md border border-blue-500 bg-sky-50 overflow-hidden shadow-2xs flex flex-col"
    >
      <div className="bg-gradient-to-r from-[#0084ff] to-[#0059d6] text-white px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold truncate">Messenger Mobile Chat Preview</div>
            <div className="text-[10px] text-sky-100 truncate">
              Recommended &le; {messengerCheck.maxRecommended} chars for mobile notification cards
            </div>
          </div>
        </div>
        <span
          data-testid="messenger-char-counter"
          className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border shrink-0 ${
            messengerCheck.fits
              ? 'bg-emerald-950/35 border-emerald-300 text-white'
              : 'bg-amber-950/60 border-amber-300 text-amber-100'
          }`}
        >
          {messengerCheck.length} / {messengerCheck.maxRecommended} chars
        </span>
      </div>

      <div className="p-3 flex-1">
        <div className="max-w-md bg-white border border-sky-200 rounded-2xl rounded-bl-xs p-3 shadow-2xs space-y-1.5">
          <pre className="font-sans text-xs whitespace-pre-wrap break-words text-slate-900 leading-snug">
            {body || '(Empty message body)'}
          </pre>
          <div className="pt-1 text-[10px] text-slate-500 font-mono">
            {source.originDateTimePht}
          </div>
        </div>
      </div>

      <div className="px-3 py-1.5 bg-sky-100 border-t border-sky-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-sky-950">
        <span className="font-semibold">
          {messengerCheck.fits
            ? `Fits mobile push/chat preview (${messengerCheck.maxRecommended - messengerCheck.length} chars spare)`
            : `Exceeds Messenger quick-read target by ${messengerCheck.overflow} chars`}
        </span>
        {templateId !== 'concise_messenger' && onSwitchToMessengerTemplate && (
          <button
            type="button"
            onClick={onSwitchToMessengerTemplate}
            className="font-bold underline hover:text-blue-900 cursor-pointer"
          >
            Load Mobile Messenger Template
          </button>
        )}
      </div>
    </div>
  );

  const renderGenericChannelCard = (channel: CommunicationChannel) => (
    <div className="bg-slate-50 border border-slate-300 rounded p-2.5 text-xs space-y-1.5">
      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
        <span className="font-bold text-slate-800">
          {CHANNEL_LABELS[channel]} Draft Preview
        </span>
        <span className="font-mono text-[11px] text-slate-600">{body.length} chars</span>
      </div>
      {channel === 'email' && (
        <div className="font-semibold text-slate-800 border-b border-slate-200 pb-1">
          Subject: {subject}
        </div>
      )}
      <pre className="font-sans text-xs whitespace-pre-wrap break-words text-slate-900 leading-relaxed">
        {body}
      </pre>
      <div className="pt-1.5 border-t border-slate-200 text-[11px] text-slate-600 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-700" />
        <span>{handoffNote}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-slate-400 rounded-md p-3 shadow-xs space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div>
          <h3 className="text-xs font-bold uppercase text-slate-800">
            Channel Message Preview (X / Twitter, Viber &amp; Mobile)
          </h3>
          <p className="text-[11px] text-slate-600">
            Live platform formatting and recommended length indicators
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {CHANNEL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangePreviewMode(tab.id)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                previewMode === tab.id
                  ? 'bg-sky-700 text-white border-sky-900'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {previewMode === 'x_and_viber' ? (
        <div className="space-y-2.5">
          {renderXPostCard()}
          {renderViberMessageCard()}
        </div>
      ) : previewMode === 'x_twitter' ? (
        renderXPostCard()
      ) : previewMode === 'viber' ? (
        renderViberMessageCard()
      ) : previewMode === 'messenger' ? (
        renderMessengerCard()
      ) : (
        renderGenericChannelCard(previewMode)
      )}
    </div>
  );
};
