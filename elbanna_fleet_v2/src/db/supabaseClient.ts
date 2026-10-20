import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const getSupabaseConfig = () => {
  const meta: any = import.meta;
  const dbUrlFallback = 'https://jqnircagivrnvsljvxau.supabase.co';
  const dbKeyFallback = 'sb_publishable_0LUMSN7RBGE1bIbWjXYI-Q_mpenQd59';

  // Auto-upgrade: clear the OLD wrong project URL if still stored
  const storedUrl = localStorage.getItem('elbanna_supabase_url');
  if (storedUrl && storedUrl.includes('zudptuecpxjcwrepynss')) {
    localStorage.removeItem('elbanna_supabase_url');
    localStorage.removeItem('elbanna_supabase_key');
  }

  const url = localStorage.getItem('elbanna_supabase_url') || (meta.env ? meta.env.VITE_SUPABASE_URL : '') || dbUrlFallback;
  const key = localStorage.getItem('elbanna_supabase_key') || (meta.env ? meta.env.VITE_SUPABASE_ANON_KEY : '') || dbKeyFallback;
  return { url: url.trim(), key: key.trim() };
};

// المفتاح السري للتطبيق (لو سياسات RLS في Supabase مضبوطة على هيدر x-app-secret):
// localStorage (elbanna_app_secret) ← VITE_APP_SECRET. لو مش مضبوط مفيش هيدر بيتبعت.
export const getAppSecret = (): string => {
  const meta: any = import.meta;
  let stored = '';
  try { stored = localStorage.getItem('elbanna_app_secret') || ''; } catch {}
  return (stored || (meta.env ? meta.env.VITE_APP_SECRET : '') || '').trim();
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
let lastUsedSecret = '';

export const getSupabaseClient = (): SupabaseClient | null => {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    clientInstance = null;
    return null;
  }
  
  const secret = getAppSecret();
  if (clientInstance && url === lastUsedUrl && key === lastUsedKey && secret === lastUsedSecret) {
    return clientInstance;
  }
  
  try {
    clientInstance = createClient(url, key, {
      auth: {
        persistSession: false
      },
      ...(secret ? { global: { headers: { 'x-app-secret': secret } } } : {})
    });
    lastUsedUrl = url;
    lastUsedKey = key;
    lastUsedSecret = secret;
    return clientInstance;
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
    return null;
  }
};
