import React, { type FormEvent, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { clearHmsSessionCache } from "@/lib/sessionCache";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, KeyRound, Loader2, ShieldCheck } from "lucide-react";

function CredentialSignIn() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.demoLogin.useMutation({
    onSuccess: async () => {
      await clearHmsSessionCache(queryClient);
      await utils.auth.me.invalidate();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return <form onSubmit={submit} className="mt-7 space-y-4"><label className="block"><span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#637381]">Work email</span><input required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@hospital.example" className="mt-2 h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm font-semibold text-[#193448] outline-none transition focus:border-[#007c83] focus:ring-2 focus:ring-[#b9e3e4]" /></label><label className="block"><span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#637381]">Password</span><input required autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="mt-2 h-11 w-full rounded-xl border border-[#dfe7e1] bg-white px-3 text-sm font-semibold text-[#193448] outline-none transition focus:border-[#007c83] focus:ring-2 focus:ring-[#b9e3e4]" /></label>{login.error && <p role="alert" className="rounded-xl bg-[#fff0ee] px-3 py-2 text-xs font-bold text-[#ae493d]">{login.error.message}</p>}<button disabled={login.isPending} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#007c83] px-5 py-3.5 text-sm font-extrabold text-white transition-transform duration-150 active:scale-[.97] disabled:opacity-60">{login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{login.isPending ? "Signing in..." : "Sign in securely"}</button></form>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f7f7f3]"><div className="flex items-center gap-3 rounded-2xl border border-[#e2e8e2] bg-white px-5 py-4 text-sm font-bold text-[#526576]"><Loader2 className="h-5 w-5 animate-spin text-[#007c83]" />Checking your secure session</div></div>;

  if (!user) return <main className="paper-noise grid min-h-screen place-items-center bg-[#f7f7f3] px-5 py-10"><section className="relative w-full max-w-xl overflow-hidden rounded-[22px] border border-[#d7e8e5] border-t-4 border-t-[#29d0d7] bg-white p-8 shadow-[0_24px_70px_rgba(16,40,58,.12)] md:p-11"><div className="file-tab absolute right-8 top-0 h-12 w-28 border-r border-b border-[#c8e4e1]" /><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f4f4] text-[#007c83]"><ShieldCheck className="h-6 w-6" /></div><p className="mt-7 text-[10px] font-extrabold uppercase tracking-[.17em] text-[#007c83]">Protected clinical workspace</p><h1 className="mt-3 font-display text-[42px] leading-[.98] text-[#10283a]">Sign in to manage care, without losing the record.</h1><p className="mt-5 max-w-md text-[15px] leading-7 text-[#526576]">Use the secure credentials issued for your Clinical Ledger account. Access is limited to the permissions assigned to your role.</p><CredentialSignIn /><div className="mt-7 flex items-center gap-3 border-t border-[#e9efea] pt-5 text-xs text-[#82909a]"><CalendarDays className="h-4 w-4 text-[#007c83]" />Availability and bookings remain protected by the active session.</div></section></main>;

  return <>{children}</>;
}
