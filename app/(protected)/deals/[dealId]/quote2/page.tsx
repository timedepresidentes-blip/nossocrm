'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { orgSettingsService, OrgQuoteSettings } from '@/lib/supabase/orgSettings';
import { Loader2 } from 'lucide-react';

interface FichaCliente {
  nomeCompleto?: string;
  potenciaKwp?: number;
  numPaineis?: number;
  modeloPainel?: string;
  potenciaPainelW?: number;
  modeloInversor?: string;
  qtdInversores?: number;
  tipoEstrutura?: string;
  instalacaoCidade?: string;
  formaPagamento?: string;
  condicoesPagamento?: string;
  prazoEntrega?: string;
  observacoes?: string;
  valorTotal?: number;
  garantiaPainel?: string | null;
  garantiaInversor?: string | null;
  economiaMensal?: number;
  economiaAnual?: number;
  contaAtualMensal?: number;
  paybackAnos?: number;
  geracaoMensalKwh?: number[];
  [key: string]: unknown;
}

interface QuoteItem { id: string; name: string; quantity: number; price: number; }

interface QuoteData {
  dealTitle: string;
  dealValue: number;
  contactName: string;
  contactPhone: string;
  createdAt: string;
  items: QuoteItem[];
  fichaCliente?: FichaCliente;
  companyName: string;
  quoteOverrides: Partial<OrgQuoteSettings>;
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDateShort = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const fmtDateLong  = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

const DIST_SAZONAL = [0.85, 0.88, 1.02, 1.08, 1.0, 0.92, 0.97, 1.07, 1.06, 1.0, 0.90, 0.85];
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function calcParcelamento(valor: number, taxaMensal = 0.013) {
  return [12, 18, 24, 36, 48, 60, 72].map(n => {
    const parcela = valor * (taxaMensal * Math.pow(1 + taxaMensal, n)) / (Math.pow(1 + taxaMensal, n) - 1);
    return { n, parcela };
  });
}

// ── Ícones SVG ────────────────────────────────────────────────────
const IcoSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IcoWA = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 2.017C6.477 2.017 2 6.494 2 12.017c0 1.762.465 3.41 1.27 4.835l-1.27 4.64 4.755-1.248A9.94 9.94 0 0 0 12 21.999c5.523 0 10-4.477 10-10s-4.477-9.983-10-9.983z"/>
  </svg>
);

// ── Cores ─────────────────────────────────────────────────────────
const C = {
  ink:       '#0F1623',
  ink2:      '#2D3A4A',
  ink3:      '#6B7A8D',
  paper:     '#F7F6F2',
  surface:   '#FFFFFF',
  border:    '#E4E1D9',
  gold:      '#B87A0A',
  goldBr:    '#E8960E',
  goldBg:    '#FEF9ED',
  goldLine:  '#EDD87A',
  green:     '#1A6B47',
  greenBg:   '#EDFBF4',
  greenLine: '#A7E8CC',
  navy:      '#0C1628',
  navy2:     '#162038',
  orange:    '#C85E0A',
  orangeBg:  '#FDF1E8',
};

const HERO_IMG = 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?fm=jpg&q=80&w=1400&auto=format&fit=crop';

export default function Quote2Page() {
  const { dealId } = useParams<{ dealId: string }>();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [orgSettings, setOrgSettings] = useState<OrgQuoteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!supabase || !dealId) return;
      try {
        const [dealRes, settingsRes] = await Promise.all([
          supabase
            .from('deals')
            .select(`id, title, value, created_at, quote_overrides, ficha_cliente,
              deal_items(id, name, quantity, price),
              contacts(name, phone),
              crm_companies(name)`)
            .eq('id', dealId)
            .maybeSingle(),
          orgSettingsService.getQuoteSettings(),
        ]);
        if (dealRes.error) throw dealRes.error;
        if (!dealRes.data) throw new Error('Deal não encontrado');
        const d = dealRes.data as any;
        const contact = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts;
        const crmCompany = Array.isArray(d.crm_companies) ? d.crm_companies[0] : d.crm_companies;
        const items: QuoteItem[] = (d.deal_items || []).map((i: any) => ({
          id: i.id, name: i.name, quantity: Number(i.quantity ?? 1), price: Number(i.price ?? 0),
        }));
        const effectiveItems = items.length > 0 ? items : [{ id: 'total', name: d.title, quantity: 1, price: Number(d.value ?? 0) }];
        setQuote({
          dealTitle: d.title,
          dealValue: Number(d.value ?? 0),
          contactName: contact?.name ?? d.ficha_cliente?.nomeCompleto ?? '—',
          contactPhone: contact?.phone ?? '',
          createdAt: d.created_at,
          items: effectiveItems,
          fichaCliente: d.ficha_cliente ?? undefined,
          companyName: crmCompany?.name ?? '',
          quoteOverrides: d.quote_overrides ?? {},
        });
        if (settingsRes.data) setOrgSettings(settingsRes.data);
      } catch (e: any) {
        setError(e.message || 'Erro');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dealId]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.paper }}>
      <Loader2 style={{ width: 32, height: 32, color: C.goldBr }} className="animate-spin" />
    </div>
  );
  if (error || !quote) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#dc2626' }}>{error || 'Erro ao carregar'}</span>
    </div>
  );

  const eff: OrgQuoteSettings = {
    logoUrl:        quote.quoteOverrides.logoUrl        ?? orgSettings?.logoUrl        ?? '',
    companyPhone:   quote.quoteOverrides.companyPhone   ?? orgSettings?.companyPhone   ?? '',
    companyEmail:   quote.quoteOverrides.companyEmail   ?? orgSettings?.companyEmail   ?? '',
    companyAddress: quote.quoteOverrides.companyAddress ?? orgSettings?.companyAddress ?? '',
    quoteFooter:    quote.quoteOverrides.quoteFooter    ?? orgSettings?.quoteFooter    ?? '',
    bannerImageUrl: quote.quoteOverrides.bannerImageUrl ?? orgSettings?.bannerImageUrl ?? '',
  };

  const f = quote.fichaCliente ?? {};
  const subtotal = quote.items.reduce((s, i) => s + i.quantity * i.price, 0);
  const kwp = f.potenciaKwp ? Number(f.potenciaKwp) : null;

  const TARIFA = 0.85;
  const geracaoMediaMes = kwp ? kwp * 120 : 0;
  const economiaMensalCalc = f.economiaMensal ?? (geracaoMediaMes * TARIFA);
  const economiaAnualCalc  = f.economiaAnual  ?? (economiaMensalCalc * 12);
  const contaAtualCalc     = f.contaAtualMensal ?? (economiaMensalCalc > 0 ? Math.round(economiaMensalCalc / 0.83) : 0);
  const contaComSolarCalc  = Math.max(50, contaAtualCalc - economiaMensalCalc);
  const paybackCalc        = f.paybackAnos ?? (economiaMensalCalc > 0 ? Math.ceil(subtotal / economiaAnualCalc * 10) / 10 : 0);
  const reducaoPct         = contaAtualCalc > 0 ? Math.round((economiaMensalCalc / contaAtualCalc) * 100) : 83;
  const perdaSemSolar3anos = contaAtualCalc * 36 - contaComSolarCalc * 36;
  const economia25anos     = economiaAnualCalc * 25;

  const geracaoMensal: number[] = f.geracaoMensalKwh && Array.isArray(f.geracaoMensalKwh) && f.geracaoMensalKwh.length === 12
    ? f.geracaoMensalKwh
    : DIST_SAZONAL.map(fator => Math.round(geracaoMediaMes * fator));
  const maxGeracao = Math.max(...geracaoMensal);
  const minGeracao = Math.min(...geracaoMensal);

  const parcelas = calcParcelamento(subtotal);
  const garantiaPainelDisplay = f.garantiaPainel || '12 anos';

  const validadeDate = new Date(quote.createdAt);
  validadeDate.setDate(validadeDate.getDate() + 3);
  const validadeStr = fmtDateShort(validadeDate.toISOString());

  const whatsappNum  = (eff.companyPhone || '').replace(/\D/g, '');
  const whatsappLink = whatsappNum ? `https://wa.me/55${whatsappNum}?text=Olá, quero confirmar minha proposta solar!` : '#';
  const docNum = `OR-${dealId.slice(0, 6).toUpperCase()}`;
  const heroImg = eff.bannerImageUrl || HERO_IMG;
  const clientName = f.nomeCompleto || quote.contactName;

  // Largura da barra de redução (%)
  const barraReducao = Math.min(reducaoPct, 95);

  const SS = `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,900;1,9..144,700;1,9..144,900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .q2 { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: ${C.navy}; padding: 28px 14px 56px; min-height: 100vh; }

    /* Toolbar */
    .q2-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 999; display: flex; align-items: center; justify-content: space-between; padding: 10px 24px; background: rgba(10,15,28,0.97); backdrop-filter: blur(14px); border-bottom: 1px solid rgba(255,255,255,0.07); }
    .q2-bar-doc { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.2px; color: rgba(255,255,255,0.3); }
    .q2-btn { display: flex; align-items: center; gap: 7px; border: none; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 600; padding: 9px 20px; border-radius: 7px; transition: opacity .15s; }
    .q2-btn:hover { opacity: .85; }
    .q2-btn-close { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
    .q2-btn-pdf   { background: ${C.goldBr}; color: ${C.ink}; }

    /* Doc */
    .q2-doc { max-width: 840px; margin: 52px auto 0; background: ${C.surface}; box-shadow: 0 60px 140px rgba(0,0,0,0.55), 0 8px 28px rgba(0,0,0,0.2); overflow: hidden; }

    /* Tipo */
    .f-display { font-family: 'Fraunces', Georgia, serif; }
    .f-mono    { font-family: 'DM Mono', monospace; }

    /* ── COVER ── */
    .cover { display: grid; grid-template-columns: 56% 44%; min-height: 480px; background: ${C.navy}; overflow: hidden; position: relative; }
    .cover-gold-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: linear-gradient(to bottom, ${C.goldBr}, ${C.gold}); z-index: 10; }
    .cover-left { position: relative; z-index: 2; display: flex; flex-direction: column; padding: 38px 44px 40px 44px; }
    .cover-right { position: relative; overflow: hidden; }
    .cover-right::before { content: ''; position: absolute; inset: 0; background: linear-gradient(to right, ${C.navy} 0%, transparent 40%); z-index: 1; }
    .cover-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; }

    /* Cover – brand row */
    .cover-brand { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 52px; }
    .cover-logo { height: 50px; max-width: 210px; object-fit: contain; filter: brightness(0) invert(1); }
    .cover-logo-text { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.8); font-weight: 500; }
    .cover-docnum { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 1.5px; color: rgba(255,255,255,0.28); border: 1px solid rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 4px; white-space: nowrap; }

    /* Cover – headline */
    .cover-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .cover-eyebrow { font-family: 'DM Mono', monospace; font-size: 8.5px; letter-spacing: 3px; text-transform: uppercase; color: ${C.goldBr}; margin-bottom: 16px; }
    .cover-h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(36px, 5vw, 52px); font-weight: 900; font-style: italic; line-height: 1.04; color: #fff; letter-spacing: -1.5px; text-wrap: balance; margin-bottom: 22px; }
    .cover-kwp-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(232,150,14,0.14); border: 1px solid rgba(232,150,14,0.3); border-radius: 5px; padding: 7px 16px; font-family: 'DM Mono', monospace; font-size: 13px; color: ${C.goldBr}; width: fit-content; }

    /* Cover – client row */
    .cover-client { border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 8px; }
    .cover-client-tag { font-family: 'DM Mono', monospace; font-size: 7.5px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 5px; }
    .cover-client-nome { font-family: 'Fraunces', Georgia, serif; font-size: 20px; font-weight: 600; color: #fff; line-height: 1.2; }
    .cover-meta { text-align: right; }
    .cover-meta-row { display: flex; gap: 8px; justify-content: flex-end; align-items: baseline; margin-bottom: 3px; }
    .cover-meta-lbl { font-family: 'DM Mono', monospace; font-size: 7.5px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.28); }
    .cover-meta-val { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); }

    /* ── Sections ── */
    .sec { padding: 40px 52px; border-top: 1px solid ${C.border}; }
    .sec-eyebrow { font-family: 'DM Mono', monospace; font-size: 8px; font-weight: 500; letter-spacing: 2.8px; text-transform: uppercase; color: ${C.gold}; margin-bottom: 26px; display: flex; align-items: center; gap: 10px; }
    .sec-eyebrow::after { content: ''; flex: 1; height: 1px; background: ${C.border}; }

    /* ── GANCHO: economia ── */
    .s-eco { background: ${C.greenBg}; padding: 48px 52px; border-top: none; }
    .s-eco .sec-eyebrow { color: ${C.green}; }
    .s-eco .sec-eyebrow::after { background: ${C.greenLine}; }
    .eco-num { font-family: 'Fraunces', Georgia, serif; font-size: clamp(64px, 10vw, 88px); font-weight: 900; color: ${C.green}; line-height: 1; letter-spacing: -3px; font-feature-settings: "tnum"; }
    .eco-por-mes { font-size: 18px; font-weight: 600; color: ${C.green}; opacity: .7; margin-top: 6px; }
    .eco-sub { font-size: 14px; color: ${C.ink2}; margin-top: 4px; }
    .eco-reducao-bar-wrap { margin-top: 24px; }
    .eco-reducao-label { font-size: 12px; font-weight: 600; color: ${C.ink3}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .eco-bar-track { height: 8px; background: ${C.border}; border-radius: 4px; overflow: hidden; }
    .eco-bar-fill { height: 100%; background: ${C.green}; border-radius: 4px; transition: width 1s ease; }
    .eco-loss-callout { margin-top: 20px; background: ${C.orangeBg}; border: 1.5px solid #F6C9A4; border-radius: 10px; padding: 14px 20px; }
    .eco-loss-text { font-size: 13px; color: ${C.orange}; font-weight: 600; line-height: 1.5; }

    /* ── MÉTRICAS CHAVE ── */
    .s-metrics { background: ${C.navy}; border-top: none; padding: 0; }
    .metrics-row { display: grid; grid-template-columns: repeat(4,1fr); }
    .metric-cell { padding: 24px 20px; border-right: 1px solid rgba(255,255,255,0.06); }
    .metric-cell:last-child { border-right: none; }
    .metric-lbl { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 1.8px; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 10px; }
    .metric-val { font-family: 'Fraunces', Georgia, serif; font-size: 26px; font-weight: 700; line-height: 1; color: #fff; font-feature-settings: "tnum"; }
    .metric-val.gold { color: ${C.goldBr}; }
    .metric-val.green { color: #4AE8A0; }

    /* ── CONTA ANTES/DEPOIS ── */
    .conta-split { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .conta-card { border-radius: 2px; padding: 22px 20px; }
    .conta-antes { background: ${C.paper}; border: 1px solid ${C.border}; }
    .conta-depois { background: ${C.greenBg}; border: 2px solid ${C.greenLine}; }
    .conta-card-lbl { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: ${C.ink3}; margin-bottom: 10px; }
    .conta-card-val { font-family: 'Fraunces', Georgia, serif; font-size: 38px; font-weight: 900; color: ${C.ink}; font-feature-settings: "tnum"; line-height: 1; }
    .conta-card-val.green { color: ${C.green}; }
    .conta-card-sub { font-size: 12px; color: ${C.ink3}; margin-top: 6px; }

    /* ── GRÁFICO ── */
    .bar-chart { display: flex; gap: 5px; align-items: flex-end; height: 110px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .bar-val { font-family: 'DM Mono', monospace; font-size: 8px; color: ${C.ink3}; }
    .bar-fill { width: 100%; border-radius: 3px 3px 0 0; min-height: 8px; }
    .bar-mes { font-family: 'DM Mono', monospace; font-size: 8px; color: ${C.ink3}; }
    .bar-legend { display: flex; gap: 18px; margin-top: 12px; }
    .bar-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: ${C.ink3}; }
    .bar-legend-dot { width: 10px; height: 10px; border-radius: 2px; }

    /* ── PARCELAMENTO ── */
    .parc-grid-main { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 10px; }
    .parc-grid-sec  { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
    .parc-card { border-radius: 4px; padding: 16px 12px; text-align: center; }
    .parc-main { background: ${C.goldBg}; border: 1.5px solid ${C.goldLine}; }
    .parc-sec  { background: ${C.paper}; border: 1px solid ${C.border}; }
    .parc-n { font-family: 'Fraunces', Georgia, serif; font-size: 28px; font-weight: 700; color: ${C.gold}; line-height: 1; }
    .parc-n-sec { color: ${C.ink2}; font-size: 22px; }
    .parc-val { font-size: 13px; font-weight: 700; color: ${C.ink}; margin-top: 5px; }
    .parc-mes { font-size: 9px; color: ${C.ink3}; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .parc-obs { font-size: 10px; color: ${C.ink3}; margin-top: 10px; }

    /* ── EQUIPAMENTOS ── */
    .equip-table { width: 100%; border-collapse: collapse; }
    .equip-table th { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 1.5px; text-transform: uppercase; color: ${C.ink3}; padding-bottom: 12px; border-bottom: 2px solid ${C.ink}; text-align: left; font-weight: 500; }
    .equip-table td { padding: 14px 0; border-bottom: 1px solid ${C.border}; font-size: 14px; }
    .equip-table tr:last-child td { border-bottom: none; }
    .equip-table tr:nth-child(even) td { background: ${C.paper}; padding-left: 4px; }
    .equip-nome { font-weight: 600; color: ${C.ink}; width: 220px; padding-right: 16px; }
    .equip-spec { color: ${C.ink2}; font-size: 13px; }

    /* ── CTA INVESTIMENTO ── */
    .s-invest { background: ${C.navy}; padding: 52px; border-top: none; text-align: center; }
    .invest-eyebrow { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 14px; }
    .invest-val { font-family: 'Fraunces', Georgia, serif; font-size: clamp(52px, 9vw, 80px); font-weight: 900; color: #fff; line-height: 1; letter-spacing: -2.5px; font-feature-settings: "tnum"; margin-bottom: 12px; }
    .invest-forma { display: inline-block; background: rgba(232,150,14,0.15); border: 1px solid rgba(232,150,14,0.28); border-radius: 20px; padding: 7px 22px; font-size: 13px; font-weight: 500; color: ${C.goldBr}; margin-bottom: 32px; }
    .invest-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-bottom: 36px; }
    .imeta { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 14px 22px; min-width: 155px; text-align: left; }
    .imeta-lbl { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 6px; }
    .imeta-val { font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.85); }

    /* ── WA BUTTON ── */
    .wa-btn { display: inline-flex; align-items: center; gap: 10px; background: #25D366; color: #fff; border-radius: 10px; padding: 14px 32px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; transition: opacity .15s; }
    .wa-btn:hover { opacity: .88; }
    .invest-valid { margin-top: 16px; font-size: 12px; color: rgba(255,255,255,0.35); }

    /* ── FOOTER ── */
    .q2-footer { display: flex; align-items: center; justify-content: space-between; padding: 18px 52px; background: ${C.navy2}; border-top: 3px solid ${C.goldBr}; }
    .footer-logo { height: 28px; max-width: 120px; object-fit: contain; filter: brightness(0) invert(1); opacity: .7; }
    .footer-brand { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(255,255,255,0.4); }
    .footer-doc { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 1px; color: rgba(255,255,255,0.2); text-align: right; line-height: 1.7; }

    @media print {
      @page { margin: 0; size: A4 portrait; }
      *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { margin: 0 !important; background: #fff !important; }
      .q2-bar { display: none !important; }
      .q2 { padding: 0 !important; background: #fff !important; }
      .q2-doc { margin-top: 0 !important; box-shadow: none !important; max-width: 100% !important; }
      .cover, .s-eco, .sec, .s-metrics, .s-invest, .q2-footer { page-break-inside: avoid; break-inside: avoid; }
    }
  `;

  return (
    <>
      <style>{SS}</style>

      {/* ── Toolbar ── */}
      <div className="q2-bar">
        <button className="q2-btn q2-btn-close" onClick={() => window.close()}>← Fechar</button>
        <span className="q2-bar-doc">{docNum} · {fmtDateLong(quote.createdAt)}</span>
        <button className="q2-btn q2-btn-pdf" onClick={() => window.print()}>⬇ Imprimir / PDF</button>
      </div>

      <div className="q2">
      <div className="q2-doc">

        {/* ══ COVER ══════════════════════════════════════════════════ */}
        <div className="cover">
          <div className="cover-gold-bar" />

          {/* Esquerda */}
          <div className="cover-left">
            <div className="cover-brand">
              {eff.logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={eff.logoUrl} alt={quote.companyName} className="cover-logo" crossOrigin="anonymous" onError={e => (e.currentTarget.style.display='none')} />
                : <span className="cover-logo-text">{quote.companyName || 'Energia Solar'}</span>
              }
              <span className="cover-docnum">{docNum}</span>
            </div>

            <div className="cover-mid">
              <p className="cover-eyebrow">Proposta Comercial · Energia Solar Fotovoltaica</p>
              <h1 className="cover-h1">
                {economiaMensalCalc > 0
                  ? <>A conta que<br />diminui todo<br />mês.</>
                  : <>Energia limpa,<br />conta reduzida,<br />futuro garantido.</>
                }
              </h1>
              {kwp && (
                <div className="cover-kwp-badge">
                  <IcoSun />
                  {kwp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kWp instalados
                </div>
              )}
            </div>

            <div className="cover-client">
              <div>
                <p className="cover-client-tag">Preparado exclusivamente para</p>
                <p className="cover-client-nome">
                  {clientName}
                  {f.instalacaoCidade && (
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 400, opacity: .55, fontFamily: 'Plus Jakarta Sans, sans-serif', fontStyle: 'normal' }}>
                      {f.instalacaoCidade}
                    </span>
                  )}
                </p>
              </div>
              <div className="cover-meta">
                <div className="cover-meta-row">
                  <span className="cover-meta-lbl">Emissão</span>
                  <span className="cover-meta-val">{fmtDateShort(quote.createdAt)}</span>
                </div>
                <div className="cover-meta-row">
                  <span className="cover-meta-lbl">Válida até</span>
                  <span className="cover-meta-val">{validadeStr}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Direita — foto */}
          <div className="cover-right">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImg} alt="" className="cover-photo" crossOrigin="anonymous" onError={e => (e.currentTarget.style.display='none')} />
          </div>
        </div>

        {/* ══ ECONOMIA — GANCHO PRINCIPAL ════════════════════════════ */}
        {economiaMensalCalc > 0 && (
          <div className="s-eco">
            <div className="sec-eyebrow">O QUE VOCÊ PASSA A ECONOMIZAR</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'start' }}>
              <div>
                <div className="eco-num">{BRL(economiaMensalCalc)}</div>
                <div className="eco-por-mes">por mês · {reducaoPct}% de redução</div>
                <div className="eco-sub">Economia anual estimada: <strong style={{ color: C.green }}>{BRL(economiaAnualCalc)}</strong></div>
                {economia25anos > 0 && (
                  <div className="eco-sub" style={{ marginTop: 4 }}>Em 25 anos: <strong style={{ color: C.green }}>{BRL(Math.round(economia25anos / 100) * 100)}</strong></div>
                )}
                <div className="eco-reducao-bar-wrap">
                  <div className="eco-reducao-label">Redução na conta de luz</div>
                  <div className="eco-bar-track">
                    <div className="eco-bar-fill" style={{ width: `${barraReducao}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: C.ink3 }}>
                    <span>0%</span><span style={{ color: C.green, fontWeight: 700 }}>{reducaoPct}%</span><span>100%</span>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {contaAtualCalc > 0 && (
                    <div className="conta-split" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="conta-card conta-antes">
                        <div className="conta-card-lbl">Conta atual (sem solar)</div>
                        <div className="conta-card-val">{BRL(contaAtualCalc)}<span style={{ fontSize: 14, fontWeight: 500, color: C.ink3 }}>/mês</span></div>
                      </div>
                      <div className="conta-card conta-depois">
                        <div className="conta-card-lbl">Conta estimada com solar</div>
                        <div className="conta-card-val green">{BRL(contaComSolarCalc)}<span style={{ fontSize: 14, fontWeight: 500, opacity: .6 }}>/mês</span></div>
                        <div className="conta-card-sub">inclui custo mínimo ANEEL obrigatório</div>
                      </div>
                    </div>
                  )}
                  {perdaSemSolar3anos > 0 && (
                    <div className="eco-loss-callout">
                      <div className="eco-loss-text">
                        Sem o sistema, nos próximos 3 anos você pagará{' '}
                        <strong style={{ fontSize: 16 }}>{BRL(Math.round(perdaSemSolar3anos / 100) * 100)}</strong> a mais de energia
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ MÉTRICAS CHAVE ════════════════════════════════════════ */}
        <div className="s-metrics">
          <div className="metrics-row">
            {[
              { lbl: 'Investimento total', val: BRL(subtotal), cls: 'gold' },
              { lbl: 'Retorno estimado',   val: paybackCalc > 0 ? `${paybackCalc} anos` : '—', cls: '' },
              { lbl: 'Potência instalada', val: kwp ? `${kwp} kWp` : '—', cls: '' },
              { lbl: 'Garantia do painel', val: garantiaPainelDisplay, cls: 'green' },
            ].map(m => (
              <div key={m.lbl} className="metric-cell">
                <div className="metric-lbl">{m.lbl}</div>
                <div className={`metric-val f-display ${m.cls}`}>{m.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ GRÁFICO DE GERAÇÃO MENSAL ══════════════════════════════ */}
        {kwp && (
          <div className="sec">
            <div className="sec-eyebrow">GERAÇÃO MENSAL ESTIMADA</div>
            <div className="bar-chart">
              {geracaoMensal.map((val, i) => {
                const isMax = val === maxGeracao;
                const isMin = val === minGeracao;
                const pct   = val / maxGeracao;
                const cor   = isMax ? C.green : isMin ? C.goldLine : C.goldBr;
                return (
                  <div key={i} className="bar-col">
                    <div className="bar-val" style={{ color: isMax ? C.green : undefined, fontWeight: isMax ? 700 : 400 }}>{val}</div>
                    <div className="bar-fill" style={{ height: `${Math.round(pct * 88)}px`, background: cor }} />
                    <div className="bar-mes">{MESES[i]}</div>
                  </div>
                );
              })}
            </div>
            <div className="bar-legend">
              <div className="bar-legend-item"><div className="bar-legend-dot" style={{ background: C.green }} />Maior geração</div>
              <div className="bar-legend-item"><div className="bar-legend-dot" style={{ background: C.goldBr }} />Geração típica</div>
              <div className="bar-legend-item"><div className="bar-legend-dot" style={{ background: C.goldLine }} />Menor geração</div>
            </div>
          </div>
        )}

        {/* ══ SIMULAÇÃO DE PARCELAMENTO ══════════════════════════════ */}
        <div className="sec" style={{ background: C.paper }}>
          <div className="sec-eyebrow">SIMULAÇÃO DE PARCELAMENTO</div>
          <div className="parc-grid-main">
            {parcelas.slice(0, 4).map(({ n, parcela }) => (
              <div key={n} className="parc-card parc-main">
                <div className="parc-n f-display">{n}<span style={{ fontSize: 16, fontWeight: 600, marginLeft: 2 }}>x</span></div>
                <div className="parc-val">{BRL(parcela)}</div>
                <div className="parc-mes">por mês</div>
              </div>
            ))}
          </div>
          <div className="parc-grid-sec">
            {parcelas.slice(4).map(({ n, parcela }) => (
              <div key={n} className="parc-card parc-sec">
                <div className="parc-n f-display parc-n-sec">{n}<span style={{ fontSize: 14, marginLeft: 2 }}>x</span></div>
                <div className="parc-val">{BRL(parcela)}</div>
                <div className="parc-mes">por mês</div>
              </div>
            ))}
          </div>
          <p className="parc-obs">* Simulação estimada com taxa de 1,3% a.m. Sujeita à análise de crédito da instituição financeira.</p>
        </div>

        {/* ══ EQUIPAMENTOS ══════════════════════════════════════════ */}
        {kwp && (
          <div className="sec">
            <div className="sec-eyebrow">EQUIPAMENTOS DO SISTEMA</div>
            <table className="equip-table">
              <thead>
                <tr>
                  <th className="equip-nome">Componente</th>
                  <th>Especificação</th>
                </tr>
              </thead>
              <tbody>
                {[
                  f.modeloPainel   ? { nome: 'Módulos fotovoltaicos', spec: `${f.potenciaPainelW}W · ${f.numPaineis} unidades · ${f.modeloPainel}` } : null,
                  f.modeloInversor ? { nome: 'Inversor solar',         spec: `${f.modeloInversor} · ${f.qtdInversores ?? 1}×` }                    : null,
                  f.tipoEstrutura  ? { nome: 'Estrutura de fixação',   spec: f.tipoEstrutura }                                                      : null,
                  { nome: 'Cabeamento',            spec: 'Solar 6mm² com conectores MC4 certificados' },
                  { nome: 'Garantia dos módulos',  spec: garantiaPainelDisplay },
                ].filter(Boolean).map((row) => row && (
                  <tr key={row.nome}>
                    <td className="equip-nome">{row.nome}</td>
                    <td className="equip-spec">{row.spec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ CONDIÇÕES GERAIS ══════════════════════════════════════ */}
        <div className="sec" style={{ background: C.paper }}>
          <div className="sec-eyebrow">CONDIÇÕES GERAIS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              'Instalação, homologação e ligação à rede inclusas no valor',
              'Garantia de 25 anos de performance dos módulos fotovoltaicos',
              `Proposta válida por 3 dias — expira em ${validadeStr}`,
              'Sujeita a vistoria técnica prévia do local de instalação',
            ].map(txt => (
              <div key={txt} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: C.ink2, lineHeight: 1.55 }}>
                <span style={{ color: C.green, flexShrink: 0, marginTop: 2 }}><IcoCheck /></span>
                <span>{txt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══ CTA INVESTIMENTO ══════════════════════════════════════ */}
        <div className="s-invest">
          <div className="invest-eyebrow">INVESTIMENTO TOTAL DO PROJETO</div>
          <div className="invest-val f-display">{BRL(subtotal)}</div>
          {f.formaPagamento && <div className="invest-forma">{f.formaPagamento}</div>}
          <div className="invest-meta">
            {f.condicoesPagamento && (
              <div className="imeta">
                <div className="imeta-lbl">Condições</div>
                <div className="imeta-val">{f.condicoesPagamento}</div>
              </div>
            )}
            {f.prazoEntrega && (
              <div className="imeta">
                <div className="imeta-lbl">Prazo de entrega</div>
                <div className="imeta-val">{f.prazoEntrega}</div>
              </div>
            )}
            <div className="imeta">
              <div className="imeta-lbl">Proposta válida até</div>
              <div className="imeta-val">{validadeStr}</div>
            </div>
          </div>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="wa-btn">
            <IcoWA /> Confirmar no WhatsApp
          </a>
          {eff.companyPhone && (
            <div className="invest-valid">{eff.companyPhone}</div>
          )}
        </div>

        {/* ══ FOOTER ════════════════════════════════════════════════ */}
        <div className="q2-footer">
          {eff.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={eff.logoUrl} alt={quote.companyName} className="footer-logo" crossOrigin="anonymous" onError={e => (e.currentTarget.style.display='none')} />
            : <span className="footer-brand">{quote.companyName || 'Energia Solar'}</span>
          }
          <div className="footer-doc">
            Proposta Nº {docNum} · {fmtDateLong(quote.createdAt)}<br />
            {quote.companyName} · Sujeita a vistoria técnica
          </div>
        </div>

      </div>
      </div>
    </>
  );
}
