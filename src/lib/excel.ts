import { AppState } from "./types";
import { buildOverview, buildSql, controlUsage } from "./analysis";

/** Build and download an .xlsx workbook with Export / Most used / Overview / SQL sheets. */
export async function exportXlsx(state: AppState): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const selectedControls = Object.keys(state.selection);
  const selection = Object.values(state.selection);

  // --- Export sheet: course grid (class, course, length, climb, start, dist, ctrl, ...) ---
  const exportAoa: (string | number)[][] = [
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
    exportAoa.push(line);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(exportAoa),
    "1d export",
  );

  // --- Most used sheet ---
  const usageAoa: (string | number)[][] = [
    ["Control", "Count", "Selected", "Classes"],
  ];
  for (const u of controlUsage(state.rows)) {
    usageAoa.push([
      u.control,
      u.count,
      state.selection[u.control] ? "yes" : "",
      u.classes.join(" "),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(usageAoa), "1d");

  // --- Overview matrix sheet ---
  const overview = buildOverview(state.rows, selectedControls);
  const overviewAoa: (string | number)[][] = [];
  const headerTop: (string | number)[] = ["Class", "Course", "Length"];
  for (const c of selectedControls) {
    headerTop.push(`${c} (km)`, `${c} (ratio)`);
  }
  overviewAoa.push(headerTop);
  for (const r of overview) {
    const line: (string | number)[] = [r.className, r.course, r.length];
    for (const c of selectedControls) {
      const cell = r.cells[c];
      line.push(cell ? round(cell.dist) : "");
      line.push(cell ? round(cell.ratio, 3) : "");
    }
    overviewAoa.push(line);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(overviewAoa),
    "1d_overview",
  );

  // --- SQL sheet ---
  const sql = buildSql(state.rows, selection, state.eventId);
  const sqlAoa: (string | number)[][] = [
    ["Class", "Control", "Code", "Dist", "Name", "Statement"],
  ];
  for (const s of sql) {
    sqlAoa.push([
      s.className,
      s.control,
      s.code,
      round(s.dist),
      s.name,
      s.statement,
    ]);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sqlAoa),
    "1d classes",
  );

  XLSX.writeFile(wb, "radio-controls.xlsx");
}

function round(n: number, digits = 1): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
