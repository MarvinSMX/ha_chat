import * as fs from 'fs/promises';
import * as path from 'path';
import {
  PublicClientApplication,
  AuthenticationResult,
  LogLevel,
} from '@azure/msal-node';
import { getOptions } from '../config/options';

const DATA_DIR = process.env.DATA_DIR || '/data';
const MSAL_CACHE_PATH = path.join(DATA_DIR, 'msal_token_cache.json');
const SCOPES = ['Notes.Read', 'User.Read'];

function getCachePlugin(cachePath: string): {
  beforeCacheAccess: (c: { tokenCache: { deserialize: (s: string) => void } }) => Promise<void>;
  afterCacheAccess: (c: { tokenCache: { serialize: () => string }; cacheHasChanged: boolean }) => Promise<void>;
} {
  return {
    beforeCacheAccess: async (context) => {
      try {
        const data = await fs.readFile(cachePath, 'utf-8');
        if (data) context.tokenCache.deserialize(data);
      } catch {
        // Datei fehlt oder leer – leerer Cache
      }
    },
    afterCacheAccess: async (context) => {
      if (context.cacheHasChanged) {
        try {
          await fs.mkdir(path.dirname(cachePath), { recursive: true });
          await fs.writeFile(cachePath, context.tokenCache.serialize(), 'utf-8');
        } catch (e) {
          console.warn('MSAL: Cache konnte nicht gespeichert werden:', e);
        }
      }
    },
  };
}

/**
 * Holt ein Access Token per MSAL (Device Flow oder Cache).
 * Kein client_secret nötig – in Azure „Öffentliche Clientflows zulassen“ = Ja setzen.
 */
export async function getAccessToken(): Promise<string | null> {
  const opts = getOptions();
  const clientId = (opts.microsoft_client_id ?? '').trim();
  if (!clientId) {
    console.warn('MSAL: client_id fehlt');
    return null;
  }

  const tenant = (opts.microsoft_tenant_id ?? 'common').trim() || 'common';
  const authority = `https://login.microsoftonline.com/${tenant}`;

  const config = {
    auth: {
      clientId,
      authority,
    },
    cache: {
      cachePlugin: getCachePlugin(MSAL_CACHE_PATH),
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Warning,
      },
    },
  };

  const app = new PublicClientApplication(config);

  const accounts = await app.getAccounts();
  if (accounts.length > 0) {
    const result: AuthenticationResult | null = await app.acquireTokenSilent({
      scopes: SCOPES,
      account: accounts[0],
    });
    if (result?.accessToken) return result.accessToken;
  }

  let result: AuthenticationResult | null = null;
  try {
    result = await app.acquireTokenByDeviceCode({
      scopes: SCOPES,
      deviceCodeCallback: (response) => {
        const uri = response.verificationUri || 'https://login.microsoft.com/device';
        const code = response.userCode || '';
        console.log('\n============================================================');
        console.log('  HA Chat – OneNote-Anmeldung (Microsoft MSAL)');
        console.log('============================================================');
        console.log('  Öffne im Browser:  ' + uri);
        console.log('  Gib folgenden Code ein:  ' + code);
        console.log('  (Gültig ca. 15 Min. – Warte auf deine Anmeldung …)');
        console.log('============================================================\n');
      },
    });
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
    console.warn('MSAL: Token-Abruf fehlgeschlagen:', msg);
    if (/AADSTS7000218|client_assertion|client_secret/i.test(msg)) {
      console.warn(
        '  Azure verlangt client_secret – „Öffentliche Clientflows zulassen“ in der App-Registrierung auf JA setzen.'
      );
    }
    return null;
  }

  if (!result?.accessToken) {
    console.warn('MSAL: Kein Access Token erhalten');
    return null;
  }

  return result.accessToken;
}

/**
 * Holt nur ein gecachtes Token (acquireTokenSilent). Startet keinen Device Flow.
 * Für getStatus nutzen, damit die API nicht blockiert.
 */
export async function getAccessTokenSilent(): Promise<string | null> {
  const opts = getOptions();
  const clientId = (opts.microsoft_client_id ?? '').trim();
  if (!clientId) return null;

  const tenant = (opts.microsoft_tenant_id ?? 'common').trim() || 'common';
  const authority = `https://login.microsoftonline.com/${tenant}`;

  const config = {
    auth: { clientId, authority },
    cache: { cachePlugin: getCachePlugin(MSAL_CACHE_PATH) },
    system: { loggerOptions: { logLevel: LogLevel.Warning } },
  };

  const app = new PublicClientApplication(config);

  const accounts = await app.getAccounts();
  if (accounts.length === 0) return null;

  const result = await app.acquireTokenSilent({
    scopes: SCOPES,
    account: accounts[0],
  });
  return result?.accessToken ?? null;
}

export { MSAL_CACHE_PATH };
