import { google } from 'googleapis';
import { logger } from '../config/logger';

function getServiceAccountCredentials(): { client_email: string; private_key: string } {
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing client_email or private_key');
      }
      return {
        client_email: parsed.client_email,
        private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
      };
    } catch (err: any) {
      throw new Error(`Invalid GOOGLE_SERVICE_ACCOUNT_JSON: ${err.message}`);
    }
  }

  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const private_key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!client_email || !private_key) {
    throw new Error(
      'Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.',
    );
  }
  return { client_email, private_key };
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

export const googleSheetsService = {
  getServiceAccountEmail(): string | null {
    try {
      return getServiceAccountCredentials().client_email;
    } catch {
      return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null;
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
    const sheets = getSheetsClient();
    try {
      const res = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties.title',
      });
      return (res.data.sheets || [])
        .map((s) => s.properties?.title)
        .filter((t): t is string => !!t);
    } catch (err: any) {
      logger.error('Google Sheets listSheetTitles failed:', err?.message || err);
      const msg = err?.message || 'Failed to list sheets';
      if (/permission|not found|403|404/i.test(msg)) {
        throw new Error(
          'Cannot access spreadsheet. Confirm the ID is correct and the sheet is shared with the service account (Viewer).',
        );
      }
      throw new Error(msg);
    }
  },

  async getSheetValues(spreadsheetId: string, sheetName: string): Promise<string[][]> {
    const sheets = getSheetsClient();
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
          'Cannot read spreadsheet tab. Confirm the sheet name exists and is shared with the service account.',
        );
      }
      throw new Error(msg);
    }
  },
};
