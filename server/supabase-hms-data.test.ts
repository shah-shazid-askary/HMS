import { describe, expect, it } from "vitest";
import { getHmsOverview, getUserByOpenId } from "./db";

const isSupabaseConfigured = Boolean(process.env.SUPABASE_DATABASE_URL);
const supabaseDescribe = isSupabaseConfigured ? describe : describe.skip;

supabaseDescribe("Supabase HMS data layer", () => {
  it("reads the credential administrator and active operational data through PostgreSQL", async () => {
    const administrator = await getUserByOpenId("demo_hms_admin");
    const overview = await getHmsOverview();
    expect(administrator).toMatchObject({ openId: "demo_hms_admin", role: "admin", isActive: "yes" });
    expect(overview.clinicians.length).toBeGreaterThan(0);
    expect(overview.patients.length).toBeGreaterThan(0);
    expect(overview.appointments.length).toBeGreaterThan(0);
  }, 20_000);
});
