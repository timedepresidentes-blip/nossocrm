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
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const fmtDateLong = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

const DIST_SAZONAL = [0.85, 0.88, 1.02, 1.08, 1.0, 0.92, 0.97, 1.07, 1.06, 1.0, 0.90, 0.85];
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const HERO_IMG = 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?fm=jpg&q=80&w=1400&auto=format&fit=crop';

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
        const d = dealRes.data as Record<string, unknown>;
        const contact = Array.isArray(d.contacts) ? (d.contacts as Record<string,unknown>[])[0] : d.contacts as Record<string,unknown> | null;
        const crmCompany = Array.isArray(d.crm_companies) ? (d.crm_companies as Record<string,unknown>[])[0] : d.crm_companies as Record<string,unknown> | null;
        const rawItems = (d.deal_items as Record<string,unknown>[] | null) || [];
        const items: QuoteItem[] = rawItems.map(i => ({
          id: String(i.id), name: String(i.name), quantity: Number(i.quantity ?? 1), price: Number(i.price ?? 0),
        }));
        const ficha = (d.ficha_cliente ?? {}) as FichaCliente;
        const effectiveItems = items.length > 0
          ? items
          : [{ id: 'total', name: String(d.title), quantity: 1, price: Number(d.value ?? 0) }];
        setQuote({
          dealTitle: String(d.title ?? ''),
          dealValue: Number(d.value ?? 0),
          contactName: contact?.name as string ?? ficha.nomeCompleto ?? '—',
          contactPhone: contact?.phone as string ?? '',
          createdAt: String(d.created_at),
          items: effectiveItems,
          fichaCliente: ficha,
          companyName: crmCompany?.name as string ?? '',
          quoteOverrides: (d.quote_overrides ?? {}) as Partial<OrgQuoteSettings>,
        });
        if (settingsRes.data) setOrgSettings(settingsRes.data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dealId]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6F9' }}>
      <Loader2 style={{ width: 32, height: 32, color: '#1E3A5F' }} className="animate-spin" />
    </div>
  );
  if (error || !quote) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6F9' }}>
      <span style={{ color: '#dc2626', fontFamily: 'system-ui, sans-serif' }}>{error || 'Erro ao carregar proposta'}</span>
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
  const reducaoPct         = contaAtualCalc > 0 ? Math.round((economiaMensalCalc / contaAtualCalc) * 100) : 0;
  const economia25anos     = economiaAnualCalc * 25;

  const geracaoMensal: number[] = (f.geracaoMensalKwh && Array.isArray(f.geracaoMensalKwh) && f.geracaoMensalKwh.length === 12)
    ? f.geracaoMensalKwh
    : DIST_SAZONAL.map(fator => Math.round(geracaoMediaMes * fator));
  const maxGeracao = Math.max(...geracaoMensal, 1);

  const garantiaPainelDisplay = f.garantiaPainel || '12 anos';

  const validadeDate = new Date(quote.createdAt);
  validadeDate.setDate(validadeDate.getDate() + 3);
  const validadeStr = fmtDate(validadeDate.toISOString());

  const whatsappNum  = (eff.companyPhone || '').replace(/\D/g, '');
  const whatsappLink = whatsappNum ? `https://wa.me/55${whatsappNum}?text=Olá, quero confirmar minha proposta solar!` : '#';
  const docNum = `OR-${dealId.slice(0, 6).toUpperCase()}`;
  const heroImg = eff.bannerImageUrl || HERO_IMG;
  const clientName = f.nomeCompleto || quote.contactName;

  const navy  = '#0F1B2D';
  const navy2 = '#1E3A5F';
  const green = '#1A6B47';
  const greenBg = '#EBF7F2';
  const greenBorder = '#A7DFC5';
  const gold  = '#C47A0A';
  const goldBg = '#FEF8EC';
  const goldBorder = '#F0D080';
  const ink3  = '#6B7A8D';
  const border = '#DDE2EA';
  const paper  = '#F7F8FA';

  const SS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .q2-wrap { font-family: 'Inter', system-ui, sans-serif; background: #E8ECF2; padding: 0 0 64px; min-height: 100vh; }

    /* Toolbar */
    .q2-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 999;
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 28px; background: ${navy}; border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .q2-bar-doc { font-size: 11px; letter-spacing: 0.5px; color: rgba(255,255,255,0.4); font-family: 'Inter', sans-serif; }
    .q2-btn {
      display: flex; align-items: center; gap: 7px; border: none; cursor: pointer;
      font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
      padding: 9px 20px; border-radius: 6px; transition: opacity .15s;
    }
    .q2-btn:hover { opacity: .85; }
    .q2-btn-close { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
    .q2-btn-pdf   { background: #E8960E; color: #fff; }

    /* Document */
    .q2-doc {
      max-width: 860px; margin: 60px auto 0;
      background: #fff;
      box-shadow: 0 4px 32px rgba(0,0,0,0.13), 0 1px 6px rgba(0,0,0,0.08);
    }

    /* ── HEADER ── */
    .q2-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 28px 48px; background: ${navy}; gap: 24px;
    }
    .q2-header-left { display: flex; align-items: center; gap: 20px; }
    .q2-logo { height: 44px; max-width: 180px; object-fit: contain; filter: brightness(0) invert(1); }
    .q2-company-name { font-family: 'Manrope', sans-serif; font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.3px; }
    .q2-header-right { text-align: right; }
    .q2-doc-label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 3px; }
    .q2-doc-num { font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.85); letter-spacing: 0.5px; }

    /* ── HERO BAND ── */
    .q2-hero { position: relative; height: 220px; overflow: hidden; }
    .q2-hero-img { width: 100%; height: 100%; object-fit: cover; object-position: center 40%; display: block; }
    .q2-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to right, rgba(15,27,45,0.82) 0%, rgba(15,27,45,0.4) 60%, transparent 100%); }
    .q2-hero-content { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 32px 48px; }
    .q2-hero-type { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #E8960E; font-weight: 600; margin-bottom: 10px; }
    .q2-hero-title { font-family: 'Manrope', sans-serif; font-size: 26px; font-weight: 800; color: #fff; line-height: 1.25; margin-bottom: 16px; text-wrap: balance; }
    .q2-hero-client { display: flex; align-items: center; gap: 10px; }
    .q2-hero-client-name { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9); }
    .q2-hero-client-city { font-size: 13px; color: rgba(255,255,255,0.5); }
    .q2-hero-dates { margin-left: auto; text-align: right; display: flex; gap: 24px; }
    .q2-date-block { text-align: right; }
    .q2-date-lbl { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 3px; }
    .q2-date-val { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.8); }

    /* ── KPI STRIP ── */
    .kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); background: ${navy2}; }
    .kpi-cell { padding: 20px 22px; border-right: 1px solid rgba(255,255,255,0.08); }
    .kpi-cell:last-child { border-right: none; }
    .kpi-lbl { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 8px; }
    .kpi-val { font-family: 'Manrope', sans-serif; font-size: 22px; font-weight: 700; color: #fff; line-height: 1; }
    .kpi-val.amber { color: #F0B840; }
    .kpi-val.green { color: #4DDDA0; }

    /* ── SECTION ── */
    .sec { padding: 36px 48px; border-top: 1px solid ${border}; }
    .sec-title {
      font-family: 'Manrope', sans-serif; font-size: 11px; font-weight: 700;
      letter-spacing: 1.8px; text-transform: uppercase; color: ${navy};
      margin-bottom: 24px; display: flex; align-items: center; gap: 12px;
    }
    .sec-title::after { content: ''; flex: 1; height: 1px; background: ${border}; }

    /* ── ECONOMIA ── */
    .eco-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
    .eco-main-val {
      font-family: 'Manrope', sans-serif; font-size: clamp(48px, 8vw, 72px);
      font-weight: 800; color: ${green}; line-height: 1; letter-spacing: -2px;
      font-feature-settings: "tnum";
    }
    .eco-sub-line { font-size: 13px; color: ${ink3}; margin-top: 6px; }
    .eco-sub-line strong { color: ${green}; }
    .eco-pct-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: ${greenBg}; border: 1px solid ${greenBorder};
      border-radius: 20px; padding: 5px 14px; font-size: 12px; font-weight: 600; color: ${green};
      margin-top: 12px;
    }
    .eco-bar-wrap { margin-top: 20px; }
    .eco-bar-lbl { font-size: 11px; font-weight: 600; color: ${ink3}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 7px; }
    .eco-bar-track { height: 7px; background: ${border}; border-radius: 4px; overflow: hidden; }
    .eco-bar-fill { height: 100%; background: ${green}; border-radius: 4px; }
    .eco-bar-pcts { display: flex; justify-content: space-between; margin-top: 5px; font-size: 10px; color: ${ink3}; }
    .eco-bar-pcts .hi { color: ${green}; font-weight: 700; }

    /* Conta antes/depois */
    .conta-stack { display: flex; flex-direction: column; gap: 12px; }
    .conta-card { border-radius: 6px; padding: 18px 20px; }
    .conta-antes { background: ${paper}; border: 1px solid ${border}; }
    .conta-depois { background: ${greenBg}; border: 1.5px solid ${greenBorder}; }
    .conta-lbl { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: ${ink3}; font-weight: 600; margin-bottom: 8px; }
    .conta-val { font-family: 'Manrope', sans-serif; font-size: 32px; font-weight: 700; color: ${navy}; line-height: 1; font-feature-settings: "tnum"; }
    .conta-val.green { color: ${green}; }
    .conta-note { font-size: 11px; color: ${ink3}; margin-top: 5px; }

    /* ── GERAÇÃO MENSAL ── */
    .bar-chart { display: flex; gap: 4px; align-items: flex-end; height: 100px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .bar-val { font-size: 8px; color: ${ink3}; }
    .bar-fill { width: 100%; border-radius: 2px 2px 0 0; min-height: 6px; }
    .bar-mes { font-size: 8px; color: ${ink3}; }
    .bar-legend { display: flex; gap: 16px; margin-top: 12px; }
    .bar-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: ${ink3}; }
    .bar-legend-dot { width: 10px; height: 10px; border-radius: 2px; }

    /* ── EQUIPAMENTOS ── */
    .equip-table { width: 100%; border-collapse: collapse; }
    .equip-table th {
      font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: ${ink3};
      padding-bottom: 10px; border-bottom: 2px solid ${navy}; text-align: left; font-weight: 600;
    }
    .equip-table td { padding: 14px 0; border-bottom: 1px solid ${border}; font-size: 14px; vertical-align: top; }
    .equip-table tr:last-child td { border-bottom: none; }
    .equip-nome { font-weight: 600; color: ${navy}; width: 200px; padding-right: 20px; }
    .equip-spec { color: #374151; font-size: 13px; }

    /* ── OBSERVAÇÕES ── */
    .obs-box { background: ${goldBg}; border: 1px solid ${goldBorder}; border-radius: 6px; padding: 16px 20px; font-size: 14px; color: #5A3A00; line-height: 1.6; }

    /* ── CTA ── */
    .cta-sec { background: ${navy}; padding: 48px; text-align: center; border-top: none; }
    .cta-lbl { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 10px; }
    .cta-val { font-family: 'Manrope', sans-serif; font-size: clamp(44px, 8vw, 68px); font-weight: 800; color: #fff; line-height: 1; letter-spacing: -2px; font-feature-settings: "tnum"; margin-bottom: 10px; }
    .cta-forma { display: inline-block; background: rgba(232,150,14,0.15); border: 1px solid rgba(232,150,14,0.3); border-radius: 20px; padding: 6px 20px; font-size: 13px; font-weight: 500; color: #F0B840; margin-bottom: 28px; }
    .cta-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-bottom: 32px; }
    .cta-meta-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 14px 20px; min-width: 140px; text-align: left; }
    .cta-meta-lbl { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 6px; }
    .cta-meta-val { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.85); }
    .wa-btn { display: inline-flex; align-items: center; gap: 10px; background: #25D366; color: #fff; border-radius: 8px; padding: 14px 32px; font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 700; text-decoration: none; transition: opacity .15s; }
    .wa-btn:hover { opacity: .88; }
    .cta-valid { margin-top: 14px; font-size: 12px; color: rgba(255,255,255,0.3); }

    /* ── CONDIÇÕES ── */
    .cond-list { display: flex; flex-direction: column; gap: 10px; }
    .cond-item { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: #374151; line-height: 1.55; }
    .cond-icon { color: ${green}; flex-shrink: 0; margin-top: 2px; }

    /* ── FOOTER ── */
    .q2-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 48px; background: ${navy2}; border-top: 3px solid #E8960E;
    }
    .footer-logo { height: 26px; max-width: 120px; object-fit: contain; filter: brightness(0) invert(1); opacity: .7; }
    .footer-name { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); letter-spacing: 0.5px; }
    .footer-info { font-size: 10px; color: rgba(255,255,255,0.25); text-align: right; line-height: 1.7; }

    @media print {
      @page { margin: 0; size: A4 portrait; }
      *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { margin: 0 !important; background: #fff !important; }
      .q2-bar { display: none !important; }
      .q2-wrap { padding: 0 !important; background: #fff !important; }
      .q2-doc { margin-top: 0 !important; box-shadow: none !important; max-width: 100% !important; }
    }
  `;

  return (
    <>
      <style>{SS}</style>

      {/* Toolbar */}
      <div className="q2-bar">
        <button className="q2-btn q2-btn-close" onClick={() => window.close()}>← Fechar</button>
        <span className="q2-bar-doc">{docNum} · {fmtDateLong(quote.createdAt)}</span>
        <button className="q2-btn q2-btn-pdf" onClick={() => window.print()}>⬇ Imprimir / PDF</button>
      </div>

      <div className="q2-wrap">
      <div className="q2-doc">

        {/* Header */}
        <div className="q2-header">
          <div className="q2-header-left">
            {eff.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={eff.logoUrl} alt={quote.companyName} className="q2-logo" crossOrigin="anonymous" onError={e => (e.currentTarget.style.display='none')} />
              : <span className="q2-company-name">{quote.companyName || 'Energia Solar'}</span>
            }
          </div>
          <div className="q2-header-right">
            <div className="q2-doc-label">Proposta Comercial</div>
            <div className="q2-doc-num">{docNum}</div>
          </div>
        </div>

        {/* Hero com foto */}
        <div className="q2-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImg} alt="" className="q2-hero-img" crossOrigin="anonymous" onError={e => (e.currentTarget.style.display='none')} />
          <div className="q2-hero-overlay" />
          <div className="q2-hero-content">
            <div className="q2-hero-type">Energia Solar Fotovoltaica</div>
            <div className="q2-hero-title">Sistema Solar Fotovoltaico{kwp ? ` — ${kwp} kWp` : ''}</div>
            <div className="q2-hero-client">
              <div className="q2-hero-client-name">{clientName}</div>
              {f.instalacaoCidade && <div className="q2-hero-client-city">· {f.instalacaoCidade}</div>}
              <div className="q2-hero-dates">
                <div className="q2-date-block">
                  <div className="q2-date-lbl">Emissão</div>
                  <div className="q2-date-val">{fmtDate(quote.createdAt)}</div>
                </div>
                <div className="q2-date-block">
                  <div className="q2-date-lbl">Válida até</div>
                  <div className="q2-date-val">{validadeStr}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="kpi-strip">
          {[
            { lbl: 'Investimento total',  val: BRL(subtotal),                                cls: 'amber' },
            { lbl: 'Retorno estimado',    val: paybackCalc > 0 ? `${paybackCalc} anos` : '—', cls: ''     },
            { lbl: 'Potência instalada',  val: kwp ? `${kwp} kWp` : '—',                      cls: ''     },
            { lbl: 'Garantia do painel',  val: garantiaPainelDisplay,                         cls: 'green'},
          ].map(m => (
            <div key={m.lbl} className="kpi-cell">
              <div className="kpi-lbl">{m.lbl}</div>
              <div className={`kpi-val ${m.cls}`}>{m.val}</div>
            </div>
          ))}
        </div>

        {/* Economia */}
        {economiaMensalCalc > 0 && (
          <div className="sec">
            <div className="sec-title">Economia Estimada</div>
            <div className="eco-grid">
              <div>
                <div className="eco-main-val">{BRL(economiaMensalCalc)}</div>
                <div className="eco-sub-line" style={{ marginTop: 6 }}>por mês · Economia anual: <strong>{BRL(economiaAnualCalc)}</strong></div>
                {economia25anos > 0 && (
                  <div className="eco-sub-line" style={{ marginTop: 3 }}>
                    Em 25 anos: <strong>{BRL(Math.round(economia25anos / 100) * 100)}</strong>
                  </div>
                )}
                {reducaoPct > 0 && (
                  <>
                    <div className="eco-pct-badge">
                      <span>↓</span> {reducaoPct}% de redução na conta
                    </div>
                    <div className="eco-bar-wrap">
                      <div className="eco-bar-lbl">Redução na conta de luz</div>
                      <div className="eco-bar-track">
                        <div className="eco-bar-fill" style={{ width: `${Math.min(reducaoPct, 95)}%` }} />
                      </div>
                      <div className="eco-bar-pcts">
                        <span>0%</span>
                        <span className="hi">{reducaoPct}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {contaAtualCalc > 0 && (
                <div className="conta-stack">
                  <div className="conta-card conta-antes">
                    <div className="conta-lbl">Conta atual</div>
                    <div className="conta-val">{BRL(contaAtualCalc)}<span style={{ fontSize: 14, fontWeight: 400, color: ink3 }}>/mês</span></div>
                  </div>
                  <div className="conta-card conta-depois">
                    <div className="conta-lbl">Estimativa com solar</div>
                    <div className="conta-val green">{BRL(contaComSolarCalc)}<span style={{ fontSize: 14, fontWeight: 400, opacity: .65 }}>/mês</span></div>
                    <div className="conta-note">Inclui custo mínimo ANEEL obrigatório</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Geração Mensal */}
        {kwp && (
          <div className="sec" style={{ background: paper }}>
            <div className="sec-title">Geração Mensal Estimada</div>
            <div className="bar-chart">
              {geracaoMensal.map((val, i) => {
                const isMax = val === maxGeracao;
                const pct   = val / maxGeracao;
                const cor   = isMax ? green : '#93C5A0';
                return (
                  <div key={i} className="bar-col">
                    <div className="bar-val">{val}</div>
                    <div className="bar-fill" style={{ height: `${Math.round(pct * 80)}px`, background: cor }} />
                    <div className="bar-mes">{MESES[i]}</div>
                  </div>
                );
              })}
            </div>
            <div className="bar-legend">
              <div className="bar-legend-item"><div className="bar-legend-dot" style={{ background: green }} />Melhor mês</div>
              <div className="bar-legend-item"><div className="bar-legend-dot" style={{ background: '#93C5A0' }} />Demais meses</div>
            </div>
          </div>
        )}

        {/* Equipamentos */}
        {kwp && (
          <div className="sec">
            <div className="sec-title">Equipamentos do Sistema</div>
            <table className="equip-table">
              <thead>
                <tr>
                  <th className="equip-nome">Componente</th>
                  <th>Especificação</th>
                </tr>
              </thead>
              <tbody>
                {([
                  f.modeloPainel   ? { nome: 'Módulos Fotovoltaicos', spec: [f.numPaineis && `${f.numPaineis} unidades`, f.potenciaPainelW && `${f.potenciaPainelW}W`, f.modeloPainel].filter(Boolean).join(' · ') } : null,
                  f.modeloInversor ? { nome: 'Inversor Solar',        spec: [f.modeloInversor, f.qtdInversores && f.qtdInversores > 1 ? `${f.qtdInversores}×` : null].filter(Boolean).join(' · ') } : null,
                  f.tipoEstrutura  ? { nome: 'Estrutura de Fixação',  spec: f.tipoEstrutura } : null,
                  { nome: 'Cabeamento',           spec: 'Solar 6mm² com conectores MC4 certificados' },
                  { nome: 'Garantia dos Módulos', spec: garantiaPainelDisplay },
                  f.garantiaInversor ? { nome: 'Garantia do Inversor', spec: f.garantiaInversor } : null,
                ] as Array<{nome: string; spec: string} | null>).filter(Boolean).map(row => row && (
                  <tr key={row.nome}>
                    <td className="equip-nome">{row.nome}</td>
                    <td className="equip-spec">{row.spec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Observações */}
        {f.observacoes && (
          <div className="sec" style={{ background: paper }}>
            <div className="sec-title">Observações</div>
            <div className="obs-box">{f.observacoes}</div>
          </div>
        )}

        {/* Condições Gerais */}
        <div className="sec">
          <div className="sec-title">Condições Gerais</div>
          <div className="cond-list">
            {[
              'Instalação, homologação e ligação à rede inclusas no valor',
              'Garantia de 25 anos de performance dos módulos fotovoltaicos',
              `Proposta válida por 3 dias — expira em ${validadeStr}`,
              'Sujeita a vistoria técnica prévia do local de instalação',
            ].map(txt => (
              <div key={txt} className="cond-item">
                <span className="cond-icon"><IcoCheck /></span>
                <span>{txt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Investimento */}
        <div className="cta-sec">
          <div className="cta-lbl">Investimento Total do Projeto</div>
          <div className="cta-val">{BRL(subtotal)}</div>
          {f.formaPagamento && <div className="cta-forma">{f.formaPagamento}</div>}
          <div className="cta-meta">
            {f.condicoesPagamento && (
              <div className="cta-meta-card">
                <div className="cta-meta-lbl">Condições</div>
                <div className="cta-meta-val">{f.condicoesPagamento}</div>
              </div>
            )}
            {f.prazoEntrega && (
              <div className="cta-meta-card">
                <div className="cta-meta-lbl">Prazo de entrega</div>
                <div className="cta-meta-val">{f.prazoEntrega}</div>
              </div>
            )}
            <div className="cta-meta-card">
              <div className="cta-meta-lbl">Válida até</div>
              <div className="cta-meta-val">{validadeStr}</div>
            </div>
          </div>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="wa-btn">
            <IcoWA /> Confirmar via WhatsApp
          </a>
          {eff.companyPhone && <div className="cta-valid">{eff.companyPhone}</div>}
        </div>

        {/* Footer */}
        <div className="q2-footer">
          {eff.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={eff.logoUrl} alt={quote.companyName} className="footer-logo" crossOrigin="anonymous" onError={e => (e.currentTarget.style.display='none')} />
            : <span className="footer-name">{quote.companyName || 'Energia Solar'}</span>
          }
          <div className="footer-info">
            {docNum} · {fmtDateLong(quote.createdAt)}<br />
            {quote.companyName} · Sujeita a vistoria técnica
          </div>
        </div>

      </div>
      </div>
    </>
  );
}
