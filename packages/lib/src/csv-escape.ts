// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

// Excel, Google Sheets, Numbers, and LibreOffice treat a cell whose first
// character is `=`, `+`, `-`, `@`, TAB, or CR as a formula. An attacker who
// gets a malicious string into an exported field (driver name, site name,
// idToken, ...) can execute arbitrary actions when an operator opens the
// CSV/XLSX. Prefix with a single quote to neutralise the formula trigger
// while keeping the displayed value the same in most clients (the leading
// quote is treated as a "text" marker and not shown).
const FORMULA_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r']);

export function neutraliseSpreadsheetFormula(value: string): string {
  if (value === '') return value;
  return FORMULA_PREFIXES.has(value.charAt(0)) ? `'${value}` : value;
}

export function csvEscape(value: unknown): string {
  if (value == null) return '';
  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    str = String(value);
  } else {
    str = JSON.stringify(value);
  }
  if (typeof value === 'string') {
    str = neutraliseSpreadsheetFormula(str);
  }
  // RFC 4180: fields containing CR, LF, comma, or double-quote must be
  // enclosed in double-quotes. Without quoting bare CR, an embedded \r in
  // user data would inject a line break into the output.
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// UTF-8 BOM so Excel for Windows detects the encoding correctly. Without it
// the default codepage (cp1252) corrupts non-ASCII characters (driver names
// with accents, €/£ symbols, OCPP error messages in non-English locales).
const UTF8_BOM = '﻿';

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(csvEscape).join(',');
  const dataLines = rows.map((row) => row.map(csvEscape).join(','));
  // CRLF line terminator per RFC 4180. LF works in modern tools but trips up
  // older Excel/Windows imports.
  return UTF8_BOM + [headerLine, ...dataLines].join('\r\n');
}
