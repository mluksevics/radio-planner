export interface Leg {
  /** leg distance in km (distance of the leg arriving at `code`) */
  dist: number;
  /** control code, or "F1" for the finish */
  code: string;
}

export interface CourseRow {
  /** classes sharing this course, e.g. ["W8","M8","W10","M10"] */
  classes: string[];
  /** raw class field as written in the source line */
  classLabel: string;
  course: string;
  length: number;
  climb: number;
  /** start code, e.g. "S1" */
  start: string;
  legs: Leg[];
}

export interface RadioControl {
  /** the control code as it appears on courses, e.g. "100" */
  control: string;
  /** liveresultat `code` value, e.g. 1096 */
  code: string;
  /** liveresultat display `name` base, e.g. "Prewarning" */
  name: string;
  /** liveresultat `corder` value */
  corder: number;
}

export interface AppState {
  /** raw text last loaded (kept so we can re-show it in the data input) */
  rawText: string;
  rows: CourseRow[];
  /** keyed by control code */
  selection: Record<string, RadioControl>;
  /** shared liveresultat tavid / event id */
  eventId: string;
  heatmap: boolean;
}

export const APP_STATE_VERSION = 1;

export interface PersistedState extends AppState {
  version: number;
}
