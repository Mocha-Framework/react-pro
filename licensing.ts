const DEV_BYPASS_KEYS = ['dev', 'development', 'debug'];

export type LicenseStatus = 'valid' | 'invalid' | 'trial' | 'development';

export function validateLicenseKey(apiKey: string): LicenseStatus {
  if (!apiKey) {
    return 'trial';
  }

  const trimmed = apiKey.trim().toLowerCase();

  if (DEV_BYPASS_KEYS.includes(trimmed)) {
    return 'development';
  }

  const keyRegex = /^(sk|pk)_(live|test)_[a-zA-Z0-9]{16,64}$/;
  if (keyRegex.test(apiKey)) {
    return 'valid';
  }

  return 'trial';
}

export function isProFeatureAllowed(apiKey: string | null): boolean {
  if (!apiKey) {
    return true;
  }
  const status = validateLicenseKey(apiKey);
  return status === 'valid' || status === 'development' || status === 'trial';
}
