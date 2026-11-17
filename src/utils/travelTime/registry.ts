import { createJbTravelTimeProvider } from './jbProvider';
import type {
  TravelTimeModelId,
  TravelTimeModelMetadata,
  TravelTimeProvider,
} from './types';

let defaultJbProvider: TravelTimeProvider | null = null;

function getJbProvider(): TravelTimeProvider {
  if (!defaultJbProvider) {
    defaultJbProvider = createJbTravelTimeProvider();
  }
  return defaultJbProvider;
}

export const UNAVAILABLE_MODEL_METADATA: Record<'iasp91' | 'ak135', TravelTimeModelMetadata> = {
  iasp91: {
    id: 'iasp91',
    name: 'iasp91 (Kennett & Engdahl, 1991)',
    shortLabel: 'iasp91',
    version: 'unavailable',
    source: 'Authoritative TauP / ObsPy iasp91 model table not present in workspace',
    checksum: null,
    supportedPhases: ['P', 'S'],
    phaseBounds: {},
    phaseSelectionPolicy:
      'First-arrival P/S branch selection pending authoritative TauP-verified model tables.',
    defaultCorrectionProfile: 'none',
    supportedCorrectionProfiles: ['none'],
    validationStatus: 'unavailable',
    available: false,
    unavailableReason:
      'Blocked: Environment lacks TauP / ObsPy runtime and authoritative iasp91 travel-time tables or independent verification references.',
  },
  ak135: {
    id: 'ak135',
    name: 'ak135 (Kennett, Engdahl & Buland, 1995)',
    shortLabel: 'ak135',
    version: 'unavailable',
    source: 'Authoritative TauP / ObsPy ak135 model table not present in workspace',
    checksum: null,
    supportedPhases: ['P', 'S'],
    phaseBounds: {},
    phaseSelectionPolicy:
      'First-arrival P/S branch selection pending authoritative TauP-verified model tables.',
    defaultCorrectionProfile: 'none',
    supportedCorrectionProfiles: ['none'],
    validationStatus: 'unavailable',
    available: false,
    unavailableReason:
      'Blocked: Environment lacks TauP / ObsPy runtime and authoritative ak135 travel-time tables or independent verification references.',
  },
};

export function getRegisteredModelIds(): TravelTimeModelId[] {
  return ['jb-jbtab'];
}

export function getAllModelCatalogMetadata(): TravelTimeModelMetadata[] {
  return [
    getJbProvider().metadata,
    UNAVAILABLE_MODEL_METADATA.iasp91,
    UNAVAILABLE_MODEL_METADATA.ak135,
  ];
}

export function getTravelTimeModelMetadata(
  modelId: TravelTimeModelId
): TravelTimeModelMetadata {
  if (modelId === 'jb-jbtab') {
    return getJbProvider().metadata;
  }
  return UNAVAILABLE_MODEL_METADATA[modelId];
}

export type ProviderLookupResult =
  | { ok: true; provider: TravelTimeProvider }
  | { ok: false; modelId: TravelTimeModelId; reason: string };

/**
 * Resolves a verified, registered TravelTimeProvider by ID.
 * Never substitutes J-B when an unimplemented/unverified model is requested.
 */
export function resolveTravelTimeProvider(
  modelId: TravelTimeModelId
): ProviderLookupResult {
  if (modelId === 'jb-jbtab') {
    return { ok: true, provider: getJbProvider() };
  }
  const meta = UNAVAILABLE_MODEL_METADATA[modelId];
  return {
    ok: false,
    modelId,
    reason:
      meta?.unavailableReason ??
      `Travel-time model '${modelId}' is not implemented or verified.`,
  };
}
