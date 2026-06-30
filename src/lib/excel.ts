import type { Workbook, Worksheet, Fill } from "exceljs";
import { AppState } from "./types";
import {
  buildOverview,
  buildSql,
  controlUsage,
  orderControlsByCourse,
} from "./analysis";
import { triggerDownload } from "./storage";

// light backgrounds cycled per control group so adjacent controls are distinct
const GROUP_FILLS = [
  "DCE6F1", // blue
  "FCE4D6", // orange
  "E2EFDA", // green
  "EDE7F6", // purple
  "E0F7FA", // teal
  "FFF2CC", // yellow
];
const DATA_BAR_COLOR = "FF638EC6"; // blue gradient bar

/** Build and download an .xlsx workbook with Export / Most used / Overview / SQL sheets. */
export async function exportXlsx(state: AppState): Promise<void> {
  const mod = await import("exceljs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ExcelJS = ((mod as any).default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();

  buildExportSheet(wb, state);
  buildMostUsedSheet(wb, state);
  buildOverviewSheet(wb, state);
  buildSqlSheet(wb, state);

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "radio-controls.xlsx",
  );
}

const solidFill = (rgb: string): Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: `FF${rgb}` },
});

/** Course grid: class, course, length, climb, start, then dist/control pairs. */
function buildExportSheet(wb: Workbook, state: AppState) {
  const aoa: (string | number)[][] = [
    ["Classes", "Course", "Length", "Climb", "Start", "Sequence (dist / control) …"],
  ];
  for (const row of state.rows) {
    const line: (string | number)[] = [
      row.classLabel,
      row.course,
      row.length,
      row.climb,
      row.start,
    ];
    for (const leg of row.legs) {
      line.push(leg.dist);
      line.push(state.selection[leg.code] ? `[${leg.code}]` : leg.code);
    }
    aoa.push(line);
  }
  addPlainSheet(wb, "Export", aoa);
}

function buildMostUsedSheet(wb: Workbook, state: AppState) {
  const aoa: (string | number)[][] = [["Control", "Count", "Selected", "Classes"]];
  for (const u of controlUsage(state.rows)) {
    aoa.push([
      u.control,
      u.count,
      state.selection[u.control] ? "yes" : "",
      u.classes.join(" "),
    ]);
  }
  addPlainSheet(wb, "Most used", aoa);
}

function buildSqlSheet(wb: Workbook, state: AppState) {
  const sql = buildSql(state.rows, Object.values(state.selection), state.eventId);
  const aoa: (string | number)[][] = [
    ["Class", "Control", "Code", "Dist", "Name", "Statement"],
  ];
  for (const s of sql) {
    aoa.push([s.className, s.control, s.code, round(s.dist), s.name, s.statement]);
  }
  addPlainSheet(wb, "SQL", aoa);
}

/**
 * Overview matrix: one row per class, two columns per radio control (cumulative
 * km and ratio-of-course as a percentage with a data bar). Controls are ordered
 * by their position in the courses (earlier first), each group gets a distinct
 * background colour, and headers show "<code> <name>".
 */
function buildOverviewSheet(wb: Workbook, state: AppState) {
  const selectedControls = Object.keys(state.selection);
  const overview = buildOverview(state.rows, selectedControls);
  const ordered = orderControlsByCourse(overview, selectedControls);

  const ws = wb.addWorksheet("Overview", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });

  ws.getColumn(1).width = 14;
  const classHeader = ws.getCell(1, 1);
  classHeader.value = "Class";
  classHeader.font = { bold: true };

  const groups = ordered.map((code, i) => {
    const kmCol = 2 + i * 2;
    return { code, kmCol, ratioCol: kmCol + 1, fill: GROUP_FILLS[i % GROUP_FILLS.length] };
  });

  // merged, bold header per control group: "<code> <name>"
  for (const g of groups) {
    const rc = state.selection[g.code];
    const label = rc ? `${rc.control} ${rc.name}`.trim() : g.code;
    ws.mergeCells(1, g.kmCol, 1, g.ratioCol);
    const hc = ws.getCell(1, g.kmCol);
    hc.value = label;
    hc.font = { bold: true };
    hc.alignment = { horizontal: "center", vertical: "middle" };
    ws.getColumn(g.kmCol).width = 9;
    ws.getColumn(g.ratioCol).width = 7;
  }

  // data rows
  overview.forEach((r, idx) => {
    const rowNum = idx + 2;
    ws.getCell(rowNum, 1).value = r.className;
    for (const g of groups) {
      const cell = r.cells[g.code];
      if (!cell) continue;
      ws.getCell(rowNum, g.kmCol).value = round(cell.dist, 3);
      const ra = ws.getCell(rowNum, g.ratioCol);
      ra.value = cell.ratio;
      ra.numFmt = "0%";
    }
  });
  const lastRow = overview.length + 1;

  // group background fills (header + every data cell, including empties) and a
  // 0–100% data bar on each ratio column
  for (const g of groups) {
    for (let row = 1; row <= lastRow; row++) {
      ws.getCell(row, g.kmCol).fill = solidFill(g.fill);
      ws.getCell(row, g.ratioCol).fill = solidFill(g.fill);
    }
    const col = ws.getColumn(g.ratioCol).letter;
    ws.addConditionalFormatting({
      ref: `${col}2:${col}${lastRow}`,
      rules: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          type: "dataBar",
          gradient: true,
          showValue: true,
          border: false,
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 1 },
          ],
          color: { argb: DATA_BAR_COLOR },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    });
  }
}

function addPlainSheet(
  wb: Workbook,
  name: string,
  aoa: (string | number)[][],
): Worksheet {
  const ws = wb.addWorksheet(name);
  ws.addRows(aoa);
  ws.getRow(1).font = { bold: true };
  return ws;
}

function round(n: number, digits = 1): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
