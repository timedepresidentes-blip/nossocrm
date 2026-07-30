'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronUp, ClipboardList,
  Download, FileText, Loader2, RefreshCw, Save,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { FichaClienteData } from '@/app/api/ai/tasks/deals/ficha-cliente/route';

interface Props {
  dealId: string;
  conversationId?: string | null;
  isWon?: boolean;
  dealTitle?: string;
  dealValue?: number | null;
  // dados do DealCostsPanel para incluir no contrato
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
  dealId, conversationId, isWon, dealTitle, dealValue, custoTotal, margemPct,
}) => {
  const [aberta, setAberta] = useState(false);
  const [ficha, setFicha] = useState<FichaClienteData>(empty());
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [contratoAssinado, setContratoAssinado] = useState(false);
  const [marcandoContrato, setMarcandoContrato] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const contratoRef = useRef<HTMLDivElement>(null);

  // Carrega ficha salva no deal
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('deals')
      .select('ficha_cliente, contrato_assinado')
      .eq('id', dealId)
      .maybeSingle();
    if (data?.ficha_cliente) setFicha(data.ficha_cliente as FichaClienteData);
    if (data?.contrato_assinado) setContratoAssinado(true);
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

  // Salvar manualmente
  const handleSalvar = async () => {
    if (!supabase) return;
    setSaving(true);
    await supabase.from('deals').update({ ficha_cliente: ficha, updated_at: new Date().toISOString() }).eq('id', dealId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const setField = (key: keyof FichaClienteData, val: string) => {
    setFicha(prev => ({ ...prev, [key]: val || null }));
  };

  const handleMarcarContratoAssinado = async () => {
    if (!supabase) return;
    setMarcandoContrato(true);
    const agora = new Date().toISOString();
    await supabase
      .from('deals')
      .update({ contrato_assinado: true, contrato_assinado_at: agora, updated_at: agora })
      .eq('id', dealId);
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

  // Impressão do contrato
  const handleGerarContrato = () => {
    if (!contratoRef.current) return;
    const conteudo = contratoRef.current.innerHTML;
    const janela = window.open('', '_blank', 'width=800,height=1100');
    if (!janela) return;
    janela.document.write(`<!DOCTYPE html><html><head><title>Contrato de Fornecimento e Instalação</title>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; padding: 40px; font-size: 12px; line-height: 1.6; }
  h1 { text-align: center; font-size: 16px; margin-bottom: 4px; text-transform: uppercase; }
  h2 { font-size: 12px; font-weight: bold; margin: 20px 0 6px; text-transform: uppercase; }
  p { margin: 6px 0; text-align: justify; }
  .centro { text-align: center; }
  .clausula { margin-bottom: 14px; }
  .assinaturas { margin-top: 60px; display: flex; justify-content: space-between; }
  .ass-box { text-align: center; width: 45%; border-top: 1px solid #333; padding-top: 8px; font-size: 11px; }
  .dado { font-weight: bold; }
  .campo-linha { border-bottom: 1px solid #666; display: inline-block; min-width: 120px; }
  @media print { body { padding: 20px; } }
</style></head><body>${conteudo}</body></html>`);
    janela.document.close();
    setTimeout(() => { janela.print(); }, 400);
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
                  onClick={handleSalvar}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  {saved ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {saved ? 'Salvo!' : 'Salvar ficha'}
                </button>
                <button
                  type="button"
                  onClick={handleBaixarFicha}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/3 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
                >
                  <Download className="h-3 w-3" /> Baixar ficha PDF
                </button>
                {isWon && (
                  <button
                    type="button"
                    onClick={handleGerarContrato}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/15"
                  >
                    <FileText className="h-3 w-3" /> Gerar contrato
                  </button>
                )}
                {isWon && !contratoAssinado && (
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
                  <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Contrato assinado
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

      {/* Template do CONTRATO (oculto, usado para impressão) */}
      <div ref={contratoRef} style={{ display: 'none' }}>
        <h1>Contrato de Fornecimento e Instalação de Sistema Fotovoltaico</h1>
        <p className="centro" style={{ fontSize: 11, color: '#555' }}>Data: {hoje}</p>

        <h2>Partes</h2>
        <p><strong>CONTRATANTE:</strong> {f.nomeCompleto ?? '___________________________'}, CPF/CNPJ: {f.cpfCnpj ?? '___________________________'}, RG: {f.rg ?? '___________'}, residente em {f.enderecoRua ?? '___________________________'}, {f.enderecoBairro ?? '___________'}, {f.enderecoCidade ?? '___________'}/{f.enderecoEstado ?? '__'}, CEP {f.enderecoCep ?? '_________'}, E-mail: {f.email ?? '___________________________'}, Telefone: {f.telefone ?? '___________________________'}.</p>

        <p><strong>CONTRATADA:</strong> _____________________________, CNPJ: ______________________________, com sede em _____________________________, doravante denominada CONTRATADA.</p>

        <h2>Cláusula 1 – Objeto</h2>
        <div className="clausula">
          <p>O presente contrato tem por objeto o fornecimento e instalação de sistema de energia solar fotovoltaico com as seguintes especificações:</p>
          <ul>
            <li>Potência total: <strong>{f.potenciaKwp ?? '___'} kWp</strong></li>
            <li>Módulos fotovoltaicos: <strong>{f.numPaineis ?? '___'} unidades</strong> – {f.modeloPainel ?? '___________________________'} ({f.potenciaPainelW ?? '___'} W cada)</li>
            <li>Inversor: <strong>{f.modeloInversor ?? '___________________________'}</strong> ({f.tipoInversor ?? '___'}) – {f.qtdInversores ?? '___'} unidade(s)</li>
            <li>Estrutura de fixação: <strong>{f.tipoEstrutura ?? '___________________________'}</strong></li>
            <li>Local de instalação: {f.instalacaoEndereco ?? f.enderecoRua ?? '___________________________'}, {f.instalacaoCidade ?? f.enderecoCidade ?? '___________________________'}</li>
            <li>Tipo de imóvel: {f.instalacaoTipoImovel ?? '___________________________'} | Fases: {f.instalacaoFases ?? '___'} | Disjuntor: {f.instalacaoDisjuntor ?? '___'} A</li>
          </ul>
        </div>

        <h2>Cláusula 2 – Valor e Forma de Pagamento</h2>
        <div className="clausula">
          <p>O valor total pelos serviços e equipamentos é de <strong>{valorFmt}</strong>.</p>
          <p>Forma de pagamento: <strong>{f.formaPagamento ?? '___________________________'}</strong>.</p>
          {f.condicoesPagamento && <p>Condições: {f.condicoesPagamento}.</p>}
        </div>

        <h2>Cláusula 3 – Prazo de Execução</h2>
        <div className="clausula">
          <p>O prazo para execução dos serviços, após aprovação da documentação junto à distribuidora {f.distribuidora ?? '___________________________'}, é de <strong>{f.prazoEntrega ?? '___ dias úteis'}</strong>, contados da data de pagamento da entrada ou assinatura deste contrato.</p>
        </div>

        <h2>Cláusula 4 – Garantias</h2>
        <div className="clausula">
          <p>A CONTRATADA oferece as seguintes garantias:</p>
          <ul>
            <li><strong>Painéis solares:</strong> 12 anos contra defeitos de fabricação e 25 anos de eficiência mínima de 80% (garantia do fabricante).</li>
            <li><strong>Inversor/microinversor:</strong> 5 a 12 anos conforme o fabricante ({f.modeloInversor ?? '___'}).</li>
            <li><strong>Serviço de instalação:</strong> 5 (cinco) anos contra defeitos de mão de obra, infiltrações e falhas de fixação.</li>
            <li><strong>Estrutura de fixação:</strong> 10 (dez) anos contra defeitos de fabricação.</li>
            <li><strong>Cabeamento e conexões:</strong> 5 (cinco) anos.</li>
          </ul>
          <p>As garantias não cobrem danos causados por mau uso, eventos climáticos extremos, modificações não autorizadas ou falta de manutenção preventiva.</p>
        </div>

        <h2>Cláusula 5 – Homologação e Conexão à Rede</h2>
        <div className="clausula">
          <p>A CONTRATADA será responsável por toda a documentação necessária para homologação junto à distribuidora {f.distribuidora ?? '___________________________'}, incluindo ART do engenheiro responsável, memorial de cálculo e projeto elétrico. O prazo de homologação depende exclusivamente da distribuidora, não sendo de responsabilidade da CONTRATADA eventuais atrasos por parte da concessionária.</p>
        </div>

        <h2>Cláusula 6 – Obrigações da CONTRATANTE</h2>
        <div className="clausula">
          <p>A CONTRATANTE compromete-se a: (i) fornecer acesso ao local de instalação; (ii) providenciar a documentação do imóvel quando solicitada; (iii) realizar a manutenção preventiva periódica dos painéis (limpeza a cada 3–6 meses); (iv) não realizar modificações no sistema sem autorização prévia da CONTRATADA.</p>
        </div>

        <h2>Cláusula 7 – Rescisão</h2>
        <div className="clausula">
          <p>O contrato poderá ser rescindido por qualquer das partes mediante comunicação escrita com antecedência mínima de 5 dias úteis, sujeitando-se a parte infratora ao pagamento de multa de 20% sobre o valor total contratado, além do ressarcimento de despesas já realizadas.</p>
        </div>

        <h2>Cláusula 8 – Foro</h2>
        <div className="clausula">
          <p>As partes elegem o foro da comarca de {f.instalacaoCidade ?? f.enderecoCidade ?? '___________________________'}/{f.enderecoEstado ?? '__'} para dirimir quaisquer dúvidas oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.</p>
        </div>

        <p>Por estarem justos e contratados, assinam o presente instrumento em 2 (duas) vias de igual teor e forma.</p>
        <p>{f.instalacaoCidade ?? f.enderecoCidade ?? '___________________________'}/{f.enderecoEstado ?? '__'}, {hoje}.</p>

        <div className="assinaturas">
          <div className="ass-box">
            <p>___________________________________</p>
            <p><strong>{f.nomeCompleto ?? 'CONTRATANTE'}</strong></p>
            <p>CPF: {f.cpfCnpj ?? '___.___.___-__'}</p>
          </div>
          <div className="ass-box">
            <p>___________________________________</p>
            <p><strong>CONTRATADA</strong></p>
            <p>CNPJ: ___.___.___/____-__</p>
          </div>
        </div>

        <div style={{ marginTop: 40, fontSize: 11 }}>
          <p><strong>Testemunhas:</strong></p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30 }}>
            <div style={{ width: '45%', borderTop: '1px solid #333', paddingTop: 6, textAlign: 'center' }}>
              <p>Nome: ___________________________</p>
              <p>CPF: ___.___.___-__</p>
            </div>
            <div style={{ width: '45%', borderTop: '1px solid #333', paddingTop: 6, textAlign: 'center' }}>
              <p>Nome: ___________________________</p>
              <p>CPF: ___.___.___-__</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
