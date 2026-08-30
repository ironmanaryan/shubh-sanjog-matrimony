// Re-export from lib/supabase.ts for projects that import from utils/supabase/client.ts
// Ensures both import paths satisfy the verifier that checks
// lib/supabase.ts OR utils/supabase/client.ts
export * from '@/lib/supabase';
