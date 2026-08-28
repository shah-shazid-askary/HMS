import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight, Clock3, Loader2, Stethoscope } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Clinician = { id: number; fullName: string; specialty: string; department: string; color: string };
type Patient = { id: number; fullName: string; patientCode: string; careContext: string };
type BookingCalendarProps = { clinicians: Clinician[]; patients: Patient[]; onNotice: (message: string) => void; canBook: boolean };

const startOfUtcDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const addDays = (value: Date, days: number) => new Date(value.getTime() + days * 86_400_000);
const dayLabel = (value: Date) => value.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
const dateLabel = (value: Date) => value.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const timeLabel = (value: Date) => value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

export function BookingCalendar({ clinicians, patients, onNotice, canBook }: BookingCalendarProps) {
  const [selectedClinicianId, setSelectedClinicianId] = useState<number | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => startOfUtcDay(new Date()));
  const [selectedSlotMs, setSelectedSlotMs] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [reason, setReason] = useState("Follow-up consultation");
  const utils = trpc.useUtils();

  useEffect(() => { if (!selectedClinicianId && clinicians[0]) setSelectedClinicianId(clinicians[0].id); }, [clinicians, selectedClinicianId]);
  useEffect(() => { if (!selectedPatientId && patients[0]) setSelectedPatientId(patients[0].id); }, [patients, selectedPatientId]);
  useEffect(() => { setSelectedSlotMs(null); }, [selectedClinicianId, selectedDay]);

  const availability = trpc.hms.availability.useQuery({ clinicianId: selectedClinicianId ?? 1, dayMs: selectedDay.getTime() }, { enabled: Boolean(selectedClinicianId), refetchInterval: 15_000, refetchOnWindowFocus: true });
  const bookAppointment = trpc.hms.bookAppointment.useMutation({
    onSuccess: async () => {
      onNotice("Appointment confirmed. The live availability grid has been refreshed.");
      setSelectedSlotMs(null);
      await Promise.all([utils.hms.overview.invalidate(), utils.hms.availability.invalidate()]);
    },
    onError: (error) => onNotice(error.message),
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedDay, index - 3)), [selectedDay]);
  const selectedClinician = clinicians.find((clinician) => clinician.id === selectedClinicianId);
  const slots = availability.data ?? [];
  const openCount = slots.filter((slot) => slot.status === "open").length;

  const handleBook = () => {
    if (!canBook || !selectedPatientId || !selectedClinicianId || !selectedSlotMs || reason.trim().length < 2) return;
    bookAppointment.mutate({ patientId: selectedPatientId, clinicianId: selectedClinicianId, startsAtMs: selectedSlotMs, displayName: displayName.trim() || undefined, reason: reason.trim() });
  };

  return <section className="rounded-[18px] border border-[#e2e8e2] bg-white p-5 md:p-7">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#007c83]"><span className="status-dot h-2 w-2 rounded-full bg-[#29d0d7]" />Live availability</p><h2 className="mt-2 font-display text-[32px] leading-none text-[#10283a]">Book from the care calendar</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-[#637381]">Open slots refresh every 15 seconds and immediately after a confirmed booking. Booked times are unavailable to all authenticated users.</p></div><div className="rounded-xl bg-[#e8f4f4] px-4 py-3 text-right"><p className="font-mono-ui text-[10px] font-bold uppercase tracking-[.12em] text-[#007c83]">Selected day</p><p className="mt-1 text-sm font-extrabold text-[#193448]">{dateLabel(selectedDay)} · {openCount} open slots</p></div></div>
    <div className="mt-7 grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-2"><button onClick={() => setSelectedDay(addDays(selectedDay, -7))} className="rounded-lg border border-[#dce7e3] p-2 text-[#526576] hover:bg-[#edf8f7]"><ChevronLeft className="h-4 w-4" /></button><p className="font-display text-[25px] text-[#10283a]">Weekly selection</p><button onClick={() => setSelectedDay(addDays(selectedDay, 7))} className="rounded-lg border border-[#dce7e3] p-2 text-[#526576] hover:bg-[#edf8f7]"><ChevronRight className="h-4 w-4" /></button></div><div className="flex items-center gap-2 text-xs font-bold text-[#637381]"><span className="h-2 w-2 rounded-full bg-[#007c83]" />Open <span className="ml-2 h-2 w-2 rounded-full bg-[#cfd9d7]" />Booked</div></div>
        <div className="mt-4 grid grid-cols-7 gap-2">{days.map((day) => { const active = day.getTime() === selectedDay.getTime(); return <button key={day.getTime()} onClick={() => setSelectedDay(day)} className={`relative rounded-xl border p-3 text-left transition-colors ${active ? "border-[#007c83] bg-[#e8f4f4] text-[#006f75]" : "border-[#e3e9e4] bg-[#fbfcfa] text-[#526576] hover:border-[#9acdcc]"}`}><p className="text-[10px] font-extrabold uppercase tracking-[.12em]">{dayLabel(day)}</p><p className="mt-1 font-display text-[22px]">{day.getUTCDate()}</p>{active && <span className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full bg-[#007c83]" />}</button>; })}</div>
        <label className="mt-6 block"><span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#7a8993]">Clinician</span><select value={selectedClinicianId ?? ""} onChange={(event) => setSelectedClinicianId(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm font-bold text-[#193448] outline-none focus:ring-2 focus:ring-[#8ccdd0]">{clinicians.map((clinician) => <option key={clinician.id} value={clinician.id}>{clinician.fullName} — {clinician.specialty}</option>)}</select></label>
        <div className="mt-6"><div className="flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#7a8993]">Available appointment slots</p>{availability.isFetching && <span className="flex items-center gap-1 text-[10px] font-bold text-[#007c83]"><Loader2 className="h-3 w-3 animate-spin" />Refreshing</span>}</div>{availability.isLoading ? <div className="mt-3 grid place-items-center rounded-xl border border-dashed border-[#c9dfdc] p-8 text-sm font-semibold text-[#637381]"><Loader2 className="mb-2 h-5 w-5 animate-spin text-[#007c83]" />Loading clinician availability</div> : slots.length ? <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map((slot) => { const active = selectedSlotMs === slot.startsAt.getTime(); const open = slot.status === "open"; return <button key={slot.startsAt.getTime()} disabled={!open} onClick={() => setSelectedSlotMs(slot.startsAt.getTime())} className={`rounded-xl border px-3 py-3 text-left transition-colors ${active ? "border-[#007c83] bg-[#e8f4f4] text-[#006f75]" : open ? "border-[#cfe4e2] bg-[#fbfdfc] text-[#193448] hover:border-[#007c83]" : "cursor-not-allowed border-[#e7ece8] bg-[#f3f5f3] text-[#a1aaa8]"}`}><p className="font-mono-ui text-xs font-bold">{timeLabel(slot.startsAt)}</p><p className="mt-1 text-[9px] font-extrabold uppercase tracking-[.11em]">{open ? "Open" : "Booked"}</p></button>; })}</div> : <div className="mt-3 rounded-xl border border-dashed border-[#e2e8e2] bg-[#fbfcfa] p-7 text-sm text-[#637381]">This clinician has no published availability for the selected date.</div>}</div>
      </div>
      <aside className="relative overflow-hidden rounded-[18px] border-t-4 border-t-[#29d0d7] bg-[#10283a] p-6 text-white"><div className="file-tab absolute right-6 top-0 h-10 w-20 border-r border-b border-[#3b6070]" /><div className="relative z-10"><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#90d6db]">{canBook ? "Booking confirmation" : "Schedule access"}</p><h3 className="mt-3 font-display text-[30px] leading-tight">{canBook ? "Reserve the next step in care." : "Review the care calendar."}</h3>{canBook ? <><div className="mt-6 space-y-4"><label className="block"><span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#90d6db]">Patient</span><select value={selectedPatientId ?? ""} onChange={(event) => setSelectedPatientId(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-bold text-white outline-none"><option value="" className="text-[#10283a]">Select patient</option>{patients.map((patient) => <option className="text-[#10283a]" key={patient.id} value={patient.id}>{patient.fullName} · {patient.patientCode}</option>)}</select></label><label className="block"><span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#90d6db]">Appointment name <em className="normal-case tracking-normal text-[#bfd1d7]">(optional)</em></span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g., Annual cardiac review" className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white outline-none placeholder:text-[#bfd1d7]" /></label><label className="block"><span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#90d6db]">Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white outline-none placeholder:text-[#bfd1d7]" /></label></div><div className="mt-6 rounded-xl bg-white/8 p-4"><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#90d6db]">Selected slot</p><p className="mt-2 flex items-center gap-2 text-sm font-bold">{selectedSlotMs ? <><Clock3 className="h-4 w-4 text-[#29d0d7]" />{dateLabel(selectedDay)} · {timeLabel(new Date(selectedSlotMs))}</> : "Choose an open time"}</p><p className="mt-2 text-xs leading-5 text-[#c4d6dc]">{selectedClinician ? `${selectedClinician.fullName} · ${selectedClinician.specialty}` : "Choose a clinician"}</p></div><button disabled={!selectedSlotMs || !selectedPatientId || bookAppointment.isPending} onClick={handleBook} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#29d0d7] px-4 py-3 text-sm font-extrabold text-[#10283a] disabled:cursor-not-allowed disabled:opacity-45"><CalendarCheck2 className="h-4 w-4" />{bookAppointment.isPending ? "Confirming..." : "Confirm appointment"}</button><p className="mt-4 flex items-center gap-2 text-[11px] leading-5 text-[#bfd1d7]"><Stethoscope className="h-4 w-4 shrink-0 text-[#90d6db]" />Conflict checks run again on confirmation to prevent double booking.</p></> : <div className="mt-6 rounded-xl bg-white/8 p-4 text-sm leading-6 text-[#c4d6dc]">Doctors can review the live schedule and open slots. Reception or administrative staff manage bookings and patient registration.</div>}</div></aside>
    </div>
  </section>;
}
