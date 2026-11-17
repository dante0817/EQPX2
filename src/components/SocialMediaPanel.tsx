import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FileSpreadsheet,
  FileWarning,
  History,
  Lock,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import type { EQPEvent } from '../data/eqpData';
import type { MagnitudeFreshnessInspection } from '../utils/magnitudeEngine';
import {
  buildManualAssistedChannelUrl,
  buildMessageFingerprint,
  buildViberProtocolForwardUrl,
  type CanonicalBulletinSource,
  CHANNEL_LABELS,
  COMMUNICATION_CHANNEL_ORDER,
  type CommunicationChannel,
  type CommunicationClassification,
  type CommunicationDestination,
  type CommunicationDraftSnapshot,
  type CommunicationTemplateId,
  type CommsSettings,
  computeDispatchQueueFilterCounts,
  computeTodayDispatchStats,
  createDefaultDispatchQueueFilterState,
  DEFAULT_COMMS_SETTINGS,
  DISPATCH_STATUS_ORDER,
  DISPATCH_STATUS_VISUALS,
  type DispatchQueueFilterSessionState,
  type DispatchRecord,
  type DispatchStatus,
  type DistributionGroup,
  exportDispatchHistoryCsv,
  exportTodayChannelReportCsv,
  filterDispatchQueueRecords,
  filterTodayDispatchHistoryRecords,
  findDuplicateDispatches,
  generateDeterministicMessage,
  isRecordStaleAgainstSource,
  isSourceMarkedStale,
  loadDispatchQueueFilterSessionState,
  MOBILE_RECOMMENDED_CHARS,
  type OfficeRecord,
  type RecipientDirectory,
  resolveCanonicalBulletinSource,
  resolveUniqueSelectedDestinations,
  saveDispatchQueueFilterSessionState,
  type SettingsValidationResult,
  TEMPLATE_DEFINITIONS,
  toggleFilterItem,
  validateMobileMessageLength,
  validatePrepareMessageForDispatch,
  validateSafeExternalUrl,
  validateSettingsUrlsAndHandle,
  validateXPostLength,
} from '../utils/socialMediaComms';
import { createLocalSocialMediaRepositories } from '../utils/socialMediaRepository';
import {
  type ApiConnectivityStatusRecord,
  checkAllSocialApiStatuses,
  type MockApiDispatchResponse,
  mockPostFacebookPageFeed,
  mockPostTwitterTweet,
  mockPostViberMessage,
  type SocialApiProvider,
} from '../services/socialMediaApi';
import {
  ChannelMessagePreviewCard,
  type PreviewCardMode,
} from './ChannelMessagePreviewCard';
import { DispatchHistoryPanel } from './DispatchHistoryPanel';
import { DispatchQueueFilterBar } from './DispatchQueueFilterBar';
import { DispatchStatusLegend } from './DispatchStatusLegend';

export type SocialMediaSubSection =
  | 'prepare'
  | 'recipients'
  | 'queue'
  | 'history'
  | 'settings';

export const CHANNEL_MESSAGE_CHAR_LIMITS: Record<CommunicationChannel, number> = {
  x_twitter: 280,
  viber: 7000,
  messenger: 2000,
  facebook: 63206,
  email: 32000,
  other: 4000,
};

export interface ChannelLengthViolation {
  channel: CommunicationChannel;
  channelLabel: string;
  messageLength: number;
  maxChars: number;
  overflow: number;
}

export interface SelectedChannelsLengthValidation {
  valid: boolean;
  messageLength: number;
  checkedChannels: Array<{
    channel: CommunicationChannel;
    channelLabel: string;
    maxChars: number;
    exceeded: boolean;
    overflow: number;
  }>;
  violations: ChannelLengthViolation[];
  errorTitle: 'Length Exceeded' | null;
  errorMessage: string | null;
}

/**
 * Validates message body length against the character limits of every selected channel
 * (e.g., 280 for X/Twitter, 2000 for Messenger, 7000 for Viber).
 */
export function validateSelectedChannelsMessageLength(
  messageBody: string,
  selectedDestinations: CommunicationDestination[],
  xMaxChars: number = CHANNEL_MESSAGE_CHAR_LIMITS.x_twitter
): SelectedChannelsLengthValidation {
  const messageLength = messageBody.length;
  const uniqueChannels: CommunicationChannel[] = [];
  for (const dest of selectedDestinations) {
    if (!uniqueChannels.includes(dest.channel)) {
      uniqueChannels.push(dest.channel);
    }
  }

  const checkedChannels = uniqueChannels.map((channel) => {
    const maxChars =
      channel === 'x_twitter'
        ? Math.max(1, Math.trunc(xMaxChars || CHANNEL_MESSAGE_CHAR_LIMITS.x_twitter))
        : CHANNEL_MESSAGE_CHAR_LIMITS[channel];
    const overflow = Math.max(0, messageLength - maxChars);
    return {
      channel,
      channelLabel: CHANNEL_LABELS[channel],
      maxChars,
      exceeded: overflow > 0,
      overflow,
    };
  });

  const violations: ChannelLengthViolation[] = checkedChannels
    .filter((c) => c.exceeded)
    .map((c) => ({
      channel: c.channel,
      channelLabel: c.channelLabel,
      messageLength,
      maxChars: c.maxChars,
      overflow: c.overflow,
    }));

  const errorMessage =
    violations.length > 0
      ? `Length Exceeded: Message is ${messageLength} characters, breaching the limit for ${violations
          .map((v) => `${v.channelLabel} (${v.messageLength}/${v.maxChars}, +${v.overflow} over)`)
          .join('; ')}.`
      : null;

  return {
    valid: violations.length === 0,
    messageLength,
    checkedChannels,
    violations,
    errorTitle: violations.length > 0 ? 'Length Exceeded' : null,
    errorMessage,
  };
}

export interface SocialMediaPanelProps {
  event: EQPEvent;
  freshness?: MagnitudeFreshnessInspection;
  primaryLocationLabel: string;
  isBulletinEdited: boolean;
  hasSavedBulletinOnDisk: boolean;
  savedBulletinFilename?: string | null;
  openedBulletinFilename?: string | null;
  onNavigateToBulletin: () => void;
  onNotice: (msg: string) => void;
}

const ALL_CHANNELS: CommunicationChannel[] = [
  'viber',
  'facebook',
  'messenger',
  'x_twitter',
  'email',
  'other',
];

function createLocalId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function nextCommRevisionId(current: string): string {
  const match = current.match(/^COMM-r(\d+)$/);
  const num = match ? Number(match[1]) : 1;
  return `COMM-r${num + 1}`;
}

function triggerExternalHandoffNavigation(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  if (url.startsWith('https://')) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function formatShortIsoTimestamp(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return `${new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(dt)} PHT`;
  } catch {
    return iso;
  }
}

export const SocialMediaPanel: React.FC<SocialMediaPanelProps> = ({
  event,
  freshness,
  primaryLocationLabel,
  isBulletinEdited,
  hasSavedBulletinOnDisk,
  savedBulletinFilename,
  openedBulletinFilename,
  onNavigateToBulletin,
  onNotice,
}) => {
  const repos = useMemo(() => createLocalSocialMediaRepositories(), []);

  const [subSection, setSubSection] = useState<SocialMediaSubSection>('prepare');
  const [directory, setDirectory] = useState<RecipientDirectory>(() => repos.directory.load());
  const [draftsByEventKey, setDraftsByEventKey] = useState<
    Record<string, CommunicationDraftSnapshot>
  >(() => repos.drafts.loadAll());
  const [queue, setQueue] = useState<DispatchRecord[]>(() => repos.queue.loadAll());
  const [history, setHistory] = useState<DispatchRecord[]>(() => repos.history.loadAll());
  const [settings, setSettings] = useState<CommsSettings>(() => repos.settings.load());
  const [settingsDraft, setSettingsDraft] = useState<CommsSettings>(() => repos.settings.load());
  const [settingsErrors, setSettingsErrors] = useState<SettingsValidationResult['fieldErrors']>({});
  const [settingsSavedNotice, setSettingsSavedNotice] = useState<string | null>(null);

  // Sync localStorage repositories cleanly
  useEffect(() => {
    repos.directory.save(directory);
  }, [directory, repos]);

  useEffect(() => {
    repos.drafts.saveAll(draftsByEventKey);
  }, [draftsByEventKey, repos]);

  useEffect(() => {
    repos.queue.saveAll(queue);
  }, [queue, repos]);

  useEffect(() => {
    repos.history.saveAll(history);
  }, [history, repos]);

  useEffect(() => {
    repos.settings.save(settings);
  }, [settings, repos]);

  // Future-integration mock API connectivity state (Viber, Facebook, Twitter)
  const [apiStatuses, setApiStatuses] = useState<ApiConnectivityStatusRecord[]>([]);
  const [isCheckingApis, setIsCheckingApis] = useState<boolean>(false);
  const [mockApiResponses, setMockApiResponses] = useState<
    Partial<Record<SocialApiProvider, MockApiDispatchResponse>>
  >({});

  useEffect(() => {
    let active = true;
    setIsCheckingApis(true);
    void checkAllSocialApiStatuses(settings.authorizedChannelUrls).then((res) => {
      if (!active) return;
      setApiStatuses(res);
      setIsCheckingApis(false);
    });
    return () => {
      active = false;
    };
  }, [settings.authorizedChannelUrls]);

  const handleRefreshApiStatus = async () => {
    setIsCheckingApis(true);
    const res = await checkAllSocialApiStatuses(settings.authorizedChannelUrls);
    setApiStatuses(res);
    setIsCheckingApis(false);
    onNotice('Refreshed mock API connectivity status for Viber, Facebook, and X/Twitter.');
  };

  const source: CanonicalBulletinSource = useMemo(
    () =>
      resolveCanonicalBulletinSource({
        event,
        primaryLocationLabel,
        freshness,
        isBulletinEdited,
        hasSavedBulletinOnDisk,
        savedBulletinFilename,
        openedBulletinFilename,
        officialBulletinUrl: settings.officialBulletinUrl,
      }),
    [
      event,
      primaryLocationLabel,
      freshness,
      isBulletinEdited,
      hasSavedBulletinOnDisk,
      savedBulletinFilename,
      openedBulletinFilename,
      settings.officialBulletinUrl,
    ]
  );

  // Build or retrieve active draft for active event
  const activeDraft: CommunicationDraftSnapshot = useMemo(() => {
    const existing = draftsByEventKey[source.eventKey];
    if (existing) return existing;
    const generated = generateDeterministicMessage(source, settings.defaultTemplateId);
    const now = new Date().toISOString();
    return {
      draftId: createLocalId('DRAFT'),
      eventId: source.eventId,
      eventKey: source.eventKey,
      templateId: settings.defaultTemplateId,
      classification: settings.defaultClassification,
      subject: generated.subject,
      body: generated.body,
      communicationRevisionId: 'COMM-r1',
      messageFingerprint: buildMessageFingerprint(
        settings.defaultTemplateId,
        settings.defaultClassification,
        generated.subject,
        generated.body
      ),
      sourceBulletinId: source.bulletinId,
      sourceBulletinRevision: source.bulletinRevision,
      sourceFingerprint: source.sourceFingerprint,
      editedFromTemplate: false,
      localAuthorization: null,
      createdAt: now,
      updatedAt: now,
    };
  }, [draftsByEventKey, source, settings.defaultClassification, settings.defaultTemplateId]);

  const isDraftStale = isRecordStaleAgainstSource(
    activeDraft.sourceFingerprint,
    source.sourceFingerprint
  );

  const [previewMode, setPreviewMode] = useState<PreviewCardMode>('x_and_viber');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() =>
    settings.defaultGroupId ? [settings.defaultGroupId] : []
  );
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);
  const [authNoteInput, setAuthNoteInput] = useState<string>('');
  const [lastAuthInvalidationMsg, setLastAuthInvalidationMsg] = useState<string | null>(null);

  // Queue confirmation inputs & session-persisted multi-select filters
  const [confirmRefs, setConfirmRefs] = useState<Record<string, string>>({});
  const [confirmNotes, setConfirmNotes] = useState<Record<string, string>>({});
  const [queueFilters, setQueueFilters] = useState<DispatchQueueFilterSessionState>(() =>
    loadDispatchQueueFilterSessionState()
  );
  const [expandedQueueIds, setExpandedQueueIds] = useState<Record<string, boolean>>({});
  const [viberDirectHandoffId, setViberDirectHandoffId] = useState<string | null>(null);

  useEffect(() => {
    saveDispatchQueueFilterSessionState(queueFilters);
  }, [queueFilters]);

  // Recipient CRUD states
  const [officeForm, setOfficeForm] = useState<{
    editingId: string | null;
    officeName: string;
    officeType: string;
    region: string;
    province: string;
    active: boolean;
  }>({
    editingId: null,
    officeName: '',
    officeType: 'DRRMO / Partner Office',
    region: '',
    province: '',
    active: true,
  });

  const [destForm, setDestForm] = useState<{
    editingId: string | null;
    officeId: string;
    channel: CommunicationChannel;
    displayName: string;
    destinationIdentifier: string;
    notes: string;
    active: boolean;
  }>({
    editingId: null,
    officeId: '',
    channel: 'viber',
    displayName: '',
    destinationIdentifier: '',
    notes: '',
    active: true,
  });

  const [groupForm, setGroupForm] = useState<{
    editingId: string | null;
    groupName: string;
    destinationIds: string[];
    active: boolean;
  }>({
    editingId: null,
    groupName: '',
    destinationIds: [],
    active: true,
  });

  const saveDraft = (updated: CommunicationDraftSnapshot) => {
    setDraftsByEventKey((prev) => ({
      ...prev,
      [source.eventKey]: updated,
    }));
  };

  const handleSelectTemplate = (templateId: CommunicationTemplateId) => {
    const generated = generateDeterministicMessage(source, templateId);
    const now = new Date().toISOString();
    const hadAuth = Boolean(activeDraft.localAuthorization?.authorized);
    const nextRev = nextCommRevisionId(activeDraft.communicationRevisionId);
    if (templateId === 'concise_viber') {
      setPreviewMode((prev) => (prev === 'x_and_viber' ? 'x_and_viber' : 'viber'));
    } else if (templateId === 'concise_messenger') {
      setPreviewMode('messenger');
    } else if (templateId === 'x_short') {
      setPreviewMode((prev) => (prev === 'x_and_viber' ? 'x_and_viber' : 'x_twitter'));
    } else if (templateId === 'public_summary') {
      setPreviewMode('facebook');
    } else if (templateId === 'standard_office' || templateId === 'updated_bulletin') {
      setPreviewMode('email');
    }
    saveDraft({
      ...activeDraft,
      templateId,
      subject: generated.subject,
      body: generated.body,
      communicationRevisionId: nextRev,
      messageFingerprint: buildMessageFingerprint(
        templateId,
        activeDraft.classification,
        generated.subject,
        generated.body
      ),
      sourceBulletinId: source.bulletinId,
      sourceBulletinRevision: source.bulletinRevision,
      sourceFingerprint: source.sourceFingerprint,
      editedFromTemplate: false,
      localAuthorization: null,
      updatedAt: now,
    });
    if (hadAuth) {
      setLastAuthInvalidationMsg(
        'Template changed — prior local authorization record was automatically invalidated.'
      );
    } else {
      setLastAuthInvalidationMsg(null);
    }
  };

  const handleRegenerateFromSource = () => {
    const generated = generateDeterministicMessage(source, activeDraft.templateId);
    const now = new Date().toISOString();
    const hadAuth = Boolean(activeDraft.localAuthorization?.authorized);
    const nextRev = nextCommRevisionId(activeDraft.communicationRevisionId);
    saveDraft({
      ...activeDraft,
      subject: generated.subject,
      body: generated.body,
      communicationRevisionId: nextRev,
      messageFingerprint: buildMessageFingerprint(
        activeDraft.templateId,
        activeDraft.classification,
        generated.subject,
        generated.body
      ),
      sourceBulletinId: source.bulletinId,
      sourceBulletinRevision: source.bulletinRevision,
      sourceFingerprint: source.sourceFingerprint,
      editedFromTemplate: false,
      localAuthorization: null,
      updatedAt: now,
    });
    setLastAuthInvalidationMsg(
      hadAuth
        ? 'Message regenerated from latest bulletin source — prior authorization invalidated.'
        : null
    );
    onNotice(`Regenerated ${source.eventKey} draft from canonical bulletin source.`);
  };

  const handleClassificationChange = (classification: CommunicationClassification) => {
    const hadAuth = Boolean(activeDraft.localAuthorization?.authorized);
    const nextRev =
      classification !== activeDraft.classification
        ? nextCommRevisionId(activeDraft.communicationRevisionId)
        : activeDraft.communicationRevisionId;
    saveDraft({
      ...activeDraft,
      classification,
      communicationRevisionId: nextRev,
      messageFingerprint: buildMessageFingerprint(
        activeDraft.templateId,
        classification,
        activeDraft.subject,
        activeDraft.body
      ),
      localAuthorization: null,
      updatedAt: new Date().toISOString(),
    });
    if (hadAuth && classification !== activeDraft.classification) {
      setLastAuthInvalidationMsg(
        'Message classification changed — prior local authorization record was invalidated.'
      );
    }
  };

  const handleEditSubjectOrBody = (field: 'subject' | 'body', value: string) => {
    const nextSubject = field === 'subject' ? value : activeDraft.subject;
    const nextBody = field === 'body' ? value : activeDraft.body;
    const hadAuth = Boolean(activeDraft.localAuthorization?.authorized);
    const nextRev =
      activeDraft.editedFromTemplate && !hadAuth
        ? activeDraft.communicationRevisionId
        : nextCommRevisionId(activeDraft.communicationRevisionId);
    saveDraft({
      ...activeDraft,
      subject: nextSubject,
      body: nextBody,
      communicationRevisionId: nextRev,
      messageFingerprint: buildMessageFingerprint(
        activeDraft.templateId,
        activeDraft.classification,
        nextSubject,
        nextBody
      ),
      editedFromTemplate: true,
      localAuthorization: null,
      updatedAt: new Date().toISOString(),
    });
    if (hadAuth) {
      setLastAuthInvalidationMsg(
        'Message content edited — prior local authorization record was automatically invalidated.'
      );
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotice(`Copied ${label} to clipboard (NOT YET SENT — confirm in Dispatch Queue after posting).`);
    } catch {
      onNotice(`Unable to access clipboard automatically; select and copy ${label} manually.`);
    }
  };

  const handleRecordLocalAuth = () => {
    if (isSourceMarkedStale(source)) {
      onNotice(
        `Local authorization blocked: bulletin source ${source.bulletinId} (${source.bulletinRevision}) is marked as STALE. Save or recalculate the bulletin first.`
      );
      return;
    }
    if (isDraftStale) {
      onNotice('Regenerate draft from latest bulletin source before recording local authorization.');
      return;
    }
    const operator = settings.operatorLabel.trim() || 'Duty Officer (Local Workstation)';
    saveDraft({
      ...activeDraft,
      localAuthorization: {
        authorized: true,
        operatorLabel: operator,
        recordedAt: new Date().toISOString(),
        recordAuthenticityLabel: 'UNVERIFIED LOCAL RECORD',
        note: authNoteInput.trim() || 'Local operator check recorded',
      },
      updatedAt: new Date().toISOString(),
    });
    setLastAuthInvalidationMsg(null);
    onNotice('Recorded local authorization (UNVERIFIED LOCAL RECORD).');
  };

  const handleRevokeLocalAuth = () => {
    saveDraft({
      ...activeDraft,
      localAuthorization: null,
      updatedAt: new Date().toISOString(),
    });
    onNotice('Cleared local authorization record.');
  };

  // Resolved deduplicated recipients for staging
  const selectionResolution = useMemo(
    () =>
      resolveUniqueSelectedDestinations({
        directory,
        selectedDestinationIds,
        selectedGroupIds,
      }),
    [directory, selectedDestinationIds, selectedGroupIds]
  );

  const duplicateMatches = useMemo(
    () =>
      findDuplicateDispatches({
        destinations: selectionResolution.destinations,
        eventKey: source.eventKey,
        sourceBulletinRevision: source.bulletinRevision,
        communicationRevisionId: activeDraft.communicationRevisionId,
        existingRecords: [...queue, ...history],
      }),
    [
      selectionResolution.destinations,
      source.eventKey,
      source.bulletinRevision,
      activeDraft.communicationRevisionId,
      queue,
      history,
    ]
  );

  const xValidation = validateXPostLength(activeDraft.body, settings.xMaxChars);
  const mobileViberValidation = validateMobileMessageLength(
    'viber',
    activeDraft.body,
    MOBILE_RECOMMENDED_CHARS.viber
  );
  const mobileMessengerValidation = validateMobileMessageLength(
    'messenger',
    activeDraft.body,
    MOBILE_RECOMMENDED_CHARS.messenger
  );
  const resolvedPreviewChannel: CommunicationChannel =
    previewMode === 'x_and_viber' ? 'viber' : previewMode;
  const previewHandoff = buildManualAssistedChannelUrl({
    channel: resolvedPreviewChannel,
    destinationIdentifier:
      settings.authorizedChannelUrls[
        resolvedPreviewChannel === 'email' ? 'other' : resolvedPreviewChannel
      ] || (resolvedPreviewChannel === 'email' ? 'desk@example.org' : ''),
    subject: activeDraft.subject,
    body: activeDraft.body,
    settings,
  });

  const dispatchValidation = useMemo(
    () =>
      validatePrepareMessageForDispatch({
        source,
        draft: activeDraft,
        selectedDestinations: selectionResolution.destinations,
        xMaxChars: settings.xMaxChars,
      }),
    [source, activeDraft, selectionResolution.destinations, settings.xMaxChars]
  );

  const channelLengthValidation = useMemo(
    () =>
      validateSelectedChannelsMessageLength(
        activeDraft.body,
        selectionResolution.destinations,
        settings.xMaxChars
      ),
    [activeDraft.body, selectionResolution.destinations, settings.xMaxChars]
  );

  const publicReleaseBlockedReason = useMemo(() => {
    if (activeDraft.classification !== 'public_release') return null;
    if (!source.isReleasedSource) {
      return 'Public release staging is blocked because the canonical bulletin source is draft/unverified or stale.';
    }
    if (!activeDraft.localAuthorization?.authorized) {
      return 'Public release staging requires recording a Local Authorization check first.';
    }
    return null;
  }, [activeDraft.classification, activeDraft.localAuthorization, source.isReleasedSource]);

  const handleStageToDispatchQueue = () => {
    if (!channelLengthValidation.valid) {
      onNotice(channelLengthValidation.errorMessage || 'Length Exceeded on selected channel.');
      return;
    }
    if (!dispatchValidation.canDispatch) {
      onNotice(
        dispatchValidation.primaryBlockingReason ||
          'Staging blocked by client-side revision protection validation.'
      );
      return;
    }

    const now = new Date().toISOString();
    const operator = settings.operatorLabel.trim() || 'Duty Officer (Local Workstation)';
    const newRecords: DispatchRecord[] = selectionResolution.destinations.map((dest) => ({
      dispatchId: createLocalId('DSP'),
      eventId: source.eventId,
      eventKey: source.eventKey,
      sourceBulletinId: source.bulletinId,
      sourceBulletinRevision: source.bulletinRevision,
      sourceFingerprint: source.sourceFingerprint,
      communicationRevisionId: activeDraft.communicationRevisionId,
      messageFingerprint: activeDraft.messageFingerprint,
      destinationId: dest.destinationId,
      destinationName: dest.displayName,
      destinationIdentifier: dest.destinationIdentifier,
      channel: dest.channel,
      classification: activeDraft.classification,
      subjectSnapshot: activeDraft.subject,
      messageSnapshot: activeDraft.body,
      createdAt: now,
      lastActionAt: now,
      status: 'PREPARED',
      operatorLabel: operator,
      confirmationMethod: 'UNCONFIRMED',
      confirmationAuthenticityLabel: 'NOT SENT',
    }));

    setQueue((prev) => [...newRecords, ...prev]);
    setSubSection('queue');
    onNotice(
      `Staged ${newRecords.length} dispatch item(s) to Dispatch Queue (${
        selectionResolution.dedupedCount > 0
          ? `${selectionResolution.dedupedCount} overlap duplicate(s) removed`
          : 'ready for manual handoff'
      }).`
    );
  };

  // Manual-assisted Dispatch Queue handlers
  const upsertImmutableHistory = (record: DispatchRecord) => {
    setHistory((prev) => {
      const idx = prev.findIndex((h) => h.dispatchId === record.dispatchId);
      if (idx >= 0) {
        if (prev[idx].status === 'OPERATOR_CONFIRMED_SENT') {
          return prev; // Confirmed records are immutable
        }
        const clone = [...prev];
        clone[idx] = record;
        return clone;
      }
      return [record, ...prev];
    });
  };

  const handleOpenExternalChannel = async (record: DispatchRecord, url: string) => {
    if (record.status === 'OPERATOR_CONFIRMED_SENT') return;
    if (
      record.eventKey === source.eventKey &&
      (isSourceMarkedStale(source) ||
        isRecordStaleAgainstSource(record.sourceFingerprint, source.sourceFingerprint))
    ) {
      onNotice(
        'Dispatch blocked: the bulletin source is STALE or changed since this item was staged. Save/recalculate the bulletin and stage a refreshed message.'
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(record.messageSnapshot);
    } catch {
      // Clipboard fallback ignored gracefully
    }

    triggerExternalHandoffNavigation(url);
    const now = new Date().toISOString();
    setQueue((prev) =>
      prev.map((item) =>
        item.dispatchId === record.dispatchId
          ? {
              ...item,
              status: 'OPENED_EXTERNALLY',
              openedExternallyAt: item.openedExternallyAt || now,
              lastActionAt: now,
              confirmationMethod: 'UNCONFIRMED',
              confirmationAuthenticityLabel: 'NOT SENT',
            }
          : item
      )
    );
    onNotice(
      `Opened ${CHANNEL_LABELS[record.channel]} for ${record.destinationName}. Still NOT SENT — click "Confirm Sent" only after posting.`
    );
  };

  const viberGeneratedPackage = useMemo(() => {
    if (activeDraft.templateId === 'concise_viber') {
      return {
        subject: activeDraft.subject,
        body: activeDraft.body,
        fromTemplate: 'active_viber_draft' as const,
      };
    }
    const generated = generateDeterministicMessage(source, 'concise_viber');
    return {
      subject: generated.subject,
      body: generated.body,
      fromTemplate: 'generator_concise_viber' as const,
    };
  }, [activeDraft.templateId, activeDraft.subject, activeDraft.body, source]);

  const viberProtocolUrl = useMemo(
    () => buildViberProtocolForwardUrl(viberGeneratedPackage.body),
    [viberGeneratedPackage.body]
  );

  const activeViberHandoffRecord = useMemo(() => {
    if (!viberDirectHandoffId) return null;
    return (
      queue.find((item) => item.dispatchId === viberDirectHandoffId) ??
      history.find((item) => item.dispatchId === viberDirectHandoffId) ??
      null
    );
  }, [viberDirectHandoffId, queue, history]);

  const handleLaunchViberDesktopProtocol = async () => {
    if (isSourceMarkedStale(source) || isDraftStale) {
      onNotice(
        `Viber Desktop handoff blocked: canonical bulletin source ${source.bulletinId} is marked STALE or out of sync. Regenerate/recalculate before dispatching.`
      );
      return;
    }
    if (
      activeDraft.classification === 'public_release' &&
      (!source.isReleasedSource || !activeDraft.localAuthorization?.authorized)
    ) {
      onNotice(
        'Viber public release handoff requires a released bulletin source and a recorded Local Authorization check.'
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(viberGeneratedPackage.body);
    } catch {
      // Clipboard fallback handled safely
    }

    const activeViberDest = activeDestinations.find((d) => d.channel === 'viber');
    const now = new Date().toISOString();
    const operator = settings.operatorLabel.trim() || 'Duty Officer (Local Workstation)';
    const newRecord: DispatchRecord = {
      dispatchId: createLocalId('DSP-VB'),
      eventId: source.eventId,
      eventKey: source.eventKey,
      sourceBulletinId: source.bulletinId,
      sourceBulletinRevision: source.bulletinRevision,
      sourceFingerprint: source.sourceFingerprint,
      communicationRevisionId: activeDraft.communicationRevisionId,
      messageFingerprint: buildMessageFingerprint(
        'concise_viber',
        activeDraft.classification,
        viberGeneratedPackage.subject,
        viberGeneratedPackage.body
      ),
      destinationId: activeViberDest?.destinationId || 'VIBER-DESKTOP-PROTOCOL',
      destinationName:
        activeViberDest?.displayName || 'Viber Desktop App (Local Protocol Handoff)',
      destinationIdentifier: 'viber://forward',
      channel: 'viber',
      classification: activeDraft.classification,
      subjectSnapshot: viberGeneratedPackage.subject,
      messageSnapshot: viberGeneratedPackage.body,
      createdAt: now,
      openedExternallyAt: now,
      lastActionAt: now,
      status: 'OPENED_EXTERNALLY',
      operatorLabel: operator,
      confirmationMethod: 'UNCONFIRMED',
      confirmationAuthenticityLabel: 'NOT SENT',
    };

    setQueue((prev) => [newRecord, ...prev]);
    setViberDirectHandoffId(newRecord.dispatchId);
    triggerExternalHandoffNavigation(viberProtocolUrl);
    onNotice(
      'Opened Viber Desktop (viber://forward) with pre-formatted message copied. Status is OPENED_EXTERNALLY (NOT SENT) — click "Confirm Sent" to log OPERATOR-CONFIRMED.'
    );
  };

  const handleConfirmSent = (record: DispatchRecord) => {
    if (record.status === 'OPERATOR_CONFIRMED_SENT') return;
    if (
      record.eventKey === source.eventKey &&
      (isSourceMarkedStale(source) ||
        isRecordStaleAgainstSource(record.sourceFingerprint, source.sourceFingerprint))
    ) {
      onNotice('Cannot confirm a stale unsent queue item while bulletin source is STALE or outdated.');
      return;
    }
    const now = new Date().toISOString();
    const updated: DispatchRecord = {
      ...record,
      status: 'OPERATOR_CONFIRMED_SENT',
      confirmationMethod: 'OPERATOR_MANUAL_CONFIRMATION',
      confirmationAuthenticityLabel: 'OPERATOR-CONFIRMED (LOCAL RECORD)',
      sentConfirmedAt: now,
      lastActionAt: now,
      operatorLabel: settings.operatorLabel.trim() || record.operatorLabel,
      externalReference: confirmRefs[record.dispatchId]?.trim() || undefined,
      notes: confirmNotes[record.dispatchId]?.trim() || undefined,
    };
    setQueue((prev) => prev.map((item) => (item.dispatchId === record.dispatchId ? updated : item)));
    upsertImmutableHistory(updated);
    onNotice(`Confirmed sent (OPERATOR-CONFIRMED LOCAL RECORD) for ${record.destinationName}.`);
  };

  const handleMarkQueueTerminal = (
    record: DispatchRecord,
    targetStatus: 'FAILED' | 'CANCELLED'
  ) => {
    if (record.status === 'OPERATOR_CONFIRMED_SENT') return;
    const now = new Date().toISOString();
    const updated: DispatchRecord = {
      ...record,
      status: targetStatus,
      confirmationMethod: 'UNCONFIRMED',
      confirmationAuthenticityLabel: 'NOT SENT',
      lastActionAt: now,
      notes: confirmNotes[record.dispatchId]?.trim() || record.notes,
    };
    setQueue((prev) => prev.map((item) => (item.dispatchId === record.dispatchId ? updated : item)));
    upsertImmutableHistory(updated);
    onNotice(`Marked ${record.destinationName} as ${targetStatus}.`);
  };

  const handleClearCompletedFromQueue = () => {
    setQueue((prev) =>
      prev.filter(
        (item) => item.status === 'PREPARED' || item.status === 'OPENED_EXTERNALLY'
      )
    );
    onNotice('Cleared finished items from active queue (permanent log remains in Dispatch History).');
  };

  // Recipient Directory CRUD handlers
  const handleSaveOffice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeForm.officeName.trim()) {
      onNotice('Office name is required.');
      return;
    }
    if (officeForm.editingId) {
      setDirectory((prev) => ({
        ...prev,
        offices: prev.offices.map((o) =>
          o.officeId === officeForm.editingId
            ? {
                ...o,
                officeName: officeForm.officeName.trim(),
                officeType: officeForm.officeType.trim() || 'Partner Office',
                region: officeForm.region.trim(),
                province: officeForm.province.trim(),
                active: officeForm.active,
              }
            : o
        ),
      }));
      onNotice('Updated office record.');
    } else {
      const record: OfficeRecord = {
        officeId: createLocalId('OFF'),
        officeName: officeForm.officeName.trim(),
        officeType: officeForm.officeType.trim() || 'Partner Office',
        region: officeForm.region.trim(),
        province: officeForm.province.trim(),
        active: officeForm.active,
      };
      setDirectory((prev) => ({ ...prev, offices: [...prev.offices, record] }));
      onNotice(`Added office "${record.officeName}" to local directory.`);
    }
    setOfficeForm({
      editingId: null,
      officeName: '',
      officeType: 'DRRMO / Partner Office',
      region: '',
      province: '',
      active: true,
    });
  };

  const handleSaveDestination = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destForm.displayName.trim()) {
      onNotice('Destination display name is required.');
      return;
    }
    const cleanId = destForm.destinationIdentifier.trim();
    if (
      cleanId &&
      (destForm.channel === 'facebook' ||
        destForm.channel === 'messenger' ||
        destForm.channel === 'other') &&
      !validateSafeExternalUrl(cleanId, ['https:']).valid
    ) {
      onNotice('Destination URL for Facebook, Messenger, or Other must use a valid https:// address.');
      return;
    }
    if (
      cleanId &&
      destForm.channel === 'viber' &&
      /^(https?|viber):/i.test(cleanId) &&
      !validateSafeExternalUrl(cleanId, ['https:', 'viber:']).valid
    ) {
      onNotice('Viber URL identifier must be https:// or viber://, or leave blank to use Viber Desktop Forward.');
      return;
    }
    if (destForm.channel === 'email') {
      const emails = cleanId
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        emails.length === 0 ||
        emails.some((addr) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr))
      ) {
        onNotice('Email destination requires one or more valid email addresses.');
        return;
      }
    }

    if (destForm.editingId) {
      setDirectory((prev) => ({
        ...prev,
        destinations: prev.destinations.map((d) =>
          d.destinationId === destForm.editingId
            ? {
                ...d,
                officeId: destForm.officeId || undefined,
                channel: destForm.channel,
                displayName: destForm.displayName.trim(),
                destinationIdentifier: cleanId,
                notes: destForm.notes.trim(),
                active: destForm.active,
              }
            : d
        ),
      }));
      onNotice('Updated communication destination.');
    } else {
      const record: CommunicationDestination = {
        destinationId: createLocalId('DST'),
        officeId: destForm.officeId || undefined,
        channel: destForm.channel,
        displayName: destForm.displayName.trim(),
        destinationIdentifier: cleanId,
        notes: destForm.notes.trim(),
        active: destForm.active,
      };
      setDirectory((prev) => ({ ...prev, destinations: [...prev.destinations, record] }));
      onNotice(`Added destination "${record.displayName}".`);
    }
    setDestForm({
      editingId: null,
      officeId: '',
      channel: 'viber',
      displayName: '',
      destinationIdentifier: '',
      notes: '',
      active: true,
    });
  };

  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.groupName.trim()) {
      onNotice('Distribution group name is required.');
      return;
    }
    if (groupForm.editingId) {
      setDirectory((prev) => ({
        ...prev,
        groups: prev.groups.map((g) =>
          g.groupId === groupForm.editingId
            ? {
                ...g,
                groupName: groupForm.groupName.trim(),
                destinationIds: groupForm.destinationIds,
                active: groupForm.active,
              }
            : g
        ),
      }));
      onNotice('Updated distribution group.');
    } else {
      const record: DistributionGroup = {
        groupId: createLocalId('GRP'),
        groupName: groupForm.groupName.trim(),
        destinationIds: groupForm.destinationIds,
        active: groupForm.active,
      };
      setDirectory((prev) => ({ ...prev, groups: [...prev.groups, record] }));
      onNotice(`Created distribution group "${record.groupName}".`);
    }
    setGroupForm({
      editingId: null,
      groupName: '',
      destinationIds: [],
      active: true,
    });
  };

  const queueFilterCounts = useMemo(
    () =>
      computeDispatchQueueFilterCounts(
        queue,
        queueFilters.activeEventOnly ? source.eventKey : null
      ),
    [queue, queueFilters.activeEventOnly, source.eventKey]
  );

  const queueStatusCounts = queueFilterCounts.byStatus;

  const filteredQueue = useMemo(
    () =>
      filterDispatchQueueRecords(queue, {
        selectedStatuses: queueFilters.selectedStatuses,
        selectedChannels: queueFilters.selectedChannels,
        activeEventKey: queueFilters.activeEventOnly ? source.eventKey : null,
      }),
    [queue, queueFilters, source.eventKey]
  );

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateSettingsUrlsAndHandle(settingsDraft);
    setSettingsErrors(validation.fieldErrors);
    if (!validation.valid) {
      setSettingsSavedNotice(null);
      onNotice(
        'Settings contain invalid URLs or disallowed credential patterns. Review highlighted fields.'
      );
      return;
    }
    setSettings(validation.normalizedSettings);
    setSettingsDraft(validation.normalizedSettings);
    const savedMsg =
      'Saved platform destination URLs, X/Twitter handle, and workstation defaults locally (zero sensitive tokens stored).';
    setSettingsSavedNotice(savedMsg);
    onNotice(savedMsg);
  };

  const handleResetSettingsDefaults = () => {
    setSettingsDraft(DEFAULT_COMMS_SETTINGS);
    setSettings(DEFAULT_COMMS_SETTINGS);
    setSettingsErrors({});
    const resetMsg = 'Reset Communications Settings to safe COM-1 defaults.';
    setSettingsSavedNotice(resetMsg);
    onNotice(resetMsg);
  };

  const pendingQueueCount = useMemo(
    () =>
      queue.filter((q) => q.status === 'PREPARED' || q.status === 'OPENED_EXTERNALLY').length,
    [queue]
  );

  const todayStats = useMemo(
    () => computeTodayDispatchStats(queue, history),
    [queue, history]
  );

  const todayChannelExportPreview = useMemo(
    () => filterTodayDispatchHistoryRecords(history),
    [history]
  );

  const handleExportCsv = (recordsToExport: DispatchRecord[]) => {
    const csv = exportDispatchHistoryCsv(recordsToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eqp_comms_history_${source.eventKey}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotice(`Exported ${recordsToExport.length} dispatch history row(s) to CSV.`);
  };

  const handleChannelExportToday = () => {
    const report = exportTodayChannelReportCsv(history);
    const blob = new Blob([report.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = report.filename;
    a.click();
    URL.revokeObjectURL(url);
    onNotice(
      `Channel Export generated ${report.filename} (${report.rowCount} row(s) for ${report.dateKeyPht} PHT, formula-escaped UTF-8 CSV).`
    );
  };

  const activeOffices = directory.offices.filter((o) => o.active);
  const activeDestinations = directory.destinations.filter((d) => d.active);
  const activeGroups = directory.groups.filter((g) => g.active);

  const statusToneClass =
    source.sourceStatus === 'RELEASED_WEB_PUBLISHED'
      ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
      : source.sourceStatus === 'STALE_SOURCE'
      ? 'bg-rose-50 border-rose-400 text-rose-950'
      : 'bg-amber-50 border-amber-400 text-amber-950';

  return (
    <div className="bg-[#dde4ee] border border-slate-400 rounded-md p-3 space-y-3 text-slate-900">
      {/* Top Workstation Header */}
      <div className="bg-white border border-slate-400 rounded-md shadow-xs px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Share2 className="w-5 h-5 text-sky-700" />
            <h1 className="text-lg font-extrabold tracking-tight text-blue-900">
              Earthquake Communications Center
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded border border-slate-300 bg-slate-100 text-slate-700">
              MANUAL-ASSISTED DISPATCH
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-900">
              LOCAL WORKSTATION STORAGE ONLY
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Read-only canonical bulletin parameters &bull; Deterministic zero-fabrication templates &bull; Explicit operator send confirmation
          </p>
        </div>

        {/* Workflow Section Switcher + Channel Export Helper */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <nav aria-label="Communications Sections" className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'prepare', label: 'A. Prepare Message', icon: <Pencil className="w-3.5 h-3.5" /> },
                {
                  id: 'recipients',
                  label: `B. Recipients (${activeDestinations.length})`,
                  icon: <Users className="w-3.5 h-3.5" />,
                },
                {
                  id: 'queue',
                  label: `C. Dispatch Queue (${pendingQueueCount})`,
                  icon: <Send className="w-3.5 h-3.5" />,
                },
                {
                  id: 'history',
                  label: `D. History (${history.length})`,
                  icon: <History className="w-3.5 h-3.5" />,
                },
                {
                  id: 'settings',
                  label: 'Settings',
                  icon: <Settings className="w-3.5 h-3.5" />,
                },
              ] as Array<{ id: SocialMediaSubSection; label: string; icon: React.ReactNode }>
            ).map((sec) => {
              const active = subSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSubSection(sec.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-700 border-blue-900 text-white shadow-xs'
                      : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-sky-50 hover:border-sky-400'
                  }`}
                >
                  {sec.icon}
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            data-testid="channel-export-btn"
            onClick={handleChannelExportToday}
            title={`Export today's (${todayChannelExportPreview.dateKeyPht} PHT) dispatch history CSV formatted for Excel / Calc with formula injection protection`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border border-emerald-800 bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Channel Export ({todayChannelExportPreview.records.length})</span>
          </button>
        </div>
      </div>

      {/* Explicit Source Verification / Limitation Banner */}
      <div className={`border rounded-md px-3.5 py-2.5 text-xs space-y-1.5 ${statusToneClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold">
            {source.isReleasedSource ? (
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            )}
            <span>Source Status: {source.sourceStatusLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {source.warnings.map((w) => (
              <span
                key={w}
                className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 border border-current"
              >
                {w}
              </span>
            ))}
            <button
              type="button"
              onClick={onNavigateToBulletin}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-400 text-slate-800 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              <BookOpen className="w-3 h-3" />
              Open Bulletin Tab
            </button>
          </div>
        </div>
        <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
          {source.warningDetails.map((detail, idx) => (
            <li key={idx}>{detail}</li>
          ))}
        </ul>
      </div>

      {/* ============================================================ */}
      {/* SECTION A: PREPARE MESSAGE                                   */}
      {/* ============================================================ */}
      {subSection === 'prepare' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          {/* Left Column: Read-only Event & Bulletin Source */}
          <div className="xl:col-span-5 space-y-3">
            <div className="bg-white border border-slate-400 rounded-md p-3 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-slate-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    Read-Only Canonical Bulletin Source
                  </h2>
                </div>
                <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700">
                  {source.sourceFingerprint}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#dce6f4] border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">Event ID</div>
                  <div className="font-mono font-bold text-slate-900 break-all">{source.eventKey}</div>
                </div>
                <div className="bg-[#dce6f4] border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">Bulletin ID</div>
                  <div className="font-mono font-bold text-slate-900 break-all">{source.bulletinId}</div>
                </div>
                <div className="bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">Bulletin Number / Rev</div>
                  <div className="font-mono font-semibold">
                    No. {source.bulletinNumber} ({source.bulletinRevision})
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">Magnitude &amp; Scale</div>
                  <div className="font-mono font-bold text-blue-900">
                    {source.magnitudeDisplay} ({source.magnitudeScale})
                  </div>
                </div>
                <div className="col-span-2 bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">
                    Earthquake Origin Date/Time
                  </div>
                  <div className="font-mono font-semibold text-slate-900">{source.originDateTimePht}</div>
                  <div className="font-mono text-[11px] text-slate-600">{source.originDateTimeUtc}</div>
                </div>
                <div className="col-span-2 bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">
                    Bulletin Issue Date/Time
                  </div>
                  <div className="font-mono text-slate-900">
                    {source.bulletinIssueDateTimePht || 'Not yet recorded'}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">Latitude / Longitude</div>
                  <div className="font-mono font-semibold">
                    {source.latitude !== null && source.longitude !== null
                      ? `${source.latitude.toFixed(3)}°N, ${source.longitude.toFixed(3)}°E`
                      : 'Pending hypocenter'}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">Depth / Origin Type</div>
                  <div className="font-mono font-semibold">
                    {source.depthKm !== null ? `${Math.round(source.depthKm)} km` : 'Pending'} &bull;{' '}
                    {source.originType || 'Not specified'}
                  </div>
                </div>
                <div className="col-span-2 bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">Epicentral Description</div>
                  <div className="font-semibold text-slate-900">{source.epicentralDescription}</div>
                </div>
                <div className="col-span-2 bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-slate-600">
                      Verified Intensity Information
                    </span>
                    {source.unverifiedIntensityExcludedCount > 0 && (
                      <span className="text-[10px] font-semibold text-amber-800">
                        {source.unverifiedIntensityExcludedCount} unverified/conflicting excluded
                      </span>
                    )}
                  </div>
                  <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap text-slate-800">
                    {source.verifiedIntensityInformation || 'No verified intensity entries for this event.'}
                  </pre>
                </div>
                <div className="col-span-2 bg-slate-50 border border-slate-300 rounded p-2">
                  <div className="text-[10px] font-bold uppercase text-slate-600">Official Bulletin Link</div>
                  <div className="font-mono text-[11px] break-all text-slate-800">
                    {source.officialBulletinLink || 'Not configured (set https:// URL in Settings if applicable)'}
                  </div>
                </div>
              </div>
            </div>

            {/* Dedicated X/Twitter & Viber Preview Card */}
            <ChannelMessagePreviewCard
              source={source}
              subject={activeDraft.subject}
              body={activeDraft.body}
              templateId={activeDraft.templateId}
              previewMode={previewMode}
              onChangePreviewMode={setPreviewMode}
              xMaxChars={settings.xMaxChars}
              operatorLabel={settings.operatorLabel}
              xHandle={settings.xHandle}
              handoffNote={previewHandoff.note}
              onSwitchToXShortTemplate={() => handleSelectTemplate('x_short')}
              onSwitchToViberTemplate={() => handleSelectTemplate('concise_viber')}
              onSwitchToMessengerTemplate={() => handleSelectTemplate('concise_messenger')}
            />
          </div>

          {/* Right Column: Message Composer, Local Authorization & Stage to Queue */}
          <div className="xl:col-span-7 space-y-3">
            <div className="bg-white border border-slate-400 rounded-md p-3 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    A. Prepare Message ({activeDraft.communicationRevisionId})
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    Message Fingerprint: <span className="font-mono">{activeDraft.messageFingerprint}</span>
                    {activeDraft.editedFromTemplate && (
                      <span className="ml-2 font-semibold text-amber-800">
                        (Manually Edited Snapshot)
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRegenerateFromSource}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border border-indigo-700 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Generate Message
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerateFromSource}
                    disabled={!activeDraft.editedFromTemplate && !isDraftStale}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border border-slate-400 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore Template
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyText(
                        `${activeDraft.subject}\n\n${activeDraft.body}`,
                        'message draft'
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border border-sky-700 bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                  >
                    <ClipboardCopy className="w-3.5 h-3.5" />
                    Copy Message
                  </button>
                </div>
              </div>

              {dispatchValidation.isSourceStale && (
                <div
                  data-testid="prepare-stale-source-gate"
                  className="bg-rose-50 border-2 border-rose-500 rounded px-3 py-2.5 text-xs text-rose-950 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-extrabold uppercase tracking-wide text-rose-900">
                        Revision Protection Active &mdash; Dispatching Blocked (STALE Bulletin Source)
                      </div>
                      <div>
                        Canonical bulletin source <span className="font-mono font-semibold">{source.bulletinId}</span> ({source.bulletinRevision}) is marked as <span className="font-mono font-bold">STALE</span> ({source.sourceStatusLabel}). Staging to Dispatch Queue and authorization are locked until the bulletin is recalculated or saved.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onNavigateToBulletin}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Resolve in Bulletin Tab
                  </button>
                </div>
              )}

              {isDraftStale && (
                <div className="bg-rose-50 border border-rose-400 rounded px-3 py-2 text-xs text-rose-950 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold">
                    <FileWarning className="w-4 h-4 text-rose-700 shrink-0" />
                    <span>
                      STALE DRAFT: Event or bulletin source changed since this draft was generated ({activeDraft.sourceFingerprint} vs {source.sourceFingerprint}).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerateFromSource}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate Now
                  </button>
                </div>
              )}

              {/* Template + Classification Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                    Deterministic Message Template
                  </label>
                  <select
                    aria-label="Deterministic Message Template"
                    value={activeDraft.templateId}
                    onChange={(e) =>
                      handleSelectTemplate(e.target.value as CommunicationTemplateId)
                    }
                    className="w-full rounded border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                  >
                    {TEMPLATE_DEFINITIONS.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.label}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const activeTplMeta = TEMPLATE_DEFINITIONS.find(
                      (t) => t.id === activeDraft.templateId
                    );
                    if (!activeTplMeta) return null;
                    return (
                      <p className="mt-1 text-[11px] text-slate-600">
                        {activeTplMeta.shortDesc}{' '}
                        <span className="font-semibold text-slate-700">
                          (Default scope:{' '}
                          {activeTplMeta.intendedClassification === 'public_release'
                            ? 'Public Release'
                            : 'Private Office'}
                          )
                        </span>
                      </p>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                    Communication Classification
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleClassificationChange('private_office')}
                      className={`px-2.5 py-1.5 rounded text-xs font-bold border cursor-pointer ${
                        activeDraft.classification === 'private_office'
                          ? 'bg-indigo-700 border-indigo-900 text-white'
                          : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                      }`}
                    >
                      Private Office Notification
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClassificationChange('public_release')}
                      className={`px-2.5 py-1.5 rounded text-xs font-bold border cursor-pointer ${
                        activeDraft.classification === 'public_release'
                          ? 'bg-emerald-700 border-emerald-900 text-white'
                          : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                      }`}
                    >
                      Public Release
                    </button>
                  </div>
                </div>
              </div>

              {/* Subject & Editable Message Body */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                    Subject / Header
                  </label>
                  <input
                    type="text"
                    value={activeDraft.subject}
                    onChange={(e) => handleEditSubjectOrBody('subject', e.target.value)}
                    className="w-full rounded border border-slate-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <label className="text-[11px] font-bold uppercase text-slate-700">
                      Message Body (Editing invalidates prior authorization &amp; bumps revision)
                    </label>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                      {(activeDraft.templateId === 'x_short' ||
                        previewMode === 'x_twitter' ||
                        previewMode === 'x_and_viber') && (
                        <span
                          className={`px-1.5 py-0.5 rounded border font-bold ${
                            xValidation.valid
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : 'bg-rose-50 border-rose-400 text-rose-900'
                          }`}
                        >
                          X Limit: {xValidation.length}/{xValidation.maxChars}
                        </span>
                      )}
                      {(activeDraft.templateId === 'concise_viber' || previewMode === 'viber') && (
                        <span
                          className={`px-1.5 py-0.5 rounded border font-bold ${
                            mobileViberValidation.fits
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : 'bg-amber-50 border-amber-400 text-amber-900'
                          }`}
                        >
                          Viber Mobile: {mobileViberValidation.length}/{mobileViberValidation.maxRecommended}
                        </span>
                      )}
                      {(activeDraft.templateId === 'concise_messenger' || previewMode === 'messenger') && (
                        <span
                          className={`px-1.5 py-0.5 rounded border font-bold ${
                            mobileMessengerValidation.fits
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : 'bg-amber-50 border-amber-400 text-amber-900'
                          }`}
                        >
                          Messenger Mobile: {mobileMessengerValidation.length}/{mobileMessengerValidation.maxRecommended}
                        </span>
                      )}
                      <span className="text-slate-600">{activeDraft.body.length} chars</span>
                    </div>
                  </div>
                  <textarea
                    rows={10}
                    value={activeDraft.body}
                    onChange={(e) => handleEditSubjectOrBody('body', e.target.value)}
                    className={`w-full rounded border bg-white px-2.5 py-2 font-mono text-xs text-slate-900 leading-relaxed ${
                      !channelLengthValidation.valid ||
                      (activeDraft.templateId === 'x_short' && activeDraft.body.length > 280)
                        ? 'border-rose-500 ring-1 ring-rose-400'
                        : 'border-slate-400'
                    }`}
                  />

                  {activeDraft.templateId === 'x_short' && (
                    <div
                      data-testid="x-template-char-counter"
                      className={`mt-1.5 rounded border px-3 py-2 space-y-1.5 ${
                        activeDraft.body.length > 280
                          ? 'bg-rose-50 border-rose-500 text-rose-950'
                          : activeDraft.body.length >= 240
                          ? 'bg-amber-50 border-amber-400 text-amber-950'
                          : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold">
                          X/Twitter Real-Time Character Counter
                        </span>
                        <span className="font-mono font-extrabold">
                          {activeDraft.body.length} / 280 chars{' '}
                          {activeDraft.body.length <= 280
                            ? `(${280 - activeDraft.body.length} remaining)`
                            : `(+${activeDraft.body.length - 280} over limit)`}
                        </span>
                      </div>
                      <svg
                        viewBox="0 0 280 6"
                        className="w-full h-1.5 rounded overflow-hidden bg-slate-200"
                        role="img"
                        aria-label={`X/Twitter character count ${activeDraft.body.length} of 280`}
                      >
                        <rect
                          x={0}
                          y={0}
                          width={Math.min(280, Math.max(0, activeDraft.body.length))}
                          height={6}
                          fill={
                            activeDraft.body.length > 280
                              ? '#e11d48'
                              : activeDraft.body.length >= 240
                              ? '#d97706'
                              : '#059669'
                          }
                        />
                      </svg>
                      {activeDraft.body.length > 280 && (
                        <div
                          data-testid="x-draft-too-long-warning"
                          role="alert"
                          className="flex items-start gap-2 pt-0.5 text-xs text-rose-950"
                        >
                          <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold uppercase tracking-wide text-rose-900">
                              Draft Too Long
                            </span>
                            <span className="ml-1.5 text-[11px]">
                              X/Twitter draft has {activeDraft.body.length} characters, exceeding the 280-character limit by {activeDraft.body.length - 280} character(s). Shorten content before X/Twitter handoff.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(!channelLengthValidation.valid ||
                    ((activeDraft.templateId === 'x_short' || previewMode === 'x_twitter') &&
                      !xValidation.valid)) && (
                    <div
                      data-testid="channel-length-exceeded-error"
                      role="alert"
                      className="mt-1.5 rounded border border-rose-500 bg-rose-50 px-3 py-2 text-xs text-rose-950 flex items-start gap-2"
                    >
                      <XCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-extrabold uppercase tracking-wide text-rose-900">
                          Length Exceeded
                        </div>
                        <div className="text-[11px]">
                          {!channelLengthValidation.valid
                            ? channelLengthValidation.errorMessage
                            : `Length Exceeded: Message is ${xValidation.length} characters, exceeding X/Twitter's ${xValidation.maxChars}-character limit by ${xValidation.overflow}.`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Local Authorization Record Box */}
              <div className="bg-[#dce6f4] border border-slate-400 rounded-md p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Local Authorization Record
                    </div>
                    <div className="text-[11px] text-slate-700">
                      Authenticity: <span className="font-bold">UNVERIFIED LOCAL RECORD</span> (no authenticated user login or server release authority in EQP Modern)
                    </div>
                  </div>
                  {activeDraft.localAuthorization?.authorized ? (
                    <button
                      type="button"
                      onClick={handleRevokeLocalAuth}
                      className="px-2.5 py-1 rounded text-xs font-bold border border-rose-500 bg-rose-50 text-rose-800 hover:bg-rose-100 cursor-pointer"
                    >
                      Revoke Local Record
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        dispatchValidation.isSourceStale || dispatchValidation.isDraftStale
                      }
                      onClick={handleRecordLocalAuth}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border border-emerald-800 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Record Local Authorization
                    </button>
                  )}
                </div>

                {lastAuthInvalidationMsg && (
                  <div className="bg-amber-100 border border-amber-400 rounded px-2.5 py-1 text-[11px] font-semibold text-amber-950">
                    {lastAuthInvalidationMsg}
                  </div>
                )}

                {activeDraft.localAuthorization?.authorized ? (
                  <div className="bg-white border border-emerald-400 rounded px-2.5 py-1.5 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Recorded by <strong>{activeDraft.localAuthorization.operatorLabel}</strong> at{' '}
                      {formatShortIsoTimestamp(activeDraft.localAuthorization.recordedAt)} &mdash;{' '}
                      <span className="font-mono text-[11px]">
                        [{activeDraft.localAuthorization.recordAuthenticityLabel}]
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-600">
                      Note: {activeDraft.localAuthorization.note}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={authNoteInput}
                      onChange={(e) => setAuthNoteInput(e.target.value)}
                      placeholder="Optional operator check note before recording local authorization..."
                      className="flex-1 min-w-[200px] rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Viber Desktop Protocol Integration & OPERATOR-CONFIRMED Logging Flow */}
              <div
                data-testid="viber-desktop-integration-card"
                className="bg-violet-50 border border-violet-400 rounded-md p-3 space-y-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-violet-950">
                      <MessageCircle className="w-4 h-4 text-violet-700" />
                      <span>Viber Desktop Integration (viber://forward Protocol Handoff)</span>
                    </div>
                    <div className="text-[11px] text-violet-900">
                      Opens the Viber desktop protocol handler pre-populated with the{' '}
                      {viberGeneratedPackage.fromTemplate === 'active_viber_draft'
                        ? 'active Concise Viber draft'
                        : 'generated Concise Viber dispatch message'}{' '}
                      and logs manual dispatch status until you confirm{' '}
                      <strong>OPERATOR-CONFIRMED</strong>.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="viber-protocol-open-btn"
                      disabled={dispatchValidation.isSourceStale || dispatchValidation.isDraftStale}
                      onClick={() => void handleLaunchViberDesktopProtocol()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border border-violet-900 bg-violet-700 hover:bg-violet-800 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Open in Viber Desktop
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-violet-200 rounded px-2.5 py-1.5 text-[11px] font-mono text-slate-700 whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {viberGeneratedPackage.body}
                </div>

                {activeViberHandoffRecord && (
                  <div
                    data-testid="viber-operator-confirm-flow"
                    className={`rounded border p-2.5 text-xs space-y-2 ${
                      activeViberHandoffRecord.status === 'OPERATOR_CONFIRMED_SENT'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                        : activeViberHandoffRecord.status === 'FAILED'
                        ? 'bg-rose-50 border-rose-400 text-rose-950'
                        : 'bg-sky-50 border-sky-400 text-sky-950'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold">
                        Viber Handoff Status:{' '}
                        <span className="font-mono">{activeViberHandoffRecord.status}</span>{' '}
                        &bull;{' '}
                        <span className="font-mono">
                          [{activeViberHandoffRecord.confirmationAuthenticityLabel}]
                        </span>
                      </div>
                      <span className="font-mono text-[10px]">
                        ID: {activeViberHandoffRecord.dispatchId}
                      </span>
                    </div>

                    {activeViberHandoffRecord.status === 'OPERATOR_CONFIRMED_SENT' ? (
                      <div className="text-[11px] font-semibold flex flex-wrap items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>
                          Logged as <strong>OPERATOR-CONFIRMED (LOCAL RECORD)</strong> by{' '}
                          {activeViberHandoffRecord.operatorLabel} at{' '}
                          {formatShortIsoTimestamp(
                            activeViberHandoffRecord.sentConfirmedAt ||
                              activeViberHandoffRecord.lastActionAt
                          )}{' '}
                          in Dispatch Queue &amp; Dispatch History.
                        </span>
                      </div>
                    ) : activeViberHandoffRecord.status === 'FAILED' ? (
                      <div className="text-[11px] font-semibold">
                        Logged as FAILED at {formatShortIsoTimestamp(activeViberHandoffRecord.lastActionAt)}.
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={confirmRefs[activeViberHandoffRecord.dispatchId] || ''}
                          onChange={(e) =>
                            setConfirmRefs((prev) => ({
                              ...prev,
                              [activeViberHandoffRecord.dispatchId]: e.target.value,
                            }))
                          }
                          placeholder="Viber group / thread reference (optional)"
                          className="flex-1 min-w-[180px] rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        />
                        <button
                          type="button"
                          data-testid="viber-confirm-sent-btn"
                          disabled={
                            isSourceMarkedStale(source) ||
                            isRecordStaleAgainstSource(
                              activeViberHandoffRecord.sourceFingerprint,
                              source.sourceFingerprint
                            )
                          }
                          onClick={() => handleConfirmSent(activeViberHandoffRecord)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-bold border border-emerald-900 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Confirm Sent (OPERATOR-CONFIRMED)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleMarkQueueTerminal(activeViberHandoffRecord, 'FAILED')
                          }
                          className="px-2.5 py-1 rounded text-xs font-bold border border-rose-500 bg-white hover:bg-rose-50 text-rose-800 cursor-pointer"
                        >
                          Mark Failed
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Recipient Selection & Stage Action */}
              <div className="bg-slate-50 border border-slate-300 rounded-md p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase text-slate-800">
                    Select Target Recipients &amp; Stage Queue
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSubSection('recipients')}
                    className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
                  >
                    Manage Offices / Groups &rarr;
                  </button>
                </div>

                {activeDestinations.length === 0 && activeGroups.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-300 rounded px-3 py-2 text-xs text-amber-950 flex items-center justify-between gap-2">
                    <span>
                      <strong>NO DESTINATIONS CONFIGURED:</strong> Add active partner destinations or distribution groups in Section B first.
                    </span>
                    <button
                      type="button"
                      onClick={() => setSubSection('recipients')}
                      className="px-2.5 py-1 rounded bg-amber-700 text-white font-bold text-xs cursor-pointer"
                    >
                      Open Recipients
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="border border-slate-300 bg-white rounded p-2 max-h-36 overflow-y-auto space-y-1">
                      <div className="text-[10px] font-bold uppercase text-slate-600">
                        Distribution Groups
                      </div>
                      {activeGroups.length === 0 ? (
                        <div className="text-slate-500 italic text-[11px]">No active groups</div>
                      ) : (
                        activeGroups.map((g) => {
                          const checked = selectedGroupIds.includes(g.groupId);
                          return (
                            <label
                              key={g.groupId}
                              className="flex items-center gap-2 py-0.5 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedGroupIds((prev) =>
                                    e.target.checked
                                      ? [...prev, g.groupId]
                                      : prev.filter((id) => id !== g.groupId)
                                  );
                                }}
                              />
                              <span className="font-semibold text-slate-800">{g.groupName}</span>
                              <span className="text-[10px] text-slate-500">
                                ({g.destinationIds.length} dest)
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div className="border border-slate-300 bg-white rounded p-2 max-h-36 overflow-y-auto space-y-1">
                      <div className="text-[10px] font-bold uppercase text-slate-600">
                        Individual Destinations
                      </div>
                      {activeDestinations.map((d) => {
                        const checked = selectedDestinationIds.includes(d.destinationId);
                        return (
                          <label
                            key={d.destinationId}
                            className="flex items-center gap-2 py-0.5 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSelectedDestinationIds((prev) =>
                                  e.target.checked
                                    ? [...prev, d.destinationId]
                                    : prev.filter((id) => id !== d.destinationId)
                                );
                              }}
                            />
                            <span className="font-semibold text-slate-800">{d.displayName}</span>
                            <span className="text-[10px] px-1 rounded bg-slate-100 border border-slate-300 text-slate-700">
                              {CHANNEL_LABELS[d.channel]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectionResolution.dedupedCount > 0 && (
                  <div className="text-[11px] font-semibold text-sky-900 bg-sky-50 border border-sky-300 rounded px-2.5 py-1">
                    Overlapping group/destination selection deduplicated: {selectionResolution.dedupedCount} duplicate reference(s) collapsed into {selectionResolution.destinations.length} unique destination(s).
                  </div>
                )}

                {duplicateMatches.length > 0 && (
                  <div className="text-[11px] font-semibold text-amber-950 bg-amber-50 border border-amber-400 rounded px-2.5 py-1.5 space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                      <span>DUPLICATE DISPATCH WARNING ({duplicateMatches.length} existing match(es))</span>
                    </div>
                    <div>
                      Already staged/dispatched for {source.bulletinRevision} / {activeDraft.communicationRevisionId}:{' '}
                      {duplicateMatches
                        .map((m) => `${m.destinationName} [${CHANNEL_LABELS[m.channel]}: ${m.existingStatus}]`)
                        .join(', ')}
                    </div>
                  </div>
                )}

                {dispatchValidation.isSourceStale && (
                  <div className="text-[11px] font-bold text-rose-950 bg-rose-50 border border-rose-500 rounded px-2.5 py-1.5 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                    <span>
                      STALE SOURCE PROTECTION: Cannot stage or dispatch while canonical bulletin source {source.bulletinId} is marked STALE.
                    </span>
                  </div>
                )}

                {publicReleaseBlockedReason && (
                  <div className="text-[11px] font-bold text-rose-900 bg-rose-50 border border-rose-400 rounded px-2.5 py-1.5">
                    {publicReleaseBlockedReason}
                  </div>
                )}

                {!channelLengthValidation.valid && (
                  <div className="text-[11px] font-bold text-rose-900 bg-rose-50 border border-rose-400 rounded px-2.5 py-1.5 flex items-start gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-rose-700 shrink-0 mt-0.5" />
                    <span>{channelLengthValidation.errorMessage}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-semibold text-slate-700">
                    Resolved unique destinations: <strong>{selectionResolution.destinations.length}</strong>
                  </span>
                  <button
                    type="button"
                    data-testid="stage-dispatch-queue-btn"
                    disabled={!dispatchValidation.canDispatch || !channelLengthValidation.valid}
                    onClick={handleStageToDispatchQueue}
                    title={
                      channelLengthValidation.errorMessage ??
                      dispatchValidation.primaryBlockingReason ??
                      undefined
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold border border-blue-900 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Stage to Dispatch Queue ({selectionResolution.destinations.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION B: RECIPIENTS                                        */}
      {/* ============================================================ */}
      {subSection === 'recipients' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-400 rounded-md px-3.5 py-2 text-xs text-amber-950 font-semibold">
            B. Local Workstation Recipient Directory &mdash; No hardcoded government numbers, personal contact lists, or API tokens exist in this module. All directory records are stored strictly in this browser&apos;s localStorage.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* 1. Offices */}
            <div className="bg-white border border-slate-400 rounded-md p-3 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                1. Offices ({directory.offices.length})
              </h2>
              <form onSubmit={handleSaveOffice} className="space-y-2 text-xs bg-slate-50 border border-slate-300 rounded p-2.5">
                <input
                  type="text"
                  value={officeForm.officeName}
                  onChange={(e) => setOfficeForm((p) => ({ ...p, officeName: e.target.value }))}
                  placeholder="Office / Agency Name *"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                />
                <input
                  type="text"
                  value={officeForm.officeType}
                  onChange={(e) => setOfficeForm((p) => ({ ...p, officeType: e.target.value }))}
                  placeholder="Office Type (e.g. Regional Desk, DRRMO)"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={officeForm.region}
                    onChange={(e) => setOfficeForm((p) => ({ ...p, region: e.target.value }))}
                    placeholder="Region"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                  />
                  <input
                    type="text"
                    value={officeForm.province}
                    onChange={(e) => setOfficeForm((p) => ({ ...p, province: e.target.value }))}
                    placeholder="Province"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                  />
                </div>
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={officeForm.active}
                    onChange={(e) => setOfficeForm((p) => ({ ...p, active: e.target.checked }))}
                  />
                  Active Office
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {officeForm.editingId ? 'Save Office' : 'Add Office'}
                  </button>
                  {officeForm.editingId && (
                    <button
                      type="button"
                      onClick={() =>
                        setOfficeForm({
                          editingId: null,
                          officeName: '',
                          officeType: 'DRRMO / Partner Office',
                          region: '',
                          province: '',
                          active: true,
                        })
                      }
                      className="px-2 py-1 rounded border border-slate-400 bg-white text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {directory.offices.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No offices configured yet.</p>
                ) : (
                  directory.offices.map((o) => (
                    <div
                      key={o.officeId}
                      className="border border-slate-300 rounded p-2 text-xs flex items-start justify-between gap-2 bg-white"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {o.officeName}{' '}
                          {!o.active && (
                            <span className="text-[10px] px-1 rounded bg-slate-200 text-slate-700">
                              INACTIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          {o.officeType}
                          {(o.region || o.province) && ` · ${[o.province, o.region].filter(Boolean).join(', ')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setOfficeForm({
                              editingId: o.officeId,
                              officeName: o.officeName,
                              officeType: o.officeType,
                              region: o.region,
                              province: o.province,
                              active: o.active,
                            })
                          }
                          className="px-1.5 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-100 cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDirectory((prev) => ({
                              ...prev,
                              offices: prev.offices.map((item) =>
                                item.officeId === o.officeId
                                  ? { ...item, active: !item.active }
                                  : item
                              ),
                            }))
                          }
                          className="px-1.5 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-100 cursor-pointer"
                        >
                          {o.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. Communication Destinations */}
            <div className="bg-white border border-slate-400 rounded-md p-3 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                2. Destinations ({directory.destinations.length})
              </h2>
              <form onSubmit={handleSaveDestination} className="space-y-2 text-xs bg-slate-50 border border-slate-300 rounded p-2.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={destForm.channel}
                    onChange={(e) =>
                      setDestForm((p) => ({
                        ...p,
                        channel: e.target.value as CommunicationChannel,
                      }))
                    }
                    className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold"
                  >
                    {ALL_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {CHANNEL_LABELS[ch]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={destForm.officeId}
                    onChange={(e) => setDestForm((p) => ({ ...p, officeId: e.target.value }))}
                    className="rounded border border-slate-300 bg-white px-2 py-1"
                  >
                    <option value="">No linked office</option>
                    {activeOffices.map((o) => (
                      <option key={o.officeId} value={o.officeId}>
                        {o.officeName}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={destForm.displayName}
                  onChange={(e) => setDestForm((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder="Destination Display Name *"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                />
                <input
                  type="text"
                  value={destForm.destinationIdentifier}
                  onChange={(e) =>
                    setDestForm((p) => ({ ...p, destinationIdentifier: e.target.value }))
                  }
                  placeholder="Email address, https:// URL, or desk reference"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px]"
                />
                <input
                  type="text"
                  value={destForm.notes}
                  onChange={(e) => setDestForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Operational notes (optional)"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                />
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={destForm.active}
                    onChange={(e) => setDestForm((p) => ({ ...p, active: e.target.checked }))}
                  />
                  Active Destination
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {destForm.editingId ? 'Save Destination' : 'Add Destination'}
                  </button>
                  {destForm.editingId && (
                    <button
                      type="button"
                      onClick={() =>
                        setDestForm({
                          editingId: null,
                          officeId: '',
                          channel: 'viber',
                          displayName: '',
                          destinationIdentifier: '',
                          notes: '',
                          active: true,
                        })
                      }
                      className="px-2 py-1 rounded border border-slate-400 bg-white text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {directory.destinations.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No destinations configured yet.</p>
                ) : (
                  directory.destinations.map((d) => {
                    const linkedOffice = directory.offices.find((o) => o.officeId === d.officeId);
                    return (
                      <div
                        key={d.destinationId}
                        className="border border-slate-300 rounded p-2 text-xs flex items-start justify-between gap-2 bg-white"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">
                            {d.displayName}{' '}
                            <span className="text-[10px] px-1 rounded bg-sky-50 border border-sky-300 text-sky-900">
                              {CHANNEL_LABELS[d.channel]}
                            </span>
                            {!d.active && (
                              <span className="ml-1 text-[10px] px-1 rounded bg-slate-200 text-slate-700">
                                INACTIVE
                              </span>
                            )}
                          </div>
                          {d.destinationIdentifier && (
                            <div className="font-mono text-[10px] text-slate-600 truncate">
                              {d.destinationIdentifier}
                            </div>
                          )}
                          {linkedOffice && (
                            <div className="text-[10px] text-slate-500">
                              Office: {linkedOffice.officeName}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setDestForm({
                                editingId: d.destinationId,
                                officeId: d.officeId || '',
                                channel: d.channel,
                                displayName: d.displayName,
                                destinationIdentifier: d.destinationIdentifier,
                                notes: d.notes,
                                active: d.active,
                              })
                            }
                            className="px-1.5 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-100 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDirectory((prev) => ({
                                ...prev,
                                destinations: prev.destinations.map((item) =>
                                  item.destinationId === d.destinationId
                                    ? { ...item, active: !item.active }
                                    : item
                                ),
                              }))
                            }
                            className="px-1.5 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-100 cursor-pointer"
                          >
                            {d.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. Distribution Groups */}
            <div className="bg-white border border-slate-400 rounded-md p-3 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                3. Distribution Groups ({directory.groups.length})
              </h2>
              <form onSubmit={handleSaveGroup} className="space-y-2 text-xs bg-slate-50 border border-slate-300 rounded p-2.5">
                <input
                  type="text"
                  value={groupForm.groupName}
                  onChange={(e) => setGroupForm((p) => ({ ...p, groupName: e.target.value }))}
                  placeholder="Group Name (e.g. Regional Ops Viber + Email) *"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                />
                <div className="border border-slate-300 bg-white rounded p-2 max-h-32 overflow-y-auto space-y-1">
                  <div className="text-[10px] font-bold uppercase text-slate-600">
                    Member Destinations
                  </div>
                  {directory.destinations.length === 0 ? (
                    <div className="text-[11px] text-slate-500 italic">
                      Add destinations in Column 2 first.
                    </div>
                  ) : (
                    directory.destinations.map((d) => {
                      const checked = groupForm.destinationIds.includes(d.destinationId);
                      return (
                        <label key={d.destinationId} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setGroupForm((prev) => ({
                                ...prev,
                                destinationIds: e.target.checked
                                  ? [...prev.destinationIds, d.destinationId]
                                  : prev.destinationIds.filter((id) => id !== d.destinationId),
                              }));
                            }}
                          />
                          <span className="font-semibold">{d.displayName}</span>
                          <span className="text-[10px] text-slate-500">
                            ({CHANNEL_LABELS[d.channel]})
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={groupForm.active}
                    onChange={(e) => setGroupForm((p) => ({ ...p, active: e.target.checked }))}
                  />
                  Active Group
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {groupForm.editingId ? 'Save Group' : 'Create Group'}
                  </button>
                  {groupForm.editingId && (
                    <button
                      type="button"
                      onClick={() =>
                        setGroupForm({
                          editingId: null,
                          groupName: '',
                          destinationIds: [],
                          active: true,
                        })
                      }
                      className="px-2 py-1 rounded border border-slate-400 bg-white text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {directory.groups.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No distribution groups created yet.</p>
                ) : (
                  directory.groups.map((g) => {
                    const activeMemberCount = g.destinationIds.filter((id) =>
                      directory.destinations.some((d) => d.destinationId === id && d.active)
                    ).length;
                    return (
                      <div
                        key={g.groupId}
                        className="border border-slate-300 rounded p-2 text-xs flex items-start justify-between gap-2 bg-white"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {g.groupName}{' '}
                            {!g.active && (
                              <span className="text-[10px] px-1 rounded bg-slate-200 text-slate-700">
                                INACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {activeMemberCount} active / {g.destinationIds.length} member destination(s)
                          </div>
                        </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setGroupForm({
                              editingId: g.groupId,
                              groupName: g.groupName,
                              destinationIds: g.destinationIds,
                              active: g.active,
                            })
                          }
                          className="px-1.5 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-100 cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDirectory((prev) => ({
                              ...prev,
                              groups: prev.groups.map((item) =>
                                item.groupId === g.groupId
                                  ? { ...item, active: !item.active }
                                  : item
                              ),
                            }))
                          }
                          className="px-1.5 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-100 cursor-pointer"
                        >
                          {g.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION C: DISPATCH QUEUE                                    */}
      {/* ============================================================ */}
      {subSection === 'queue' && (
        <div className="space-y-3">
        <div className="bg-white border border-slate-400 rounded-md p-3 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                C. Manual-Assisted Dispatch Queue ({filteredQueue.length})
              </h2>
              <p className="text-[11px] text-slate-600">
                Copying or opening an external channel keeps status as <strong className="text-amber-800">NOT SENT</strong>. Only clicking &ldquo;Confirm Sent&rdquo; marks <strong className="text-emerald-800">OPERATOR-CONFIRMED (LOCAL RECORD)</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={queueFilters.activeEventOnly}
                  onChange={(e) =>
                    setQueueFilters((prev) => ({
                      ...prev,
                      activeEventOnly: e.target.checked,
                    }))
                  }
                />
                Active Event Only ({source.eventKey})
              </label>
              <button
                type="button"
                onClick={handleClearCompletedFromQueue}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Finished
              </button>
            </div>
          </div>

          {/* Multi-Select Status & Communication Channel Filter Component */}
          <DispatchQueueFilterBar
            selectedStatuses={queueFilters.selectedStatuses}
            selectedChannels={queueFilters.selectedChannels}
            activeEventOnly={queueFilters.activeEventOnly}
            filteredCount={filteredQueue.length}
            counts={queueFilterCounts}
            onToggleStatus={(status) =>
              setQueueFilters((prev) => ({
                ...prev,
                selectedStatuses: toggleFilterItem(
                  prev.selectedStatuses,
                  status,
                  DISPATCH_STATUS_ORDER
                ),
              }))
            }
            onSelectAllStatuses={() =>
              setQueueFilters((prev) => ({
                ...prev,
                selectedStatuses: [...DISPATCH_STATUS_ORDER],
              }))
            }
            onSelectPendingStatuses={() =>
              setQueueFilters((prev) => ({
                ...prev,
                selectedStatuses: ['PREPARED', 'OPENED_EXTERNALLY'],
              }))
            }
            onClearStatuses={() =>
              setQueueFilters((prev) => ({
                ...prev,
                selectedStatuses: [],
              }))
            }
            onToggleChannel={(channel) =>
              setQueueFilters((prev) => ({
                ...prev,
                selectedChannels: toggleFilterItem(
                  prev.selectedChannels,
                  channel,
                  COMMUNICATION_CHANNEL_ORDER
                ),
              }))
            }
            onSelectAllChannels={() =>
              setQueueFilters((prev) => ({
                ...prev,
                selectedChannels: [...COMMUNICATION_CHANNEL_ORDER],
              }))
            }
            onClearChannels={() =>
              setQueueFilters((prev) => ({
                ...prev,
                selectedChannels: [],
              }))
            }
            onResetAllFilters={() =>
              setQueueFilters(createDefaultDispatchQueueFilterState())
            }
          />

          {/* Summary Stats Widget: Communications Today (Asia/Manila) */}
          <div
            data-testid="dispatch-today-summary"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
          >
            <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-sky-900">
                  Attempted Today ({todayStats.dateKeyPht})
                </div>
                <div className="text-[11px] text-sky-800">
                  Opened, confirmed, or failed &bull; {todayStats.pendingPreparedToday} staged awaiting handoff
                </div>
              </div>
              <span className="font-mono text-2xl font-extrabold text-sky-950">
                {todayStats.attemptedToday}
              </span>
            </div>

            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-rose-900">
                  Failed Today
                </div>
                <div className="text-[11px] text-rose-800">
                  Marked FAILED in queue/history today
                </div>
              </div>
              <span className="font-mono text-2xl font-extrabold text-rose-950">
                {todayStats.failedToday}
              </span>
            </div>

            <div className="rounded-md border border-emerald-400 bg-emerald-50 px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                  Confirmed Sent Today
                </div>
                <div className="text-[11px] text-emerald-800">
                  Operator-confirmed local records today
                </div>
              </div>
              <span className="font-mono text-2xl font-extrabold text-emerald-950">
                {todayStats.confirmedSentToday}
              </span>
            </div>
          </div>

          {/* Status Legend explaining every Dispatch Queue state with Dispatch History color parity */}
          <DispatchStatusLegend counts={queueStatusCounts} />

          {filteredQueue.length === 0 ? (
            <div className="bg-slate-50 border border-slate-300 rounded p-6 text-center text-xs text-slate-600 space-y-2">
              {queue.length > 0 ? (
                <>
                  <p className="font-semibold">
                    {queueFilters.selectedStatuses.length === 0 ||
                    queueFilters.selectedChannels.length === 0
                      ? 'All statuses or communication channels are currently hidden by your filter selection.'
                      : 'No transmissions match the selected status and channel filters.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setQueueFilters(createDefaultDispatchQueueFilterState())}
                    className="px-3 py-1 rounded bg-slate-800 text-white font-bold cursor-pointer"
                  >
                    Reset Queue Filters
                  </button>
                </>
              ) : (
                <>
                  <p className="font-semibold">No dispatch records in queue.</p>
                  <button
                    type="button"
                    onClick={() => setSubSection('prepare')}
                    className="px-3 py-1 rounded bg-blue-700 text-white font-bold cursor-pointer"
                  >
                    Go to A. Prepare Message
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-300 rounded-md">
              <table
                data-testid="dispatch-queue-table"
                className="w-full text-left border-collapse text-xs"
              >
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-[11px] uppercase text-slate-700">
                    <th className="p-2.5">Destination</th>
                    <th className="p-2.5">Channel</th>
                    <th className="p-2.5">Event / Rev</th>
                    <th className="p-2.5">Progress Status</th>
                    <th className="p-2.5">Confirmation</th>
                    <th className="p-2.5">Last Action</th>
                    <th className="p-2.5 text-right">Manual Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map((item, idx) => {
                    const isConfirmed = item.status === 'OPERATOR_CONFIRMED_SENT';
                    const isTerminal =
                      isConfirmed || item.status === 'FAILED' || item.status === 'CANCELLED';
                    const isStaleItem =
                      item.eventKey === source.eventKey &&
                      isRecordStaleAgainstSource(item.sourceFingerprint, source.sourceFingerprint);
                    const unsentAndStale = isStaleItem && !isConfirmed;
                    const expanded = Boolean(expandedQueueIds[item.dispatchId]);

                    const handoff = buildManualAssistedChannelUrl({
                      channel: item.channel,
                      destinationIdentifier: item.destinationIdentifier,
                      subject: item.subjectSnapshot,
                      body: item.messageSnapshot,
                      settings,
                    });

                    const xCheck =
                      item.channel === 'x_twitter'
                        ? validateXPostLength(item.messageSnapshot, settings.xMaxChars)
                        : {
                            valid: true,
                            overflow: 0,
                            length: item.messageSnapshot.length,
                            maxChars: settings.xMaxChars,
                          };

                    const pill =
                      DISPATCH_STATUS_VISUALS[item.status] ?? DISPATCH_STATUS_VISUALS.PREPARED;

                    return (
                      <React.Fragment key={item.dispatchId}>
                        <tr
                          className={`border-b border-slate-200 align-top ${
                            unsentAndStale
                              ? 'bg-rose-50/70'
                              : idx % 2 === 0
                              ? 'bg-white'
                              : 'bg-[#f4f7fb]'
                          }`}
                        >
                          <td className="p-2.5">
                            <div className="font-bold text-slate-900">{item.destinationName}</div>
                            {item.destinationIdentifier && (
                              <div className="font-mono text-[10px] text-slate-600 truncate max-w-[190px]">
                                {item.destinationIdentifier}
                              </div>
                            )}
                            {unsentAndStale && (
                              <span className="mt-1 inline-block px-1.5 py-0.5 rounded bg-rose-700 text-white font-bold text-[10px]">
                                STALE — BULLETIN CHANGED
                              </span>
                            )}
                          </td>

                          <td className="p-2.5 font-semibold whitespace-nowrap">
                            {CHANNEL_LABELS[item.channel]}
                          </td>

                          <td className="p-2.5 font-mono text-[11px] whitespace-nowrap">
                            <div className="font-bold text-slate-800">{item.eventKey}</div>
                            <div className="text-slate-600">
                              {item.sourceBulletinRevision} &bull; {item.communicationRevisionId}
                            </div>
                          </td>

                          <td className="p-2.5 whitespace-nowrap">
                            <span
                              data-testid={`status-pill-${item.status}`}
                              title={item.status}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-bold text-[11px] ${pill.pillClass}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${pill.dotClass}`} />
                              <span>{pill.shortLabel}</span>
                            </span>
                          </td>

                          <td className="p-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${
                                isConfirmed
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                                  : 'bg-slate-50 border-slate-300 text-slate-700'
                              }`}
                            >
                              {item.confirmationAuthenticityLabel}
                            </span>
                            {isStaleItem && isConfirmed && (
                              <div className="mt-1 text-[10px] font-bold text-slate-600">
                                IMMUTABLE SNAPSHOT
                              </div>
                            )}
                          </td>

                          <td className="p-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                            {formatShortIsoTimestamp(item.lastActionAt)}
                          </td>

                          <td className="p-2.5">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopyText(
                                    item.messageSnapshot,
                                    `${item.destinationName} message`
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold border border-slate-400 bg-white hover:bg-slate-100 text-slate-800 cursor-pointer"
                              >
                                <ClipboardCopy className="w-3 h-3" />
                                Copy
                              </button>

                              {!isTerminal && handoff.isSupported && handoff.url && (
                                <button
                                  type="button"
                                  disabled={unsentAndStale || !xCheck.valid}
                                  onClick={() => void handleOpenExternalChannel(item, handoff.url!)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold border border-sky-700 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                                >
                                  {item.channel === 'email' ? (
                                    <Mail className="w-3 h-3" />
                                  ) : item.channel === 'viber' || item.channel === 'messenger' ? (
                                    <MessageCircle className="w-3 h-3" />
                                  ) : (
                                    <ExternalLink className="w-3 h-3" />
                                  )}
                                  {item.channel === 'viber' &&
                                  handoff.url.startsWith('viber://')
                                    ? 'Open Viber'
                                    : 'Open'}
                                </button>
                              )}

                              {!isTerminal &&
                                item.channel === 'viber' &&
                                (!handoff.url || !handoff.url.startsWith('viber://')) && (
                                  <button
                                    type="button"
                                    disabled={unsentAndStale}
                                    onClick={() =>
                                      void handleOpenExternalChannel(
                                        item,
                                        buildViberProtocolForwardUrl(item.messageSnapshot)
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold border border-violet-800 bg-violet-700 hover:bg-violet-800 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                    Viber App
                                  </button>
                                )}

                              {!isTerminal && (
                                <button
                                  type="button"
                                  disabled={unsentAndStale}
                                  onClick={() => handleConfirmSent(item)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold border border-emerald-900 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                  Confirm Sent
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedQueueIds((p) => ({
                                    ...p,
                                    [item.dispatchId]: !p[item.dispatchId],
                                  }))
                                }
                                className="px-2 py-1 rounded text-[11px] font-semibold border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
                              >
                                {expanded ? 'Hide Details' : 'Details'}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {expanded && (
                          <tr className="bg-slate-50 border-b border-slate-300">
                            <td colSpan={7} className="p-3 space-y-2">
                              <div className="bg-white border border-slate-300 rounded p-2 text-xs">
                                <div className="font-semibold text-slate-800 mb-1">
                                  Snapshot Subject: {item.subjectSnapshot}
                                </div>
                                <pre className="font-mono text-[11px] whitespace-pre-wrap text-slate-700 max-h-32 overflow-y-auto">
                                  {item.messageSnapshot}
                                </pre>
                              </div>

                              {!handoff.isSupported && !isTerminal && (
                                <div className="text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-300 rounded px-2.5 py-1">
                                  UNSUPPORTED CHANNEL ENTRY: {handoff.note} (Copy still available.)
                                </div>
                              )}

                              {!xCheck.valid && !isTerminal && (
                                <div className="text-[11px] font-bold text-rose-900 bg-rose-100 border border-rose-300 rounded px-2.5 py-1">
                                  X/Twitter length exceeded ({xCheck.length}/{xCheck.maxChars}). External launch disabled.
                                </div>
                              )}

                              {isConfirmed ? (
                                <div className="text-xs text-emerald-950 flex flex-wrap items-center gap-4">
                                  <span>
                                    <strong>Confirmed by:</strong> {item.operatorLabel}
                                  </span>
                                  {item.externalReference && (
                                    <span>
                                      <strong>Ref:</strong> {item.externalReference}
                                    </span>
                                  )}
                                  {item.notes && (
                                    <span>
                                      <strong>Notes:</strong> {item.notes}
                                    </span>
                                  )}
                                </div>
                              ) : !isTerminal ? (
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleMarkQueueTerminal(item, 'FAILED')}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border border-rose-400 bg-rose-50 hover:bg-rose-100 text-rose-800 cursor-pointer"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      Mark Failed
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMarkQueueTerminal(item, 'CANCELLED')}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border border-slate-400 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                      Cancel
                                    </button>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={confirmRefs[item.dispatchId] ?? ''}
                                      onChange={(e) =>
                                        setConfirmRefs((p) => ({
                                          ...p,
                                          [item.dispatchId]: e.target.value,
                                        }))
                                      }
                                      placeholder="Post URL / Ref (optional)"
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs w-44"
                                    />
                                    <input
                                      type="text"
                                      value={confirmNotes[item.dispatchId] ?? ''}
                                      onChange={(e) =>
                                        setConfirmNotes((p) => ({
                                          ...p,
                                          [item.dispatchId]: e.target.value,
                                        }))
                                      }
                                      placeholder="Notes (optional)"
                                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs w-40"
                                    />
                                    <button
                                      type="button"
                                      disabled={unsentAndStale}
                                      onClick={() => handleConfirmSent(item)}
                                      className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-bold border border-emerald-900 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Confirm Sent
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                item.notes && (
                                  <div className="text-xs text-slate-700">
                                    <strong>Notes:</strong> {item.notes}
                                  </div>
                                )
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Small Dispatch Stats Card below Dispatch Queue */}
        {(() => {
          const prepared = todayStats.pendingPreparedToday;
          const failed = todayStats.failedToday;
          const confirmed = todayStats.confirmedSentToday;
          const total = prepared + failed + confirmed;
          const confirmedPct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
          const radius = 18;
          const circumference = 2 * Math.PI * radius;
          const confirmedDashOffset =
            total > 0 ? circumference * (1 - confirmed / total) : circumference;

          const barWidth = 300;
          const confirmedW = total > 0 ? (confirmed / total) * barWidth : 0;
          const preparedW = total > 0 ? (prepared / total) * barWidth : 0;
          const failedW = total > 0 ? Math.max(0, barWidth - confirmedW - preparedW) : 0;

          return (
            <div
              data-testid="dispatch-stats-card"
              className="bg-white border border-slate-400 rounded-md p-3 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Circular Completion Ring + Title */}
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                    <svg
                      viewBox="0 0 48 48"
                      className="w-12 h-12 -rotate-90"
                      aria-label={`Confirmed transmission progress ${confirmedPct}%`}
                    >
                      <circle
                        cx="24"
                        cy="24"
                        r={radius}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="5"
                      />
                      <circle
                        cx="24"
                        cy="24"
                        r={radius}
                        fill="none"
                        stroke="#059669"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={confirmedDashOffset}
                      />
                    </svg>
                    <span className="absolute font-mono text-[10px] font-extrabold text-slate-900">
                      {confirmedPct}%
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                      Dispatch Stats ({todayStats.dateKeyPht} PHT)
                    </h3>
                    <p className="text-[11px] text-slate-600">
                      Daily progress across Prepared, Failed, and Confirmed transmissions ({total} tracked today)
                    </p>
                  </div>
                </div>

                {/* Compact Daily Metric Counters */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-300 bg-amber-50">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="font-semibold text-amber-900">Prepared:</span>
                    <span
                      data-testid="dispatch-stats-prepared"
                      className="font-mono font-extrabold text-amber-950"
                    >
                      {prepared}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-rose-300 bg-rose-50">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    <span className="font-semibold text-rose-900">Failed:</span>
                    <span
                      data-testid="dispatch-stats-failed"
                      className="font-mono font-extrabold text-rose-950"
                    >
                      {failed}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-400 bg-emerald-50">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    <span className="font-semibold text-emerald-900">Confirmed:</span>
                    <span
                      data-testid="dispatch-stats-confirmed"
                      className="font-mono font-extrabold text-emerald-950"
                    >
                      {confirmed}
                    </span>
                  </div>
                </div>
              </div>

              {/* Multi-segment Proportional Progress Bar */}
              <div className="mt-2.5 space-y-1">
                <svg
                  viewBox={`0 0 ${barWidth} 10`}
                  preserveAspectRatio="none"
                  className="w-full h-2.5 rounded-full overflow-hidden bg-slate-200"
                  role="img"
                  aria-label={`Dispatch breakdown bar: ${confirmed} confirmed, ${prepared} prepared, ${failed} failed`}
                >
                  {total > 0 && (
                    <>
                      <rect x="0" y="0" width={confirmedW} height="10" fill="#059669" />
                      <rect x={confirmedW} y="0" width={preparedW} height="10" fill="#f59e0b" />
                      <rect
                        x={confirmedW + preparedW}
                        y="0"
                        width={failedW}
                        height="10"
                        fill="#e11d48"
                      />
                    </>
                  )}
                </svg>
                <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>
                    Confirmed {total > 0 ? Math.round((confirmed / total) * 100) : 0}% &bull; Prepared{' '}
                    {total > 0 ? Math.round((prepared / total) * 100) : 0}% &bull; Failed{' '}
                    {total > 0 ? Math.round((failed / total) * 100) : 0}%
                  </span>
                  <span>Updated live from local Queue &amp; Dispatch History</span>
                </div>
              </div>
            </div>
          );
        })()}
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION D & E: HISTORY / DEDICATED SETTINGS CONFIGURATION    */}
      {/* ============================================================ */}
      {(subSection === 'history' || subSection === 'settings') && (
        <div className="space-y-4">
          {subSection === 'history' && (
            <DispatchHistoryPanel
              records={history}
              activeEventKey={source.eventKey}
              onExportCsv={handleExportCsv}
              onCopySnapshot={(text, label) => void handleCopyText(text, label)}
              onNavigateToQueue={() => setSubSection('queue')}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Authorized Personnel Platform Destination URLs & X/Twitter Handle Settings */}
            <form
              onSubmit={handleSaveSettings}
              data-testid="social-media-settings-section"
              className="lg:col-span-6 bg-white border border-slate-300 rounded-lg p-4 space-y-3 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-600" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Settings &mdash; Default Platform URLs &amp; X/Twitter Handle
                    </h2>
                    <p className="text-xs text-slate-500">
                      Configure authorized personnel defaults without storing any sensitive access tokens.
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-900 font-mono text-[10px] font-bold">
                  TOKEN-FREE LOCAL CONFIG
                </span>
              </div>

              <div className="bg-amber-50 border border-amber-300 rounded px-2.5 py-2 text-[11px] font-semibold text-amber-950 flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-800 shrink-0 mt-0.5" />
                <span>
                  Security Guardrail: No API keys, OAuth access tokens, Bearer headers, client secrets, or passwords are stored or accepted in EQP Modern.
                </span>
              </div>

              {settingsSavedNotice && (
                <div
                  data-testid="settings-saved-banner"
                  className="bg-emerald-50 border border-emerald-400 rounded px-2.5 py-1.5 text-[11px] font-semibold text-emerald-950 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{settingsSavedNotice}</span>
                </div>
              )}

              <div className="space-y-2.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                      Operator Label (Authorized Duty Desk)
                    </label>
                    <input
                      type="text"
                      value={settingsDraft.operatorLabel}
                      onChange={(e) => {
                        setSettingsSavedNotice(null);
                        setSettingsDraft((p) => ({ ...p, operatorLabel: e.target.value }));
                      }}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="settings-x-handle"
                      className="block text-[11px] font-bold uppercase text-slate-700 mb-1"
                    >
                      X / Twitter Official Handle
                    </label>
                    <input
                      id="settings-x-handle"
                      data-testid="settings-x-handle-input"
                      type="text"
                      value={settingsDraft.officialChannelHandles?.x_twitter ?? settingsDraft.xHandle}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSettingsSavedNotice(null);
                        setSettingsDraft((p) => ({
                          ...p,
                          xHandle: val,
                          officialChannelHandles: {
                            ...p.officialChannelHandles,
                            x_twitter: val,
                          },
                        }));
                      }}
                      placeholder="@phivolcs_dost"
                      className={`w-full rounded border bg-white px-2.5 py-1.5 font-mono ${
                        settingsErrors.xHandle ? 'border-rose-500' : 'border-slate-300'
                      }`}
                    />
                    {settingsErrors.xHandle ? (
                      <p className="mt-0.5 text-[10px] font-bold text-rose-700">
                        {settingsErrors.xHandle}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Public handle only (1&ndash;15 chars); used in X preview &amp; compose attribution.
                      </p>
                    )}
                  </div>
                </div>

                {/* Official Public Channel Handles (Viber, Facebook, Messenger) */}
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="text-[11px] font-bold uppercase text-slate-700">
                    Official Channel Handles (Public Handles Only &mdash; No Tokens or Passwords)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        {
                          key: 'viber',
                          label: 'Viber Official Handle',
                          placeholder: '@eqp_viber_ops',
                          errorKey: 'handle_viber',
                        },
                        {
                          key: 'facebook',
                          label: 'Facebook Page Handle',
                          placeholder: '@eqp.official.page',
                          errorKey: 'handle_facebook',
                        },
                        {
                          key: 'messenger',
                          label: 'Messenger Desk Handle',
                          placeholder: '@eqp.messenger',
                          errorKey: 'handle_messenger',
                        },
                      ] as const
                    ).map((hField) => (
                      <div key={hField.key}>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          {hField.label}
                        </label>
                        <input
                          data-testid={`settings-handle-${hField.key}`}
                          type="text"
                          value={settingsDraft.officialChannelHandles?.[hField.key] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSettingsSavedNotice(null);
                            setSettingsDraft((p) => ({
                              ...p,
                              officialChannelHandles: {
                                ...p.officialChannelHandles,
                                [hField.key]: val,
                              },
                            }));
                          }}
                          placeholder={hField.placeholder}
                          className={`w-full rounded border bg-white px-2 py-1 font-mono text-[11px] ${
                            settingsErrors[hField.errorKey]
                              ? 'border-rose-500'
                              : 'border-slate-300'
                          }`}
                        />
                        {settingsErrors[hField.errorKey] && (
                          <p className="mt-0.5 text-[10px] font-bold text-rose-700">
                            {settingsErrors[hField.errorKey]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                    Default Message Template
                  </label>
                  <select
                    value={settingsDraft.defaultTemplateId}
                    onChange={(e) => {
                      setSettingsSavedNotice(null);
                      setSettingsDraft((p) => ({
                        ...p,
                        defaultTemplateId: e.target.value as CommunicationTemplateId,
                      }));
                    }}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
                  >
                    {TEMPLATE_DEFINITIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                      Default Recipient Group
                    </label>
                    <select
                      value={settingsDraft.defaultGroupId}
                      onChange={(e) => {
                        setSettingsSavedNotice(null);
                        setSettingsDraft((p) => ({ ...p, defaultGroupId: e.target.value }));
                      }}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
                    >
                      <option value="">None</option>
                      {activeGroups.map((g) => (
                        <option key={g.groupId} value={g.groupId}>
                          {g.groupName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                      Default Classification
                    </label>
                    <select
                      value={settingsDraft.defaultClassification}
                      onChange={(e) => {
                        setSettingsSavedNotice(null);
                        setSettingsDraft((p) => ({
                          ...p,
                          defaultClassification: e.target.value as CommunicationClassification,
                        }));
                      }}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
                    >
                      <option value="private_office">Private Office Notification</option>
                      <option value="public_release">Public Release</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                      Official Bulletin Link (https:// optional)
                    </label>
                    <input
                      data-testid="settings-official-url-input"
                      type="url"
                      value={settingsDraft.officialBulletinUrl}
                      onChange={(e) => {
                        setSettingsSavedNotice(null);
                        setSettingsDraft((p) => ({ ...p, officialBulletinUrl: e.target.value }));
                      }}
                      placeholder="https://earthquake.example.gov.ph/..."
                      className={`w-full rounded border bg-white px-2.5 py-1.5 font-mono text-[11px] ${
                        settingsErrors.officialBulletinUrl ? 'border-rose-500' : 'border-slate-300'
                      }`}
                    />
                    {settingsErrors.officialBulletinUrl && (
                      <p className="mt-0.5 text-[10px] font-bold text-rose-700">
                        {settingsErrors.officialBulletinUrl}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                      X / Twitter Max Chars
                    </label>
                    <input
                      type="number"
                      min={80}
                      max={4000}
                      value={settingsDraft.xMaxChars}
                      onChange={(e) => {
                        setSettingsSavedNotice(null);
                        setSettingsDraft((p) => ({
                          ...p,
                          xMaxChars: Math.max(80, Number(e.target.value) || 280),
                        }));
                      }}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="text-[11px] font-bold uppercase text-slate-700">
                    Default Posting Platform Destination URLs (Public HTTPS / App Entry Only)
                  </div>
                  {(
                    [
                      {
                        key: 'viber',
                        label: 'Viber Default Group / Invite URL (https:// or viber://)',
                        placeholder: 'https://invite.viber.com/...',
                      },
                      {
                        key: 'facebook',
                        label: 'Facebook Default Page URL (https://)',
                        placeholder: 'https://www.facebook.com/...',
                      },
                      {
                        key: 'messenger',
                        label: 'Messenger Default Thread Entry URL (https://)',
                        placeholder: 'https://www.messenger.com/t/...',
                      },
                      {
                        key: 'x_twitter',
                        label: 'X / Twitter Default Posting / Compose URL (https://)',
                        placeholder: 'https://x.com/intent/tweet',
                      },
                      {
                        key: 'other',
                        label: 'Other Channel Default Destination URL (https://)',
                        placeholder: 'https://...',
                      },
                    ] as const
                  ).map((field) => (
                    <div key={field.key}>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        {field.label}
                      </label>
                      <input
                        data-testid={`settings-url-${field.key}`}
                        type="url"
                        value={settingsDraft.authorizedChannelUrls[field.key]}
                        onChange={(e) => {
                          setSettingsSavedNotice(null);
                          setSettingsDraft((p) => ({
                            ...p,
                            authorizedChannelUrls: {
                              ...p.authorizedChannelUrls,
                              [field.key]: e.target.value,
                            },
                          }));
                        }}
                        placeholder={field.placeholder}
                        className={`w-full rounded border bg-white px-2 py-1 font-mono text-[11px] ${
                          settingsErrors[field.key] ? 'border-rose-500' : 'border-slate-300'
                        }`}
                      />
                      {settingsErrors[field.key] && (
                        <p className="mt-0.5 text-[10px] font-bold text-rose-700">
                          {settingsErrors[field.key]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    data-testid="settings-reset-btn"
                    onClick={handleResetSettingsDefaults}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Safe Defaults
                  </button>
                  <button
                    type="submit"
                    data-testid="settings-save-btn"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded border border-blue-900 bg-blue-700 hover:bg-blue-800 text-xs font-bold text-white cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Save Platform Settings
                  </button>
                </div>
              </div>
            </form>

            {/* API Connectivity Status Card (Mock Service Layer for Future Integration) */}
            <div
              data-testid="api-connectivity-status-card"
              className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-600" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      API Connectivity Status
                    </h2>
                    <p className="text-xs text-slate-500">
                      Future-integration mock endpoint service layer (Viber, Facebook, X/Twitter).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRefreshApiStatus()}
                  disabled={isCheckingApis}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingApis ? 'animate-spin' : ''}`} />
                  Refresh Status
                </button>
              </div>

              <div className="bg-sky-50 border border-sky-200 rounded px-2.5 py-1.5 text-[11px] text-sky-950 font-medium flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                <span>
                  COM-1 Stub Mode: Endpoints return simulated dry-run responses only. Zero API credentials stored and zero automatic publishing enabled.
                </span>
              </div>

              <div className="space-y-2.5">
                {apiStatuses.map((api) => {
                  const lastMock = mockApiResponses[api.provider];
                  const isReady = api.status === 'MOCK_SANDBOX_READY';
                  const runMockTest = async () => {
                    const payload = {
                      eventId: source.eventKey,
                      bulletinId: source.bulletinId,
                      subject: activeDraft.subject,
                      message: activeDraft.body,
                    };
                    const res =
                      api.provider === 'viber'
                        ? await mockPostViberMessage(payload)
                        : api.provider === 'facebook'
                        ? await mockPostFacebookPageFeed(payload)
                        : await mockPostTwitterTweet(payload, settings.xMaxChars);
                    setMockApiResponses((prev) => ({
                      ...prev,
                      [api.provider]: res,
                    }));
                    onNotice(res.message);
                  };

                  return (
                    <div
                      key={api.provider}
                      data-testid={`api-status-row-${api.provider}`}
                      className="rounded border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isReady ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          <span className="font-semibold text-slate-900">{api.displayName}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                              isReady
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : 'bg-amber-50 border-amber-300 text-amber-900'
                            }`}
                          >
                            {api.statusLabel}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => void runMockTest()}
                          className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-800 cursor-pointer"
                        >
                          Test Mock Endpoint
                        </button>
                      </div>

                      <div className="font-mono text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                        <span className="truncate">{api.endpointUrl}</span>
                        <span>
                          Max {api.provider === 'twitter' ? settings.xMaxChars : api.maxChars} chars &bull; {api.latencyMs}ms (mock)
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600">
                        {api.note}
                        {api.configuredPortalUrl && (
                          <span className="ml-1 font-mono text-slate-700">
                            (Portal: {api.configuredPortalUrl})
                          </span>
                        )}
                      </div>

                      {lastMock && (
                        <div
                          className={`mt-1 rounded border px-2 py-1 text-[11px] font-mono ${
                            lastMock.ok
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                              : 'bg-rose-50 border-rose-300 text-rose-950'
                          }`}
                        >
                          HTTP {lastMock.httpStatus} &bull; {lastMock.simulatedRequestId} &bull;{' '}
                          <span className="font-sans font-semibold">{lastMock.message}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
