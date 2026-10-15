import { google } from 'googleapis';
import { logger } from '../config/logger';

/** Trim and strip accidental surrounding quotes from env values (common on Vercel pastes). */
function sanitizeEnvValue(raw: string | undefined | null): string {
  let v = String(raw ?? '').trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function normalizePrivateKey(raw: string): string {
  let key = sanitizeEnvValue(raw);
  // dotenv / Vercel often store literal \n sequences
  key = key.replace(/\\n/g, '\n');
  // Strip quotes again if they wrapped a multi-line paste
  key = sanitizeEnvValue(key);
  if (!key.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is invalid (missing BEGIN PRIVATE KEY). Paste the full PEM; on Vercel do not wrap it in quotes.',
    );
  }
  return key;
}

function getServiceAccountCredentials(): { client_email: string; private_key: string } {
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(sanitizeEnvValue(jsonRaw));
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing client_email or private_key');
      }
      return {
        client_email: sanitizeEnvValue(parsed.client_email),
        private_key: normalizePrivateKey(String(parsed.private_key)),
      };
    } catch (err: any) {
      throw new Error(`Invalid GOOGLE_SERVICE_ACCOUNT_JSON: ${err.message}`);
    }
  }

  const client_email = sanitizeEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const private_key_raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!client_email || !private_key_raw) {
    throw new Error(
      'Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY on the backend.',
    );
  }
  return {
    client_email,
    private_key: normalizePrivateKey(private_key_raw),
  };
}

function getSheetsClient() {
  const creds = getServiceAccountCredentials();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

function accessHint(serviceEmail: string | null): string {
  const who = serviceEmail || 'the Google service account email';
  return `Share the spreadsheet with ${who} as Viewer, then try again.`;
}

export const googleSheetsService = {
  getServiceAccountEmail(): string | null {
    try {
      return getServiceAccountCredentials().client_email;
    } catch {
      const e = sanitizeEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
      return e || null;
    }
  },

  isConfigured(): boolean {
    try {
      getServiceAccountCredentials();
      return true;
    } catch {
      return false;
    }
  },

  async listSheetTitles(spreadsheetId: string): Promise<string[]> {
    const id = String(spreadsheetId || '').trim();
    if (!id || !/^[a-zA-Z0-9-_]+$/.test(id)) {
      throw new Error('Invalid spreadsheet ID. Paste the full Google Sheets URL or the ID only.');
    }

    const sheets = getSheetsClient();
    const serviceEmail = this.getServiceAccountEmail();
    try {
      const res = await sheets.spreadsheets.get({
        spreadsheetId: id,
        fields: 'sheets.properties.title',
      });
      return (res.data.sheets || [])
        .map((s) => s.properties?.title)
        .filter((t): t is string => !!t);
    } catch (err: any) {
      logger.error('Google Sheets listSheetTitles failed:', err?.message || err);
      const msg = err?.message || 'Failed to list sheets';
      if (/permission|not found|403|404|The caller does not have permission|Requested entity was not found/i.test(msg)) {
        throw new Error(
          `Cannot access spreadsheet. Confirm the ID is correct. ${accessHint(serviceEmail)}`,
        );
      }
      if (/DECODER|PEM|invalid_grant|invalid_client|unauthorized/i.test(msg)) {
        throw new Error(
          'Google service account credentials are invalid. Check GOOGLE_SERVICE_ACCOUNT_EMAIL and PRIVATE_KEY on the backend (Vercel env).',
        );
      }
      throw new Error(msg);
    }
  },

  async getSheetValues(spreadsheetId: string, sheetName: string): Promise<string[][]> {
    const sheets = getSheetsClient();
    const serviceEmail = this.getServiceAccountEmail();
    try {
      // Quote sheet name for A1 notation
      const quoted = `'${sheetName.replace(/'/g, "''")}'`;
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: quoted,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
      });
      const values = res.data.values || [];
      return values.map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
    } catch (err: any) {
      logger.error('Google Sheets getSheetValues failed:', err?.message || err);
      const msg = err?.message || 'Failed to read sheet';
      if (/permission|not found|403|404/i.test(msg)) {
        throw new Error(
          `Cannot read spreadsheet tab "${sheetName}". Confirm the tab exists. ${accessHint(serviceEmail)}`,
        );
      }
      throw new Error(msg);
    }
  },
};
