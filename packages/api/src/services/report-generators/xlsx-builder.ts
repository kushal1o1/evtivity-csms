// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

import ExcelJS from 'exceljs';

// ExcelJS's published `Column` interface omits `eachCell`, but the runtime
// objects in `sheet.columns` do expose it (see exceljs/lib/doc/column.js).
// Define a local shape that captures the actual runtime contract so the
// autosize loop type-checks without a blanket `any`.
type ColumnWithEachCell = Partial<ExcelJS.Column> & {
  width?: number;
  eachCell: (
    opt: { includeEmpty: boolean },
    cb: (cell: ExcelJS.Cell, rowNumber: number) => void,
  ) => void;
};

/**
 * Build an XLSX workbook from multiple tables (sheets).
 * Each table has a sheet name, headers, and rows.
 */
export async function buildXlsx(
  tables: Array<{ name: string; headers: string[]; rows: unknown[][] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const table of tables) {
    const sheet = workbook.addWorksheet(table.name);
    sheet.addRow(table.headers);

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
    });

    for (const row of table.rows) {
      // Skip empty separator rows
      if (row.length === 0) continue;
      sheet.addRow(row);
    }

    // Auto-fit column widths.
    for (const column of sheet.columns as ColumnWithEachCell[]) {
      let maxLen = 10;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        const len = (typeof val === 'string' ? val : val != null ? JSON.stringify(val) : '').length;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(maxLen + 2, 40);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
