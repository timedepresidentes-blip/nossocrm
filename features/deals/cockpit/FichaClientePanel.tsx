'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronUp, ClipboardList,
  Download, ExternalLink, FileSpreadsheet, FileText, Loader2, RefreshCw, Save, Send, ScanSearch, Upload, XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { autoFillDealCosts } from '@/lib/supabase/autoFillDealCosts';
import { detectModulo, detectInversor } from '@/features/documents/templates/fabricantes';

export interface FichaClienteData {
  nomeCompleto: string | null; cpfCnpj: string | null; rg: string | null;
  telefone: string | null; email: string | null; estadoCivil: string | null;
  enderecoRua: string | null; enderecoBairro: string | null; enderecoCidade: string | null;
  enderecoEstado: string | null; enderecoCep: string | null;
  instalacaoEndereco: string | null; instalacaoCidade: string | null;
  instalacaoTipoImovel: string | null; instalacaoTelhado: string | null;
  instalacaoFases: string | null; instalacaoDisjuntor: string | null;
  potenciaKwp: number | null; numPaineis: number | null; modeloPainel: string | null;
  potenciaPainelW: number | null; modeloInversor: string | null; tipoInversor: string | null;
  qtdInversores: number | null; tipoEstrutura: string | null;
  valorTotal: number | null; formaPagamento: string | null; condicoesPagamento: string | null;
  prazoEntrega: string | null; consumoMensalKwh: number | null; valorContaAtual: number | null;
  distribuidora: string | null; observacoes: string | null;
}

interface Props {
  dealId?: string | null;
  contactId?: string | null;
  conversationId?: string | null;
  isWon?: boolean;
  dealTitle?: string;
  dealValue?: number | null;
  custoTotal?: number;
  margemPct?: number;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inp = 'w-full rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/30';

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className={inp} placeholder="—" />
    </div>
  );
}

function empty(): FichaClienteData {
  return {
    nomeCompleto: null, cpfCnpj: null, rg: null, telefone: null, email: null, estadoCivil: null,
    enderecoRua: null, enderecoBairro: null, enderecoCidade: null, enderecoEstado: null, enderecoCep: null,
    instalacaoEndereco: null, instalacaoCidade: null, instalacaoTipoImovel: null,
    instalacaoTelhado: null, instalacaoFases: null, instalacaoDisjuntor: null,
    potenciaKwp: null, numPaineis: null, modeloPainel: null, potenciaPainelW: null,
    modeloInversor: null, tipoInversor: null, qtdInversores: null, tipoEstrutura: null,
    valorTotal: null, formaPagamento: null, condicoesPagamento: null, prazoEntrega: null,
    consumoMensalKwh: null, valorContaAtual: null, distribuidora: null, observacoes: null,
  };
}

function toStr(v: string | number | null | undefined): string {
  return v != null ? String(v) : '';
}

export const FichaClientePanel: React.FC<Props> = ({
  dealId, contactId, conversationId, isWon, dealTitle, dealValue, custoTotal, margemPct,
}) => {
  const [aberta, setAberta] = useState(true);
  const [ficha, setFicha] = useState<FichaClienteData>(empty());
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [contratoAssinado, setContratoAssinado] = useState(false);
  const [marcandoContrato, setMarcandoContrato] = useState(false);
  const [csEnvelopeKey, setCsEnvelopeKey] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // ClickSign — contrato
  const pdfRefCs = useRef<HTMLInputElement>(null);
  const [pdfFileCs, setPdfFileCs]         = useState<File | null>(null);
  const [sendingCs, setSendingCs]         = useState(false);
  const [sendResultCs, setSendResultCs]   = useState<'ok' | 'error' | null>(null);
  const [sendErrorCs, setSendErrorCs]     = useState('');

  // ClickSign — procuração
  const pdfRefProc = useRef<HTMLInputElement>(null);
  const [inclProc, setInclProc]           = useState(false);   // toggle
  const [pdfFileProc, setPdfFileProc]     = useState<File | null>(null);
  const [procAvulsa, setProcAvulsa]       = useState(false);   // separado vs mesmo envelope

  // Extração via contrato PDF
  const pdfContratoRef = useRef<HTMLInputElement>(null);
  const pdfOrcRef      = useRef<HTMLInputElement>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [pdfExtractMsg, setPdfExtractMsg] = useState<'ok' | 'error' | null>(null);
  const [pdfExtractError, setPdfExtractError] = useState<string>('');

  // Seletor de orçamento OrçaFácil
  interface OrcItem {
    id: string; cliente_nome: string; potencia_kwp: number; valor_final: number | null;
    status: string; created_at: string;
    cliente_cidade?: string | null; cliente_telefone?: string | null;
    num_paineis?: number | null; potencia_painel_w?: number | null;
    modelo_painel?: string | null; modelo_inversor?: string | null;
    tipo_inversor?: string | null; qtd_inversores?: number | null;
    tipo_estrutura?: string | null; forma_pagamento?: string | null;
    distribuidora_nome?: string | null;
  }
  const [orcList, setOrcList] = useState<OrcItem[]>([]);
  const [showOrcPicker, setShowOrcPicker] = useState(false);
  const [loadingOrcList, setLoadingOrcList] = useState(false);
  const [extractingOrc, setExtractingOrc] = useState(false);
  const [orcMsg, setOrcMsg] = useState<'ok' | 'error' | null>(null);
  const [orcError, setOrcError] = useState('');

  // Carrega ficha salva no deal
  const load = useCallback(async () => {
    if (!supabase || !dealId) return;
    setLoading(true);
    const { data } = await supabase
      .from('deals')
      .select('ficha_cliente, contrato_assinado, custom_fields')
      .eq('id', dealId)
      .maybeSingle();
    if (data?.ficha_cliente) setFicha(data.ficha_cliente as FichaClienteData);
    if (data?.contrato_assinado) setContratoAssinado(true);
    const envKey = (data?.custom_fields as Record<string, any>)?.clicksign?.envelopeKey;
    if (envKey) setCsEnvelopeKey(envKey);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { void load(); }, [load]);

  // Extração IA
  const handleExtrair = async () => {
    setExtracting(true);
    try {
      const res = await fetch('/api/ai/tasks/deals/ficha-cliente', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, dealId }),
      });
      const body = await res.json();
      if (body.ficha) setFicha(body.ficha);
    } finally {
      setExtracting(false);
    }
  };

  // Extração via contrato PDF assinado
  const handleExtrairContrato = async (file: File) => {
    setExtractingPdf(true);
    setPdfExtractMsg(null);
    setPdfExtractError('');
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      if (dealId) fd.append('dealId', dealId);
      const res = await fetch('/api/ai/tasks/deals/ficha-from-pdf', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (body.ficha) {
        setFicha(body.ficha);
        if (body.ficha.valorTotal || body.ficha.nomeCompleto) setContratoAssinado(true);
        if (contactId) await applyVendaLabel(contactId);
        if (dealId) autoFillDealCosts(dealId).catch(console.warn);
        setPdfExtractMsg('ok');
      } else {
        const msg = body.error?.message || `HTTP ${res.status}`;
        setPdfExtractError(msg);
        setPdfExtractMsg('error');
      }
    } catch (e: unknown) {
      setPdfExtractError(e instanceof Error ? e.message : 'Erro de rede');
      setPdfExtractMsg('error');
    } finally {
      setExtractingPdf(false);
      setTimeout(() => setPdfExtractMsg(null), 8000);
      if (pdfContratoRef.current) pdfContratoRef.current.value = '';
    }
  };

  // Abre o seletor de orçamentos: busca a lista e exibe
  const handleAbrirSeletorOrc = async () => {
    if (showOrcPicker) { setShowOrcPicker(false); return; }
    setLoadingOrcList(true);
    setOrcMsg(null);
    try {
      const params = new URLSearchParams();
      if (dealId) params.set('dealId', dealId);
      if (contactId) params.set('contactId', contactId);
      const res = await fetch(`/api/orcafacil/by-deal?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const list = body.orcamentos ?? [];
      if (list.length === 0) {
        setOrcError('Nenhum orçamento encontrado para este contato.');
        setOrcMsg('error');
        setTimeout(() => setOrcMsg(null), 5000);
      } else {
        setOrcList(list);
        setShowOrcPicker(true);
      }
    } catch (e: unknown) {
      setOrcError(e instanceof Error ? e.message : 'Erro de rede');
      setOrcMsg('error');
      setTimeout(() => setOrcMsg(null), 5000);
    } finally {
      setLoadingOrcList(false);
    }
  };

  // Extrai dados completos do orçamento via API by-id (usa SECURITY DEFINER RPC)
  const handleExtrairOrcamento = async (orc: OrcItem) => {
    setExtractingOrc(true);
    setShowOrcPicker(false);
    setOrcMsg(null);
    try {
      const params = new URLSearchParams({ id: orc.id });
      if (contactId) params.set('contactId', contactId);
      else if (dealId) params.set('dealId', dealId);

      const res = await fetch(`/api/orcafacil/by-id?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      const o = body.orcamento as OrcItem;
      const painelW: number | null = o.potencia_painel_w ?? null;
      // num_paineis não é salvo pelo NovoOrcamento — calcula de kwp / W
      const numPaineis: number | null =
        o.num_paineis ??
        (o.potencia_kwp && painelW ? Math.round(o.potencia_kwp * 1000 / painelW) : null);
      const potenciaKwp: number | null =
        numPaineis && painelW
          ? Math.round(numPaineis * painelW / 1000 * 100) / 100
          : o.potencia_kwp ?? null;

      setFicha(prev => ({
        ...prev,
        nomeCompleto:     o.cliente_nome          ?? prev.nomeCompleto,
        telefone:         o.cliente_telefone      ?? prev.telefone,
        enderecoCidade:   o.cliente_cidade        ?? prev.enderecoCidade,
        instalacaoCidade: o.cliente_cidade        ?? prev.instalacaoCidade,
        potenciaKwp,
        numPaineis,
        potenciaPainelW:  painelW,
        modeloPainel:     o.modelo_painel         ?? prev.modeloPainel,
        modeloInversor:   o.modelo_inversor       ?? prev.modeloInversor,
        tipoInversor:     o.tipo_inversor         ?? prev.tipoInversor,
        qtdInversores:    o.qtd_inversores        ?? prev.qtdInversores,
        tipoEstrutura:    o.tipo_estrutura        ?? prev.tipoEstrutura,
        valorTotal:       o.valor_final           ?? prev.valorTotal,
        formaPagamento:   o.forma_pagamento       ?? prev.formaPagamento,
        distribuidora:    o.distribuidora_nome    ?? prev.distribuidora,
      }));
      setOrcMsg('ok');
    } catch (e: unknown) {
      setOrcError(e instanceof Error ? e.message : 'Erro inesperado');
      setOrcMsg('error');
    } finally {
      setExtractingOrc(false);
      setTimeout(() => setOrcMsg(null), 6000);
    }
  };

  // Salvar manualmente
  const handleSalvar = async () => {
    if (!supabase || !dealId) return;
    setSaving(true);

    const updates: Record<string, unknown> = { ficha_cliente: ficha, updated_at: new Date().toISOString() };

    // Se ficha tem valorTotal e deal.value está zerado, grava o valor da venda também
    if (ficha.valorTotal != null) {
      const raw = String(ficha.valorTotal).replace(/[R$\s.]/g, '').replace(',', '.');
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0 && (!dealValue || dealValue === 0)) {
        updates.value = n;
      }
    }

    await supabase.from('deals').update(updates).eq('id', dealId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);

    // Sincroniza custos financeiros com padrões da org
    autoFillDealCosts(dealId).catch(console.warn);
  };

  const setField = (key: keyof FichaClienteData, val: string) => {
    setFicha(prev => ({ ...prev, [key]: val || null }));
  };

  // Aplica a primeira etiqueta "Venda concluída" (syncs_with_won) ao contato
  const applyVendaLabel = async (cid: string) => {
    if (!supabase) return;
    const { data: label } = await supabase
      .from('labels')
      .select('id')
      .eq('syncs_with_won', true)
      .limit(1)
      .maybeSingle();
    if (label?.id) {
      await supabase
        .from('contact_labels')
        .upsert({ contact_id: cid, label_id: label.id }, { onConflict: 'contact_id,label_id' });
    }
  };

  const handleMarcarContratoAssinado = async () => {
    if (!supabase || !dealId) return;
    setMarcandoContrato(true);
    const agora = new Date().toISOString();
    await supabase
      .from('deals')
      .update({
        contrato_assinado: true,
        contrato_assinado_at: agora,
        is_won: true,
        is_lost: false,
        closed_at: agora,
        updated_at: agora,
      })
      .eq('id', dealId);
    if (contactId) await applyVendaLabel(contactId);
    if (dealId) autoFillDealCosts(dealId).catch(console.warn);
    setContratoAssinado(true);
    setMarcandoContrato(false);
  };

  // Impressão da ficha como PDF
  const handleBaixarFicha = () => {
    if (!printRef.current) return;
    const conteudo = printRef.current.innerHTML;
    const janela = window.open('', '_blank', 'width=800,height=900');
    if (!janela) return;
    janela.document.write(`<!DOCTYPE html><html><head><title>Ficha do Cliente</title>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; padding: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 13px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 16px 0 8px; color: #333; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 16px; }
  .campo { margin-bottom: 6px; }
  .label { font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: 0.04em; }
  .valor { border-bottom: 1px solid #aaa; padding: 2px 0; min-height: 18px; }
  .total { font-size: 14px; font-weight: bold; color: #1a5c2a; }
  @media print { body { padding: 8px; } }
</style></head><body>${conteudo}</body></html>`);
    janela.document.close();
    setTimeout(() => { janela.print(); }, 400);
  };

  // Impressão do contrato — AUREON ENERGIX / F. R. C. CINTRA (contrato real)
  // Gera HTML da procuração pré-preenchida com dados da ficha
  const gerarProcuracaoHtml = () => {
    const f = ficha;
    const nome = f.nomeCompleto ?? '___________________________';
    const cpf  = f.cpfCnpj ?? '___________';
    const end  = [f.enderecoRua, f.enderecoBairro, f.enderecoCidade, f.enderecoEstado]
      .filter(Boolean).join(', ') + (f.enderecoCep ? ` - CEP: ${f.enderecoCep}` : '');
    const cidade = f.enderecoCidade ?? 'Araraquara';
    const data   = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

    return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><title>Procuração – ${nome}</title>
<style>
  @page { size: A4; margin: 35mm 30mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.7; color: #1a1a1a; }
  h1 { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 40px; letter-spacing: 1px; }
  p { text-align: justify; margin-bottom: 14px; }
  u { text-decoration: underline; }
  .data { text-align: center; margin: 50px 0 80px; }
  .assin { text-align: center; margin-top: 20px; }
  .linha { border-top: 1px solid #333; width: 68%; margin: 0 auto 8px; }
  .nome-cpf { font-size: 11pt; }
</style>
</head>
<body>
<h1>PROCURAÇÃO</h1>
<p>Pelo presente instrumento particular de procuração <strong>${nome.toUpperCase()}</strong>, portador do CPF:<strong>${cpf}</strong>, residente e domiciliado(a) no endereço: <strong>${end.toUpperCase()}</strong>, nomeia e constitui seu procurador <strong>HENRIQUE IWANO</strong>, portador do CPF: 365.349.468-07, situada no endereço: RUA VN 24, 294, CJH VIDA NOVA, BARRETOS - SP, CEP: 14.784-776, para representá-la junto à Companhia de Energia, com a finalidade específica assinalada abaixo:</p>
<p>Outros poderes (especificar): <u>Viabilidade para carga no projeto de homologação energia solar, executar projeto elétrico de geração distribuída de energia solar fotovoltaica, solicitação de viabilidade, alteração de carga, inspeção, fiscalização, assinar ART, solicitação de acesso, compensação de créditos de energia elétrica e/ou quaisquer serviços necessários para instalação e homologação de usina solar fotovoltaica.</u></p>
<div class="data">${cidade.toUpperCase()} – SP, ${data}.</div>
<div class="assin">
  <div class="linha"></div>
  <div class="nome-cpf">Nome: ${nome.toUpperCase()}</div>
  <div class="nome-cpf">CPF: ${cpf}</div>
</div>
<script>window.onload = () => window.print();</script>
</body></html>`;
  };

  const handleAbrirProcuracao = () => {
    const html  = gerarProcuracaoHtml();
    const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const handleGerarOS = async () => {
    const logo = await fetchLogoBase64();
    const f = ficha;
    const hoje = new Date().toLocaleDateString('pt-BR');
    const osNum = `OS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${dealId?.slice(0, 6).toUpperCase() ?? 'XXXXX'}`;
    const endCliente = [f.enderecoRua, f.enderecoBairro, f.enderecoCidade, f.enderecoEstado]
      .filter(Boolean).join(', ') + (f.enderecoCep ? ` — CEP ${f.enderecoCep}` : '');
    const endInstalacao = f.instalacaoEndereco
      ? `${f.instalacaoEndereco}${f.instalacaoCidade ? ', ' + f.instalacaoCidade : ''}`
      : endCliente;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><title>O.S. ${osNum}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a5c2a; padding-bottom: 10px; margin-bottom: 14px; }
  .empresa { font-size: 15pt; font-weight: bold; color: #1a5c2a; }
  .sub { font-size: 9pt; color: #555; margin-top: 2px; }
  .titulo { text-align: center; font-size: 14pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 4px; }
  .osnum { text-align: center; font-size: 10pt; color: #555; margin-bottom: 16px; }
  .secao { font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #1a5c2a; border-bottom: 1px solid #1a5c2a; margin: 14px 0 8px; padding-bottom: 2px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 4px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 16px; margin-bottom: 4px; }
  .campo .label { font-size: 8pt; text-transform: uppercase; color: #666; letter-spacing: 0.04em; }
  .campo .valor { border-bottom: 1px solid #aaa; padding: 2px 0; min-height: 17px; font-size: 10.5pt; }
  .obs-box { border: 1px solid #aaa; border-radius: 4px; padding: 8px; min-height: 60px; margin-top: 4px; font-size: 10pt; }
  .checklist { list-style: none; margin: 4px 0; }
  .checklist li { display: flex; align-items: center; gap: 8px; font-size: 10pt; margin-bottom: 5px; }
  .check { width: 14px; height: 14px; border: 1.5px solid #333; border-radius: 2px; flex-shrink: 0; }
  .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 32px; max-width: 600px; }
  .assin-bloco { text-align: center; }
  .assin-linha { border-top: 1px solid #333; margin-bottom: 4px; }
  .assin-nome { font-size: 9pt; }
  .prestador-box { background: #f5f5f5; border-radius: 4px; padding: 8px 12px; font-size: 9.5pt; }
  @media print { body { font-size: 10.5pt; } }
</style>
</head><body>

<div class="header">
  <div style="display:flex;align-items:center;gap:12px">
    ${logo ? `<img src="${logo}" alt="Aureon Energix" style="height:52px;width:auto">` : ''}
    <div>
      <div class="empresa">AUREON ENERGIX</div>
      <div class="sub">F. R. C. CINTRA — CNPJ 33.071.872/0001-08</div>
      <div class="sub">Araraquara — SP</div>
    </div>
  </div>
  <div style="text-align:right">
    <div class="sub">Data de emissão: ${hoje}</div>
    <div class="sub">Prestador: FENIX SOLAR (J.W - FENIX SOLAR LTDA)</div>
    <div class="sub">CNPJ: 61.338.707/0001-05 | Tel: (16) 9602-3210</div>
    <div class="sub">Monte Alto/SP</div>
  </div>
</div>

<div class="titulo">ORDEM DE SERVIÇO DE INSTALAÇÃO</div>
<div class="osnum">Nº ${osNum}</div>

<div class="secao">1. Dados do Cliente</div>
<div class="grid2">
  <div class="campo"><div class="label">Nome completo</div><div class="valor">${f.nomeCompleto ?? ''}</div></div>
  <div class="campo"><div class="label">Telefone</div><div class="valor">${f.telefone ?? ''}</div></div>
  <div class="campo" style="grid-column:span 2"><div class="label">Endereço do cliente</div><div class="valor">${endCliente}</div></div>
  <div class="campo" style="grid-column:span 2"><div class="label">Local de instalação</div><div class="valor">${endInstalacao}</div></div>
</div>

<div class="secao">2. Especificações Técnicas do Sistema</div>
<div class="grid3">
  <div class="campo"><div class="label">Potência total (kWp)</div><div class="valor">${f.potenciaKwp ?? ''}</div></div>
  <div class="campo"><div class="label">Qtd. de painéis</div><div class="valor">${f.numPaineis ?? ''}</div></div>
  <div class="campo"><div class="label">Potência do painel (W)</div><div class="valor">${f.potenciaPainelW ?? ''}</div></div>
</div>
<div class="grid2">
  <div class="campo"><div class="label">Modelo / Marca do painel</div><div class="valor">${f.modeloPainel ?? ''}</div></div>
  <div class="campo"><div class="label">Qtd. de inversores</div><div class="valor">${f.qtdInversores ?? ''}</div></div>
  <div class="campo"><div class="label">Modelo / Marca do inversor</div><div class="valor">${f.modeloInversor ?? ''}</div></div>
  <div class="campo"><div class="label">Tipo (inversor / microinversor)</div><div class="valor">${f.tipoInversor ?? ''}</div></div>
</div>

<div class="secao">3. Informações da Instalação</div>
<div class="grid2">
  <div class="campo"><div class="label">Tipo de telhado</div><div class="valor">${f.instalacaoTelhado ?? ''}</div></div>
  <div class="campo"><div class="label">Tipo de estrutura</div><div class="valor">${f.tipoEstrutura ?? ''}</div></div>
  <div class="campo"><div class="label">Fases elétricas</div><div class="valor">${f.instalacaoFases ?? ''}</div></div>
  <div class="campo"><div class="label">Disjuntor (A)</div><div class="valor">${f.instalacaoDisjuntor ?? ''}</div></div>
  <div class="campo"><div class="label">Tipo de imóvel</div><div class="valor">${f.instalacaoTipoImovel ?? ''}</div></div>
</div>

<div class="secao">4. Checklist de Conclusão</div>
<ul class="checklist">
  <li><span class="check"></span> Equipamentos instalados conforme especificação técnica</li>
  <li><span class="check"></span> Sistema ligado e testado (geração verificada no inversor)</li>
  <li><span class="check"></span> Estrutura fixada e vedações concluídas</li>
  <li><span class="check"></span> Local limpo e entregue ao cliente</li>
  <li><span class="check"></span> Cliente orientado sobre o funcionamento e aplicativo de monitoramento</li>
</ul>

<div class="secao">5. Observações</div>
<div class="obs-box">${f.observacoes ?? ''}</div>

<div class="assinaturas">
  <div class="assin-bloco">
    <div class="assin-linha"></div>
    <div class="assin-nome">CLIENTE<br>${f.nomeCompleto ?? '___________________________'}</div>
  </div>
  <div class="assin-bloco">
    <div class="assin-linha"></div>
    <div class="assin-nome">FENIX SOLAR<br>Responsável pela instalação</div>
  </div>
</div>

<script>window.onload = () => window.print();</script>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const toBase64 = (file: File) => new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res((r.result as string).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const handleEnviarAssinatura = async () => {
    if (!pdfFileCs) return;
    const email = ficha.email;
    if (!email) {
      setSendResultCs('error');
      setSendErrorCs('Preencha o e-mail do cliente na ficha antes de enviar.');
      return;
    }
    if (inclProc && !pdfFileProc) {
      setSendResultCs('error');
      setSendErrorCs('Selecione também o PDF da procuração ou desmarque a opção.');
      return;
    }

    setSendingCs(true); setSendResultCs(null);
    try {
      const contratoBase64  = await toBase64(pdfFileCs);
      const procBase64      = inclProc && pdfFileProc ? await toBase64(pdfFileProc) : null;

      // Se procuração avulsa → envia em envelope separado ANTES do contrato
      if (inclProc && procBase64 && procAvulsa) {
        const respProc = await fetch('/api/clicksign/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            dealId:             'doc-avulso',
            pdfBase64:          procBase64,
            filename:           pdfFileProc!.name,
            signerName:         ficha.nomeCompleto ?? 'Cliente',
            signerEmail:        email,
            signerPhone:        ficha.telefone ?? undefined,
            // procuração: apenas cliente assina (sem vendedora)
          }),
        });
        if (!respProc.ok) {
          const d = await respProc.json();
          throw new Error(`Procuração: ${d.error ?? 'Erro ao enviar.'}`);
        }
      }

      // Envia contrato (+ procuração junto se não for avulsa)
      const resp = await fetch('/api/clicksign/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dealId:                 dealId ?? 'doc-avulso',
          pdfBase64:              contratoBase64,
          filename:               pdfFileCs.name,
          signerName:             ficha.nomeCompleto ?? 'Cliente',
          signerEmail:            email,
          signerPhone:            ficha.telefone ?? undefined,
          companySignerName:      'F.R.C Cintra',
          companySignerEmail:     'fcintra4@hotmail.com',
          // procuração no mesmo envelope (não avulsa)
          ...(inclProc && procBase64 && !procAvulsa ? {
            procuracaoBase64:     procBase64,
            procuracaoFilename:   pdfFileProc!.name,
          } : {}),
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? 'Erro ao enviar.');

      setSendResultCs('ok');
      if (data.envelopeKey) setCsEnvelopeKey(data.envelopeKey);
      setPdfFileCs(null);  setPdfFileProc(null);
      if (pdfRefCs.current)   pdfRefCs.current.value   = '';
      if (pdfRefProc.current) pdfRefProc.current.value = '';
    } catch (e) {
      setSendResultCs('error');
      setSendErrorCs(e instanceof Error ? e.message : 'Erro desconhecido.');
    } finally {
      setSendingCs(false);
    }
  };

  const fetchLogoBase64 = async (): Promise<string> => {
    try {
      const res = await fetch('/logo-aureon.png');
      const blob = await res.blob();
      return await new Promise<string>(resolve => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(blob);
      });
    } catch { return ''; }
  };

  const handleGerarContrato = async () => {
    const janela = window.open('', '_blank', 'width=900,height=1100');
    if (!janela) return;
    const logo = await fetchLogoBase64();
    const ref = (dealId ?? 'N/D').slice(0, 8).toUpperCase();
    const modfab = detectModulo(f.modeloPainel ?? '');
    const invfab = detectInversor(f.modeloInversor ?? '');
    const rawValor = f.valorTotal ?? dealValue;
    const valorContrato = rawValor != null
      ? (() => {
          const n = typeof rawValor === 'number'
            ? rawValor
            : Number(String(rawValor).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
          return isNaN(n) ? String(rawValor) : BRL.format(n);
        })()
      : '___________';
    const endComp = [f.enderecoRua, f.enderecoBairro, f.enderecoCidade, f.enderecoEstado]
      .filter(Boolean).join(', ') + (f.enderecoCep ? ` — CEP ${f.enderecoCep}` : '');
    const endInst = [f.instalacaoEndereco || f.enderecoRua, f.instalacaoCidade || f.enderecoCidade]
      .filter(Boolean).join(', ') || '___________________________';
    const contato = [f.email, f.telefone].filter(Boolean).join(' / ') || '___________________________';
    const html = `<!DOCTYPE html><html><head>
<title>Contrato – ${f.nomeCompleto ?? 'Cliente'}</title><meta charset="utf-8">
<style>
  @page{size:A4;margin:0}
  *{box-sizing:border-box}
  /* TELA */
  body{font-family:Arial,sans-serif;color:#1a1a1a;font-size:10.5pt;line-height:1.65;margin:0;padding:24px 0;background:#c8c8c8}
  .sheet{background:#fff;max-width:800px;margin:0 auto;padding:28px 36px;box-shadow:0 3px 14px rgba(0,0,0,.3)}
  h1{text-align:center;font-size:14pt;margin:0 0 5px;text-transform:uppercase;letter-spacing:.05em}
  .sub{text-align:center;font-size:9pt;color:#555;margin:0 0 16px}
  h2{font-size:10.5pt;font-weight:bold;margin:16px 0 5px;text-transform:uppercase;border-bottom:1.5px solid #aaa;padding-bottom:3px;page-break-after:avoid;break-after:avoid}
  h3{font-size:10.5pt;font-weight:bold;margin:12px 0 4px;page-break-after:avoid;break-after:avoid}
  p{margin:4px 0;text-align:justify}
  .pb{background:#f8f8f8;border:1px solid #ddd;padding:8px 12px;margin:8px 0;border-radius:3px;page-break-inside:avoid;break-inside:avoid}
  .pb-t{font-size:8.5pt;text-transform:uppercase;font-weight:bold;color:#666;margin-bottom:4px}
  .cl{margin-bottom:8px}
  table{border-collapse:collapse;width:100%;margin:6px 0;font-size:9.5pt;page-break-inside:avoid;break-inside:avoid}
  th,td{border:1px solid #ccc;padding:5px 8px}
  th{background:#efefef;font-weight:bold;text-align:left}
  tr{page-break-inside:avoid;break-inside:avoid}
  .assin{margin-top:44px;display:flex;justify-content:space-between;page-break-inside:avoid;break-inside:avoid}
  .ab{text-align:center;width:44%;font-size:9.5pt}
  .al{border-top:1px solid #333;padding-top:6px;margin-top:26px}
  .quebra{display:block;height:32px;margin:0;padding:0;border-top:2px dashed #ccc}
  .at{text-align:center;font-size:13pt;font-weight:bold;margin:0 0 8px;text-transform:uppercase;letter-spacing:.03em}
  .ck{display:inline-block;width:12px;height:12px;border:1px solid #333;margin-right:4px;vertical-align:middle}
  ul{margin:4px 0 4px 20px}li{margin:2px 0}
  /* IMPRESSÃO — @page margin:0, padding no sheet garante margens independente do dialogo */
  @media print{
    #toolbar{display:none!important}
    html{width:210mm}
    body{margin:0;padding:0;background:#fff;width:210mm}
    .sheet{width:210mm;max-width:none;margin:0;padding:20mm 18mm;box-shadow:none;background:#fff}
    .quebra{height:0;border:none;break-before:page;page-break-before:always;display:block}
    h2,h3{break-after:avoid;page-break-after:avoid;orphans:3;widows:3}
    p{orphans:3;widows:3}
    .pb{break-inside:avoid;page-break-inside:avoid}
    table{break-inside:avoid;page-break-inside:avoid}
    tr{break-inside:avoid;page-break-inside:avoid}
    .assin{break-inside:avoid;page-break-inside:avoid}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style></head><body><div class="sheet">

${logo ? `<div style="text-align:center;margin-bottom:14px"><img src="${logo}" alt="Aureon Energix" style="height:90px;width:auto"></div>` : ''}
<h1>Contrato de Compra, Venda e Instalação<br>de Sistema de Geração Fotovoltaica</h1>
<p class="sub">Nº de Referência: ${ref} &nbsp;|&nbsp; Data: ${hoje}</p>

<h2>Qualificação das Partes</h2>
<div class="pb">
  <div class="pb-t">Comprador(a)</div>
  <p>Nome/Razão Social: <strong>${f.nomeCompleto ?? '___________________________'}</strong></p>
  <p>CPF/CNPJ: ${f.cpfCnpj ?? '___________________________'} &nbsp;&nbsp; RG: ${f.rg ?? '___________________________'}</p>
  <p>Estado Civil: ${f.estadoCivil ?? '___________________________'}</p>
  <p>Endereço: ${endComp || '___________________________'}</p>
  <p>E-mail / Telefone: ${contato}</p>
  <p style="font-size:11px;color:#555;margin-top:5px">Doravante denominada simplesmente COMPRADOR(A).</p>
</div>
<div class="pb">
  <div class="pb-t">Vendedora</div>
  <p>Razão Social: <strong>F. R. C. CINTRA</strong> &nbsp; Nome Fantasia (uso comercial): <strong>AUREON ENERGIX</strong></p>
  <p>CNPJ: <strong>33.071.872/0001-08</strong></p>
  <p>Endereço: Av. Octaviano de Arruda Campos, nº 921, Vila Cidade Industrial (Vila Xavier), CEP 14.810-225, Araraquara/SP</p>
  <p>Telefone: (16) 3357-4701</p>
  <p style="font-size:11px;color:#555;margin-top:5px">Doravante denominada simplesmente VENDEDORA.</p>
</div>
<p>VENDEDORA e COMPRADOR(A), doravante em conjunto denominadas PARTES, têm entre si justo e contratado o presente instrumento particular de compra, venda e instalação de sistema de geração fotovoltaica, que se regerá pelas cláusulas seguintes e pela legislação aplicável, notadamente o Código Civil, o Código de Defesa do Consumidor (Lei nº 8.078/1990) e a Lei nº 14.300/2022 (Marco Legal da Geração Distribuída).</p>

<h2>O que está sendo adquirido — Sistema e Valor</h2>
<p>Endereço de instalação: <strong>${endInst}</strong></p>
<p>Potência nominal do sistema: <strong>${f.potenciaKwp ?? '___'} kWp</strong></p>
<table>
  <tr><th>Descrição</th><th>Marca/Modelo</th><th>Quantidade</th></tr>
  <tr><td>Inversor</td><td>${f.modeloInversor ?? '___________________________'}</td><td>${f.qtdInversores ?? '___'}</td></tr>
  <tr><td>Módulos fotovoltaicos</td><td>${f.modeloPainel ?? '___________________________'}</td><td>${f.numPaineis ?? '___'}</td></tr>
  <tr><td>Estrutura de fixação</td><td>${f.tipoEstrutura ?? '___________________________'}</td><td>1</td></tr>
  <tr><td>Kit de acessórios (conectores, cabeamento, proteções)</td><td>—</td><td>1</td></tr>
</table>
<p style="font-size:11px;color:#555">Ressalva-se que marcas, modelos e potências específicas dos equipamentos poderão variar conforme disponibilidade de estoque, mantendo-se a potência nominal total contratada, sendo certo que todos os equipamentos utilizados possuirão garantia do respectivo fabricante.</p>
<table>
  <tr><td style="width:50%">Valor total do contrato:</td><td><strong>${valorContrato}</strong></td></tr>
  <tr><td>Forma de pagamento:</td><td>${f.formaPagamento ?? '___________________________'}</td></tr>
  ${f.condicoesPagamento ? `<tr><td>Condições:</td><td>${f.condicoesPagamento}</td></tr>` : ''}
</table>

<h2>Cláusula 1ª — Do Objeto</h2>
<div class="cl">
<p>1.1. O presente contrato tem por objeto a venda, o fornecimento e a instalação de um SISTEMA DE GERAÇÃO FOTOVOLTAICA de potência nominal de ${f.potenciaKwp ?? '___'} kWp ("Sistema"), composto pelos equipamentos discriminados na tabela acima e na proposta comercial que integra este instrumento.</p>
<p>1.2. O objeto deste contrato consiste na venda de um sistema com determinada capacidade nominal de geração (kWp), cujo alcance, condições e limitações quanto à geração efetiva de energia estão detalhados na Cláusula 9ª e no Termo de Ciência Técnica anexo.</p>
<p>1.3. Não integra o objeto deste contrato qualquer intervenção, reforço estrutural ou adequação da edificação, telhado ou local de instalação, cuja verificação de adequação e eventual regularização são de responsabilidade exclusiva do COMPRADOR, nos termos da Cláusula 4ª.</p>
</div>

<h2>Cláusula 2ª — Da Vistoria Técnica Prévia</h2>
<div class="cl">
<p>2.1. Previamente à celebração deste contrato, foi realizada vistoria técnica e comercial no local indicado pelo COMPRADOR, com as seguintes finalidades: (i) dimensionamento do sistema fotovoltaico; (ii) verificação do espaço físico disponível e sua adequação; (iii) identificação de eventuais obstáculos, sombreamentos ou condições que possam impactar o desempenho do sistema.</p>
<p>2.2. O relatório/laudo de vistoria técnica, quando emitido, passa a integrar este contrato para todos os fins de direito, nos termos da Cláusula 15ª, constituindo documento comprobatório das condições do local no momento do dimensionamento do Sistema.</p>
<p>2.3. A potência nominal do Sistema (kWp) e a estimativa de geração constante da proposta comercial partem de parâmetros técnicos padronizados de referência, pressupondo condições ideais de instalação. O dimensionamento realizado para o COMPRADOR considera as condições reais do local, verificadas na vistoria técnica prévia, e o perfil de consumo por ele declarado, sendo certo que eventual divergência entre as condições reais do local e as condições ideais de referência pode impactar o resultado de geração, nos termos da Cláusula 9ª. A VENDEDORA não é responsável por alterações supervenientes às condições verificadas até a data da vistoria.</p>
<p>2.4. Poderão ser realizadas visitas técnicas adicionais (revisitas) quando necessárias em razão de: (i) ausência do COMPRADOR ou de responsável no local, na data e horário agendados; (ii) informações incorretas ou incompletas prestadas pelo COMPRADOR; (iii) solicitação do próprio COMPRADOR para nova avaliação após alteração do projeto ou do local inicialmente indicado.</p>
<p>2.5. As revisitas poderão ser cobradas conforme valor vigente na tabela de preços da VENDEDORA, informado previamente ao COMPRADOR. Não será cobrada a primeira vistoria técnica realizada no âmbito do processo comercial.</p>
</div>

<h2>Cláusula 3ª — Das Obrigações da Vendedora</h2>
<div class="cl">
<p>3.1. Fornecer e instalar os equipamentos do Sistema, conforme especificações da proposta comercial aprovada.</p>
<p>3.2. Executar a instalação em conformidade com as normas técnicas vigentes (incluindo as normas da concessionária local de energia elétrica) e as boas práticas do setor fotovoltaico.</p>
<p>3.3. Elaborar o projeto técnico do Sistema e submetê-lo à concessionária de energia elétrica para fins de homologação.</p>
<p>3.4. Prestar suporte técnico e orientação ao COMPRADOR quanto ao funcionamento básico do Sistema, nos termos da Cláusula 11ª (Garantias).</p>
<p>3.5. Configurar e instalar o Sistema de forma técnica e otimizada, buscando o máximo aproveitamento da capacidade de geração dentro das condições e limitações do local apresentadas na vistoria técnica prévia. Trata-se de obrigação de meio, não constituindo, em qualquer hipótese, obrigação de resultado quanto ao volume de energia efetivamente gerado, nos termos da Cláusula 9ª.</p>
<p>3.6. A título de cortesia e bônus de pós-venda, a VENDEDORA poderá auxiliar o COMPRADOR na compreensão e análise de dados de consumo e geração de energia relacionados ao Sistema, ressalvando-se que a apuração e disponibilização dos dados de consumo constantes da fatura de energia elétrica constituem serviço prestado pela concessionária, não constituindo o auxílio aqui previsto obrigação contratual exigível da VENDEDORA.</p>
<p>3.7. O COMPRADOR terá acesso a aplicativo de monitoramento para acompanhamento da geração do Sistema, cujo funcionamento e disponibilidade dependem do respectivo desenvolvedor/fabricante, não constituindo obrigação da VENDEDORA.</p>
</div>

<h2>Cláusula 4ª — Das Obrigações do Comprador</h2>
<div class="cl">
<p>4.1. Fornecer local de instalação com condições estruturais, físicas e de segurança adequadas ao Sistema contratado, sendo de sua exclusiva responsabilidade a veracidade das informações e condições apresentadas por ocasião da vistoria técnica prévia.</p>
<p>4.2. Garantir a integridade estrutural do telhado ou local de instalação, respondendo por eventuais vícios ocultos ou problemas estruturais preexistentes.</p>
<p>4.3. Disponibilizar livre acesso à VENDEDORA para a execução da instalação e eventuais visitas técnicas, nas datas e horários agendados.</p>
<p>4.4. Efetuar os pagamentos nos prazos e condições estipulados na Cláusula 5ª.</p>
<p>4.5. O COMPRADOR declara estar ciente de que o dimensionamento do Sistema e a estimativa de geração constante da proposta comercial foram elaborados com base no perfil de consumo de energia elétrica por ele informado à VENDEDORA até a data da contratação.</p>
<p>4.6. Providenciar, por sua conta e responsabilidade, quaisquer adequações estruturais, elétricas ou logísticas que se mostrem necessárias e que não estejam contempladas no escopo deste contrato.</p>
</div>

<h2>Cláusula 5ª — Do Valor e Forma de Pagamento</h2>
<div class="cl">
<p>5.1. O valor total deste contrato, a forma de pagamento e as demais condições aplicáveis são os indicados no preâmbulo deste instrumento ("O que está sendo adquirido — Sistema e Valor"), a ser pago pelo COMPRADOR conforme ali especificado.</p>
<p>5.1.1. O valor previsto no item 5.1 compreende a integralidade do fornecimento dos equipamentos, seu transporte e entrega, bem como a execução dos serviços de instalação do Sistema, conforme escopo definido na Cláusula 1ª.</p>
<p>5.2. Este contrato entra em vigor e vincula as PARTES a partir da data de sua assinatura. O prazo para entrega e instalação do Sistema, previsto na Cláusula 8ª, terá início somente a partir da confirmação/compensação do pagamento ou da respectiva entrada, conforme a forma de pagamento acordada.</p>
<p>5.3. Caso o pagamento seja realizado por meio de instituição financeira, cooperativa de crédito ou fintech, o prazo de entrega e instalação somente terá início após a efetiva compensação bancária dos valores e a confirmação pela VENDEDORA.</p>
<p>5.4. É de responsabilidade do COMPRADOR informar à VENDEDORA a identificação dos pagamentos realizados, mediante envio do respectivo comprovante.</p>
</div>

<h2>Cláusula 6ª — Do Reajuste por Pendência Atribuível ao Comprador</h2>
<div class="cl">
<p>6.1. Havendo pendência atribuível exclusivamente ao COMPRADOR que impacte o prazo de entrega e/ou instalação previsto na Cláusula 8ª, o valor contratual ficará sujeito a reajuste, enquanto perdurar a pendência, para refletir variações de mercado nos custos de aquisição de equipamentos e insumos.</p>
<p>6.2. O reajuste será calculado com base em critério objetivo e verificável (variação de índice oficial e/ou de tabela de custos de fornecedores), sendo vedado o reajuste por critério exclusivamente unilateral da VENDEDORA.</p>
<p>6.3. O novo valor será previamente comunicado ao COMPRADOR, com a devida justificativa, e sua aplicação dependerá da formalização de Termo Aditivo a este contrato.</p>
<p>6.4. O reajuste tratado nesta cláusula não se confunde com a multa moratória prevista na Cláusula 7ª, podendo ambos ser aplicados cumulativamente quando cabíveis.</p>
</div>

<h2>Cláusula 7ª — Da Mora, Inadimplência e Alienação Fiduciária em Garantia</h2>
<div class="cl">
<p>7.1. O atraso no pagamento de qualquer valor devido, por período superior a 3 (três) dias, sujeitará o COMPRADOR à incidência de: (a) multa moratória de 2% (dois por cento) sobre o valor em atraso; e (b) juros moratórios de 1% (um por cento) ao mês, calculados pro rata die, até a data do efetivo pagamento.</p>
<p>7.2. O atraso de qualquer parcela poderá facultar à VENDEDORA declarar o vencimento antecipado das parcelas vincendas, mediante notificação prévia ao COMPRADOR.</p>
<p>7.3. Persistindo a inadimplência, a VENDEDORA poderá incluir o nome do COMPRADOR nos cadastros de proteção ao crédito (SPC, Serasa ou similares), observada a notificação prévia exigida pela Súmula 359 do Superior Tribunal de Justiça, bem como adotar as medidas judiciais cabíveis para cobrança dos valores devidos.</p>
<p>7.4. Nos casos em que o pagamento do preço não seja integralmente quitado no ato nem integralmente intermediado por instituição financeira que assuma o risco de crédito perante a VENDEDORA, os equipamentos que compõem o Sistema permanecerão alienados fiduciariamente em favor da VENDEDORA, nos termos do Decreto-Lei nº 911/1969, até a quitação integral do preço.</p>
<p>7.5. Enquanto não quitado integralmente o preço, a propriedade fiduciária dos equipamentos permanece com a VENDEDORA, cabendo ao COMPRADOR a posse direta dos bens na qualidade de fiel depositário, sendo vedada a transferência, oneração ou remoção dos equipamentos sem autorização prévia e expressa da VENDEDORA.</p>
<p>7.6. Caracterizada a inadimplência não sanada no prazo previsto no item 13.1, a VENDEDORA poderá notificar o COMPRADOR para regularização em prazo adicional razoável, e, persistindo o inadimplemento, adotar as medidas cabíveis para consolidação da propriedade e busca e apreensão dos equipamentos, judicial ou extrajudicial, nos termos da legislação aplicável.</p>
<p>7.7. Em caso de recuperação dos equipamentos, caso a VENDEDORA proceda à sua alienação para quitação do saldo devedor, eventual valor excedente será restituído ao COMPRADOR, e eventual saldo remanescente poderá ser cobrado judicialmente, sempre observados os limites e garantias do Código de Defesa do Consumidor.</p>
</div>

<h2>Cláusula 8ª — Do Prazo de Entrega e Instalação</h2>
<div class="cl">
<p>8.1. O prazo máximo para entrega e instalação do Sistema é de 60 (sessenta) dias corridos, contados a partir da confirmação/compensação do pagamento, nos termos do item 5.2. Para fins de organização logística, a VENDEDORA estima prazo médio de entrega de 15 (quinze) dias corridos, contado da mesma data, sendo esse prazo médio de natureza estritamente informativa e não vinculante.</p>
<p>8.1.1. A entrega ocorrerá no endereço de instalação indicado neste contrato, cabendo ao COMPRADOR, ou a responsável por ele indicado, recepcionar os materiais e a equipe técnica na data agendada.</p>
<p>8.2. O prazo ficará suspenso, sem incidência de qualquer penalidade à VENDEDORA, nas seguintes hipóteses: greves que afetem diretamente a logística de transporte; condições climáticas severas comprovadas por órgão meteorológico oficial; fatos técnicos imprevistos alheios ao controle da VENDEDORA; interrupções no fornecimento de energia elétrica por período superior a 2 horas diárias; necessidade de obra na rede elétrica pública; pendência atribuível ao COMPRADOR.</p>
<p>8.3. Cessada a causa da suspensão, o prazo voltará a correr automaticamente, devendo a VENDEDORA comunicar ao COMPRADOR o novo prazo estimado.</p>
<p>8.4. O prazo previsto nesta cláusula não inclui o prazo de homologação do Sistema junto à concessionária de energia elétrica, cuja responsabilidade é integralmente da companhia distribuidora, a partir da solicitação de vistoria formulada pela VENDEDORA.</p>
</div>

<h2>Cláusula 9ª — Da Estimativa de Geração de Energia</h2>
<div class="cl">
<p>9.1. A potência nominal do Sistema (kWp) corresponde à capacidade de geração aferida em condições técnicas padronizadas de referência, pressupondo instalação em condições ideais, não representando, portanto, garantia de volume determinado de energia efetivamente gerada (kWh) ou de economia financeira específica na conta de energia elétrica do COMPRADOR.</p>
<p>9.2. A geração efetiva do Sistema depende do grau de proximidade entre as condições reais do local de instalação e as condições ideais de referência. Eventual estimativa de geração ou de economia constante da proposta comercial possui natureza exclusivamente projetiva e referencial, não constituindo garantia de resultado.</p>
<p>9.3. O COMPRADOR declara estar ciente de que o desempenho real do Sistema pode variar em função de fatores técnicos e ambientais alheios ao controle da VENDEDORA, incluindo, entre outros: sombreamento e obstáculos; sujidade sobre os módulos fotovoltaicos; variação da irradiação solar conforme a época do ano e a região de instalação; condições climáticas; orientação geográfica (azimute) e inclinação do telhado; alteração do perfil de consumo de energia elétrica do COMPRADOR posterior à contratação.</p>
<p>9.4. Os fatores descritos no item 9.3 e suas implicações são detalhados, de forma específica e destacada, no Termo de Ciência Técnica que integra este contrato como Anexo I, cuja leitura e aceite são condição para a assinatura deste instrumento.</p>
</div>

<h2>Cláusula 10ª — Da Manutenção e Limpeza</h2>
<div class="cl">
<p>10.1. Não integra o escopo deste contrato a prestação de serviços de manutenção preventiva ou de limpeza periódica dos módulos fotovoltaicos, sendo tal atividade de responsabilidade exclusiva do COMPRADOR.</p>
<p>10.2. O serviço de limpeza e manutenção preventiva poderá ser contratado separadamente junto à VENDEDORA ou a terceiros, mediante instrumento próprio, não estando incluído no valor pactuado neste contrato.</p>
<p>10.3. A VENDEDORA não se responsabiliza por danos causados ao Sistema em decorrência de serviços de limpeza ou manutenção executados por terceiros sem a devida qualificação técnica.</p>
</div>

<h2>Cláusula 11ª — Das Garantias</h2>
<div class="cl">
<p>11.1. A VENDEDORA concede ao COMPRADOR garantia de 12 (doze) meses sobre os serviços de instalação do Sistema, contados a partir da data de conclusão da instalação, abrangendo exclusivamente a mão de obra empregada.</p>
<p>11.2. Os equipamentos possuem garantia própria concedida pelo respectivo fabricante, conforme prazos e condições discriminados no Anexo II — Quadro de Garantia dos Equipamentos, que integra este contrato. O preenchimento do Anexo II com a marca, modelo e prazo de garantia dos equipamentos efetivamente fornecidos, e sua entrega ao COMPRADOR, constituem condição de eficácia da entrega do Sistema. O acionamento técnico de garantia de equipamentos observará os prazos e procedimentos estabelecidos pelo fabricante, sem prejuízo da responsabilidade solidária da VENDEDORA perante o COMPRADOR, nos termos do art. 18 do Código de Defesa do Consumidor.</p>
<p>11.3. Não estão cobertos pela garantia de instalação: (a) defeitos decorrentes de uso inadequado ou de intervenção de terceiros não autorizados pela VENDEDORA; (b) danos provocados por fenômenos da natureza (raios, enchentes, granizo e similares); (c) danos causados por vandalismo, roubo, furto ou ações humanas externas; (d) danos decorrentes de ausência de manutenção/limpeza a cargo do COMPRADOR.</p>
<p>11.4. Identificado problema técnico coberto pela garantia, o COMPRADOR deverá comunicar a VENDEDORA, que terá até 30 (trinta) dias para solucionar a questão, nos termos do art. 18, caput, do Código de Defesa do Consumidor.</p>
</div>

<h2>Cláusula 12ª — Dos Serviços Extras</h2>
<div class="cl">
<p>12.1. Serviços não expressamente previstos neste contrato não integram o escopo contratado e, caso necessários ou solicitados pelo COMPRADOR, serão objeto de negociação e formalização à parte, mediante Termo Aditivo específico, no qual constarão a descrição do serviço, o valor e, quando aplicável, novo prazo de execução.</p>
<p>12.2. Nenhum serviço extra será executado sem a prévia formalização referida no item 12.1, ficando a VENDEDORA isenta de qualquer obrigação nesse sentido até então.</p>
</div>

<h2>Cláusula 13ª — Da Rescisão e Penalidades</h2>
<div class="cl">
<p>13.1. Este contrato poderá ser rescindido em razão do inadimplemento de quaisquer das obrigações nele previstas, desde que a parte inadimplente não regularize a pendência no prazo de 30 (trinta) dias corridos, contados da notificação por escrito da parte prejudicada.</p>
<p>13.2. Em caso de rescisão unilateral por conveniência do COMPRADOR, sem que haja descumprimento contratual por parte da VENDEDORA, o COMPRADOR arcará com: (a) multa compensatória de 2% (dois por cento) sobre o valor total do contrato; e (b) ressarcimento das despesas efetivamente desembolsadas pela VENDEDORA até a data da rescisão, mediante comprovação documental específica, incluindo: (i) custos de entrega e logística; (ii) serviços de instalação já executados; (iii) elaboração de projeto de engenharia; (iv) visitas técnicas realizadas; (v) danos comprovadamente causados aos equipamentos em razão da rescisão.</p>
<p>13.3. Caso a VENDEDORA descumpra o prazo máximo de entrega e instalação previsto no item 8.1, sem amparo em hipótese de força maior (item 8.2) ou em pendência atribuível ao COMPRADOR (Cláusula 6ª), a VENDEDORA pagará ao COMPRADOR multa compensatória de 2% (dois por cento) sobre o valor total do contrato.</p>
<p>13.3.1. Persistindo o descumprimento por prazo superior a 30 (trinta) dias contados da notificação da mora, ou não havendo interesse do COMPRADOR na continuidade da execução, este poderá optar pela rescisão do contrato, hipótese em que fará jus à devolução integral dos valores pagos, devidamente atualizados, no prazo de até 30 (trinta) dias, sem prejuízo da multa prevista no item 13.3.</p>
<p>13.4. O contrato poderá, ainda, ser rescindido por mútuo acordo entre as PARTES, hipótese que será formalizada por instrumento específico de rescisão, com as devidas restituições recíprocas, quando cabíveis.</p>
</div>

<h2>Cláusula 14ª — Da Proteção de Dados Pessoais</h2>
<div class="cl">
<p>14.1. Os dados pessoais do COMPRADOR serão tratados pela VENDEDORA exclusivamente para as finalidades relacionadas à execução deste contrato, incluindo o projeto técnico, a homologação junto à concessionária de energia e, quando aplicável, o compartilhamento com instituições financeiras envolvidas no pagamento, em conformidade com a Lei nº 13.709/2018 (LGPD).</p>
<p>14.2. Os dados serão mantidos pelo prazo necessário ao cumprimento das finalidades contratuais e das obrigações legais e regulatórias aplicáveis, sendo assegurados ao COMPRADOR os direitos previstos na LGPD, mediante solicitação à VENDEDORA.</p>
</div>

<h2>Cláusula 15ª — Dos Documentos Integrantes</h2>
<div class="cl">
<p>15.1. Consideram-se parte integrante e inseparável deste contrato, independentemente de transcrição em seu corpo: a proposta comercial, o relatório/laudo de vistoria técnica, o Termo de Ciência Técnica (Anexo I), o Quadro de Garantia dos Equipamentos (Anexo II) e demais termos de entrega e de vistoria eventualmente firmados entre as PARTES.</p>
</div>

<h2>Cláusula 16ª — Do Quadro-Resumo de Responsabilidades</h2>
<div class="cl">
<table>
  <tr><th>Parte</th><th>Responsabilidades principais</th></tr>
  <tr><td><strong>VENDEDORA</strong></td><td>Fornecimento e instalação dos equipamentos (Cláusula 3ª); elaboração e submissão do projeto técnico (item 3.3); configuração otimizada do Sistema (item 3.5); garantia de instalação (Cláusula 11ª); auxílio de cortesia na análise de dados de consumo/geração e orientação inicial do aplicativo de monitoramento (itens 3.6 e 3.7).</td></tr>
  <tr><td><strong>COMPRADOR</strong></td><td>Fornecer local apto e estruturalmente adequado, com veracidade das informações prestadas na vistoria (item 4.1); livre acesso à equipe técnica (item 4.3); pagamento nos prazos (item 4.4); manutenção e limpeza dos módulos (Cláusula 10ª); adequações particulares do imóvel não incluídas no escopo (itens 4.6 e 5.1.1); recepção da entrega no endereço de instalação (item 8.1.1).</td></tr>
  <tr><td><strong>Concessionária de Energia</strong></td><td>Homologação do Sistema junto à rede elétrica (item 8.4); apuração e disponibilização dos dados de consumo e geração na fatura de energia (item 3.6); eventual execução de obras na rede pública (item 8.2); processos de compensação de créditos de energia, quando aplicável.</td></tr>
</table>
</div>

<h2>Cláusula 17ª — Das Disposições Gerais</h2>
<div class="cl">
<p>17.1. Este instrumento constitui o acordo integral entre as PARTES quanto ao seu objeto, substituindo entendimentos anteriores, verbais ou escritos.</p>
<p>17.2. Quaisquer modificações a este contrato somente terão validade se formalizadas por escrito, mediante Termo Aditivo assinado pelas PARTES.</p>
<p>17.3. A tolerância de uma das PARTES quanto ao eventual descumprimento de obrigação pela outra não implicará novação, renúncia ou alteração das condições pactuadas.</p>
</div>

<h2>Cláusula 18ª — Do Foro</h2>
<div class="cl">
<p>18.1. Para dirimir quaisquer controvérsias oriundas deste contrato, as PARTES elegem o Foro da Comarca de Araraquara, Estado de São Paulo, sem prejuízo da prerrogativa do COMPRADOR, na qualidade de consumidor, de propor ação no foro de seu domicílio, nos termos do art. 101, I, do Código de Defesa do Consumidor.</p>
</div>

<p>E, por estarem assim justas e contratadas, as PARTES firmam o presente instrumento em 2 (duas) vias de igual teor, na presença das testemunhas abaixo.</p>
<p>Local e data: Araraquara/SP, ${hoje}.</p>
<div class="assin">
  <div class="ab"><div class="al"></div><p><strong>VENDEDORA</strong><br>F. R. C. CINTRA<br>CNPJ: 33.071.872/0001-08</p></div>
  <div class="ab"><div class="al"></div><p><strong>COMPRADOR(A)</strong><br>${f.nomeCompleto ?? '___________________________'}<br>CPF/CNPJ: ${f.cpfCnpj ?? '___________________________'}</p></div>
</div>
<div style="margin-top:36px;font-size:11px">
  <p><strong>Testemunha 1:</strong> ___________________________ &nbsp; CPF: ______________</p>
  <p style="margin-top:8px"><strong>Testemunha 2:</strong> ___________________________ &nbsp; CPF: ______________</p>
</div>

<!-- ANEXO I -->
<div class="quebra"></div>
<div class="at">Termo de Ciência Técnica</div>
<p style="text-align:center;font-size:11px;color:#555">Anexo I ao Contrato de Compra, Venda e Instalação de Sistema de Geração Fotovoltaica</p>
<p>Este Termo tem por finalidade registrar, de forma clara, específica e destacada, informações técnicas essenciais sobre o Sistema de Geração Fotovoltaica objeto do contrato principal, das quais o COMPRADOR declara ter pleno conhecimento antes da assinatura do referido contrato, nos termos dos artigos 6º, III, e 46 do Código de Defesa do Consumidor.</p>
<p><strong>Contrato vinculado:</strong> ${ref} &nbsp;|&nbsp; <strong>COMPRADOR(A):</strong> ${f.nomeCompleto ?? '___________________________'}</p>
<p><strong>Local de instalação:</strong> ${endInst}</p>
<p><strong>Data da vistoria técnica:</strong> _____/_____/_______</p>

<h3>1. Responsabilidade pelo Local de Instalação</h3>
<p><span class="ck">&nbsp;</span> Declaro estar ciente de que o objeto do contrato é a venda e instalação de um sistema de geração fotovoltaica, e que a verificação e o fornecimento de um local de instalação (telhado ou estrutura) apto, seguro e estruturalmente adequado são de minha exclusiva responsabilidade, não integrando o escopo do contrato qualquer intervenção ou reforço estrutural na edificação.</p>
<p><span class="ck">&nbsp;</span> Declaro estar ciente de que a VENDEDORA não se responsabiliza por vícios ocultos ou problemas estruturais preexistentes no local de instalação.</p>

<h3>2. Natureza Estimativa da Geração de Energia</h3>
<p>Declaro estar ciente de que:</p>
<ul>
  <li>A potência contratada é expressa em kWp (capacidade nominal de geração do equipamento), e não em kWh (energia efetivamente gerada);</li>
  <li>Qualquer estimativa de geração ou de economia constante da proposta comercial é referencial e projetiva, calculada a partir das condições do local verificadas na vistoria técnica e do meu perfil de consumo declarado, não constituindo garantia de resultado;</li>
  <li>A alteração futura do meu perfil de consumo de energia elétrica (aumento ou redução) impacta diretamente o resultado de economia observado, sem que isso configure falha do Sistema.</li>
</ul>
<p><span class="ck">&nbsp;</span> Declaro estar ciente da natureza estimativa da geração informada, nos termos acima.</p>

<h3>3. Fatores que Podem Afetar o Desempenho do Sistema</h3>
<p>Declaro estar ciente de que o desempenho real do Sistema pode ser influenciado pelos seguintes fatores, entre outros, alheios ao controle da VENDEDORA:</p>
<ul>
  <li>Sombreamento e obstáculos (árvores, construções vizinhas, antenas, caixas d'água e similares), inclusive os que venham a surgir após a instalação;</li>
  <li>Sujidade sobre os módulos fotovoltaicos (poeira, fuligem, folhas, dejetos de animais), que reduz a incidência de radiação solar sobre as células;</li>
  <li>Variação sazonal da irradiação solar ao longo do ano e condições climáticas (nebulosidade, chuvas prolongadas);</li>
  <li>Orientação geográfica (azimute) e inclinação do telhado ou local disponibilizado para instalação.</li>
</ul>
<p><span class="ck">&nbsp;</span> Declaro estar ciente de que os fatores acima podem interferir na geração do Sistema, sem que isso configure vício ou defeito do produto ou serviço.</p>

<h3>4. Manutenção e Limpeza — Fora do Escopo Contratual</h3>
<p>Declaro estar ciente de que:</p>
<ul>
  <li>A manutenção preventiva e a limpeza periódica dos módulos fotovoltaicos são de minha responsabilidade;</li>
  <li>Esse serviço não está incluído no escopo do contrato principal, podendo ser contratado separadamente, caso eu tenha interesse.</li>
</ul>
<p><span class="ck">&nbsp;</span> Declaro estar ciente de que a manutenção/limpeza não integra o escopo do contrato.</p>

<h3>5. Declaração Final</h3>
<p>Declaro ter lido e compreendido integralmente as informações técnicas descritas neste Termo, tendo tido a oportunidade de esclarecer todas as dúvidas junto à VENDEDORA antes da assinatura do contrato principal. Este Termo é parte integrante e inseparável do contrato de compra, venda e instalação de sistema de geração fotovoltaica firmado entre as partes.</p>
<p>Local e data: Araraquara/SP, ${hoje}.</p>
<div class="assin">
  <div class="ab"><div class="al"></div><p>COMPRADOR(A)<br>${f.nomeCompleto ?? '___________________________'}<br>CPF/CNPJ: ${f.cpfCnpj ?? '___________________________'}</p></div>
  <div class="ab"><div class="al"></div><p>VENDEDORA (representante)<br>F. R. C. CINTRA — CNPJ 33.071.872/0001-08</p></div>
</div>

<!-- ANEXO II -->
<div class="quebra"></div>
<div class="at">Anexo II — Quadro de Garantia dos Equipamentos</div>
<p style="text-align:center;font-size:11px;color:#555">Anexo ao Contrato de Compra, Venda e Instalação de Sistema de Geração Fotovoltaica</p>
<p>Os equipamentos listados abaixo são fornecidos com as garantias dos respectivos fabricantes, conforme termos oficiais vigentes na data da contratação.</p>
<p><strong>Contrato vinculado:</strong> ${ref} &nbsp;|&nbsp; <strong>COMPRADOR(A):</strong> ${f.nomeCompleto ?? '___________________________'}</p>

<h3>1. Inversor / Microinversor</h3>
<table style="font-size:10px">
  <colgroup><col style="width:18%"><col style="width:36%"><col style="width:23%"><col style="width:23%"></colgroup>
  <tr><th>Marca</th><th>Modelo</th><th>Garantia Fornecedor</th><th>Garantia Fábrica</th></tr>
  <tr>
    <td>${f.modeloInversor ? f.modeloInversor.split(' ')[0] : '___'}</td>
    <td>${f.modeloInversor ?? '___________________________'}</td>
    <td>${invfab?.garantiaFornecedor ?? '—'}</td>
    <td>${invfab?.garantiaFabrica ?? '5 anos'}</td>
  </tr>
</table>

<h3>2. Módulos Fotovoltaicos</h3>
<table style="font-size:10px">
  <colgroup><col style="width:16%"><col style="width:32%"><col style="width:18%"><col style="width:18%"><col style="width:16%"></colgroup>
  <tr><th>Marca</th><th>Modelo</th><th>Gar. Fornecedor</th><th>Gar. Fábrica</th><th>Gar. Desempenho</th></tr>
  <tr>
    <td>${f.modeloPainel ? f.modeloPainel.split(' ')[0] : '___'}</td>
    <td>${f.modeloPainel ?? '___________________________'}</td>
    <td>${modfab?.garantiaFornecedor ?? '—'}</td>
    <td>${modfab?.garantiaFabrica ?? '12 anos'}</td>
    <td>${modfab?.garantiaDesempenho ?? '25 anos'}</td>
  </tr>
</table>
<p style="font-size:9px;color:#666;margin-top:4px">Data de verificação: ${hoje} &nbsp;|&nbsp; Fonte: NF e termo oficial do fabricante</p>

<h3>3. Estrutura de Fixação e Demais Componentes</h3>
<table>
  <tr><th>Item</th><th>Marca / Fornecedor</th><th>Prazo de Garantia</th><th>Observação</th></tr>
  <tr><td>Estrutura de fixação</td><td>${f.tipoEstrutura ?? '___'}</td><td>_____ anos</td><td>—</td></tr>
</table>

<h3>4. Esclarecimentos sobre os Tipos de Garantia</h3>
<p><strong>Garantia de Produto:</strong> cobre defeitos de fabricação e materiais dos módulos fotovoltaicos.</p>
<p><strong>Garantia de Desempenho (linear):</strong> garante uma potência mínima de saída ao longo dos anos, tipicamente entre 80% e 87% da potência nominal ao final do prazo.</p>
<p style="font-size:9.5pt;color:#444">Os prazos informados correspondem aos termos oficiais do fabricante vigentes na data de emissão da nota fiscal.</p>

<p>Local e data: Araraquara/SP, ${hoje}.</p>
<div class="assin">
  <div class="ab"><div class="al"></div><p>COMPRADOR(A)<br>${f.nomeCompleto ?? '___________________________'}<br>CPF/CNPJ: ${f.cpfCnpj ?? '___________________________'}</p></div>
  <div class="ab"><div class="al"></div><p>VENDEDORA (representante)<br>F. R. C. CINTRA — CNPJ 33.071.872/0001-08</p></div>
</div>

</div>
<div id="toolbar" style="position:fixed;top:14px;right:18px;z-index:9999;display:flex;gap:8px;font-family:Arial,sans-serif">
  <button onclick="var t=document.getElementById('toolbar');t.style.display='none';window.print();setTimeout(()=>{t.style.display='flex'},800)" style="background:#374151;color:#fff;border:none;padding:9px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)">⬇ Salvar como PDF</button>
  <button id="btnSign" style="background:#7c3aed;color:#fff;border:none;padding:9px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)">✉ Enviar p/ Assinatura</button>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
(function(){
  var btn = document.getElementById('btnSign');
  var signerName  = ${JSON.stringify(f.nomeCompleto ?? 'Cliente')};
  var signerEmail = ${JSON.stringify(f.email ?? '')};
  var signerPhone = ${JSON.stringify(f.telefone ?? '')};
  var dealId      = ${JSON.stringify(dealId ?? 'doc-avulso')};
  var filename    = 'Contrato-${ref}-' + signerName.replace(/\\s+/g,'-') + '.pdf';

  btn.addEventListener('click', function(){
    if (!signerEmail) { alert('E-mail do cliente não preenchido na ficha.'); return; }
    btn.disabled = true;
    btn.textContent = 'Gerando PDF…';
    var sheet = document.querySelector('.sheet');
    html2pdf().set({
      margin: 0,
      image: {type:'jpeg',quality:0.98},
      html2canvas: {scale:2,useCORS:true,allowTaint:true,logging:false},
      jsPDF: {unit:'mm',format:'a4',orientation:'portrait'}
    }).from(sheet).toPdf().get('pdf').then(function(pdf){
      btn.textContent = 'Enviando…';
      var base64 = pdf.output('datauristring').split(',')[1];
      return fetch('/api/clicksign/send', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({
          dealId: dealId,
          pdfBase64: base64,
          filename: filename,
          signerName: signerName,
          signerEmail: signerEmail,
          signerPhone: signerPhone || undefined,
          companySignerName: 'F.R.C Cintra',
          companySignerEmail: 'fcintra4@hotmail.com'
        })
      });
    }).then(function(resp){
      return resp.json().then(function(d){ return {ok:resp.ok, d:d}; });
    }).then(function(r){
      if(r.ok){
        btn.style.background='#16a34a';
        btn.textContent='✓ Enviado! Ambos receberão e-mail da ClickSign.';
      } else {
        btn.disabled=false;
        btn.style.background='#dc2626';
        btn.textContent='✗ ' + (r.d.error||'Erro ao enviar');
        setTimeout(function(){ btn.style.background='#7c3aed'; btn.textContent='✉ Enviar p/ Assinatura'; },4000);
      }
    }).catch(function(e){
      btn.disabled=false;
      btn.style.background='#dc2626';
      btn.textContent='✗ Erro: ' + e.message;
      setTimeout(function(){ btn.style.background='#7c3aed'; btn.textContent='✉ Enviar p/ Assinatura'; },4000);
    });
  });
})();
</script>
</body></html>`;
    janela.document.write(html);
    janela.document.close();
  };

  const f = ficha;
  const hoje = new Date().toLocaleDateString('pt-BR');
  const valorFmt = dealValue != null ? BRL.format(dealValue) : (f.valorTotal != null ? BRL.format(f.valorTotal) : '___________');

  return (
    <div className="rounded-xl border border-white/10 bg-white/2">
      {/* Header */}
      <button
        type="button"
        onClick={() => setAberta(a => !a)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/3 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-1.5 flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <ClipboardList className="h-3.5 w-3.5" />
          Ficha do Cliente
          {contratoAssinado
            ? <span className="ml-1 text-[9px] bg-emerald-500/25 text-emerald-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" /> Contrato assinado</span>
            : isWon && <span className="ml-1 text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full">Contrato disponível</span>
          }
        </div>
        {aberta ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
      </button>

      {aberta && (
        <div className="border-t border-white/10 px-3 py-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              {/* Ações */}
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExtrair}
                  disabled={extracting}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-50"
                >
                  {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {extracting ? 'Extraindo...' : 'Extrair da conversa (IA)'}
                </button>

                <button
                  type="button"
                  onClick={handleAbrirSeletorOrc}
                  disabled={extractingOrc || loadingOrcList || (!dealId && !contactId)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${showOrcPicker ? 'border-orange-400/50 bg-orange-500/20 text-orange-200' : 'border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/15'}`}
                  title="Selecionar orçamento do OrçaFácil para importar dados"
                >
                  {loadingOrcList || extractingOrc ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
                  {loadingOrcList ? 'Buscando...' : extractingOrc ? 'Importando...' : 'Extrair do Orçamento'}
                </button>
                {orcMsg === 'ok' && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Dados importados!
                  </span>
                )}
                {orcMsg === 'error' && (
                  <span className="flex items-center gap-1 text-[10px] text-rose-400">
                    <XCircle className="h-3 w-3 shrink-0" /> {orcError || 'Falha ao buscar orçamentos.'}
                  </span>
                )}
                {/* Seletor de orçamentos */}
                {showOrcPicker && (
                  <div className="w-full mt-1 rounded-lg border border-orange-500/20 bg-[#0f1a24] overflow-hidden">
                    <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400/70 border-b border-orange-500/15">
                      Selecione o orçamento
                    </div>
                    {orcList.length > 0 ? orcList.map(orc => {
                      const statusColor = orc.status === 'fechado' ? 'text-emerald-400' : orc.status === 'enviado' ? 'text-amber-400' : 'text-slate-500';
                      const statusLabel = orc.status === 'fechado' ? 'Fechado' : orc.status === 'enviado' ? 'Enviado' : 'Rascunho';
                      const data = new Date(orc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
                      const valor = orc.valor_final ? orc.valor_final.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
                      return (
                        <button
                          key={orc.id}
                          type="button"
                          onClick={() => handleExtrairOrcamento(orc)}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 hover:bg-orange-500/10 transition-colors border-b border-white/5 last:border-0 text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-slate-100 truncate">{orc.cliente_nome}</p>
                            <p className="text-[10px] text-slate-400">{orc.potencia_kwp} kWp · {valor} · {data}</p>
                          </div>
                          <span className={`text-[10px] font-medium shrink-0 ${statusColor}`}>{statusLabel}</span>
                        </button>
                      );
                    }) : (
                      <p className="px-2.5 py-2 text-[11px] text-slate-500">Nenhum orçamento encontrado para este contato.</p>
                    )}
                    {/* Opção de anexar PDF do orçamento */}
                    <div className="border-t border-white/8 px-2.5 py-2 flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-600 mr-0.5">ou</span>
                      <input
                        ref={pdfOrcRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setShowOrcPicker(false);
                            void handleExtrairContrato(file);
                          }
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => pdfOrcRef.current?.click()}
                        className="flex items-center gap-1 text-[11px] text-orange-300/80 hover:text-orange-300 transition-colors"
                      >
                        <Upload className="h-3 w-3" />
                        Anexar PDF do orçamento
                      </button>
                    </div>
                  </div>
                )}

                {/* Extração via contrato PDF */}
                <input
                  ref={pdfContratoRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleExtrairContrato(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => pdfContratoRef.current?.click()}
                  disabled={extractingPdf}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/15 disabled:opacity-50"
                  title="Faça upload do contrato assinado (PDF) para extrair os dados automaticamente"
                >
                  {extractingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanSearch className="h-3 w-3" />}
                  {extractingPdf ? 'Lendo contrato...' : 'Extrair do contrato (PDF)'}
                </button>
                {pdfExtractMsg === 'ok' && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Dados extraídos com sucesso!
                  </span>
                )}
                {pdfExtractMsg === 'error' && (
                  <span className="flex flex-col gap-0.5 text-[10px] text-rose-400">
                    <span className="flex items-center gap-1"><XCircle className="h-3 w-3 shrink-0" /> Falha ao ler o contrato.</span>
                    {pdfExtractError && <span className="pl-4 text-rose-300/70">{pdfExtractError}</span>}
                  </span>
                )}
                {dealId && (
                  <button
                    type="button"
                    onClick={handleSalvar}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    {saved ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    {saved ? 'Salvo!' : 'Salvar ficha'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBaixarFicha}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
                >
                  <Download className="h-3 w-3" /> Baixar ficha PDF
                </button>
                <button
                  type="button"
                  onClick={handleGerarContrato}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/15"
                >
                  <FileText className="h-3 w-3" /> Gerar contrato
                </button>
                {/* Enviar para Assinatura Digital (ClickSign) */}
                <div className="w-full mt-1 pt-2 border-t border-white/5 space-y-2">
                  {/* Inputs ocultos */}
                  <input ref={pdfRefCs}   type="file" accept=".pdf" className="hidden"
                    onChange={e => { setPdfFileCs(e.target.files?.[0] ?? null); setSendResultCs(null); }} />
                  <input ref={pdfRefProc} type="file" accept=".pdf" className="hidden"
                    onChange={e => { setPdfFileProc(e.target.files?.[0] ?? null); setSendResultCs(null); }} />

                  {/* Toggle procuração */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setInclProc(v => !v); setPdfFileProc(null); setSendResultCs(null); }}
                      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors ${inclProc ? 'bg-amber-500 border-amber-400' : 'bg-white/10 border-white/20'}`}
                    >
                      <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${inclProc ? 'translate-x-3' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="text-[11px] text-slate-400">Incluir Procuração</span>
                    {inclProc && (
                      <label className="flex items-center gap-1 ml-1 text-[10px] text-slate-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={procAvulsa}
                          onChange={e => setProcAvulsa(e.target.checked)}
                          className="accent-amber-500 h-3 w-3"
                        />
                        Envelope separado
                      </label>
                    )}
                  </div>

                  {/* Upload procuração (aparece só quando toggle ON) */}
                  {inclProc && (
                    <div className="flex items-center gap-1.5 flex-wrap pl-1">
                      <button
                        type="button"
                        onClick={handleAbrirProcuracao}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/15"
                      >
                        <FileText className="h-3 w-3" /> Gerar Procuração
                      </button>
                      <button
                        type="button"
                        onClick={() => pdfRefProc.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/8 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/12"
                      >
                        <Upload className="h-3 w-3" />
                        {pdfFileProc ? pdfFileProc.name.slice(0, 18) + (pdfFileProc.name.length > 18 ? '…' : '') : 'PDF da Procuração'}
                      </button>
                    </div>
                  )}

                  {/* Upload contrato + botão enviar */}
                  <div className="flex gap-1.5 items-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => pdfRefCs.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/15"
                    >
                      <Upload className="h-3 w-3" />
                      {pdfFileCs ? pdfFileCs.name.slice(0, 18) + (pdfFileCs.name.length > 18 ? '…' : '') : 'PDF do Contrato'}
                    </button>
                    <button
                      type="button"
                      onClick={handleEnviarAssinatura}
                      disabled={!pdfFileCs || sendingCs}
                      className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-purple-300 hover:bg-purple-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sendingCs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      {sendingCs ? 'Enviando…' : 'Enviar p/ Assinatura'}
                    </button>
                  </div>

                  {sendResultCs === 'ok' && (
                    <p className="text-[10px] text-emerald-400 flex items-center gap-1 flex-wrap">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      Enviado! {ficha.nomeCompleto} e você receberão e-mail da ClickSign.
                      {inclProc && procAvulsa && ' (Procuração em envelope separado.)'}
                      {csEnvelopeKey && (
                        <a
                          href={`https://app.clicksign.com/sign/${csEnvelopeKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 underline text-emerald-300 hover:text-emerald-200"
                        >
                          Ver contrato →
                        </a>
                      )}
                    </p>
                  )}
                  {sendResultCs === 'error' && (
                    <p className="text-[10px] text-red-400 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> {sendErrorCs}
                    </p>
                  )}
                </div>

                {dealId && !contratoAssinado && (
                  <button
                    type="button"
                    onClick={handleMarcarContratoAssinado}
                    disabled={marcandoContrato}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-600/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-600/25 disabled:opacity-50"
                  >
                    {marcandoContrato ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Marcar contrato como assinado
                  </button>
                )}
                {contratoAssinado && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Contrato assinado
                    </div>
                    {csEnvelopeKey && (
                      <a
                        href={`https://app.clicksign.com/sign/${csEnvelopeKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-slate-600/40 bg-slate-700/30 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" /> Ver contrato
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleGerarOS}
                      className="flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-orange-300 hover:bg-orange-500/25"
                    >
                      <FileText className="h-3 w-3" /> Gerar O.S.
                    </button>
                  </div>
                )}
              </div>

              {/* Campos editáveis */}
              <div className="space-y-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Dados pessoais</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Nome completo" value={toStr(f.nomeCompleto)} onChange={v => setField('nomeCompleto', v)} />
                  <Field label="CPF / CNPJ" value={toStr(f.cpfCnpj)} onChange={v => setField('cpfCnpj', v)} />
                  <Field label="RG" value={toStr(f.rg)} onChange={v => setField('rg', v)} />
                  <Field label="Estado civil" value={toStr(f.estadoCivil)} onChange={v => setField('estadoCivil', v)} />
                  <Field label="Telefone" value={toStr(f.telefone)} onChange={v => setField('telefone', v)} />
                  <Field label="E-mail" value={toStr(f.email)} onChange={v => setField('email', v)} />
                </div>

                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mt-2">Endereço do cliente</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Field label="Rua e número" value={toStr(f.enderecoRua)} onChange={v => setField('enderecoRua', v)} />
                  </div>
                  <Field label="Bairro" value={toStr(f.enderecoBairro)} onChange={v => setField('enderecoBairro', v)} />
                  <Field label="CEP" value={toStr(f.enderecoCep)} onChange={v => setField('enderecoCep', v)} />
                  <Field label="Cidade" value={toStr(f.enderecoCidade)} onChange={v => setField('enderecoCidade', v)} />
                  <Field label="Estado (UF)" value={toStr(f.enderecoEstado)} onChange={v => setField('enderecoEstado', v)} />
                </div>

                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mt-2">Local de instalação</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Field label="Endereço (se diferente)" value={toStr(f.instalacaoEndereco)} onChange={v => setField('instalacaoEndereco', v)} />
                  </div>
                  <Field label="Cidade instalação" value={toStr(f.instalacaoCidade)} onChange={v => setField('instalacaoCidade', v)} />
                  <Field label="Tipo de imóvel" value={toStr(f.instalacaoTipoImovel)} onChange={v => setField('instalacaoTipoImovel', v)} />
                  <Field label="Telhado" value={toStr(f.instalacaoTelhado)} onChange={v => setField('instalacaoTelhado', v)} />
                  <Field label="Fases elétricas" value={toStr(f.instalacaoFases)} onChange={v => setField('instalacaoFases', v)} />
                  <Field label="Disjuntor (A)" value={toStr(f.instalacaoDisjuntor)} onChange={v => setField('instalacaoDisjuntor', v)} />
                </div>

                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mt-2">Sistema solar</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Potência kWp" value={toStr(f.potenciaKwp)} onChange={v => setField('potenciaKwp', v)} />
                  <Field label="Nº de painéis" value={toStr(f.numPaineis)} onChange={v => setField('numPaineis', v)} />
                  <Field label="Modelo do painel" value={toStr(f.modeloPainel)} onChange={v => setField('modeloPainel', v)} />
                  <Field label="Potência painel (W)" value={toStr(f.potenciaPainelW)} onChange={v => setField('potenciaPainelW', v)} />
                  <Field label="Modelo do inversor" value={toStr(f.modeloInversor)} onChange={v => setField('modeloInversor', v)} />
                  <Field label="Tipo inversor" value={toStr(f.tipoInversor)} onChange={v => setField('tipoInversor', v)} />
                  <Field label="Qtd inversores" value={toStr(f.qtdInversores)} onChange={v => setField('qtdInversores', v)} />
                  <Field label="Estrutura" value={toStr(f.tipoEstrutura)} onChange={v => setField('tipoEstrutura', v)} />
                </div>

                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mt-2">Condições comerciais</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Valor total (R$)" value={toStr(f.valorTotal ?? dealValue)} onChange={v => setField('valorTotal', v)} />
                  <Field label="Forma de pagamento" value={toStr(f.formaPagamento)} onChange={v => setField('formaPagamento', v)} />
                  <div className="col-span-2">
                    <Field label="Condições / parcelas" value={toStr(f.condicoesPagamento)} onChange={v => setField('condicoesPagamento', v)} />
                  </div>
                  <Field label="Prazo de entrega/instalação" value={toStr(f.prazoEntrega)} onChange={v => setField('prazoEntrega', v)} />
                  <Field label="Distribuidora" value={toStr(f.distribuidora)} onChange={v => setField('distribuidora', v)} />
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 mb-0.5">Observações</div>
                  <textarea
                    value={toStr(f.observacoes)}
                    onChange={e => setField('observacoes', e.target.value)}
                    rows={2}
                    className={inp + ' resize-none'}
                    placeholder="—"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Template da FICHA (oculto, usado para impressão) */}
      <div ref={printRef} style={{ display: 'none' }}>
        <h1>Ficha do Cliente – {dealTitle ?? f.nomeCompleto ?? '—'}</h1>
        <p style={{ color: '#666', fontSize: 11 }}>Emitida em {hoje}</p>

        <h2>Dados Pessoais</h2>
        <div className="grid2">
          <div className="campo"><div className="label">Nome completo</div><div className="valor">{f.nomeCompleto ?? '—'}</div></div>
          <div className="campo"><div className="label">CPF / CNPJ</div><div className="valor">{f.cpfCnpj ?? '—'}</div></div>
          <div className="campo"><div className="label">RG</div><div className="valor">{f.rg ?? '—'}</div></div>
          <div className="campo"><div className="label">Estado civil</div><div className="valor">{f.estadoCivil ?? '—'}</div></div>
          <div className="campo"><div className="label">Telefone</div><div className="valor">{f.telefone ?? '—'}</div></div>
          <div className="campo"><div className="label">E-mail</div><div className="valor">{f.email ?? '—'}</div></div>
        </div>

        <h2>Endereço do Cliente</h2>
        <div className="grid2">
          <div className="campo"><div className="label">Rua e número</div><div className="valor">{f.enderecoRua ?? '—'}</div></div>
          <div className="campo"><div className="label">Bairro</div><div className="valor">{f.enderecoBairro ?? '—'}</div></div>
          <div className="campo"><div className="label">Cidade</div><div className="valor">{f.enderecoCidade ?? '—'}</div></div>
          <div className="campo"><div className="label">Estado</div><div className="valor">{f.enderecoEstado ?? '—'}</div></div>
          <div className="campo"><div className="label">CEP</div><div className="valor">{f.enderecoCep ?? '—'}</div></div>
        </div>

        <h2>Local de Instalação</h2>
        <div className="grid2">
          <div className="campo"><div className="label">Endereço</div><div className="valor">{f.instalacaoEndereco ?? f.enderecoRua ?? '—'}</div></div>
          <div className="campo"><div className="label">Cidade</div><div className="valor">{f.instalacaoCidade ?? f.enderecoCidade ?? '—'}</div></div>
          <div className="campo"><div className="label">Tipo de imóvel</div><div className="valor">{f.instalacaoTipoImovel ?? '—'}</div></div>
          <div className="campo"><div className="label">Telhado</div><div className="valor">{f.instalacaoTelhado ?? '—'}</div></div>
          <div className="campo"><div className="label">Fases elétricas</div><div className="valor">{f.instalacaoFases ?? '—'}</div></div>
          <div className="campo"><div className="label">Disjuntor</div><div className="valor">{f.instalacaoDisjuntor ?? '—'}</div></div>
        </div>

        <h2>Sistema Solar</h2>
        <div className="grid3">
          <div className="campo"><div className="label">Potência kWp</div><div className="valor">{f.potenciaKwp ?? '—'}</div></div>
          <div className="campo"><div className="label">Nº painéis</div><div className="valor">{f.numPaineis ?? '—'}</div></div>
          <div className="campo"><div className="label">Modelo painel</div><div className="valor">{f.modeloPainel ?? '—'}</div></div>
          <div className="campo"><div className="label">Potência painel (W)</div><div className="valor">{f.potenciaPainelW ?? '—'}</div></div>
          <div className="campo"><div className="label">Inversor</div><div className="valor">{f.modeloInversor ?? '—'}</div></div>
          <div className="campo"><div className="label">Tipo inversor</div><div className="valor">{f.tipoInversor ?? '—'}</div></div>
          <div className="campo"><div className="label">Qtd inversores</div><div className="valor">{f.qtdInversores ?? '—'}</div></div>
          <div className="campo"><div className="label">Estrutura</div><div className="valor">{f.tipoEstrutura ?? '—'}</div></div>
        </div>

        <h2>Condições Comerciais</h2>
        <div className="grid2">
          <div className="campo"><div className="label">Valor total</div><div className="valor total">{valorFmt}</div></div>
          <div className="campo"><div className="label">Forma de pagamento</div><div className="valor">{f.formaPagamento ?? '—'}</div></div>
          <div className="campo"><div className="label">Condições / parcelas</div><div className="valor">{f.condicoesPagamento ?? '—'}</div></div>
          <div className="campo"><div className="label">Prazo instalação</div><div className="valor">{f.prazoEntrega ?? '—'}</div></div>
          <div className="campo"><div className="label">Consumo mensal (kWh)</div><div className="valor">{f.consumoMensalKwh ?? '—'}</div></div>
          <div className="campo"><div className="label">Distribuidora</div><div className="valor">{f.distribuidora ?? '—'}</div></div>
        </div>

        {f.observacoes && (
          <>
            <h2>Observações</h2>
            <p>{f.observacoes}</p>
          </>
        )}
      </div>

    </div>
  );
};
