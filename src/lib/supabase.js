import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const hasValidSupabase = 
  process.env.SUPABASE_URL && 
  process.env.SUPABASE_URL.startsWith('http') && 
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_URL.includes('your-project');

export const isSupabaseConfigured = Boolean(hasValidSupabase);

export const supabase = isSupabaseConfigured
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;
