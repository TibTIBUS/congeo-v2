// Donnees 100% fictives : boutique "L'Echoppe du Marche".
// Partage entre la DEMO navigateur (localStorage) et le SERVEUR local authentifie.
const OFF = { worked: false, start: null, end: null, pauseStart: null, pauseEnd: null, open: false, close: false };
const D = (start, end, o, f, pause = ["12:00", "13:00"]) => ({ worked: true, start, end, pauseStart: pause ? pause[0] : null, pauseEnd: pause ? pause[1] : null, open: o, close: f });

export function seed() {
  const employees = [
    { id: "emma", name: "Emma R.", role: "Gérante", color: "#d94f70" },
    { id: "hugo", name: "Hugo B.", role: "Vendeur", color: "#2f6fdb" },
    { id: "lea", name: "Léa M.", role: "Vendeuse", color: "#0e9f6e" },
    { id: "tom", name: "Tom D.", role: "Vendeur", color: "#b7791f" },
    { id: "ines", name: "Inès K.", role: "Vendeuse", color: "#7c53c9" },
  ];
  // gabarits : [lun..dim], paire et impaire
  const templates = {
    emma: {
      paire:  [D("08:00","17:00",true,false), D("08:00","17:00",true,false), D("08:00","12:30",true,false,null), D("08:00","17:00",true,false), D("10:00","19:30",false,true), OFF, OFF],
      impaire:[D("08:00","17:00",true,false), D("08:00","17:00",true,false), D("08:00","17:00",true,false), D("08:00","12:30",true,false,null), D("10:00","19:30",false,true), D("09:00","13:00",true,false,null), OFF],
    },
    hugo: {
      paire:  [D("08:00","17:00",true,false), D("10:00","19:30",false,true), OFF, D("08:00","17:00",true,false), D("10:00","19:30",false,true), D("08:30","17:00",false,false), OFF],
      impaire:[OFF, D("08:00","17:00",true,false), D("10:00","19:30",false,true), OFF, D("08:00","17:00",true,false), D("10:00","19:30",false,true), OFF],
    },
    lea: {
      paire:  [D("10:00","19:30",false,true), D("08:00","17:00",false,false), D("10:00","19:30",false,true), D("08:00","17:00",false,false), D("10:00","19:30",false,true), D("08:30","17:00",false,true), OFF],
      impaire:[D("08:00","17:00",false,false), D("10:00","19:30",false,true), OFF, D("10:00","19:30",false,true), D("08:00","17:00",false,false), OFF, OFF],
    },
    tom: {
      paire:  [OFF, D("10:00","19:30",false,true), D("08:00","17:00",true,false), D("10:00","19:30",false,true), D("08:00","17:00",true,false), D("10:00","19:30",false,true), OFF],
      impaire:[D("10:00","19:30",false,true), OFF, D("10:00","19:30",false,true), D("08:00","17:00",true,false), D("10:00","19:30",false,true), D("08:00","17:00",true,false), OFF],
    },
    ines: {
      paire:  [D("08:30","17:00",false,false), OFF, D("08:30","17:00",false,false), D("10:00","19:30",false,true), OFF, D("08:30","17:00",true,false), OFF],
      impaire:[OFF, D("08:30","17:00",false,false), OFF, D("08:30","17:00",false,false), D("10:00","19:30",false,true), D("08:30","17:00",false,true), OFF],
    },
  };
  return {
    employees,
    templates,
    overrides: {}, // "empId|YYYY-MM-DD" -> day plan
    requests: [
      { id: "r1", employeeId: "lea", type: "leave", dateStart: "2027-03-10", dateEnd: "2027-03-13", status: "approved", createdAt: "2027-02-20T09:00:00" },
      { id: "r2", employeeId: "hugo", type: "recovery", dates: ["2027-03-12"], status: "pending", createdAt: "2027-03-01T14:30:00" },
      { id: "r3", employeeId: "tom", type: "leave", dateStart: "2027-04-19", dateEnd: "2027-04-24", status: "pending", createdAt: "2027-03-02T10:15:00" },
    ],
    recoveryLedger: [
      { id: "l1", employeeId: "hugo", deltaMin: 14 * 60, reason: "Heures supplémentaires février", at: "2027-02-28T18:00:00" },
      { id: "l2", employeeId: "lea", deltaMin: 6 * 60, reason: "Inventaire", at: "2027-02-15T19:00:00" },
      { id: "l3", employeeId: "tom", deltaMin: 21 * 60, reason: "Heures supplémentaires janv.-févr.", at: "2027-02-27T18:00:00" },
      { id: "l4", employeeId: "ines", deltaMin: 9 * 60, reason: "Remplacement samedi", at: "2027-02-20T18:00:00" },
    ],
  };
}


export { OFF, D };
