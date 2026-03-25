import { ShippingEntry } from './types';

export interface LegacySheetRows {
  name: string;
  rows: unknown[][];
}

export type LegacySkippedReason = 'missing_date' | 'missing_order_number' | 'missing_customer';
export type LegacyOrderSource = 'order_column' | 'status_column' | 'customer_text';
export type LegacyStatusSource =
  | 'explicit_x'
  | 'blank_default_mdf'
  | 'volume_text'
  | 'return_keyword'
  | 'other_text';
export type LegacyInferenceFlag =
  | 'order_number_from_status'
  | 'order_number_from_customer'
  | 'status_defaulted_to_mdf'
  | 'status_inferred_as_return'
  | 'status_inferred_from_volume'
  | 'status_imported_as_other';

export interface LegacyImportSkippedRow {
  sheetName: string;
  rowNumber: number;
  reason: LegacySkippedReason;
  rawOrderNumber: string;
  customer: string;
  rawStatus: string;
}

export interface LegacyParsedEntry {
  sheetName: string;
  rowNumber: number;
  rawOrderNumber: string;
  rawStatus: string;
  orderSource: LegacyOrderSource;
  statusSource: LegacyStatusSource;
  inferenceFlags: LegacyInferenceFlag[];
  entry: Omit<ShippingEntry, 'id' | 'userId' | 'createdAt'>;
}

export interface LegacyImportParseResult {
  parsedEntries: LegacyParsedEntry[];
  skippedRows: LegacyImportSkippedRow[];
}

interface ExtractedOrderNumber {
  value: string;
  source: LegacyOrderSource;
}

interface ResolvedStatus {
  statusSource: LegacyStatusSource;
  inferenceFlags: LegacyInferenceFlag[];
  entryFields: Pick<ShippingEntry, 'statusType' | 'volumes' | 'otherDescription'>;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function formatDateFromSpreadsheet(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeComparableText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function extractDigits(value: string) {
  const digits = normalizeText(value).match(/\d+/g);
  return digits?.length ? digits.join('') : '';
}

function extractOrderNumber(rawOrderNumber: string, rawStatus: string, customer: string): ExtractedOrderNumber | null {
  const fromOrderColumn = extractDigits(rawOrderNumber);
  if (fromOrderColumn) {
    return {
      value: fromOrderColumn,
      source: 'order_column',
    };
  }

  const fromStatusColumn = extractDigits(rawStatus);
  if (fromStatusColumn) {
    return {
      value: fromStatusColumn,
      source: 'status_column',
    };
  }

  const fromCustomerText = extractDigits(customer);
  if (fromCustomerText) {
    return {
      value: fromCustomerText,
      source: 'customer_text',
    };
  }

  return null;
}

function resolveStatus(rawOrderNumber: string, rawStatus: string): ResolvedStatus {
  const orderText = normalizeComparableText(rawOrderNumber);
  const statusText = normalizeComparableText(rawStatus);
  const combinedText = `${orderText} ${statusText}`.trim();
  const volumeMatch = combinedText.match(/(\d+)\s*VOLUME/);

  if (volumeMatch) {
    return {
      statusSource: 'volume_text',
      inferenceFlags: ['status_inferred_from_volume'],
      entryFields: {
        statusType: 'HARDWARE',
        volumes: Number(volumeMatch[1]),
      },
    };
  }

  if (combinedText.includes('RETIRA') || combinedText.includes('DEVOL')) {
    return {
      statusSource: 'return_keyword',
      inferenceFlags: ['status_inferred_as_return'],
      entryFields: {
        statusType: 'RETURN',
      },
    };
  }

  if (statusText === 'X') {
    return {
      statusSource: 'explicit_x',
      inferenceFlags: [],
      entryFields: {
        statusType: 'MDF_ONLY',
      },
    };
  }

  if (!rawStatus) {
    return {
      statusSource: 'blank_default_mdf',
      inferenceFlags: ['status_defaulted_to_mdf'],
      entryFields: {
        statusType: 'MDF_ONLY',
      },
    };
  }

  return {
    statusSource: 'other_text',
    inferenceFlags: ['status_imported_as_other'],
    entryFields: {
      statusType: 'OTHER',
      otherDescription: rawStatus,
    },
  };
}

function isLegacyHeaderRow(rawOrderNumber: string, customer: string) {
  return normalizeComparableText(rawOrderNumber) === 'VENDA' && normalizeComparableText(customer).startsWith('CLIENTE');
}

export function parseLegacyImportSheets(sheets: LegacySheetRows[]): LegacyImportParseResult {
  const parsedEntries: LegacyParsedEntry[] = [];
  const skippedRows: LegacyImportSkippedRow[] = [];

  sheets.forEach((sheet) => {
    let currentDate = '';

    sheet.rows.forEach((row, rowIndex) => {
      const rawDate = row[0];
      const rawOrderNumber = normalizeText(row[1]);
      const customer = normalizeText(row[2]);
      const rawStatus = normalizeText(row[3]);

      if (isValidDate(rawDate)) {
        currentDate = formatDateFromSpreadsheet(rawDate);
      }

      const hasOrderData = rawOrderNumber || customer || rawStatus;

      if (!hasOrderData || isLegacyHeaderRow(rawOrderNumber, customer)) {
        return;
      }

      if (!currentDate) {
        skippedRows.push({
          sheetName: sheet.name,
          rowNumber: rowIndex + 1,
          reason: 'missing_date',
          rawOrderNumber,
          customer,
          rawStatus,
        });
        return;
      }

      const extractedOrder = extractOrderNumber(rawOrderNumber, rawStatus, customer);

      if (!extractedOrder) {
        skippedRows.push({
          sheetName: sheet.name,
          rowNumber: rowIndex + 1,
          reason: 'missing_order_number',
          rawOrderNumber,
          customer,
          rawStatus,
        });
        return;
      }

      if (!customer) {
        skippedRows.push({
          sheetName: sheet.name,
          rowNumber: rowIndex + 1,
          reason: 'missing_customer',
          rawOrderNumber,
          customer,
          rawStatus,
        });
        return;
      }

      const resolvedStatus = resolveStatus(rawOrderNumber, rawStatus);
      const inferenceFlags = [...resolvedStatus.inferenceFlags];

      if (extractedOrder.source === 'status_column') {
        inferenceFlags.unshift('order_number_from_status');
      }

      if (extractedOrder.source === 'customer_text') {
        inferenceFlags.unshift('order_number_from_customer');
      }

      parsedEntries.push({
        sheetName: sheet.name,
        rowNumber: rowIndex + 1,
        rawOrderNumber,
        rawStatus,
        orderSource: extractedOrder.source,
        statusSource: resolvedStatus.statusSource,
        inferenceFlags,
        entry: {
          date: currentDate,
          orderNumber: extractedOrder.value,
          customer,
          ...resolvedStatus.entryFields,
        },
      });
    });
  });

  return {
    parsedEntries,
    skippedRows,
  };
}
