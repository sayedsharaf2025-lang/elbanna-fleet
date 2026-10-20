import { createClient, SupabaseClient } from '@supabase/supabase-js';

// المفتاح السري اللي ضفناه في Supabase للحماية (RLS)
const appSecretFallback = 'elbanna_secure_2026_x8kP2mN9vQ4rT7wZ1yB5cF3hJ6lD0sA';
const appSecret = (import.meta as any).env?.VITE_APP_SECRET || appSecretFallback;

// قيم افتراضية في حال عدم وجود إعدادات محفوظة
const dbUrlFallback = 'https://gjmicraivrnvslivxau.supabase.co';
const dbKeyFallback = 'sb_publishable_DLMSN7R8GEibWbJXVTi_Q.mqemQ59';

// Auto-upgrade: clear the OLD wrong project URL if still stored
const storedUrl = localStorage.getItem('elbanna_supabase_url');
if (storedUrl && storedUrl.includes('zudptuecpxjwrepynss')) {
  localStorage.removeItem('elbanna_supabase_url');
  localStorage.removeItem('elbanna_supabase_key');
}

export const getSupabaseConfig = () => {
  const url = localStorage.getItem('elbanna_supabase_url') || (import.meta as any).env?.VITE_SUPABASE_URL || dbUrlFallback;
  const key = localStorage.getItem('elbanna_supabase_key') || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || dbKeyFallback;
  return { url: url.trim(), key: key.trim() };
};

export const saveSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem('elbanna_supabase_url', url.trim());
  localStorage.setItem('elbanna_supabase_key', key.trim());
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('elbanna_supabase_url');
  localStorage.removeItem('elbanna_supabase_key');
};

let clientInstance: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

export const getSupabaseClient = (): SupabaseClient | null => {
  const { url, key } = getSupabaseConfig();

  if (!url || !key) {
    clientInstance = null;
    return null;
  }

  if (clientInstance && url === lastUsedUrl && key === lastUsedKey) {
    return clientInstance;
  }

  try {
    clientInstance = createClient(url, key, {
      auth: {
        persistSession: false
      },
      global: {
        // إرسال المفتاح السري مع كل طلب لتفعيل الحماية (RLS)
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers || {});
          headers.set('x-app-secret', appSecret);
          return fetch(input, { ...init, headers });
        }
      }
    });
    lastUsedUrl = url;
    lastUsedKey = key;
    return clientInstance;
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
    return null;
  }
};
