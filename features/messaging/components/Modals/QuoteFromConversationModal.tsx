'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, Loader2, ExternalLink, Sparkles, ChevronDown, ChevronUp, Paperclip, Receipt, User, Users } from 'lucide-react';
import { useBoards, useCreateDeal } from '@/lib/query/hooks';
import { useAuth } from '@/context/AuthContext';
import { orgSettingsService, OrgCostSettings } from '@/lib/supabase/orgSettings';
import { dealCostsService, calcEngCost, calcComissaoPct, calcNfCost } from '@/lib/supabase/dealCosts';
import type { ConversationView } from '@/lib/messaging/types';

interface SolarExtracted {
  kwhMonth: number | null;
  city: string | null;
  state: string | null;
  distributor: string | null;
  currentBillValue: number | null;
  systemPowerKwp: number | null;
  observations: string | null;
  confidence: number;
}

interface SupplierData {
  kitTotalPrice: number | null;
  systemPowerKwp: number | null;
  panelBrand: string | null;
  panelModel: string | null;
  panelWatts: number | null;
  panelQty: number | null;
  inverterType: 'micro' | 'string' | null;
  inverterBrand: string | null;
  inverterModel: string | null;
  inverterQty: number | null;
  inverterPower: string | null;
  structureType: string | null;
  freightCost: number | null;
  warranty: string | null;
  observations: string | null;
}

interface QuoteFromConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationView;
}

function makeTitle(name: string): string {
  const now = new Date();
  const date = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Orçamento — ${name} (${date} ${time})`;
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseFlt(s: string): number {
  if (!s) return 0;
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s) || 0;
}

function fmtMoeda(v: number): string {
  if (!v) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function blurFmt(val: string, setter: (v: string) => void) {
  const n = parseFlt(val);
  setter(n > 0 ? fmtMoeda(n) : '');
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const defaultCfg: OrgCostSettings = {
  custoArt: 0, custoNfKitPct: 4, custoNfServicoPct: 6,
  custoEng1a3kwp: 350, custoEng3a5kwp: 450, custoEngAcima5kwp: 600,
  custoCorrugado: 0, custoEletroduto: 0, custoComissaoPct: 5, custoComissaoAcima5kwpPct: 7,
};

const inp = 'w-full rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/5 px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400';
const inpPre = 'pl-8 ' + inp;
const inpSuf = 'pr-8 ' + inp;

export function QuoteFromConversationModal({ isOpen, onClose, conversation }: QuoteFromConversationModalProps) {
  const { data: boards = [] } = useBoards();
  const createDeal = useCreateDeal();
  const { profile } = useAuth();

  const contactName = conversation.contactName || conversation.externalContactName || 'Contato';

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [extracted, setExtracted] = useState<SolarExtracted | null>(null);
  const [supplierData, setSupplierData] = useState<SupplierData | null>(null);
  const [showExtracted, setShowExtracted] = useState(true);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [supplierAnalyzing, setSupplierAnalyzing] = useState(false);
  const [supplierError, setSupplierError] = useState('');

  const [dealTitle, setDealTitle] = useState(makeTitle(contactName));

  // Configurações da org
  const [orgCfg, setOrgCfg] = useState<OrgCostSettings>(defaultCfg);
  const [cfgLoaded, setCfgLoaded] = useState(false);

  // Custos internos
  const [tipoVenda, setTipoVenda] = useState<'propria' | 'vendedor'>('vendedor');
  const [custoNfTipo, setCustoNfTipo] = useState<'kit' | 'servico'>('kit');
  const [custoArt, setCustoArt] = useState('');
  const [custoEngenharia, setCustoEngenharia] = useState('');
  const [custoCorrugado, setCustoCorrugado] = useState('');
  const [custoEletroduto, setCustoEletroduto] = useState('');
  const [custoFornecedor, setCustoFornecedor] = useState('');
  const [custoComissaoPct, setCustoComissaoPct] = useState('');

  // Custo instalação e extras nomeados
  const [custoInstalacao, setCustoInstalacao] = useState('');
  const [custosAdicionais, setCustosAdicionais] = useState<{ nome: string; valor: string }[]>([]);

  // Valor de venda e margem
  const [valorBase, setValorBase] = useState('');
  const [margemDesejada, setMargemDesejada] = useState('');
  const [descontoPct, setDescontoPct] = useState('');
  const [descontoReais, setDescontoReais] = useState('');

  // Carrega config ao abrir
  useEffect(() => {
    if (!isOpen) return;
    setError(''); setExtracted(null); setSupplierData(null);
    setAiError(''); setSupplierError('');
    setBillFile(null); setSupplierFile(null);
    setValorBase(''); setMargemDesejada('');
    setDescontoPct(''); setDescontoReais('');
    setCustoInstalacao(''); setCustosAdicionais([]);
    setCustoEngenharia(''); setCustoFornecedor('');
    setCfgLoaded(false);
    setDealTitle(makeTitle(contactName));

    orgSettingsService.getCostSettings().then(({ data }) => {
      const cfg = data ?? defaultCfg;
      setOrgCfg(cfg);
      setCustoArt(cfg.custoArt > 0 ? fmtMoeda(cfg.custoArt) : '');
      setCustoCorrugado(cfg.custoCorrugado > 0 ? fmtMoeda(cfg.custoCorrugado) : '');
      setCustoEletroduto(cfg.custoEletroduto > 0 ? fmtMoeda(cfg.custoEletroduto) : '');
      setCustoComissaoPct(String(cfg.custoComissaoPct));
      setCfgLoaded(true);
    });
  }, [isOpen, contactName]);

  // Auto-seleciona engenharia e comissão quando kWp muda (conversa IA ou PDF fornecedor)
  useEffect(() => {
    if (!cfgLoaded) return;
    const kwp = extracted?.systemPowerKwp ?? supplierData?.systemPowerKwp ?? 0;
    if (kwp > 0) {
      setCustoEngenharia(fmtMoeda(calcEngCost(kwp, orgCfg)));
      setCustoComissaoPct(String(calcComissaoPct(kwp, orgCfg)));
    }
  }, [extracted?.systemPowerKwp, supplierData?.systemPowerKwp, orgCfg, cfgLoaded]);

  // Preenche valor final de venda a partir do PDF do fornecedor
  useEffect(() => {
    if (supplierData?.kitTotalPrice != null && supplierData.kitTotalPrice > 0) {
      setValorBase(fmtMoeda(supplierData.kitTotalPrice));
      setMargemDesejada('');
    }
  }, [supplierData]);

  if (!isOpen) return null;

  const salesBoard = boards.find((b: any) => b.template === 'SALES') ?? boards.find((b: any) => b.isDefault) ?? boards[0];
  const firstStage = (salesBoard as any)?.stages?.[0];

  const kwp = extracted?.systemPowerKwp ?? supplierData?.systemPowerKwp ?? 0;
  const nfPct = custoNfTipo === 'kit' ? orgCfg.custoNfKitPct : orgCfg.custoNfServicoPct;
  const comPct = tipoVenda === 'propria' ? 0 : parseFlt(custoComissaoPct);

  // Cálculos de margem
  const valorBaseNum = parseFlt(valorBase);
  const descontoPctNum = parseFlt(descontoPct);
  const descontoReaisNum = parseFlt(descontoReais);
  const valorFinalVenda = descontoPctNum > 0
    ? valorBaseNum * (1 - descontoPctNum / 100)
    : valorBaseNum - descontoReaisNum;

  const custoFornecedorNum = parseFlt(custoFornecedor);
  const custoInstalacaoNum = parseFlt(custoInstalacao);
  const custosAdicionaisTotal = custosAdicionais.reduce((s, e) => s + parseFlt(e.valor), 0);
  const nfPreview = valorFinalVenda > 0 ? calcNfCost(valorFinalVenda, custoNfTipo, orgCfg, custoFornecedorNum) : 0;
  const totalCustos = nfPreview + parseFlt(custoArt) + parseFlt(custoEngenharia) +
    parseFlt(custoCorrugado) + parseFlt(custoEletroduto) + custoFornecedorNum +
    custoInstalacaoNum + custosAdicionaisTotal;
  const comissaoVal = valorFinalVenda * (comPct / 100);
  const lucro = valorFinalVenda - totalCustos - comissaoVal;
  const margem = valorFinalVenda > 0 ? (lucro / valorFinalVenda) * 100 : 0;
  const margemColor = margem >= 20 ? 'text-emerald-600 dark:text-emerald-400' : margem >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  function handleMargemChange(margemPct: string) {
    setMargemDesejada(margemPct);
    const m = parseFlt(margemPct);
    if (m <= 0 || m >= 100) return;

    // Triangulação: custo + margem → valor de venda
    // Fórmula: V = custos_fixos / (1 - NF% - margem% - comissão%)
    const custosFixos = parseFlt(custoArt) + parseFlt(custoEngenharia) +
      parseFlt(custoCorrugado) + parseFlt(custoEletroduto) + parseFlt(custoFornecedor) +
      parseFlt(custoInstalacao) + custosAdicionais.reduce((s, e) => s + parseFlt(e.valor), 0);
    if (custosFixos <= 0) return;
    const divisor = 1 - nfPct / 100 - m / 100 - comPct / 100;
    if (divisor <= 0) return;
    const v = custosFixos / divisor;
    setValorBase(fmtMoeda(v));
    setDescontoPct(''); setDescontoReais('');
  }

  function handleDescontoPctChange(v: string) {
    setDescontoPct(v);
    setDescontoReais('');
    if (valorBaseNum > 0 && parseFlt(v) > 0) {
      const d = valorBaseNum * (parseFlt(v) / 100);
      setDescontoReais(d.toFixed(2).replace('.', ','));
    }
  }

  function handleDescontoReaisChange(v: string) {
    setDescontoReais(v);
    setDescontoPct('');
    if (valorBaseNum > 0 && parseFlt(v) > 0) {
      const pct = (parseFlt(v) / valorBaseNum) * 100;
      setDescontoPct(pct.toFixed(2).replace('.', ','));
    }
  }

  function buildOrcafacilUrl(dealId?: string): string {
    const base = 'https://app-eight-eta-92.vercel.app/novo-orcamento';
    const p = new URLSearchParams();
    if (contactName && contactName !== 'Contato') p.set('cliente', contactName);
    if (conversation.contactPhone) p.set('tel', conversation.contactPhone);
    if (extracted?.city) p.set('cidade', extracted.city);
    if (extracted?.distributor) p.set('distribuidora', extracted.distributor);
    if (extracted?.kwhMonth) p.set('kwh', String(extracted.kwhMonth));
    if (kwp > 0) p.set('kwp', String(kwp));
    if (valorFinalVenda > 0) p.set('valor', String(valorFinalVenda.toFixed(2)));
    // Dados do inversor extraídos do PDF do fornecedor
    if (supplierData?.inverterType) p.set('inversor', supplierData.inverterType);
    if (supplierData?.inverterModel) p.set('modeloInversor', supplierData.inverterModel);
    // Quantidade: usa inverterQty se disponível; para micro sem qty explícita usa panelQty (1 por painel)
    const qtdInv = supplierData?.inverterQty
      ?? (supplierData?.inverterType === 'micro' ? supplierData?.panelQty : 1)
      ?? 1;
    if (supplierData?.inverterModel || supplierData?.inverterType) p.set('qtdInversores', String(qtdInv));
    if (supplierData?.panelWatts != null) p.set('wattsPainel', String(supplierData.panelWatts));
    if (supplierData?.panelQty != null) p.set('paineis', String(supplierData.panelQty));
    if (supplierData?.structureType) p.set('tipoEstrutura', supplierData.structureType);
    if (dealId && profile?.organization_id) {
      p.set('deal', dealId);
      p.set('orgId', profile.organization_id);
      p.set('cburl', `${window.location.origin}/api/orcafacil-callback`);
    }
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  }

  async function handleAIExtract() {
    setAiLoading(true); setAiError('');
    try {
      const payload: Record<string, string> = { conversationId: conversation.id };
      if (billFile) {
        payload.billImageBase64 = await fileToBase64(billFile);
        payload.billImageMimeType = billFile.type || 'image/jpeg';
      }
      const res = await fetch('/api/ai/tasks/quote/solar-extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setAiError(data.error?.message || 'Erro ao analisar.'); return; }
      setExtracted(data.extracted);
      setShowExtracted(true);
    } catch { setAiError('Erro de conexão.'); }
    finally { setAiLoading(false); }
  }

  async function handleAnalyzeSupplier() {
    if (!supplierFile) return;
    setSupplierAnalyzing(true); setSupplierError('');
    try {
      const supplierQuoteBase64 = await fileToBase64(supplierFile);
      const res = await fetch('/api/ai/tasks/quote/solar-extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, supplierQuoteBase64, supplierQuoteMimeType: supplierFile.type || 'application/pdf' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setSupplierError(data.error?.message || 'Erro ao analisar.'); return; }
      if (data.supplierData) setSupplierData(data.supplierData);
    } catch { setSupplierError('Erro de conexão.'); }
    finally { setSupplierAnalyzing(false); }
  }

  async function handleAbrirOrcafacil() {
    setIsCreating(true); setError('');
    try {
      let dealId: string | undefined;
      if (conversation.contactId && salesBoard && firstStage) {
        try {
          const deal = await createDeal.mutateAsync({
            title: dealTitle || makeTitle(contactName),
            contactId: conversation.contactId,
            boardId: (salesBoard as any).id,
            status: (firstStage as any).id,
            value: valorFinalVenda > 0 ? valorFinalVenda : 0,
            items: [], probability: 50, priority: 'medium',
            owner: { name: '', avatar: '' }, tags: [],
          });
          dealId = (deal as any).id;
        } catch { /* segue sem vínculo */ }
      }

      if (dealId) {
        const nf = valorFinalVenda > 0 ? calcNfCost(valorFinalVenda, custoNfTipo, orgCfg, parseFlt(custoFornecedor)) : 0;
        const extrasParaSalvar: { descricao: string; valor: number }[] = [];
        if (custoInstalacaoNum > 0) extrasParaSalvar.push({ descricao: 'Instalação', valor: custoInstalacaoNum });
        custosAdicionais.filter(e => e.nome.trim()).forEach(e => extrasParaSalvar.push({ descricao: e.nome.trim(), valor: parseFlt(e.valor) }));
        await dealCostsService.updateCosts(dealId, {
          custoNfTipo, custoNf: nf,
          custoArt: parseFlt(custoArt),
          custoEngenharia: parseFlt(custoEngenharia),
          custoCorrugado: parseFlt(custoCorrugado),
          custoEletroduto: parseFlt(custoEletroduto),
          custoFornecedor: parseFlt(custoFornecedor),
          custosExtras: extrasParaSalvar,
        });
      }

      window.open(buildOrcafacilUrl(dealId), '_blank');
      onClose();
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao abrir OrçaFácil.');
    } finally { setIsCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Gerar Proposta Solar</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Cliente */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0">Cliente</span>
            <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{contactName}</span>
          </div>

          {/* Análise IA */}
          <div className="rounded-xl border border-primary-200 dark:border-primary-500/30 bg-primary-50 dark:bg-primary-500/5 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                <span className="text-xs font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wide">Análise IA da conversa</span>
              </div>
              <div className="flex items-center gap-2">
                {extracted && (
                  <button type="button" onClick={() => setShowExtracted(v => !v)} className="p-1 text-primary-500">
                    {showExtracted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button type="button" onClick={handleAIExtract} disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white">
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {aiLoading ? 'Analisando…' : extracted ? 'Re-analisar' : 'Analisar'}
                </button>
              </div>
            </div>
            {extracted && showExtracted && (
              <div className="px-4 pb-4 space-y-2 border-t border-primary-200 dark:border-primary-500/20 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  {extracted.systemPowerKwp !== null && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10 col-span-2">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Potência estimada</p>
                      <p className="text-base font-bold text-primary-600 dark:text-primary-400">{extracted.systemPowerKwp} kWp</p>
                    </div>
                  )}
                  {extracted.kwhMonth !== null && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Consumo mensal</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{extracted.kwhMonth} kWh</p>
                    </div>
                  )}
                  {extracted.currentBillValue !== null && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Valor da conta</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{fmtBRL(extracted.currentBillValue)}</p>
                    </div>
                  )}
                  {extracted.city && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cidade</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{extracted.city}{extracted.state ? ` - ${extracted.state}` : ''}</p>
                    </div>
                  )}
                  {extracted.distributor && (
                    <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-white/10">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Distribuidora</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{extracted.distributor}</p>
                    </div>
                  )}
                </div>
                {extracted.observations && <p className="text-xs text-slate-500 dark:text-slate-400 italic">{extracted.observations}</p>}
              </div>
            )}
            {aiError && <p className="px-4 pb-3 text-xs text-red-500">{aiError}</p>}
          </div>

          {/* Conta de energia */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> Conta de energia <span className="normal-case font-normal text-slate-400">(opcional — melhora a extração)</span>
            </label>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-white/20 cursor-pointer hover:border-primary-400">
              <Paperclip className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{billFile ? billFile.name : 'Anexar foto ou PDF da conta'}</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setBillFile(e.target.files?.[0] ?? null)} />
            </label>
            {billFile && <button type="button" onClick={() => setBillFile(null)} className="text-xs text-red-400 hover:text-red-600 mt-1">Remover</button>}
          </div>

          {/* Orçamento do fornecedor */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Orçamento do fornecedor <span className="normal-case font-normal text-slate-400">(custo de referência)</span>
            </label>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-white/20 cursor-pointer hover:border-amber-400">
              <Paperclip className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{supplierFile ? supplierFile.name : 'Anexar PDF do orçamento da fornecedora'}</span>
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => { setSupplierFile(e.target.files?.[0] ?? null); setSupplierData(null); }} />
            </label>
            {supplierFile && (
              <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={handleAnalyzeSupplier} disabled={supplierAnalyzing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 disabled:opacity-50">
                  {supplierAnalyzing ? <><Loader2 className="w-3 h-3 animate-spin" /> Analisando...</> : '⚡ Extrair dados do orçamento'}
                </button>
                <button type="button" onClick={() => { setSupplierFile(null); setSupplierData(null); }} className="text-xs text-red-400 hover:text-red-600">Remover</button>
              </div>
            )}
            {supplierError && <p className="mt-1 text-xs text-red-500">{supplierError}</p>}
            {supplierData && (
              <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 p-3 text-xs space-y-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Dados extraídos:</p>
                {supplierData.kitTotalPrice != null && <div className="flex justify-between"><span className="text-slate-500">Custo total do kit</span><span className="font-semibold">{fmtBRL(supplierData.kitTotalPrice)}</span></div>}
                {supplierData.systemPowerKwp != null && <div className="flex justify-between"><span className="text-slate-500">Potência</span><span className="font-semibold">{supplierData.systemPowerKwp} kWp</span></div>}
                {supplierData.panelBrand && <div className="flex justify-between"><span className="text-slate-500">Painel</span><span className="font-semibold">{[supplierData.panelBrand, supplierData.panelModel, supplierData.panelWatts ? `${supplierData.panelWatts}W` : '', supplierData.panelQty ? `(${supplierData.panelQty}un)` : ''].filter(Boolean).join(' ')}</span></div>}
                {(supplierData.inverterBrand || supplierData.inverterType) && <div className="flex justify-between"><span className="text-slate-500">{supplierData.inverterType === 'micro' ? 'Microinversor' : 'Inversor'}</span><span className="font-semibold">{[supplierData.inverterBrand, supplierData.inverterModel, supplierData.inverterPower ? `${supplierData.inverterPower}` : '', supplierData.inverterQty ? `· ${supplierData.inverterQty}x` : ''].filter(Boolean).join(' ')}</span></div>}
                {supplierData.structureType && <div className="flex justify-between"><span className="text-slate-500">Estrutura</span><span className="font-semibold">{supplierData.structureType}</span></div>}
                {supplierData.warranty && <div className="flex justify-between"><span className="text-slate-500">Garantia</span><span className="font-semibold">{supplierData.warranty}</span></div>}
              </div>
            )}
          </div>

          {/* Título do negócio */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Título do negócio</label>
            <input value={dealTitle} onChange={e => setDealTitle(e.target.value)} className={inp} placeholder="Ex: Proposta Solar — João Silva" />
          </div>

          {/* Custos Internos */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Custos Internos</span>
              <span className="text-[10px] text-slate-400 font-normal normal-case">(não aparecem na proposta)</span>
            </div>

            {/* Tipo de venda */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Tipo de venda</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'vendedor' as const, label: 'Via vendedor', icon: Users, desc: 'Comissão aplicada' },
                  { id: 'propria' as const, label: 'Venda própria', icon: User, desc: 'Sem comissão' },
                ] as const).map(({ id, label, icon: Icon, desc }) => (
                  <button key={id} type="button" onClick={() => setTipoVenda(id)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                      tipoVenda === id
                        ? 'border-primary-400 bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300'
                        : 'border-slate-200 dark:border-white/10 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <div className="text-left">
                      <div>{label}</div>
                      <div className="text-[10px] font-normal opacity-70">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tipo de NF */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Tipo de Nota Fiscal</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'kit' as const, label: 'Total do kit solar', pct: orgCfg.custoNfKitPct, desc: 'sobre o valor total da NF' },
                  { id: 'servico' as const, label: 'Somente serviço', pct: orgCfg.custoNfServicoPct, desc: '% sobre (venda − custo kit)' },
                ] as const).map(({ id, label, pct, desc }) => (
                  <button key={id} type="button" onClick={() => setCustoNfTipo(id)}
                    className={`flex flex-col items-center rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                      custoNfTipo === id
                        ? 'border-primary-400 bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300'
                        : 'border-slate-200 dark:border-white/10 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}>
                    <span>{label}</span>
                    <span className="text-lg font-bold mt-0.5">{pct}%</span>
                    <span className="text-[10px] font-normal opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Campos de custo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Engenharia {kwp > 0 ? `(${kwp} kWp)` : ''}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                  <input type="text" inputMode="decimal" value={custoEngenharia} onChange={e => setCustoEngenharia(e.target.value)} onFocus={e => e.target.select()} onBlur={e => blurFmt(e.target.value, setCustoEngenharia)} className={inpPre} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">ART de Engenharia</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                  <input type="text" inputMode="decimal" value={custoArt} onChange={e => setCustoArt(e.target.value)} onFocus={e => e.target.select()} onBlur={e => blurFmt(e.target.value, setCustoArt)} className={inpPre} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Corrugado</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                  <input type="text" inputMode="decimal" value={custoCorrugado} onChange={e => setCustoCorrugado(e.target.value)} onFocus={e => e.target.select()} onBlur={e => blurFmt(e.target.value, setCustoCorrugado)} className={inpPre} placeholder="0,00" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Eletroduto</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                  <input type="text" inputMode="decimal" value={custoEletroduto} onChange={e => setCustoEletroduto(e.target.value)} onFocus={e => e.target.select()} onBlur={e => blurFmt(e.target.value, setCustoEletroduto)} className={inpPre} placeholder="0,00" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  Custo da fornecedora (kit)
                  {supplierData?.kitTotalPrice ? <span className="ml-1 text-[10px] text-amber-500 font-normal">← extraído do PDF</span> : null}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                  <input type="text" inputMode="decimal" value={custoFornecedor} onChange={e => setCustoFornecedor(e.target.value)} onFocus={e => e.target.select()} onBlur={e => blurFmt(e.target.value, setCustoFornecedor)} className={inpPre} placeholder="0,00" />
                </div>
              </div>
              {/* Custo de Instalação */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Custo de Instalação</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                  <input type="text" inputMode="decimal" value={custoInstalacao} onChange={e => setCustoInstalacao(e.target.value)} onFocus={e => e.target.select()} onBlur={e => blurFmt(e.target.value, setCustoInstalacao)} className={inpPre} placeholder="0,00" />
                </div>
              </div>

              {/* Custos adicionais nomeados */}
              {custosAdicionais.map((item, i) => (
                <div key={i} className="col-span-2 flex gap-2 items-end">
                  <div className="flex-1">
                    {i === 0 && <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Custos adicionais</label>}
                    <input type="text" placeholder="Nome (ex: Homologação)" value={item.nome}
                      onChange={e => setCustosAdicionais(prev => prev.map((x, idx) => idx === i ? { ...x, nome: e.target.value } : x))}
                      className={inp} />
                  </div>
                  <div className="w-28 relative">
                    {i === 0 && <div className="mb-1.5 h-4" />}
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                    <input type="text" inputMode="decimal" placeholder="0,00" value={item.valor}
                      onChange={e => setCustosAdicionais(prev => prev.map((x, idx) => idx === i ? { ...x, valor: e.target.value } : x))}
                      onBlur={e => { const v = fmtMoeda(parseFlt(e.target.value)); setCustosAdicionais(prev => prev.map((x, idx) => idx === i ? { ...x, valor: v } : x)); }}
                      className={inpPre} />
                  </div>
                  <button type="button" onClick={() => setCustosAdicionais(prev => prev.filter((_, idx) => idx !== i))}
                    className="mb-0.5 px-2 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-400 hover:text-red-400 hover:border-red-300 transition-colors text-xs">✕</button>
                </div>
              ))}
              <div className="col-span-2">
                <button type="button"
                  onClick={() => setCustosAdicionais(prev => [...prev, { nome: '', valor: '' }])}
                  className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                  + Adicionar custo
                </button>
              </div>

              {tipoVenda === 'vendedor' && (
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    Comissão do vendedor
                    {kwp >= 5 ? <span className="ml-1 text-[10px] text-slate-400 font-normal">≥5 kWp — auto</span> : null}
                  </label>
                  <div className="relative">
                    <input type="number" min={0} max={100} step={0.01} value={custoComissaoPct} onChange={e => setCustoComissaoPct(e.target.value)} onFocus={e => e.target.select()} className={inpSuf} placeholder="5" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Valor de venda + Margem desejada */}
            <div className="mt-4 space-y-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Precificação</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Margem desejada</label>
                  <div className="relative">
                    <input type="number" min={0} max={99} step={0.1} value={margemDesejada}
                      onChange={e => handleMargemChange(e.target.value)}
                      onFocus={e => e.target.select()}
                      className={inpSuf} placeholder="Ex: 25" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Preencha os custos e defina a margem → calcula o valor de venda
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Valor de venda</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                    <input type="text" inputMode="decimal" value={valorBase}
                      onChange={e => { setValorBase(e.target.value); setMargemDesejada(''); }}
                      onFocus={e => e.target.select()}
                      className={inpPre} placeholder="0,00" />
                  </div>
                </div>
              </div>

              {/* Desconto */}
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Desconto (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Em percentual</label>
                    <div className="relative">
                      <input type="number" min={0} max={100} step={0.01} value={descontoPct}
                        onChange={e => handleDescontoPctChange(e.target.value)}
                        onFocus={e => e.target.select()}
                        className={inpSuf} placeholder="0" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1">Em reais</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                      <input type="text" inputMode="decimal" value={descontoReais}
                        onChange={e => handleDescontoReaisChange(e.target.value)}
                        onFocus={e => e.target.select()}
                        className={inpPre} placeholder="0,00" />
                    </div>
                  </div>
                </div>
                {(descontoPctNum > 0 || descontoReaisNum > 0) && valorBaseNum > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    Valor final após desconto: <span className="font-semibold text-slate-800 dark:text-white">{fmtBRL(valorFinalVenda)}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Preview de margem */}
            {valorFinalVenda > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 px-4 py-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">NF ({nfPct}%)</span>
                  <span className="text-slate-700 dark:text-slate-300">{fmtBRL(nfPreview)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Demais custos</span>
                  <span className="text-slate-700 dark:text-slate-300">{fmtBRL(totalCustos - nfPreview)}</span>
                </div>
                {tipoVenda === 'vendedor' && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Comissão ({comPct}%)</span>
                    <span className="text-slate-700 dark:text-slate-300">{fmtBRL(comissaoVal)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 dark:border-white/10 pt-1.5 flex justify-between font-semibold">
                  <span className="text-slate-600 dark:text-slate-300">Lucro estimado</span>
                  <span className={margemColor}>{fmtBRL(lucro)} ({margem.toFixed(1)}%)</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-200 dark:border-white/10 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5">
            Cancelar
          </button>
          <button type="button" onClick={handleAbrirOrcafacil} disabled={isCreating}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {isCreating ? 'Abrindo…' : 'Abrir no OrçaFácil'}
          </button>
        </div>
      </div>
    </div>
  );
}
