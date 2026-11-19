import React from "react";
import { DAY_NAMES } from "../domain/dates.js";
import { fmtHours } from "../domain/planning.js";
import { displayTime, normalizeTime } from "../domain/dates.js";

export function Badges({ d }) {
  if (!d.worked) return null;
  return <span style={{ display: "inline-flex", gap: 4, marginLeft: 6 }}>
    {d.replacementOpen&&<span className="replacement-label">Rempl. ouverture</span>}{d.replacementClose&&<span className="replacement-label">Rempl. fermeture</span>}{d.open && <span className="badgeO" title="Ouvre le magasin">O</span>}
    {d.close && <span className="badgeF" title="Ferme le magasin">F</span>}
  </span>;
}
export function Status({ s }) {
  const t = { pending: "En attente", approved: "Validée", rejected: "Refusée" }[s];
  return <span className={`st ${s}`}>{t}</span>;
}
export function PariteBadge({ parite, week }) {
  return <span className="mut" style={{ fontSize: 12 }}>Semaine {week} · <span className="parite">SEMAINE {parite==='paire'?'A':'B'}</span></span>;
}
export function WeekNav({ onPrev, onNext, children }) {
  return <div className="weeknav">
    <button className="arrow" aria-label="Semaine précédente" onClick={onPrev}>‹</button>
    <div style={{ textAlign: "center", flex: 1 }}>{children}</div>
    <button className="arrow" aria-label="Semaine suivante" onClick={onNext}>›</button>
  </div>;
}
export function Hm({ min, strong }) {
  return <span style={strong ? { fontWeight: 800, color: "var(--pri)" } : {}}>{fmtHours(min)}</span>;
}
const hm = (s) => displayTime(s).replace(":", "h");
// Champ horaire texte : affiche « 9:30 », accepte « 9:30 » / « 09:30 » / « 9h30 »,
// normalise en « 09:30 » pour le stockage. Une frappe invalide est gardée en brouillon
// puis annulée à la perte de focus (jamais envoyée).
export function TimeField({ value, onChange, className, ...rest }) {
  const [draft, setDraft] = React.useState(null);
  const shown = draft ?? displayTime(value || "");
  const handle = (raw) => {
    const n = normalizeTime(raw);
    if (n === null) { setDraft(raw); return; }
    setDraft(null);
    onChange(n);
  };
  return <input type="text" inputMode="numeric" autoComplete="off" placeholder="9:30" className={["time-input", className].filter(Boolean).join(" ")} value={shown} onChange={(e) => handle(e.target.value)} onBlur={() => setDraft(null)} {...rest} />;
}
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
