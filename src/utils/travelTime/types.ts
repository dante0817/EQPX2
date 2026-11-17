export type TravelTimeModelId = 'jb-jbtab' | 'iasp91' | 'ak135';

export type TravelTimePhase = 'P' | 'S';

export type CorrectionProfileId = 'legacy-eqp-s173' | 'none';

export type ModelValidationStatus =
  | 'operational-legacy'
  | 'verified'
  | 'research-only'
  | 'unavailable';

export type TravelTimePredictionStatus =
  | 'ok'
  | 'invalid_input'
  | 'out_of_depth_range'
  | 'out_of_distance_range'
  | 'unavailable_cell'
  | 'unsupported_phase'
  | 'model_unavailable';

export interface TravelTimePredictionRequest {
  phase: TravelTimePhase;
  deltaDeg: number;
  depthKm: number;
}

export interface TravelTimePrediction {
  valid: boolean;
  status: TravelTimePredictionStatus;
  modelId: TravelTimeModelId;
  modelVersion: string;
  phase: string;
  requestedPhase: TravelTimePhase;
  branchLabel: string | null;
  timeSec: number | null;
  dTdDeltaDeg: number | null;
  dTdDepthKm: number | null;
  toaDeg: number | null;
  derivativeDepthValid: boolean;
  failureReason?: string;
}

export interface PhaseDomainBounds {
  minDepthKm: number;
  maxDepthKm: number;
  minDeltaDeg: number;
  maxDeltaDeg: number;
}

export interface TravelTimeModelMetadata {
  id: TravelTimeModelId;
  name: string;
  shortLabel: string;
  version: string;
  source: string;
  checksum: string | null;
  supportedPhases: TravelTimePhase[];
  phaseBounds: Partial<Record<TravelTimePhase, PhaseDomainBounds>>;
  phaseSelectionPolicy: string;
  defaultCorrectionProfile: CorrectionProfileId;
  supportedCorrectionProfiles: CorrectionProfileId[];
  validationStatus: ModelValidationStatus;
  available: boolean;
  unavailableReason?: string;
  notes?: string[];
}

export interface TravelTimeProvider {
  readonly metadata: TravelTimeModelMetadata;
  predict(phase: TravelTimePhase, deltaDeg: number, depthKm: number): TravelTimePrediction;
  predictBatch(requests: TravelTimePredictionRequest[]): TravelTimePrediction[];
}
