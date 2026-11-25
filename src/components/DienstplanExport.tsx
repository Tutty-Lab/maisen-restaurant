import { useMemo, useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import { buildDienstplanPdf, isMobileDevice, pdfFile, saveOrSharePdf } from "../lib/pdf";
import { weeksOfMonth } from "../lib/weeks";

/** „In lịch": Dienstplan als PDF – ganzer Monat (eine Seite je Woche) oder eine Woche. */
export function DienstplanExport({ store }: { store: UseScheduleReturn }) {
  const { schedule } = store;
  const weeks = useMemo(() => weeksOfMonth(schedule.year, schedule.month), [schedule.year, schedule.month]);
  const [which, setWhich] = useState("month");
  const [busy, setBusy] = useState(false);
  const [readyFile, setReadyFile] = useState<File | null>(null);
  const hasSchedule = schedule.shifts.length > 0;
  const monthTag = `${schedule.year}-${String(schedule.month).padStart(2, "0")}`;

  async function handleExport() {
    if (busy || !hasSchedule) return;
    setBusy(true);
    setReadyFile(null);
    try {
      const starts = which === "month" ? weeks.map((w) => w.weekStart) : [which];
      const doc = buildDienstplanPdf(schedule, store.monthEmployees, starts);
      const name = which === "month" ? `Dienstplan_${monthTag}.pdf` : `Dienstplan_${monthTag}_tuan_${which}.pdf`;
      const file = pdfFile(doc, name);
      if (isMobileDevice()) setReadyFile(file);
      else await saveOrSharePdf(file);
    } catch (err) {
      alert(`Không tạo được PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        value={which}
        onChange={(e) => {
          setWhich(e.target.value);
          setReadyFile(null);
        }}
        aria-label="In lịch cho"
      >
        <option value="month">Cả tháng</option>
        {weeks.map((w) => (
          <option key={w.weekStart} value={w.weekStart}>
            Tuần {w.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !hasSchedule}
        onClick={() => void handleExport()}
        title={hasSchedule ? undefined : "Chưa có lịch – hãy tạo lịch trước."}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
      >
        {busy ? "Đang tạo…" : "🖨 In lịch (PDF)"}
      </button>
      {readyFile && !busy && (
        <button
          type="button"
          onClick={() => {
            void saveOrSharePdf(readyFile).then((r) => {
              if (r !== "cancelled") setReadyFile(null);
            });
          }}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          📥 Lưu PDF
        </button>
      )}
    </div>
  );
}
