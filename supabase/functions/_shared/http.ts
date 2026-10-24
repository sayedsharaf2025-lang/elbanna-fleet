// أدوات HTTP مشتركة بين الـ Edge Functions (مافيهاش أي اعتماد على Deno عشان تتختبر بـ bun/node)

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// الأخطاء المنطقية بترجع 200 + { ok:false, error } عشان التطبيق يقراها بسهولة من supabase.functions.invoke
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export const fail = (error: string, extra: Record<string, unknown> = {}): Response => json({ ok: false, error, ...extra });

export const preflight = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

const MAX_BODY_BYTES = 64 * 1024;

// بيقرا الـ JSON من الطلب بحد أقصى للحجم؛ بيرجّع null لو مش صالح
export async function readJson(req: Request): Promise<Record<string, any> | null> {
  const len = Number(req.headers.get('content-length') || '0');
  if (len > MAX_BODY_BYTES) return null;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// مقارنة نصوص بزمن ثابت (للأسرار)
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
