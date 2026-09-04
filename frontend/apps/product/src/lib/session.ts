"use client";

const KEY = "medseg_session";

export function getSessionKey(): string {
  if (typeof window === "undefined") return "";
  let key = localStorage.getItem(KEY);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(KEY, key);
  }
  return key;
}
