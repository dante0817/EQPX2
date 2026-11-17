/**
 * EQP Modern — COM-1 Future-Integration Social Media API Service Layer
 *
 * Provides typed, non-destructive mock endpoint stubs for Viber, Facebook, and
 * X/Twitter APIs so future server-side or authorized OAuth integrations can be
 * wired without altering UI components.
 *
 * IMPORTANT COM-1 POLICY:
 * - No real API keys, bearer tokens, or passwords are stored or transmitted.
 * - No automatic social-media publishing occurs in COM-1.
 */

export type SocialApiProvider = 'viber' | 'facebook' | 'twitter';

export type ApiConnectionHealth =
  | 'MOCK_SANDBOX_READY'
  | 'MANUAL_ASSISTED_ONLY'
  | 'NOT_CONFIGURED';

export interface SocialApiEndpointInfo {
  provider: SocialApiProvider;
  displayName: string;
  endpointUrl: string;
  method: 'POST';
  mode: 'MOCK_STUB';
  authRequirement: string;
  maxChars: number;
}

export interface ApiConnectivityStatusRecord {
  provider: SocialApiProvider;
  displayName: string;
  status: ApiConnectionHealth;
  statusLabel: string;
  endpointUrl: string;
  configuredPortalUrl: string | null;
  latencyMs: number;
  checkedAt: string;
  credentialsConfigured: false;
  autoPublishEnabled: false;
  maxChars: number;
  note: string;
}

export interface MockApiDispatchPayload {
  provider: SocialApiProvider;
  eventId: string;
  bulletinId: string;
  subject?: string;
  message: string;
  recipientHint?: string;
}

export interface MockApiDispatchResponse {
  ok: boolean;
  mocked: true;
  provider: SocialApiProvider;
  endpointUrl: string;
  httpStatus: number;
  simulatedRequestId: string;
  timestamp: string;
  characterCount: number;
  maxChars: number;
  message: string;
}

const ENDPOINT_CATALOG: Record<SocialApiProvider, SocialApiEndpointInfo> = {
  viber: {
    provider: 'viber',
    displayName: 'Viber Messaging API',
    endpointUrl: 'https://chatapi.viber.com/pa/send_message',
    method: 'POST',
    mode: 'MOCK_STUB',
    authRequirement: 'Bot Auth Token (Deferred — Manual Viber desktop/web handoff active)',
    maxChars: 7000,
  },
  facebook: {
    provider: 'facebook',
    displayName: 'Facebook Graph Page API',
    endpointUrl: 'https://graph.facebook.com/v20.0/{page-id}/feed',
    method: 'POST',
    mode: 'MOCK_STUB',
    authRequirement: 'Page Access Token (Deferred — Manual Page URL handoff active)',
    maxChars: 63206,
  },
  twitter: {
    provider: 'twitter',
    displayName: 'X / Twitter API v2',
    endpointUrl: 'https://api.x.com/2/tweets',
    method: 'POST',
    mode: 'MOCK_STUB',
    authRequirement: 'OAuth 2.0 User Context (Deferred — Manual intent compose active)',
    maxChars: 280,
  },
};

export function getSocialApiEndpointCatalog(): Record<
  SocialApiProvider,
  SocialApiEndpointInfo
> {
  return ENDPOINT_CATALOG;
}

function buildSimulatedRequestId(provider: SocialApiProvider): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MOCK-${provider.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function buildStatusRecord(
  provider: SocialApiProvider,
  configuredPortalUrl?: string
): ApiConnectivityStatusRecord {
  const info = ENDPOINT_CATALOG[provider];
  const cleanUrl = (configuredPortalUrl || '').trim();
  const hasPortal = cleanUrl.startsWith('https://');
  const latencyMap: Record<SocialApiProvider, number> = {
    viber: 14,
    facebook: 18,
    twitter: 12,
  };

  return {
    provider,
    displayName: info.displayName,
    status: hasPortal ? 'MOCK_SANDBOX_READY' : 'MANUAL_ASSISTED_ONLY',
    statusLabel: hasPortal
      ? 'Mock Stub Ready · Portal URL Set'
      : 'Mock Stub · Manual Handoff Mode',
    endpointUrl: info.endpointUrl,
    configuredPortalUrl: hasPortal ? cleanUrl : null,
    latencyMs: latencyMap[provider],
    checkedAt: new Date().toISOString(),
    credentialsConfigured: false,
    autoPublishEnabled: false,
    maxChars: info.maxChars,
    note: info.authRequirement,
  };
}

export async function checkViberApiStatus(
  configuredPortalUrl?: string
): Promise<ApiConnectivityStatusRecord> {
  return buildStatusRecord('viber', configuredPortalUrl);
}

export async function checkFacebookApiStatus(
  configuredPortalUrl?: string
): Promise<ApiConnectivityStatusRecord> {
  return buildStatusRecord('facebook', configuredPortalUrl);
}

export async function checkTwitterApiStatus(
  configuredPortalUrl?: string
): Promise<ApiConnectivityStatusRecord> {
  return buildStatusRecord('twitter', configuredPortalUrl);
}

export async function checkAllSocialApiStatuses(configuredUrls?: {
  viber?: string;
  facebook?: string;
  x_twitter?: string;
}): Promise<ApiConnectivityStatusRecord[]> {
  return Promise.all([
    checkViberApiStatus(configuredUrls?.viber),
    checkFacebookApiStatus(configuredUrls?.facebook),
    checkTwitterApiStatus(configuredUrls?.x_twitter),
  ]);
}

function executeMockEndpoint(
  provider: SocialApiProvider,
  payload: Omit<MockApiDispatchPayload, 'provider'>,
  customMaxChars?: number
): MockApiDispatchResponse {
  const info = ENDPOINT_CATALOG[provider];
  const limit = customMaxChars && customMaxChars > 0 ? customMaxChars : info.maxChars;
  const text = (payload.message || '').trim();
  const timestamp = new Date().toISOString();

  if (!text) {
    return {
      ok: false,
      mocked: true,
      provider,
      endpointUrl: info.endpointUrl,
      httpStatus: 400,
      simulatedRequestId: buildSimulatedRequestId(provider),
      timestamp,
      characterCount: 0,
      maxChars: limit,
      message: `${info.displayName} mock validation failed: message body is empty.`,
    };
  }

  if (text.length > limit) {
    return {
      ok: false,
      mocked: true,
      provider,
      endpointUrl: info.endpointUrl,
      httpStatus: 422,
      simulatedRequestId: buildSimulatedRequestId(provider),
      timestamp,
      characterCount: text.length,
      maxChars: limit,
      message: `Length Exceeded: ${text.length}/${limit} characters for ${info.displayName}.`,
    };
  }

  return {
    ok: true,
    mocked: true,
    provider,
    endpointUrl: info.endpointUrl,
    httpStatus: 202,
    simulatedRequestId: buildSimulatedRequestId(provider),
    timestamp,
    characterCount: text.length,
    maxChars: limit,
    message: `Mock endpoint accepted dry-run payload for ${info.displayName} (COM-1 stub — no live transmission executed).`,
  };
}

export async function mockPostViberMessage(
  payload: Omit<MockApiDispatchPayload, 'provider'>
): Promise<MockApiDispatchResponse> {
  return executeMockEndpoint('viber', payload);
}

export async function mockPostFacebookPageFeed(
  payload: Omit<MockApiDispatchPayload, 'provider'>
): Promise<MockApiDispatchResponse> {
  return executeMockEndpoint('facebook', payload);
}

export async function mockPostTwitterTweet(
  payload: Omit<MockApiDispatchPayload, 'provider'>,
  maxChars: number = ENDPOINT_CATALOG.twitter.maxChars
): Promise<MockApiDispatchResponse> {
  return executeMockEndpoint('twitter', payload, maxChars);
}
