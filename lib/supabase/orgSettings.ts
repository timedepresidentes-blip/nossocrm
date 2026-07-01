import { supabase } from './client';
import { sanitizeUUID } from './utils';

export interface OrgQuoteSettings {
  logoUrl: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  quoteFooter: string;
}

let cachedOrgId: string | null = null;
let cachedUserId: string | null = null;

async function getOrgId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (cachedUserId === user.id && cachedOrgId) return cachedOrgId;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  const orgId = sanitizeUUID((profile as any)?.organization_id);
  cachedUserId = user.id;
  cachedOrgId = orgId;
  return orgId;
}

export const orgSettingsService = {
  async getQuoteSettings(): Promise<{ data: OrgQuoteSettings | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };
      const orgId = await getOrgId();
      if (!orgId) return { data: null, error: new Error('Organização não encontrada') };

      const { data, error } = await supabase
        .from('organization_settings')
        .select('logo_url, company_phone, company_email, company_address, quote_footer')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) return { data: null, error };
      if (!data) return { data: { logoUrl: '', companyPhone: '', companyEmail: '', companyAddress: '', quoteFooter: '' }, error: null };

      const row = data as any;
      return {
        data: {
          logoUrl: row.logo_url ?? '',
          companyPhone: row.company_phone ?? '',
          companyEmail: row.company_email ?? '',
          companyAddress: row.company_address ?? '',
          quoteFooter: row.quote_footer ?? '',
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async updateQuoteSettings(updates: Partial<OrgQuoteSettings>): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const orgId = await getOrgId();
      if (!orgId) return { error: new Error('Organização não encontrada') };

      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl || null;
      if (updates.companyPhone !== undefined) payload.company_phone = updates.companyPhone || null;
      if (updates.companyEmail !== undefined) payload.company_email = updates.companyEmail || null;
      if (updates.companyAddress !== undefined) payload.company_address = updates.companyAddress || null;
      if (updates.quoteFooter !== undefined) payload.quote_footer = updates.quoteFooter || null;

      const { error } = await supabase
        .from('organization_settings')
        .upsert({ organization_id: orgId, ...payload }, { onConflict: 'organization_id' });

      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },
};
