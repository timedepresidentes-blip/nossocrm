'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FileText, Stamp, FileSignature, AlertCircle, RefreshCw, Send, Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { gerarProcuracao } from './templates/procuracao';
import { gerarContrato, gerarAnexoII, gerarTermoCiencia, type ContratoData } from './templates/contrato';
import {
  MODULOS, INVERSORES, TIPOS_ESTRUTURA,
  getModulo, getInversor, gerarNumContrato,
  detectModulo, detectInversor,
} from './templates/fabricantes';

function abrirHTML(html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  window.open(URL.createObjectURL(blob), '_blank');
}

function hoje(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      className={`w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${props.className ?? ''}`}
    />
  );
}

function Select({ value, onChange, children }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {children}
    </select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <div className={span2 ? 'md:col-span-2' : ''}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function GarantiaBadge({ label }: { label: string }) {
  return (
    <span className="inline-block bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs px-2 py-0.5 rounded-full mt-1">
      {label}
    </span>
  );
}

// ---------- ABA PROCURAÇÃO ----------
function ProcuracaoTab() {
  const [titularDiferente, setTitularDiferente] = useState(false);
  const [form, setForm] = useState({
    titularNome: '', titularCpf: '', titularEndereco: '',
    titularCep: '', titularCidade: 'Araraquara', titularUf: 'SP',
    distribuidora: 'CPFL Paulista', refNumero: '',
    cidade: 'Araraquara', data: hoje(),
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-5 flex gap-2 text-sm text-amber-800 dark:text-amber-300">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Preencha os dados do <strong>titular da conta de luz</strong> (UC) junto à distribuidora.</span>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <input type="checkbox" id="titDif" checked={titularDiferente}
          onChange={e => setTitularDiferente(e.target.checked)} className="rounded" />
        <label htmlFor="titDif" className="text-sm text-slate-700 dark:text-slate-300">
          Titular da UC é diferente do comprador
        </label>
      </div>

      <Section title="Dados do Titular da Conta de Luz">
        <Field label="Nome completo do titular">
          <Input value={form.titularNome} onChange={e => set('titularNome', e.target.value)} placeholder="Nome como aparece na conta de luz" />
        </Field>
        <Field label="CPF do titular">
          <Input value={form.titularCpf} onChange={e => set('titularCpf', e.target.value)} placeholder="000.000.000-00" />
        </Field>
        <Field label="Endereço completo (do titular)" span2>
          <Input value={form.titularEndereco} onChange={e => set('titularEndereco', e.target.value)} placeholder="Rua, número, bairro" />
        </Field>
        <Field label="CEP">
          <Input value={form.titularCep} onChange={e => set('titularCep', e.target.value)} placeholder="00000-000" />
        </Field>
        <Field label="Cidade / UF">
          <div className="flex gap-2">
            <Input value={form.titularCidade} onChange={e => set('titularCidade', e.target.value)} placeholder="Cidade" />
            <Input value={form.titularUf} onChange={e => set('titularUf', e.target.value)} placeholder="SP" style={{ width: 70 }} />
          </div>
        </Field>
      </Section>

      <Section title="Distribuidora e Assinatura">
        <Field label="Distribuidora de energia">
          <Input value={form.distribuidora} onChange={e => set('distribuidora', e.target.value)} placeholder="Ex: CPFL Paulista" />
        </Field>
        <Field label="Nº de referência (REF)">
          <Input value={form.refNumero} onChange={e => set('refNumero', e.target.value)} placeholder="Ex: 00454613" />
        </Field>
        <Field label="Cidade">
          <Input value={form.cidade} onChange={e => set('cidade', e.target.value)} />
        </Field>
        <Field label="Data">
          <Input value={form.data} onChange={e => set('data', e.target.value)} />
        </Field>
      </Section>

      <button
        onClick={() => {
          if (!form.titularNome || !form.titularCpf) { alert('Preencha nome e CPF do titular.'); return; }
          abrirHTML(gerarProcuracao({ ...form, titularDiferente }));
        }}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 transition-colors"
      >
        <Stamp className="h-4 w-4" />
        Gerar Procuração
      </button>
    </div>
  );
}

// ---------- ABA CONTRATO ----------
function ContratoTab() {
  const [moduloNome, setModuloNome] = useState('');
  const [inversorNome, setInversorNome] = useState('');
  const [estruturaNome, setEstruturaNome] = useState('');

  // Estado para envio à ClickSign
  const pdfUploadRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile]           = useState<File | null>(null);
  const [sending, setSending]           = useState(false);
  const [sendResult, setSendResult]     = useState<'ok' | 'error' | null>(null);
  const [sendError, setSendError]       = useState('');

  const [form, setForm] = useState<ContratoData>({
    compradorNome: '', compradorCpfCnpj: '', compradorEndereco: '', compradorContato: '',
    enderecoInstalacao: '', potenciaKwp: '',
    inversorModelo: '', inversorQtd: '1',
    moduloModelo: '', moduloQtd: '',
    estruturaTipo: '', estruturaQtd: '1',
    valorTotal: '', valorExtenso: '', formaPagamento: '',
    numParcelas: '1', valorParcela: '', vencimento: '',
    numContrato: '', cidade: 'Araraquara', data: hoje(),
    moduloFabricanteData: undefined, inversorFabricanteData: undefined,
  });

  const set = (k: keyof ContratoData, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Ao selecionar fabricante do módulo via dropdown, preenche modelo e dados de garantia
  const onModuloNomeChange = (nome: string) => {
    setModuloNome(nome);
    const fab = getModulo(nome);
    setForm(f => ({
      ...f,
      moduloFabricanteData: fab,
      moduloModelo: f.moduloModelo || nome,
    }));
  };

  const onInversorNomeChange = (nome: string) => {
    setInversorNome(nome);
    const fab = getInversor(nome);
    setForm(f => ({
      ...f,
      inversorFabricanteData: fab,
      inversorModelo: f.inversorModelo || nome,
    }));
  };

  // Ao digitar modelo, tenta detectar fabricante automaticamente por palavras-chave
  const onModuloModeloChange = (v: string) => {
    setForm(f => {
      const detected = detectModulo(v);
      if (detected && !f.moduloFabricanteData) {
        setModuloNome(detected.nome);
        return { ...f, moduloModelo: v, moduloFabricanteData: detected };
      }
      return { ...f, moduloModelo: v };
    });
  };

  const onInversorModeloChange = (v: string) => {
    setForm(f => {
      const detected = detectInversor(v);
      if (detected && !f.inversorFabricanteData) {
        setInversorNome(detected.nome);
        return { ...f, inversorModelo: v, inversorFabricanteData: detected };
      }
      return { ...f, inversorModelo: v };
    });
  };

  const onEstruturaChange = (tipo: string) => {
    setEstruturaNome(tipo);
    setForm(f => ({ ...f, estruturaTipo: tipo }));
  };

  // Gerar número de contrato automático ao montar
  useEffect(() => {
    setForm(f => ({ ...f, numContrato: gerarNumContrato() }));
  }, []);

  const validar = () => {
    if (!form.compradorNome || !form.compradorCpfCnpj || !form.potenciaKwp || !form.valorTotal) {
      alert('Preencha pelo menos: nome, CPF/CNPJ, potência e valor total.');
      return false;
    }
    return true;
  };

  // Extrai e-mail do campo contato (pode ser "email / telefone")
  const emailContato = form.compradorContato.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] ?? '';

  async function handleEnviarAssinatura() {
    if (!pdfFile) return;
    if (!emailContato) {
      alert('Preencha o campo Contato com o e-mail do comprador (ex: joao@email.com / 11999999999).');
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res((reader.result as string).split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(pdfFile);
      });

      const resp = await fetch('/api/clicksign/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dealId:             'doc-avulso',
          pdfBase64:          base64,
          filename:           pdfFile.name,
          signerName:         form.compradorNome,
          signerEmail:        emailContato,
          companySignerName:  'F.R.C Cintra',
          companySignerEmail: 'fcintra4@hotmail.com',
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? 'Erro ao enviar.');
      setSendResult('ok');
      setPdfFile(null);
      if (pdfUploadRef.current) pdfUploadRef.current.value = '';
    } catch (e) {
      setSendResult('error');
      setSendError(e instanceof Error ? e.message : 'Erro desconhecido.');
    } finally {
      setSending(false);
    }
  }

  const moduloSelecionado = getModulo(moduloNome);
  const inversorSelecionado = getInversor(inversorNome);

  return (
    <div>
      <Section title="Dados do Comprador">
        <Field label="Nome completo / Razão Social" span2>
          <Input value={form.compradorNome} onChange={e => set('compradorNome', e.target.value)} />
        </Field>
        <Field label="CPF / CNPJ">
          <Input value={form.compradorCpfCnpj} onChange={e => set('compradorCpfCnpj', e.target.value)} />
        </Field>
        <Field label="Contato (e-mail / telefone)">
          <Input value={form.compradorContato} onChange={e => set('compradorContato', e.target.value)} />
        </Field>
        <Field label="Endereço completo" span2>
          <Input value={form.compradorEndereco} onChange={e => set('compradorEndereco', e.target.value)} placeholder="Rua, número, bairro, cidade/UF" />
        </Field>
      </Section>

      <Section title="Local de Instalação">
        <Field label="Endereço da instalação (se diferente)" span2>
          <Input value={form.enderecoInstalacao} onChange={e => set('enderecoInstalacao', e.target.value)} />
        </Field>
        <Field label="Potência do sistema (kWp)">
          <Input value={form.potenciaKwp} onChange={e => set('potenciaKwp', e.target.value)} placeholder="Ex: 6,6" />
        </Field>
      </Section>

      <Section title="Módulos Fotovoltaicos">
        <Field label="Fabricante">
          <Select value={moduloNome} onChange={onModuloNomeChange}>
            <option value="">— Selecione —</option>
            {MODULOS.map(m => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
          </Select>
          {moduloSelecionado && (
            <div className="mt-1 flex gap-1 flex-wrap">
              <GarantiaBadge label={`Produto: ${moduloSelecionado.garantiaProduto}`} />
              <GarantiaBadge label={`Desempenho: ${moduloSelecionado.garantiaDesempenho}`} />
            </div>
          )}
        </Field>
        <Field label="Quantidade">
          <Input value={form.moduloQtd} onChange={e => set('moduloQtd', e.target.value)} placeholder="Ex: 12" />
        </Field>
        <Field label="Modelo completo" span2>
          <Input
            value={form.moduloModelo}
            onChange={e => onModuloModeloChange(e.target.value)}
            placeholder="Ex: Canadian HiKu6 550W — detecta fabricante automaticamente"
          />
          {form.moduloFabricanteData && !moduloSelecionado && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ Fabricante detectado: <strong>{form.moduloFabricanteData.nome}</strong> — Garantia: {form.moduloFabricanteData.garantiaProduto} produto / {form.moduloFabricanteData.garantiaDesempenho}
            </p>
          )}
        </Field>
      </Section>

      <Section title="Inversor">
        <Field label="Fabricante">
          <Select value={inversorNome} onChange={onInversorNomeChange}>
            <option value="">— Selecione —</option>
            {INVERSORES.map(i => <option key={i.nome} value={i.nome}>{i.nome} ({i.tipo})</option>)}
          </Select>
          {inversorSelecionado && (
            <div className="mt-1">
              <GarantiaBadge label={`Garantia: ${inversorSelecionado.garantia}`} />
            </div>
          )}
        </Field>
        <Field label="Quantidade">
          <Input value={form.inversorQtd} onChange={e => set('inversorQtd', e.target.value)} placeholder="1" />
        </Field>
        <Field label="Modelo completo" span2>
          <Input
            value={form.inversorModelo}
            onChange={e => onInversorModeloChange(e.target.value)}
            placeholder="Ex: Deye SUN-6K-SG03LP1-EU — detecta fabricante automaticamente"
          />
          {form.inversorFabricanteData && !inversorSelecionado && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ Fabricante detectado: <strong>{form.inversorFabricanteData.nome}</strong> — Garantia: {form.inversorFabricanteData.garantia}
            </p>
          )}
        </Field>
      </Section>

      <Section title="Estrutura de Fixação">
        <Field label="Tipo de estrutura (do orçamento do fornecedor)">
          <Select value={estruturaNome} onChange={onEstruturaChange}>
            <option value="">— Selecione ou digite abaixo —</option>
            {TIPOS_ESTRUTURA.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Quantidade">
          <Input value={form.estruturaQtd} onChange={e => set('estruturaQtd', e.target.value)} placeholder="1" />
        </Field>
        <Field label="Detalhar estrutura (opcional)" span2>
          <Input
            value={form.estruturaTipo}
            onChange={e => setForm(f => ({ ...f, estruturaTipo: e.target.value }))}
            placeholder="Ex: Metálica trapezoidal Romagnole 40mm"
          />
        </Field>
      </Section>

      <Section title="Financeiro">
        <Field label="Valor total (R$)">
          <Input value={form.valorTotal} onChange={e => set('valorTotal', e.target.value)} placeholder="Ex: 25.000,00" />
        </Field>
        <Field label="Valor por extenso">
          <Input value={form.valorExtenso} onChange={e => set('valorExtenso', e.target.value)} placeholder="vinte e cinco mil reais" />
        </Field>
        <Field label="Forma de pagamento" span2>
          <Input value={form.formaPagamento} onChange={e => set('formaPagamento', e.target.value)} placeholder="Ex: 50% na assinatura e 50% na instalação" />
        </Field>
        <Field label="Nº de parcelas">
          <Input value={form.numParcelas} onChange={e => set('numParcelas', e.target.value)} placeholder="1" />
        </Field>
        <Field label="Valor da parcela">
          <Input value={form.valorParcela} onChange={e => set('valorParcela', e.target.value)} placeholder="Ex: 12.500,00" />
        </Field>
        <Field label="Vencimento">
          <Input value={form.vencimento} onChange={e => set('vencimento', e.target.value)} placeholder="Ex: 30/01/2025" />
        </Field>
      </Section>

      <Section title="Identificação e Assinatura">
        <Field label="Nº do Contrato">
          <div className="flex gap-2">
            <Input value={form.numContrato} onChange={e => set('numContrato', e.target.value)} />
            <button
              type="button"
              onClick={() => set('numContrato', gerarNumContrato())}
              title="Gerar próximo número"
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </Field>
        <Field label="Cidade">
          <Input value={form.cidade} onChange={e => set('cidade', e.target.value)} />
        </Field>
        <Field label="Data">
          <Input value={form.data} onChange={e => set('data', e.target.value)} />
        </Field>
      </Section>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => { if (validar()) abrirHTML(gerarContrato(form)); }}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Gerar Contrato
        </button>
        <button
          onClick={() => { if (validar()) abrirHTML(gerarAnexoII(form)); }}
          className="flex-1 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Gerar Anexo II
        </button>
        <button
          onClick={() => { if (validar()) abrirHTML(gerarTermoCiencia(form)); }}
          className="flex-1 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 transition-colors"
        >
          <FileSignature className="h-4 w-4" />
          Gerar Termo de Ciência
        </button>
      </div>

      {/* Enviar para Assinatura Digital */}
      <div className="mt-6 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-blue-500" />
          Enviar para Assinatura Digital (ClickSign)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          1. Clique em <strong>Gerar Contrato</strong> acima → salve como PDF (Ctrl+P → Salvar como PDF).<br />
          2. Faça upload do PDF e clique em <strong>Enviar</strong> — o cliente receberá por e-mail.
        </p>

        <input ref={pdfUploadRef} type="file" accept=".pdf" className="hidden"
          onChange={e => { setPdfFile(e.target.files?.[0] ?? null); setSendResult(null); }} />

        <div
          onClick={() => pdfUploadRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-3 text-center cursor-pointer hover:border-blue-400 transition-colors mb-3"
        >
          {pdfFile ? (
            <span className="text-sm text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" /> {pdfFile.name}
            </span>
          ) : (
            <span className="text-sm text-slate-400 flex items-center justify-center gap-2">
              <Upload className="h-4 w-4" /> Clique para selecionar o PDF do contrato
            </span>
          )}
        </div>

        {sendResult === 'ok' && (
          <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mb-2">
            <CheckCircle2 className="h-3 w-3" /> Contrato enviado! {form.compradorNome} receberá o e-mail da ClickSign.
          </p>
        )}
        {sendResult === 'error' && (
          <p className="text-xs text-red-500 flex items-center gap-1 mb-2">
            <XCircle className="h-3 w-3" /> {sendError}
          </p>
        )}

        <button
          onClick={handleEnviarAssinatura}
          disabled={!pdfFile || sending}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 transition-colors"
        >
          {sending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
            : <><Send className="h-4 w-4" /> Enviar para Assinatura</>}
        </button>
      </div>
    </div>
  );
}

// ---------- PÁGINA PRINCIPAL ----------
type TabKey = 'procuracao' | 'contrato';

export function DocumentsPage() {
  const [tab, setTab] = useState<TabKey>('procuracao');

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'procuracao', label: 'Procuração CPFL', icon: <Stamp className="h-4 w-4" /> },
    { key: 'contrato', label: 'Contrato Solar', icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Documentos</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gere documentos prontos para impressão e assinatura</p>
        <div className="flex gap-1 mt-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {tab === 'procuracao' && <ProcuracaoTab />}
          {tab === 'contrato' && <ContratoTab />}
        </div>
      </div>
    </div>
  );
}
