import React from "react";
import { DAY_NAMES } from "../domain/dates.js";
import { fmtHours } from "../domain/planning.js";

export function Badges({ d }) {
  if (!d.worked) return null;
  return <span style={{ display: "inline-flex", gap: 4, marginLeft: 6 }}>
    {d.open && <span className="badgeO" title="Ouvre le magasin">O</span>}
    {d.close && <span className="badgeF" title="Ferme le magasin">F</span>}
  </span>;
}
export function Status({ s }) {
  const t = { pending: "En attente", approved: "Validée", rejected: "Refusée" }[s];
  return <span className={`st ${s}`}>{t}</span>;
}
export function PariteBadge({ parite, week }) {
  return <span className="mut" style={{ fontSize: 12 }}>Semaine {week} · <span className="parite">SEMAINE {parite.toUpperCase()}</span></span>;
}
export function WeekNav({ onPrev, onNext, children }) {
  return <div className="weeknav">
    <button className="arrow" onClick={onPrev}>‹</button>
    <div style={{ textAlign: "center", flex: 1 }}>{children}</div>
    <button className="arrow" onClick={onNext}>›</button>
  </div>;
}
export function Hm({ min, strong }) {
  return <span style={strong ? { fontWeight: 800, color: "var(--pri)" } : {}}>{fmtHours(min)}</span>;
}
const hm = (s) => s.replace(":", "h");
export const fmtRange2 = (d) => d.start && d.end ? `${hm(d.start)} – ${hm(d.end)}` : "";
// Deux plages de travail séparées par la coupure du midi (demande du 25 oct, 12h22) :
// ex. "08h00 – 12h30 / 14h00 – 19h00". Sans pause : une seule plage.
export const fmtRanges = (d) => {
  if (!d.start || !d.end) return "";
  return d.pauseStart && d.pauseEnd
    ? `${hm(d.start)} – ${hm(d.pauseStart)} / ${hm(d.pauseEnd)} – ${hm(d.end)}`
    : fmtRange2(d);
};
export { DAY_NAMES };
