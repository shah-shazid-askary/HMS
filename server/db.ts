import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  appointments,
  availabilityWindows,
  bills,
  clinicians,
  clinicalNotes,
  InsertUser,
  laboratoryOrders,
  laboratoryResults,
  patients,
  payments,
  prescriptionItems,
  prescriptions,
  users,
} from "../drizzle/schema";
import type { HmsRole } from "../shared/hmsAccess";
import { ENV } from "./_core/env";
import { buildAvailabilitySlots, startOfUtcDay, validateBookingRequest } from "./scheduling";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: postgres.Sql | null = null;
type Gender = "Female" | "Male" | "Other" | "Not specified";
type AppointmentStatus = "Scheduled" | "Checked in" | "Completed" | "Cancelled";
type PaymentMethod = "Cash" | "Card" | "Mobile banking" | "Insurance";



export async function getDb() {
  const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!_db && connectionString) {
    _client = postgres(connectionString, {
      max: 5,
      prepare: false,
      fetch_types: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _db = drizzle({ client: _client });
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  (["name", "email", "loginMethod"] as const).forEach((field) => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

function verifyPassword(password: string, encodedHash: string) {
  const [salt, hash] = encodedHash.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export class ManagedAccountEmailConflictError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "ManagedAccountEmailConflictError";
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

function managedAccountResponse(user: { id: number; name: string | null; email: string | null; role: HmsRole; isActive: "yes" | "no"; loginMethod: string | null; lastSignedIn: Date }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, loginMethod: user.loginMethod, lastSignedIn: user.lastSignedIn };
}

export async function authenticateUser(email: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const user = (await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1))[0];
  if (!user || user.isActive !== "yes") return undefined;
  if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) return undefined;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
  return (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
}

export async function listManagedAccounts() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select({
    user: { id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, loginMethod: users.loginMethod, lastSignedIn: users.lastSignedIn },
    clinician: { id: clinicians.id, fullName: clinicians.fullName, specialty: clinicians.specialty },
  }).from(users).leftJoin(clinicians, eq(clinicians.userId, users.id)).orderBy(asc(users.name));
}

export async function createManagedAccount(input: { name: string; email: string; password: string; role: HmsRole; clinicianId?: number }) {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const email = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new ManagedAccountEmailConflictError();
  const openId = `managed_${randomBytes(16).toString("hex")}`;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ openId, name: input.name.trim(), email, loginMethod: "supabase", passwordHash: hashPassword(input.password), role: input.role, isActive: "yes", lastSignedIn: new Date() });
      const account = (await tx.select().from(users).where(eq(users.openId, openId)).limit(1))[0]!;
      if (input.clinicianId) await tx.update(clinicians).set({ userId: account.id }).where(eq(clinicians.id, input.clinicianId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ManagedAccountEmailConflictError();
    throw error;
  }
  const account = (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0]!;
  return managedAccountResponse(account);
}

export async function updateManagedAccount(input: { userId: number; name: string; email: string; role: HmsRole; clinicianId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role }).where(eq(users.id, input.userId));
    if (input.clinicianId !== undefined) {
      await tx.update(clinicians).set({ userId: null }).where(eq(clinicians.userId, input.userId));
      if (input.clinicianId) await tx.update(clinicians).set({ userId: input.userId }).where(eq(clinicians.id, input.clinicianId));
    }
  });
  return { success: true } as const;
}

export async function resetManagedAccountPassword(userId: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(users).set({ passwordHash: hashPassword(password), loginMethod: "supabase" }).where(eq(users.id, userId));
  return { success: true } as const;
}

export async function setManagedAccountActive(userId: number, isActive: "yes" | "no") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
  return { success: true } as const;
}

function demoDay(offset = 0) { const today = startOfUtcDay(new Date()); return new Date(today.getTime() + offset * 86_400_000); }
function atUtcDay(day: Date, hour: number, minute: number) { return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute)); }

export async function ensureHmsSeed() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const existing = await db.select({ id: patients.id }).from(patients).limit(1);
  if (existing.length) return;

  await db.insert(clinicians).values([
    { fullName: "Dr. Samira Ahmed", specialty: "Cardiology", department: "Cardiology", color: "#007C83" },
    { fullName: "Dr. Mahmud Hasan", specialty: "Endocrinology", department: "Internal Medicine", color: "#386B9D" },
    { fullName: "Dr. Tahmina Noor", specialty: "Pathology", department: "Laboratory", color: "#8A5A9B" },
    { fullName: "Dr. Imran Kabir", specialty: "General Medicine", department: "Outpatient", color: "#A56B31" },
  ]);
  await db.insert(patients).values([
    { patientCode: "P-1001", fullName: "Ayesha Rahman", gender: "Female", phone: "+8801711234890", careContext: "Hypertension review" },
    { patientCode: "P-1002", fullName: "Karim Hossain", gender: "Male", phone: "+8801814876122", careContext: "Diabetes follow-up" },
    { patientCode: "P-1003", fullName: "Nabila Islam", gender: "Female", phone: "+8801612551809", careContext: "Laboratory order" },
    { patientCode: "P-1004", fullName: "Rafiq Ahmed", gender: "Male", phone: "+8801911204778", careContext: "Cardiology consult" },
    { patientCode: "P-1005", fullName: "Farzana Khan", gender: "Female", phone: "+8801755660009", careContext: "Medication refill" },
  ]);
  const clinicianRows = await db.select().from(clinicians).orderBy(asc(clinicians.id));
  const patientRows = await db.select().from(patients).orderBy(asc(patients.id));
  const clinicianIds = clinicianRows.map((clinician) => clinician.id);
  await db.insert(availabilityWindows).values(clinicianIds.flatMap((clinicianId) => [1, 2, 3, 4, 5].map((weekday) => ({ clinicianId, weekday, startMinute: 540, endMinute: 1020, slotMinutes: 30 }))));
  const day = demoDay();
  await db.insert(appointments).values([
    { appointmentCode: "A-4016", patientId: patientRows[0]!.id, clinicianId: clinicianRows[0]!.id, startsAt: atUtcDay(day, 9, 0), endsAt: atUtcDay(day, 9, 30), reason: "Follow-up ECG", status: "Scheduled" },
    { appointmentCode: "A-4017", patientId: patientRows[1]!.id, clinicianId: clinicianRows[1]!.id, startsAt: atUtcDay(day, 10, 30), endsAt: atUtcDay(day, 11, 0), reason: "Diabetes review", status: "Checked in" },
    { appointmentCode: "A-4018", patientId: patientRows[2]!.id, clinicianId: clinicianRows[2]!.id, startsAt: atUtcDay(day, 11, 15), endsAt: atUtcDay(day, 11, 45), reason: "CBC result review", status: "Scheduled" },
    { appointmentCode: "A-4019", patientId: patientRows[3]!.id, clinicianId: clinicianRows[0]!.id, startsAt: atUtcDay(day, 13, 45), endsAt: atUtcDay(day, 14, 15), reason: "New consultation", status: "Scheduled" },
  ]);
  const appointmentRows = await db.select().from(appointments).orderBy(asc(appointments.id));
  await db.insert(bills).values([
    { billCode: "B-5001", patientId: patientRows[0]!.id, appointmentId: appointmentRows[0]!.id, totalAmount: "5420.00", status: "Partial" },
    { billCode: "B-5002", patientId: patientRows[1]!.id, appointmentId: appointmentRows[1]!.id, totalAmount: "3200.00", status: "Paid" },
    { billCode: "B-5003", patientId: patientRows[2]!.id, appointmentId: appointmentRows[2]!.id, totalAmount: "2750.00", status: "Due" },
  ]);
  const billRows = await db.select().from(bills).orderBy(asc(bills.id));
  await db.insert(payments).values([{ billId: billRows[0]!.id, amount: "2400.00", method: "Mobile banking" }, { billId: billRows[1]!.id, amount: "3200.00", method: "Card" }]);
}

export async function ensureMedicalRecordSeed() {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  if ((await db.select({ id: clinicalNotes.id }).from(clinicalNotes).limit(1)).length) return;
  const [patientRows, clinicianRows, appointmentRows] = await Promise.all([
    db.select().from(patients).orderBy(asc(patients.id)),
    db.select().from(clinicians).orderBy(asc(clinicians.id)),
    db.select().from(appointments).orderBy(asc(appointments.id)),
  ]);
  const ayesha = patientRows[0]!;
  const nabila = patientRows[2]!;
  const samira = clinicianRows[0]!;
  const tahmina = clinicianRows[2]!;
  await db.insert(clinicalNotes).values([
    { patientId: ayesha.id, appointmentId: appointmentRows[0]?.id, authorClinicianId: samira.id, subjective: "Reports intermittent headaches with home blood-pressure readings above baseline.", assessment: "Essential hypertension requiring adherence review and cardiovascular risk follow-up.", plan: "Continue amlodipine, review ECG, and repeat blood-pressure check in four weeks." },
    { patientId: nabila.id, appointmentId: appointmentRows[2]?.id, authorClinicianId: tahmina.id, subjective: "Attended to discuss CBC and ESR laboratory review.", assessment: "Laboratory follow-up required; no immediate escalation noted in the clinical record.", plan: "Review available results with the treating clinician and document follow-up guidance." },
  ]);
  await db.insert(prescriptions).values({ prescriptionCode: "RX-7001", patientId: ayesha.id, appointmentId: appointmentRows[0]?.id, prescriberClinicianId: samira.id, notes: "Take consistently and bring home blood-pressure readings to follow-up." });
  const rx = (await db.select().from(prescriptions).where(eq(prescriptions.prescriptionCode, "RX-7001")).limit(1))[0]!;
  await db.insert(prescriptionItems).values([{ prescriptionId: rx.id, medicineName: "Amlodipine", dosage: "5 mg", route: "Oral", frequency: "Once daily", durationDays: 30, instructions: "Take in the morning." }]);
  await db.insert(laboratoryOrders).values({ orderCode: "LAB-8101", patientId: ayesha.id, appointmentId: appointmentRows[0]?.id, orderingClinicianId: samira.id, testName: "Lipid profile", priority: "Routine", status: "Resulted", clinicalQuestion: "Cardiovascular risk review in hypertension follow-up." });
  const labOrder = (await db.select().from(laboratoryOrders).where(eq(laboratoryOrders.orderCode, "LAB-8101")).limit(1))[0]!;
  await db.insert(laboratoryResults).values({ laboratoryOrderId: labOrder.id, reportedByClinicianId: tahmina.id, resultSummary: "Lipid profile completed and available for treating clinician review.", referenceRange: "Laboratory reference interval", resultValue: "Result available" });
}

export async function getHmsOverview() {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [clinicianRows, patientRows, appointmentRows] = await Promise.all([
    db.select().from(clinicians).where(eq(clinicians.isActive, "yes")).orderBy(asc(clinicians.fullName)),
    db.select().from(patients).where(isNull(patients.archivedAt)).orderBy(asc(patients.fullName)),
    db.select({ appointment: appointments, patient: patients, clinician: clinicians }).from(appointments).innerJoin(patients, eq(appointments.patientId, patients.id)).innerJoin(clinicians, eq(appointments.clinicianId, clinicians.id)).where(and(isNull(appointments.archivedAt), isNull(patients.archivedAt))).orderBy(asc(appointments.startsAt)),
  ]);
  return { clinicians: clinicianRows, patients: patientRows, appointments: appointmentRows };
}

export async function getBillingDesk() {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [billRows, paymentRows] = await Promise.all([
    db.select({ bill: bills, patient: patients }).from(bills).innerJoin(patients, eq(bills.patientId, patients.id)).orderBy(asc(bills.issuedAt)),
    db.select().from(payments),
  ]);
  const paymentTotals = paymentRows.reduce<Record<number, number>>((totals, payment) => ({ ...totals, [payment.billId]: (totals[payment.billId] ?? 0) + Number(payment.amount) }), {});
  const totalBilled = billRows.reduce((sum, row) => sum + Number(row.bill.totalAmount), 0);
  const totalCollected = Object.values(paymentTotals).reduce((sum, amount) => sum + amount, 0);
  return { bills: billRows, paymentTotals, financialSummary: { totalBilled, totalCollected, outstanding: totalBilled - totalCollected } };
}

export async function getAvailability(clinicianId: number, dayMs: number) {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const day = startOfUtcDay(new Date(dayMs)); const nextDay = new Date(day.getTime() + 86_400_000);
  const [windows, scheduled] = await Promise.all([
    db.select().from(availabilityWindows).where(eq(availabilityWindows.clinicianId, clinicianId)),
    db.select().from(appointments).where(and(eq(appointments.clinicianId, clinicianId), isNull(appointments.archivedAt), ne(appointments.status, "Cancelled"), lt(appointments.startsAt, nextDay), gt(appointments.endsAt, day))),
  ]);
  return buildAvailabilitySlots(day, windows, scheduled);
}

export async function createPatient(input: { fullName: string; gender: Gender; phone: string; careContext: string }) {
  await ensureHmsSeed(); const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const suffix = String(Date.now()).slice(-6);
  await db.insert(patients).values({ patientCode: `P-${suffix}`, fullName: input.fullName, gender: input.gender, phone: input.phone.replace(/\s/g, ""), careContext: input.careContext });
  return (await db.select().from(patients).where(eq(patients.patientCode, `P-${suffix}`)).limit(1))[0]!;
}

export async function updatePatient(input: { patientId: number; fullName: string; gender: Gender; phone: string; careContext: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(patients).set({ fullName: input.fullName.trim(), gender: input.gender, phone: input.phone.replace(/\s/g, ""), careContext: input.careContext.trim() }).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt)));
  const patient = (await db.select().from(patients).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt))).limit(1))[0];
  if (!patient) throw new Error("Patient record was not found in the active registry.");
  return patient;
}

export async function bookAppointment(input: { patientId: number; clinicianId: number; startsAtMs: number; displayName?: string; reason: string; createdByUserId: number }) {
  await ensureHmsSeed(); const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const startsAt = new Date(input.startsAtMs); const endsAt = new Date(startsAt.getTime() + 30 * 60_000); const weekday = startsAt.getUTCDay();
  return db.transaction(async (tx) => {
    const [patient] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt))).limit(1);
    if (!patient) throw new Error("Choose a patient from the active registry.");
    const [clinicianWindows, scheduled] = await Promise.all([
      tx.select().from(availabilityWindows).where(and(eq(availabilityWindows.clinicianId, input.clinicianId), eq(availabilityWindows.weekday, weekday))),
      tx.select().from(appointments).where(and(eq(appointments.clinicianId, input.clinicianId), isNull(appointments.archivedAt), ne(appointments.status, "Cancelled"), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))),
    ]);
    validateBookingRequest(startsAt, endsAt, clinicianWindows, scheduled);
    const appointmentCode = `A-${String(Date.now()).slice(-6)}`;
    await tx.insert(appointments).values({ appointmentCode, patientId: input.patientId, clinicianId: input.clinicianId, startsAt, endsAt, displayName: input.displayName?.trim() || null, reason: input.reason, status: "Scheduled", createdByUserId: input.createdByUserId });
    return (await tx.select().from(appointments).where(eq(appointments.appointmentCode, appointmentCode)).limit(1))[0]!;
  });
}

export async function updateAppointment(input: { appointmentId: number; patientId: number; clinicianId: number; startsAtMs: number; displayName?: string; reason: string }) {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const startsAt = new Date(input.startsAtMs); const endsAt = new Date(startsAt.getTime() + 30 * 60_000); const weekday = startsAt.getUTCDay();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), isNull(appointments.archivedAt))).limit(1);
    if (!existing) throw new Error("Appointment was not found.");
    const [patient] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt))).limit(1);
    if (!patient) throw new Error("Choose a patient from the active registry.");
    const [clinicianWindows, scheduled] = await Promise.all([
      tx.select().from(availabilityWindows).where(and(eq(availabilityWindows.clinicianId, input.clinicianId), eq(availabilityWindows.weekday, weekday))),
      tx.select().from(appointments).where(and(eq(appointments.clinicianId, input.clinicianId), isNull(appointments.archivedAt), ne(appointments.id, input.appointmentId), ne(appointments.status, "Cancelled"), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))),
    ]);
    validateBookingRequest(startsAt, endsAt, clinicianWindows, scheduled);
    await tx.update(appointments).set({ patientId: input.patientId, clinicianId: input.clinicianId, startsAt, endsAt, displayName: input.displayName?.trim() || null, reason: input.reason.trim() }).where(eq(appointments.id, input.appointmentId));
    return (await tx.select().from(appointments).where(eq(appointments.id, input.appointmentId)).limit(1))[0]!;
  });
}

export async function archiveAppointment(input: { appointmentId: number; userId: number }) {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.id, input.appointmentId), isNull(appointments.archivedAt))).limit(1);
    if (!appointment) throw new Error("Appointment was not found.");
    if (appointment.status !== "Scheduled" && appointment.status !== "Cancelled") throw new Error("Only Scheduled or Cancelled appointments can be archived.");
    const [linkedBills, linkedNotes, linkedPrescriptions, linkedOrders] = await Promise.all([
      tx.select({ id: bills.id }).from(bills).where(eq(bills.appointmentId, input.appointmentId)).limit(1),
      tx.select({ id: clinicalNotes.id }).from(clinicalNotes).where(eq(clinicalNotes.appointmentId, input.appointmentId)).limit(1),
      tx.select({ id: prescriptions.id }).from(prescriptions).where(eq(prescriptions.appointmentId, input.appointmentId)).limit(1),
      tx.select({ id: laboratoryOrders.id }).from(laboratoryOrders).where(eq(laboratoryOrders.appointmentId, input.appointmentId)).limit(1),
    ]);
    if ([linkedBills, linkedNotes, linkedPrescriptions, linkedOrders].some((rows) => rows.length > 0)) throw new Error("This appointment has linked billing or clinical records and must remain active.");
    const archivedAt = new Date();
    await tx.update(appointments).set({ archivedAt, archivedByUserId: input.userId }).where(eq(appointments.id, input.appointmentId));
    return { success: true, archivedAt } as const;
  });
}

export async function archivePatient(input: { patientId: number; userId: number }) {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const [patient] = await tx.select().from(patients).where(and(eq(patients.id, input.patientId), isNull(patients.archivedAt))).limit(1);
    if (!patient) throw new Error("Patient was not found.");
    const [linkedAppointments, linkedBills, linkedNotes, linkedPrescriptions, linkedOrders] = await Promise.all([
      tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.patientId, input.patientId), isNull(appointments.archivedAt))).limit(1),
      tx.select({ id: bills.id }).from(bills).where(eq(bills.patientId, input.patientId)).limit(1),
      tx.select({ id: clinicalNotes.id }).from(clinicalNotes).where(eq(clinicalNotes.patientId, input.patientId)).limit(1),
      tx.select({ id: prescriptions.id }).from(prescriptions).where(eq(prescriptions.patientId, input.patientId)).limit(1),
      tx.select({ id: laboratoryOrders.id }).from(laboratoryOrders).where(eq(laboratoryOrders.patientId, input.patientId)).limit(1),
    ]);
    if ([linkedAppointments, linkedBills, linkedNotes, linkedPrescriptions, linkedOrders].some((rows) => rows.length > 0)) throw new Error("This patient has linked scheduling, billing, or clinical records and must remain active.");
    const archivedAt = new Date();
    await tx.update(patients).set({ archivedAt, archivedByUserId: input.userId }).where(eq(patients.id, input.patientId));
    return { success: true, archivedAt } as const;
  });
}

export async function getArchivedRecords() {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [archivedPatients, archivedAppointments] = await Promise.all([
    db.select({ patient: patients, archivedBy: { id: users.id, name: users.name } }).from(patients).leftJoin(users, eq(patients.archivedByUserId, users.id)).where(isNotNull(patients.archivedAt)).orderBy(desc(patients.archivedAt)),
    db.select({ appointment: appointments, patient: patients, clinician: clinicians, archivedBy: { id: users.id, name: users.name } }).from(appointments).innerJoin(patients, eq(appointments.patientId, patients.id)).innerJoin(clinicians, eq(appointments.clinicianId, clinicians.id)).leftJoin(users, eq(appointments.archivedByUserId, users.id)).where(isNotNull(appointments.archivedAt)).orderBy(desc(appointments.archivedAt)),
  ]);
  return { patients: archivedPatients, appointments: archivedAppointments };
}

export async function restorePatient(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [patient] = await db.select().from(patients).where(and(eq(patients.id, patientId), isNotNull(patients.archivedAt))).limit(1);
  if (!patient) throw new Error("Archived patient record was not found.");
  await db.update(patients).set({ archivedAt: null, archivedByUserId: null }).where(eq(patients.id, patientId));
  return { success: true } as const;
}

export async function restoreAppointment(appointmentId: number) {
  await ensureHmsSeed();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.id, appointmentId), isNotNull(appointments.archivedAt))).limit(1);
    if (!appointment) throw new Error("Archived appointment was not found.");
    const [patient, clinician] = await Promise.all([
      tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, appointment.patientId), isNull(patients.archivedAt))).limit(1),
      tx.select().from(clinicians).where(and(eq(clinicians.id, appointment.clinicianId), eq(clinicians.isActive, "yes"))).limit(1),
    ]);
    if (!patient) throw new Error("Restore the linked patient record before restoring this appointment.");
    if (!clinician) throw new Error("The appointment clinician is no longer active.");
    if (appointment.status !== "Cancelled") {
      const weekday = appointment.startsAt.getUTCDay();
      const [clinicianWindows, scheduled] = await Promise.all([
        tx.select().from(availabilityWindows).where(and(eq(availabilityWindows.clinicianId, appointment.clinicianId), eq(availabilityWindows.weekday, weekday))),
        tx.select().from(appointments).where(and(eq(appointments.clinicianId, appointment.clinicianId), isNull(appointments.archivedAt), ne(appointments.status, "Cancelled"), lt(appointments.startsAt, appointment.endsAt), gt(appointments.endsAt, appointment.startsAt))),
      ]);
      validateBookingRequest(appointment.startsAt, appointment.endsAt, clinicianWindows, scheduled);
    }
    await tx.update(appointments).set({ archivedAt: null, archivedByUserId: null }).where(eq(appointments.id, appointmentId));
    return { success: true } as const;
  });
}

export async function updateAppointmentStatus(appointmentId: number, status: AppointmentStatus) { const db = await getDb(); if (!db) throw new Error("Database is unavailable"); await db.update(appointments).set({ status }).where(and(eq(appointments.id, appointmentId), isNull(appointments.archivedAt))); return { success: true } as const; }

export async function recordPayment(input: { billId: number; amount: number; method: PaymentMethod; userId: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.transaction(async (tx) => {
    await tx.insert(payments).values({ billId: input.billId, amount: input.amount.toFixed(2), method: input.method, recordedByUserId: input.userId });
    const billRecord = (await tx.select().from(bills).where(eq(bills.id, input.billId)).limit(1))[0]!;
    const billPayments = await tx.select().from(payments).where(eq(payments.billId, input.billId));
    const collected = billPayments.reduce((sum: number, payment: { amount: string }) => sum + Number(payment.amount), 0);
    await tx.update(bills).set({ status: collected >= Number(billRecord.totalAmount) ? "Paid" : collected > 0 ? "Partial" : "Due" }).where(eq(bills.id, input.billId));
  });
  return { success: true } as const;
}

export async function getRoleContext(userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new Error("Active user was not found.");
  const clinician = (await db.select().from(clinicians).where(eq(clinicians.userId, userId)).limit(1))[0] ?? null;
  return { role: user.role as HmsRole, clinician };
}

async function resolveAuthorClinician(input: { userId: number; role: HmsRole; clinicianId?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  if (input.role === "doctor") {
    const linked = (await db.select().from(clinicians).where(eq(clinicians.userId, input.userId)).limit(1))[0];
    if (linked) return linked;
  }
  if (input.clinicianId) {
    const selected = (await db.select().from(clinicians).where(eq(clinicians.id, input.clinicianId)).limit(1))[0];
    if (selected) return selected;
  }
  // Fallback to first active clinician for Admin / system operations
  const firstActive = (await db.select().from(clinicians).where(eq(clinicians.isActive, "yes")).orderBy(asc(clinicians.id)).limit(1))[0];
  if (firstActive) return firstActive;
  throw new Error("No active clinicians available.");
}

export async function getPatientMedicalRecord(patientId: number) {
  await ensureMedicalRecordSeed(); const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const patient = (await db.select().from(patients).where(eq(patients.id, patientId)).limit(1))[0];
  if (!patient) throw new Error("Patient record not found.");
  const [notes, prescriptionRows, itemRows, labRows] = await Promise.all([
    db.select({ note: clinicalNotes, clinician: clinicians }).from(clinicalNotes).innerJoin(clinicians, eq(clinicalNotes.authorClinicianId, clinicians.id)).where(eq(clinicalNotes.patientId, patientId)).orderBy(desc(clinicalNotes.createdAt)),
    db.select({ prescription: prescriptions, clinician: clinicians }).from(prescriptions).innerJoin(clinicians, eq(prescriptions.prescriberClinicianId, clinicians.id)).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.prescribedAt)),
    db.select().from(prescriptionItems),
    db.select({ order: laboratoryOrders, orderingClinician: clinicians, result: laboratoryResults }).from(laboratoryOrders).innerJoin(clinicians, eq(laboratoryOrders.orderingClinicianId, clinicians.id)).leftJoin(laboratoryResults, eq(laboratoryResults.laboratoryOrderId, laboratoryOrders.id)).where(eq(laboratoryOrders.patientId, patientId)).orderBy(desc(laboratoryOrders.orderedAt)),
  ]);
  const rxIds = prescriptionRows.map((row) => row.prescription.id);
  const scopedItems = rxIds.length ? itemRows.filter((item) => rxIds.includes(item.prescriptionId)) : [];
  return { patient, notes, prescriptions: prescriptionRows.map((row) => ({ ...row, items: scopedItems.filter((item) => item.prescriptionId === row.prescription.id) })), laboratoryOrders: labRows };
}

export async function createClinicalNote(input: { patientId: number; appointmentId?: number; clinicianId?: number; subjective: string; assessment: string; plan: string; userId: number; role: HmsRole }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const author = await resolveAuthorClinician(input);
  await db.insert(clinicalNotes).values({ patientId: input.patientId, appointmentId: input.appointmentId, authorClinicianId: author.id, authorUserId: input.userId, subjective: input.subjective, assessment: input.assessment, plan: input.plan });
  return { success: true } as const;
}

export async function createPrescription(input: { patientId: number; appointmentId?: number; clinicianId?: number; notes?: string; items: { medicineName: string; dosage: string; route: string; frequency: string; durationDays?: number; instructions?: string }[]; userId: number; role: HmsRole }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const prescriber = await resolveAuthorClinician(input); const code = `RX-${String(Date.now()).slice(-7)}`;
  await db.transaction(async (tx) => {
    await tx.insert(prescriptions).values({ prescriptionCode: code, patientId: input.patientId, appointmentId: input.appointmentId, prescriberClinicianId: prescriber.id, authorUserId: input.userId, notes: input.notes });
    const rx = (await tx.select().from(prescriptions).where(eq(prescriptions.prescriptionCode, code)).limit(1))[0]!;
    await tx.insert(prescriptionItems).values(input.items.map((item) => ({ prescriptionId: rx.id, ...item, durationDays: item.durationDays ?? null, instructions: item.instructions ?? null })));
  });
  return { success: true } as const;
}

export async function createLaboratoryOrder(input: { patientId: number; appointmentId?: number; clinicianId?: number; testName: string; priority: "Routine" | "Urgent"; clinicalQuestion?: string; userId: number; role: HmsRole }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const clinician = await resolveAuthorClinician(input); const code = `LAB-${String(Date.now()).slice(-7)}`;
  await db.insert(laboratoryOrders).values({ orderCode: code, patientId: input.patientId, appointmentId: input.appointmentId, orderingClinicianId: clinician.id, authorUserId: input.userId, testName: input.testName, priority: input.priority, clinicalQuestion: input.clinicalQuestion });
  return { success: true } as const;
}

export async function recordLaboratoryResult(input: { laboratoryOrderId: number; resultSummary: string; resultValue?: string; referenceRange?: string; clinicianId?: number; userId: number; role: HmsRole }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const clinician = await resolveAuthorClinician(input);
  await db.transaction(async (tx) => {
    await tx.insert(laboratoryResults).values({ laboratoryOrderId: input.laboratoryOrderId, reportedByClinicianId: clinician.id, resultSummary: input.resultSummary, resultValue: input.resultValue, referenceRange: input.referenceRange });
    await tx.update(laboratoryOrders).set({ status: "Resulted" }).where(eq(laboratoryOrders.id, input.laboratoryOrderId));
  });
  return { success: true } as const;
}

export async function updateLaboratoryOrder(input: { orderId: number; testName: string; priority: "Routine" | "Urgent"; status?: "Ordered" | "Collected" | "Resulted" | "Cancelled"; clinicalQuestion?: string; clinicianId?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const updateData: Record<string, unknown> = { testName: input.testName.trim(), priority: input.priority, clinicalQuestion: input.clinicalQuestion?.trim() || null };
  if (input.status) updateData.status = input.status;
  if (input.clinicianId) updateData.orderingClinicianId = input.clinicianId;
  await db.update(laboratoryOrders).set(updateData).where(eq(laboratoryOrders.id, input.orderId));
  return { success: true } as const;
}

export async function deleteLaboratoryOrder(orderId: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(laboratoryOrders).where(eq(laboratoryOrders.id, orderId));
  return { success: true } as const;
}

export async function updateLaboratoryResult(input: { resultId: number; resultSummary: string; resultValue?: string; referenceRange?: string; clinicianId?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const updateData: Record<string, unknown> = { resultSummary: input.resultSummary.trim(), resultValue: input.resultValue?.trim() || null, referenceRange: input.referenceRange?.trim() || null };
  if (input.clinicianId) updateData.reportedByClinicianId = input.clinicianId;
  await db.update(laboratoryResults).set(updateData).where(eq(laboratoryResults.id, input.resultId));
  return { success: true } as const;
}

export async function deleteLaboratoryResult(resultId: number, orderId?: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.transaction(async (tx) => {
    let targetOrderId = orderId;
    if (!targetOrderId) {
      const [resRow] = await tx.select().from(laboratoryResults).where(eq(laboratoryResults.id, resultId)).limit(1);
      if (resRow) targetOrderId = resRow.laboratoryOrderId;
    }
    await tx.delete(laboratoryResults).where(eq(laboratoryResults.id, resultId));
    if (targetOrderId) {
      await tx.update(laboratoryOrders).set({ status: "Ordered" }).where(eq(laboratoryOrders.id, targetOrderId));
    }
  });
  return { success: true } as const;
}

export async function listStaff() {
  return listManagedAccounts();
}

export async function updateStaffRole(input: { userId: number; role: HmsRole; clinicianId?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
    if (input.clinicianId) await tx.update(clinicians).set({ userId: input.userId }).where(eq(clinicians.id, input.clinicianId));
  });
  return { success: true } as const;
}
