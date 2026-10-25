// Export annuel Excel : salaries en lignes, semaines 1..52 (53 les annees a
// 53 semaines) en colonnes, semaines de vacances scolaires zone B teintees,
// conges valides colores de la couleur du salarie. Annee civile.
import JSZip from "jszip";
import { isoWeeksInYear } from "./dates.js";
import { holidayByWeek, holidaySegments } from "./schoolHolidays.js";

const HOLIDAY_FILL = "FFF3EAE1"; // teinte claire vacances
const HEAD_FILL = "FF23252A";
const NAME_FILL = "FFF1F8F8";

function colLetter(i) { // 1 -> A
  let s = "";
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// leavesByEmployee: { empId: Set(weeks) } — conges valides, semaines ISO de l'annee
export function buildXlsx({ employees, leavesByEmployee, year }) {
  const weeks = isoWeeksInYear(year);
  const hol = holidayByWeek(year, weeks);

  // styles : 0 defaut, 1 header, 2 nom, 3 vacances, puis une couleur par salarie
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    `<fill><patternFill patternType="solid"><fgColor rgb="${HEAD_FILL}"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="${NAME_FILL}"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="${HOLIDAY_FILL}"/><bgColor indexed="64"/></patternFill></fill>`,
    ...employees.map((e) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${e.color.slice(1).toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`),
  ];
  const cellXfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"/>',
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>',
    '<xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>',
    ...employees.map((_, i) => `<xf numFmtId="0" fontId="0" fillId="${5 + i}" borderId="0" xfId="0" applyFill="1"/>`),
  ];

  const cell = (r, c, v, s) =>
    v === null || v === undefined
      ? `<c r="${colLetter(c)}${r}" s="${s}"/>`
      : `<c r="${colLetter(c)}${r}" s="${s}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;

  const segments = holidaySegments(year);

  let rows = "";
  // ligne 1 : titre ; ligne 2 : reperes vacances ; ligne 3 : semaines
  rows += `<row r="1">${cell(1, 1, `Congés ${year} · semaines 1 à ${weeks} · vacances scolaires zone B teintées`, 1)}</row>`;
  let rlab = cell(2, 1, "", 0);
  const merges = [];
  for (const s of segments) {
    rlab += cell(2, s.fromWeek + 1, `${s.label}${s.dates ? " · " + s.dates : ""}`, 4);
    for (let w = s.fromWeek + 1; w <= s.toWeek; w++) rlab += cell(2, w + 1, null, 4);
    if (s.toWeek > s.fromWeek) merges.push(`<mergeCell ref="${colLetter(s.fromWeek + 1)}2:${colLetter(s.toWeek + 1)}2"/>`);
  }
  rows += `<row r="2">${rlab}</row>`;
  let r3 = cell(3, 1, "SEMAINE", 1);
  for (let w = 1; w <= weeks; w++) r3 += cell(3, w + 1, `S${w}`, 1);
  rows += `<row r="3">${r3}</row>`;

  employees.forEach((e, ei) => {
    const r = 4 + ei;
    let row = cell(r, 1, e.name, 2);
    const leaves = leavesByEmployee[e.id] || new Set();
    for (let w = 1; w <= weeks; w++) {
      let s = 0, v = null;
      if (leaves.has(w)) { s = 5 + ei; v = hol[w] || "C"; }
      else if (hol[w]) { s = 3; v = null; }
      row += cell(r, w + 1, v, s);
    }
    rows += `<row r="${r}">${row}</row>`;
  });
  // legende
  const lr = 5 + employees.length;
  rows += `<row r="${lr}">${cell(lr, 1, "Cases teintées claires : vacances scolaires zone B. Cases colorées : congés validés (couleur du salarié).", 0)}</row>`;

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="16" customWidth="1"/>${`<col min="2" max="${weeks + 1}" width="5" customWidth="1"/>`}</cols><sheetData>${rows}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.join("")}</mergeCells>` : ""}</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><cellXfs count="${cellXfs.length}">${cellXfs.join("")}</cellXfs></styleSheet>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Congés ${year}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  zip.file("xl/styles.xml", styles);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// Matrice pour l'apercu ecran (meme regles que le fichier).
export function buildMatrix({ employees, leavesByEmployee, year }) {
  const weeks = isoWeeksInYear(year);
  const hol = holidayByWeek(year, weeks);
  return { weeks, hol, rows: employees.map((e) => ({ employee: e, leaves: leavesByEmployee[e.id] || new Set() })) };
}
