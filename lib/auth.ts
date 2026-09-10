import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Subscription } from "@/lib/types";

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile | null) ?? null;
}

export async function requireProfile(): Promise<Profile> {
  const p = await getProfile();
  if (!p) redirect("/login");
  return p;
}

export async function requireAdmin(): Promise<Profile> {
  const p = await requireProfile();
  if (p.role !== "admin") redirect("/studio");
  return p;
}

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  return (data as Subscription | null) ?? null;
}

export const isSubscribed = (s: Subscription | null) => s?.status === "active";
