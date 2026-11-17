/**
 * URL, domain-allowlist, MIME, and private/reserved IP validation utilities
 * for R1 Safe URL Retrieval inside the PRIMER Research Assistant.
 */

export const MAX_RESEARCH_FETCH_BYTES = 8 * 1024 * 1024; // 8 MiB
export const MAX_RESEARCH_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MAX_RESEARCH_REDIRECTS = 3;
export const RESEARCH_FETCH_TIMEOUT_MS = 12_000;

export interface AllowlistedDomainGroup {
  domain: string;
  organization: string;
  authorityTier: 'philippine-agency' | 'usgs-noaa' | 'international-scientific';
}

export const ALLOWLISTED_OFFICIAL_DOMAINS: AllowlistedDomainGroup[] = [
  // Philippine government & scientific agencies
  { domain: 'phivolcs.dost.gov.ph', organization: 'DOST-PHIVOLCS', authorityTier: 'philippine-agency' },
  { domain: 'dost.gov.ph', organization: 'DOST', authorityTier: 'philippine-agency' },
  { domain: 'ndrrmc.gov.ph', organization: 'NDRRMC', authorityTier: 'philippine-agency' },
  { domain: 'ocd.gov.ph', organization: 'Office of Civil Defense (OCD)', authorityTier: 'philippine-agency' },
  { domain: 'dswd.gov.ph', organization: 'DSWD', authorityTier: 'philippine-agency' },
  { domain: 'pagasa.dost.gov.ph', organization: 'DOST-PAGASA', authorityTier: 'philippine-agency' },
  { domain: 'pna.gov.ph', organization: 'Philippine News Agency', authorityTier: 'philippine-agency' },
  { domain: 'pia.gov.ph', organization: 'Philippine Information Agency', authorityTier: 'philippine-agency' },
  { domain: 'gov.ph', organization: 'Philippine Government Agency', authorityTier: 'philippine-agency' },
  // USGS / NOAA
  { domain: 'earthquake.usgs.gov', organization: 'USGS Earthquake Hazards Program', authorityTier: 'usgs-noaa' },
  { domain: 'usgs.gov', organization: 'U.S. Geological Survey (USGS)', authorityTier: 'usgs-noaa' },
  { domain: 'tsunami.gov', organization: 'U.S. Tsunami Warning System (NOAA)', authorityTier: 'usgs-noaa' },
  { domain: 'noaa.gov', organization: 'NOAA', authorityTier: 'usgs-noaa' },
  // International seismological & disaster authorities
  { domain: 'isc.ac.uk', organization: 'International Seismological Centre (ISC)', authorityTier: 'international-scientific' },
  { domain: 'emsc-csem.org', organization: 'EMSC-CSEM', authorityTier: 'international-scientific' },
  { domain: 'seismicportal.eu', organization: 'EMSC SeismicPortal', authorityTier: 'international-scientific' },
  { domain: 'globalcmt.org', organization: 'Global CMT Project', authorityTier: 'international-scientific' },
  { domain: 'gdacs.org', organization: 'GDACS (UN/EC)', authorityTier: 'international-scientific' },
  { domain: 'reliefweb.int', organization: 'ReliefWeb (OCHA)', authorityTier: 'international-scientific' },
  { domain: 'ioc-unesco.org', organization: 'UNESCO-IOC', authorityTier: 'international-scientific' },
  { domain: 'jma.go.jp', organization: 'Japan Meteorological Agency (JMA)', authorityTier: 'international-scientific' },
  { domain: 'geonet.org.nz', organization: 'GeoNet New Zealand', authorityTier: 'international-scientific' },
  { domain: 'ga.gov.au', organization: 'Geoscience Australia', authorityTier: 'international-scientific' },
  { domain: 'doi.org', organization: 'DOI Foundation', authorityTier: 'international-scientific' },
  { domain: 'crossref.org', organization: 'Crossref', authorityTier: 'international-scientific' },
];

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set<string>([
  'application/pdf',
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'application/json',
  'application/geo+json',
  'text/csv',
  'application/xml',
  'text/xml',
]);

export function normalizeMimeType(rawHeader: string | null | undefined): string {
  if (!rawHeader) return '';
  return rawHeader.split(';')[0].trim().toLowerCase();
}

export function isAllowedDocumentMimeType(rawHeader: string | null | undefined): boolean {
  const mime = normalizeMimeType(rawHeader);
  return ALLOWED_DOCUMENT_MIME_TYPES.has(mime);
}

export function matchAllowlistedDomain(hostname: string): AllowlistedDomainGroup | null {
  const clean = hostname.trim().toLowerCase().replace(/\.+$/, '');
  if (!clean) return null;
  // Sort longest domain first so specific subdomains (e.g. phivolcs.dost.gov.ph) match before gov.ph
  const sorted = [...ALLOWLISTED_OFFICIAL_DOMAINS].sort(
    (a, b) => b.domain.length - a.domain.length
  );
  for (const entry of sorted) {
    if (clean === entry.domain || clean.endsWith(`.${entry.domain}`)) {
      return entry;
    }
  }
  return null;
}

export function isIpLiteralHost(hostname: string): boolean {
  const clean = hostname.trim().replace(/^\[|\]$/g, '');
  if (!clean) return false;
  // IPv4 decimal or shorthand/hex forms
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) return true;
  if (/^0x[0-9a-f]+$/i.test(clean) || /^\d+$/.test(clean)) return true;
  // IPv6 contains ':'
  if (clean.includes(':')) return true;
  return false;
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [
    number,
    number,
    number,
    number,
  ];
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

function isPrivateOrReservedIpv4Octets(octets: [number, number, number, number]): boolean {
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 ("this" network)
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved (224.0.0.0/4 & 240.0.0.0/4)
  return false;
}

/**
 * Checks whether an IPv4 or IPv6 address points to loopback, private, link-local,
 * carrier-grade NAT, metadata, or reserved address space.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const clean = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (!clean) return true;

  const v4 = parseIpv4Octets(clean);
  if (v4) {
    return isPrivateOrReservedIpv4Octets(v4);
  }

  // IPv6 checks
  if (!clean.includes(':')) return true; // malformed
  if (clean === '::' || clean === '::1') return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (clean.startsWith('::ffff:')) {
    const tail = clean.slice('::ffff:'.length);
    const mappedV4 = parseIpv4Octets(tail);
    if (mappedV4) {
      return isPrivateOrReservedIpv4Octets(mappedV4);
    }
    const hexPair = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexPair) {
      const hi = parseInt(hexPair[1], 16);
      const lo = parseInt(hexPair[2], 16);
      return isPrivateOrReservedIpv4Octets([
        (hi >> 8) & 0xff,
        hi & 0xff,
        (lo >> 8) & 0xff,
        lo & 0xff,
      ]);
    }
    return true;
  }

  const firstSegment = clean.split(':')[0] || '0';
  const firstWord = parseInt(firstSegment, 16);
  if (!Number.isFinite(firstWord)) return true;

  // fc00::/7 Unique Local Addresses
  if ((firstWord & 0xfe00) === 0xfc00) return true;
  // fe80::/10 Link-Local
  if ((firstWord & 0xffc0) === 0xfe80) return true;
  // fec0::/10 deprecated site-local
  if ((firstWord & 0xffc0) === 0xfec0) return true;
  // ff00::/8 multicast
  if ((firstWord & 0xff00) === 0xff00) return true;
  // 2001:db8::/32 documentation
  if (clean.startsWith('2001:db8:') || clean.startsWith('2001:0db8:')) return true;
  // 0000::/8 unspecified / loopback / ipv4-compatible
  if (firstWord === 0 && !clean.startsWith('::ffff:')) return true;

  return false;
}

export interface UrlSecurityValidationResult {
  ok: boolean;
  normalizedUrl: string;
  hostname: string;
  allowlistMatch: AllowlistedDomainGroup | null;
  error?: string;
}

/**
 * Validates a URL against strict SSRF & safe-retrieval constraints:
 * - HTTPS only
 * - No credentials or custom ports
 * - No IP literals or local/internal hostnames
 * - Official domain allowlist enforcement (default: true)
 */
export function validateSafePublicHttpsUrl(
  rawUrl: string,
  options: { requireAllowlist?: boolean } = {}
): UrlSecurityValidationResult {
  const requireAllowlist = options.requireAllowlist !== false;
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed) {
    return {
      ok: false,
      normalizedUrl: '',
      hostname: '',
      allowlistMatch: null,
      error: 'URL is empty.',
    };
  }
  if (trimmed.length > 2048) {
    return {
      ok: false,
      normalizedUrl: '',
      hostname: '',
      allowlistMatch: null,
      error: 'URL exceeds maximum length (2048 characters).',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      normalizedUrl: '',
      hostname: '',
      allowlistMatch: null,
      error: 'Malformed URL syntax.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      normalizedUrl: '',
      hostname: parsed.hostname,
      allowlistMatch: null,
      error: `Only HTTPS URLs are permitted (rejected scheme "${parsed.protocol}").`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      normalizedUrl: '',
      hostname: parsed.hostname,
      allowlistMatch: null,
      error: 'URLs containing embedded credentials are rejected.',
    };
  }

  if (parsed.port && parsed.port !== '443') {
    return {
      ok: false,
      normalizedUrl: '',
      hostname: parsed.hostname,
      allowlistMatch: null,
      error: `Non-standard port "${parsed.port}" is not allowed.`,
    };
  }

  const hostname = parsed.hostname.trim().toLowerCase().replace(/\.+$/, '');
  if (!hostname || !hostname.includes('.')) {
    return {
      ok: false,
      normalizedUrl: '',
      hostname,
      allowlistMatch: null,
      error: 'Single-label or empty hostnames are rejected.',
    };
  }

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.arpa')
  ) {
    return {
      ok: false,
      normalizedUrl: '',
      hostname,
      allowlistMatch: null,
      error: `Local/internal hostname "${hostname}" is blocked.`,
    };
  }

  if (isIpLiteralHost(hostname)) {
    return {
      ok: false,
      normalizedUrl: '',
      hostname,
      allowlistMatch: null,
      error: 'Direct IP-literal URLs are rejected; use an official public domain name.',
    };
  }

  const allowlistMatch = matchAllowlistedDomain(hostname);
  if (requireAllowlist && !allowlistMatch) {
    return {
      ok: false,
      normalizedUrl: parsed.toString(),
      hostname,
      allowlistMatch: null,
      error: `Domain "${hostname}" is not in the allowlisted official scientific/agency domain registry. Download the file manually and use Import Documents instead.`,
    };
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    hostname,
    allowlistMatch,
  };
}
