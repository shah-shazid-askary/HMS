import { type FormEvent, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Plus, Power, Save, ShieldCheck, UserRoundCog, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { HmsRole } from "../../../shared/hmsAccess";

type Clinician = { id: number; fullName: string; specialty: string };
type AccountRow = { user: { id: number; name: string | null; email: string | null; role: HmsRole; isActive: "yes" | "no"; loginMethod: string | null; lastSignedIn: Date }; clinician: Clinician | null };

const roles: HmsRole[] = ["admin", "doctor", "receptionist"];
const createBlank = { name: "", email: "", password: "", role: "receptionist" as HmsRole, clinicianId: "" };

export function AccountManagement({ clinicians, currentUserId, onNotice }: { clinicians: Clinician[]; currentUserId: number; onNotice: (message: string) => void }) {
  const utils = trpc.useUtils();
  const accounts = trpc.hms.listManagedAccounts.useQuery();
  const [creating, setCreating] = useState(false);
  const [newAccount, setNewAccount] = useState(createBlank);
  const [createError, setCreateError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { name: string; email: string; role: HmsRole; clinicianId: string }>>({});
  const [passwords, setPasswords] = useState<Record<number, string>>({});

  const refresh = async () => {
    await utils.hms.listManagedAccounts.invalidate();
  };

  const create = trpc.hms.createManagedAccount.useMutation({
    onSuccess: async () => {
      setCreating(false);
      setNewAccount(createBlank);
      setCreateError(null);
      onNotice("Account created successfully with protected credentials.");
      await refresh();
    },
    onError: (error) => {
      setCreateError(error.message);
      onNotice(error.message);
    },
  });

  const update = trpc.hms.updateManagedAccount.useMutation({
    onSuccess: async () => {
      onNotice("Account details updated.");
      await refresh();
    },
    onError: (error) => onNotice(error.message),
  });

  const reset = trpc.hms.resetManagedAccountPassword.useMutation({
    onSuccess: async () => {
      onNotice("Credential password reset successfully.");
      await refresh();
    },
    onError: (error) => onNotice(error.message),
  });

  const activate = trpc.hms.setManagedAccountActive.useMutation({
    onSuccess: async () => {
      onNotice("Account activation state updated.");
      await refresh();
    },
    onError: (error) => onNotice(error.message),
  });

  const draftFor = (row: AccountRow) =>
    drafts[row.user.id] ?? {
      name: row.user.name ?? "",
      email: row.user.email ?? "",
      role: row.user.role,
      clinicianId: row.clinician?.id ? String(row.clinician.id) : "",
    };

  const updateDraft = (id: number, value: Partial<{ name: string; email: string; role: HmsRole; clinicianId: string }>, row: AccountRow) =>
    setDrafts((current) => ({ ...current, [id]: { ...draftFor(row), ...value } }));

  const submitNew = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    if (newAccount.password.length < 6) {
      setCreateError("Password must be at least 6 characters.");
      return;
    }
    create.mutate({
      name: newAccount.name,
      email: newAccount.email,
      password: newAccount.password,
      role: newAccount.role,
      clinicianId: newAccount.clinicianId ? Number(newAccount.clinicianId) : undefined,
    });
  };

  if (accounts.isLoading)
    return (
      <div className="grid min-h-64 place-items-center rounded-[18px] border border-dashed border-[#c9dfdc] bg-white text-sm font-bold text-[#637381]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-[#007c83]" />
          Loading account controls
        </div>
      </div>
    );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-[#007c83]">
            <ShieldCheck className="h-4 w-4" />
            Staff & Role Management
          </p>
          <h2 className="mt-2 font-display text-[32px] text-[#10283a]">Account & Role Control</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#637381]">
            Create staff accounts, assign roles (Admin, Doctor, Receptionist), link doctors with clinical profiles, and manage active access.
          </p>
        </div>
        <button
          onClick={() => {
            setCreateError(null);
            setNewAccount(createBlank);
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#007c83] px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[#006f75] transition"
        >
          <Plus className="h-4 w-4" />
          Add staff account
        </button>
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[#e2e8e2] bg-white">
        <table className="w-full min-w-[1050px] text-left">
          <thead>
            <tr className="border-b border-[#e8ece8] bg-[#fbfcfa] text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7a8993]">
              <th className="px-4 py-4">Account details</th>
              <th className="px-4 py-4">Role</th>
              <th className="px-4 py-4">Clinical profile</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Password reset</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.data?.map((row) => {
              const draft = draftFor(row as AccountRow);
              const isSelf = row.user.id === currentUserId;
              const active = row.user.isActive === "yes";
              return (
                <tr key={row.user.id} className="border-b border-[#edf0ed] align-top text-sm last:border-0 hover:bg-[#fafbfa]">
                  <td className="px-4 py-4">
                    <input
                      value={draft.name}
                      onChange={(event) => updateDraft(row.user.id, { name: event.target.value }, row as AccountRow)}
                      placeholder="Full name"
                      className="h-9 w-44 rounded-lg border border-[#dfe7e1] px-2 text-sm font-bold text-[#193448] outline-none focus:border-[#007c83]"
                    />
                    <input
                      value={draft.email}
                      onChange={(event) => updateDraft(row.user.id, { email: event.target.value }, row as AccountRow)}
                      placeholder="Email address"
                      className="mt-2 h-9 w-56 rounded-lg border border-[#dfe7e1] px-2 font-mono-ui text-[11px] text-[#526576] outline-none focus:border-[#007c83]"
                    />
                    <p className="mt-2 text-[10px] text-[#82909a]">
                      {row.user.loginMethod || "supabase"} · last sign-in{" "}
                      {new Date(row.user.lastSignedIn).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={draft.role}
                      disabled={isSelf}
                      onChange={(event) => updateDraft(row.user.id, { role: event.target.value as HmsRole }, row as AccountRow)}
                      className="h-9 rounded-lg border border-[#dfe7e1] bg-white px-2 text-sm font-semibold capitalize text-[#193448] disabled:opacity-60"
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={draft.clinicianId}
                      onChange={(event) => updateDraft(row.user.id, { clinicianId: event.target.value }, row as AccountRow)}
                      className="h-9 max-w-48 rounded-lg border border-[#dfe7e1] bg-white px-2 text-sm font-semibold text-[#193448]"
                    >
                      <option value="">No clinical profile</option>
                      {clinicians.map((clinician) => (
                        <option key={clinician.id} value={clinician.id}>
                          {clinician.fullName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] ${
                          active ? "bg-[#eaf5ef] text-[#297353]" : "bg-[#fff0ee] text-[#ae493d]"
                        }`}
                      >
                        {active ? "Active" : "Inactive"}
                      </span>
                      <button
                        disabled={isSelf || activate.isPending}
                        onClick={() => activate.mutate({ userId: row.user.id, isActive: active ? "no" : "yes" })}
                        className="rounded-lg border border-[#dfe7e1] p-2 text-[#526576] hover:bg-[#f4f6f3] disabled:cursor-not-allowed disabled:opacity-40"
                        title={isSelf ? "You cannot deactivate your own account" : active ? "Deactivate account" : "Reactivate account"}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={passwords[row.user.id] ?? ""}
                        onChange={(event) => setPasswords((current) => ({ ...current, [row.user.id]: event.target.value }))}
                        placeholder="New password (min 6)"
                        className="h-9 w-36 rounded-lg border border-[#dfe7e1] px-2 text-xs outline-none focus:border-[#007c83]"
                      />
                      <button
                        disabled={(passwords[row.user.id] ?? "").length < 6 || reset.isPending}
                        onClick={() => reset.mutate({ userId: row.user.id, password: passwords[row.user.id]! })}
                        className="rounded-lg border border-[#cde4e2] bg-[#f7fbfb] p-2 text-[#007c83] hover:bg-[#eaf4f4] disabled:opacity-40"
                        title="Set credential password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          userId: row.user.id,
                          name: draft.name,
                          email: draft.email,
                          role: draft.role,
                          clinicianId: draft.clinicianId ? Number(draft.clinicianId) : null,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-[#007c83] px-3 py-2 text-xs font-extrabold text-white hover:bg-[#006f75] disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#10283a]/45 p-4 backdrop-blur-sm">
          <form onSubmit={submitNew} className="w-full max-w-lg rounded-[18px] border-t-4 border-t-[#29d0d7] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#007c83]">New Staff Account</p>
                <h3 className="mt-2 font-display text-[30px] text-[#10283a]">Create staff access</h3>
              </div>
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg p-2 text-[#637381] hover:bg-[#f2f4f2]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#fff0ee] p-3 text-xs font-bold text-[#ae493d]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field
                label="Full name"
                placeholder="e.g. Dr. Farhan Ahmed"
                value={newAccount.name}
                onChange={(value) => setNewAccount({ ...newAccount, name: value })}
              />
              <Field
                label="Work Email"
                type="email"
                placeholder="staff@hospital.demo"
                value={newAccount.email}
                onChange={(value) => setNewAccount({ ...newAccount, email: value })}
              />
              <Field
                label="Password (min 6 characters)"
                type="password"
                placeholder="Enter password"
                value={newAccount.password}
                onChange={(value) => setNewAccount({ ...newAccount, password: value })}
              />
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">Role</span>
                <select
                  value={newAccount.role}
                  onChange={(event) => {
                    const role = event.target.value as HmsRole;
                    setNewAccount({
                      ...newAccount,
                      role,
                      clinicianId: role === "doctor" ? newAccount.clinicianId : "",
                    });
                  }}
                  className="mt-2 h-10 w-full rounded-lg border border-[#dfe7e1] px-2 text-sm font-semibold capitalize text-[#193448]"
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">
                  Clinician profile (optional)
                </span>
                <select
                  disabled={newAccount.role !== "doctor"}
                  value={newAccount.clinicianId}
                  onChange={(event) => setNewAccount({ ...newAccount, clinicianId: event.target.value })}
                  className="mt-2 h-10 w-full rounded-lg border border-[#dfe7e1] px-2 text-sm font-semibold text-[#193448] disabled:cursor-not-allowed disabled:bg-[#f4f6f3] disabled:text-[#93a09a]"
                >
                  <option value="">
                    {newAccount.role === "doctor" ? "No profile (or select below)" : "Only available for Doctor accounts"}
                  </option>
                  {newAccount.role === "doctor" &&
                    clinicians.map((clinician) => (
                      <option key={clinician.id} value={clinician.id}>
                        {clinician.fullName} · {clinician.specialty}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <button
              disabled={create.isPending || newAccount.password.length < 6 || !newAccount.name || !newAccount.email}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#007c83] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#006f75] disabled:opacity-50"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCog className="h-4 w-4" />}
              {create.isPending ? "Creating staff account..." : "Create staff account"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#637381]">{label}</span>
      <input
        required
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-[#dfe7e1] px-2 text-sm font-semibold text-[#193448] outline-none focus:border-[#007c83]"
      />
    </label>
  );
}
