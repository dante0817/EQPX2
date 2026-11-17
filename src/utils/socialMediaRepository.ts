import {
  type CommunicationDraftSnapshot,
  type CommsSettings,
  DEFAULT_COMMS_SETTINGS,
  type DispatchRecord,
  type RecipientDirectory,
  stripSensitiveCredentialsFromSettings,
} from './socialMediaComms.ts';

export const COMMS_STORAGE_KEYS = {
  directory: 'eqp_com1_recipient_directory_v1',
  drafts: 'eqp_com1_drafts_v1',
  queue: 'eqp_com1_dispatch_queue_v1',
  history: 'eqp_com1_dispatch_history_v1',
  settings: 'eqp_com1_settings_v1',
} as const;

export interface RecipientDirectoryRepository {
  load(): RecipientDirectory;
  save(directory: RecipientDirectory): void;
}

export interface CommunicationDraftRepository {
  loadAll(): Record<string, CommunicationDraftSnapshot>;
  saveAll(draftsByEventKey: Record<string, CommunicationDraftSnapshot>): void;
}

export interface DispatchQueueRepository {
  loadAll(): DispatchRecord[];
  saveAll(records: DispatchRecord[]): void;
}

export interface DispatchHistoryRepository {
  loadAll(): DispatchRecord[];
  saveAll(records: DispatchRecord[]): void;
}

export interface CommsSettingsRepository {
  load(): CommsSettings;
  save(settings: CommsSettings): void;
}

export interface SocialMediaRepositories {
  storageMode: 'LOCAL_STORAGE_ONLY';
  directory: RecipientDirectoryRepository;
  drafts: CommunicationDraftRepository;
  queue: DispatchQueueRepository;
  history: DispatchHistoryRepository;
  settings: CommsSettingsRepository;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallback;
    }
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore local storage quota errors gracefully
  }
}

export const EMPTY_RECIPIENT_DIRECTORY: RecipientDirectory = {
  offices: [],
  destinations: [],
  groups: [],
};

export function createLocalSocialMediaRepositories(): SocialMediaRepositories {
  return {
    storageMode: 'LOCAL_STORAGE_ONLY',
    directory: {
      load(): RecipientDirectory {
        const parsed = readJson<Partial<RecipientDirectory>>(
          COMMS_STORAGE_KEYS.directory,
          EMPTY_RECIPIENT_DIRECTORY
        );
        return {
          offices: Array.isArray(parsed.offices) ? parsed.offices : [],
          destinations: Array.isArray(parsed.destinations) ? parsed.destinations : [],
          groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        };
      },
      save(directory: RecipientDirectory) {
        writeJson(COMMS_STORAGE_KEYS.directory, directory);
      },
    },
    drafts: {
      loadAll(): Record<string, CommunicationDraftSnapshot> {
        const parsed = readJson<Record<string, CommunicationDraftSnapshot>>(
          COMMS_STORAGE_KEYS.drafts,
          {}
        );
        return parsed && typeof parsed === 'object' ? parsed : {};
      },
      saveAll(draftsByEventKey: Record<string, CommunicationDraftSnapshot>) {
        writeJson(COMMS_STORAGE_KEYS.drafts, draftsByEventKey);
      },
    },
    queue: {
      loadAll(): DispatchRecord[] {
        const parsed = readJson<DispatchRecord[]>(COMMS_STORAGE_KEYS.queue, []);
        return Array.isArray(parsed) ? parsed : [];
      },
      saveAll(records: DispatchRecord[]) {
        writeJson(COMMS_STORAGE_KEYS.queue, records);
      },
    },
    history: {
      loadAll(): DispatchRecord[] {
        const parsed = readJson<DispatchRecord[]>(COMMS_STORAGE_KEYS.history, []);
        return Array.isArray(parsed) ? parsed : [];
      },
      saveAll(records: DispatchRecord[]) {
        writeJson(COMMS_STORAGE_KEYS.history, records);
      },
    },
    settings: {
      load(): CommsSettings {
        const parsed = readJson<Partial<CommsSettings>>(
          COMMS_STORAGE_KEYS.settings,
          DEFAULT_COMMS_SETTINGS
        );
        const merged: CommsSettings = {
          ...DEFAULT_COMMS_SETTINGS,
          ...parsed,
          officialChannelHandles: {
            ...DEFAULT_COMMS_SETTINGS.officialChannelHandles,
            ...(parsed.officialChannelHandles ?? {}),
            x_twitter:
              parsed.officialChannelHandles?.x_twitter ??
              parsed.xHandle ??
              DEFAULT_COMMS_SETTINGS.xHandle,
          },
          authorizedChannelUrls: {
            ...DEFAULT_COMMS_SETTINGS.authorizedChannelUrls,
            ...(parsed.authorizedChannelUrls ?? {}),
          },
        };
        return stripSensitiveCredentialsFromSettings(merged);
      },
      save(settings: CommsSettings) {
        writeJson(
          COMMS_STORAGE_KEYS.settings,
          stripSensitiveCredentialsFromSettings(settings)
        );
      },
    },
  };
}
