import { supabase } from './client';
import { sanitizeUUID } from './utils';

export interface CustoAdicionalFixo {
  nome: string;
  valor: number;
}

export interface OrgCostSettings {
  custoNfKitPct: number;             // % NF sobre total do kit
  custoNfServicoPct: number;         // % NF sobre somente serviço
  custoEng1a3kwp: number;           // 1–2,99 kWp
  custoEng3a5kwp: number;           // 3–4,99 kWp
  custoEngAcima5kwp: number;        // ≥5 kWp
  custoCorrugado: number;
  custoEletroduto: number;
  custoInstalacaoPorKwp: number;    // R$/kWp — custo de instalação
  custoComissaoPct: number;          // comissão padrão %
  custoComissaoAcima5kwpPct: number; // comissão para >5 kWp %
  custosAdicionaisFixos: CustoAdicionalFixo[];
}

export interface OrgQuoteSettings {
  logoUrl: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  quoteFooter: string;
  bannerImageUrl?: string;
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
        .select('logo_url, company_phone, company_email, company_address, quote_footer, quote_banner_url')
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
          bannerImageUrl: row.quote_banner_url ?? '',
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
      if (updates.bannerImageUrl !== undefined) payload.quote_banner_url = updates.bannerImageUrl || null;

      const { error } = await supabase
        .from('organization_settings')
        .upsert({ organization_id: orgId, ...payload }, { onConflict: 'organization_id' });

      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async getCostSettings(): Promise<{ data: OrgCostSettings | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };
      const orgId = await getOrgId();
      if (!orgId) return { data: null, error: new Error('Organização não encontrada') };

      const { data, error } = await supabase
        .from('organization_settings')
        .select('custo_nf_kit_pct, custo_nf_servico_pct, custo_eng_ate5kwp, custo_eng_3a5kwp, custo_eng_acima5kwp, custo_corrugado, custo_eletroduto, custo_instalacao_por_kwp, custo_comissao_pct, custo_comissao_acima5kwp_pct, custos_adicionais_fixos')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) return { data: null, error };
      const defaults: OrgCostSettings = {
        custoNfKitPct: 4, custoNfServicoPct: 6,
        custoEng1a3kwp: 350, custoEng3a5kwp: 450, custoEngAcima5kwp: 600,
        custoCorrugado: 0, custoEletroduto: 0, custoInstalacaoPorKwp: 190,
        custoComissaoPct: 5, custoComissaoAcima5kwpPct: 7,
        custosAdicionaisFixos: [],
      };
      if (!data) return { data: defaults, error: null };

      const row = data as any;
      return {
        data: {
          custoNfKitPct: Number(row.custo_nf_kit_pct ?? 4),
          custoNfServicoPct: Number(row.custo_nf_servico_pct ?? 6),
          custoEng1a3kwp: Number(row.custo_eng_ate5kwp ?? 350),
          custoEng3a5kwp: Number(row.custo_eng_3a5kwp ?? 450),
          custoEngAcima5kwp: Number(row.custo_eng_acima5kwp ?? 600),
          custoCorrugado: Number(row.custo_corrugado ?? 0),
          custoEletroduto: Number(row.custo_eletroduto ?? 0),
          custoInstalacaoPorKwp: Number(row.custo_instalacao_por_kwp ?? 190),
          custoComissaoPct: Number(row.custo_comissao_pct ?? 5),
          custoComissaoAcima5kwpPct: Number(row.custo_comissao_acima5kwp_pct ?? 7),
          custosAdicionaisFixos: Array.isArray(row.custos_adicionais_fixos) ? row.custos_adicionais_fixos : [],
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async updateCostSettings(updates: Partial<OrgCostSettings>): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const orgId = await getOrgId();
      if (!orgId) return { error: new Error('Organização não encontrada') };

      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.custoNfKitPct !== undefined) { payload.custo_nf_kit_pct = updates.custoNfKitPct; payload.custo_nf_pct = updates.custoNfKitPct; }
      if (updates.custoNfServicoPct !== undefined) payload.custo_nf_servico_pct = updates.custoNfServicoPct;
      if (updates.custoEng1a3kwp !== undefined) payload.custo_eng_ate5kwp = updates.custoEng1a3kwp;
      if (updates.custoEng3a5kwp !== undefined) payload.custo_eng_3a5kwp = updates.custoEng3a5kwp;
      if (updates.custoEngAcima5kwp !== undefined) payload.custo_eng_acima5kwp = updates.custoEngAcima5kwp;
      if (updates.custoCorrugado !== undefined) payload.custo_corrugado = updates.custoCorrugado;
      if (updates.custoEletroduto !== undefined) payload.custo_eletroduto = updates.custoEletroduto;
      if (updates.custoInstalacaoPorKwp !== undefined) payload.custo_instalacao_por_kwp = updates.custoInstalacaoPorKwp;
      if (updates.custoComissaoPct !== undefined) payload.custo_comissao_pct = updates.custoComissaoPct;
      if (updates.custoComissaoAcima5kwpPct !== undefined) payload.custo_comissao_acima5kwp_pct = updates.custoComissaoAcima5kwpPct;
      if (updates.custosAdicionaisFixos !== undefined) payload.custos_adicionais_fixos = updates.custosAdicionaisFixos;

      const { error } = await supabase
        .from('organization_settings')
        .upsert({ organization_id: orgId, ...payload }, { onConflict: 'organization_id' });

      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },
};
