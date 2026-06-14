import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const getSupabaseConfig = () => {
  const meta: any = import.meta;
  const dbUrlFallback = 'https://jqnircagivrnvsljvxau.supabase.co';
  const dbKeyFallback = 'sb_publishable_0LUMSN7RBGE1bIbWjXYI-Q_mpenQd59';

  // تنظيف أي config قديم
  const storedUrl = localStorage.getItem('elbanna_supabase_url');
  if (storedUrl && storedUrl.includes('zudptuecpxjcwrepynss')) {
    localStorage.removeItem('elbanna_supabase_url');
    localStorage.removeItem('elbanna_supabase_key');
  }

  const url = localStorage.getItem('elbanna_supabase_url') || (meta.env ? meta.env.VITE_SUPABASE_URL : '') || dbUrlFallback;
  const key = localStorage.getItem('elbanna_supabase_key') || (meta.env ? meta.env.VITE_SUPABASE_ANON_KEY : '') || dbKeyFallback;
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
      auth: { persistSession: false }
    });
    lastUsedUrl = url;
    lastUsedKey = key;
    return clientInstance;
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
    return null;
  }
};
