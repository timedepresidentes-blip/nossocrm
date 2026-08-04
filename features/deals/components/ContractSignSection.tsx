'use client';

import React, { useRef, useState } from 'react';
import { FileText, Upload, Send, CheckCircle2, Clock, XCircle, Loader2, ExternalLink } from 'lucide-react';
import type { Deal } from '@/types';

interface ClicksignData {
  envelopeId?: string;
  envelopeKey?: string;
  status?: 'running' | 'signed' | 'cancelled' | string;
  sentAt?: string;
  signedAt?: string;
  signerName?: string;
  signerEmail?: string;
}

interface ContractSignSectionProps {
  deal: Deal;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  onStatusChange?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  running: {
    label: 'Aguardando assinatura',
    color: 'text-amber-400',
    icon: <Clock className="w-4 h-4" />,
  },
  signed: {
    label: 'Assinado',
    color: 'text-emerald-400',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  cancelled: {
    label: 'Cancelado',
    color: 'text-red-400',
    icon: <XCircle className="w-4 h-4" />,
  },
};

export function ContractSignSection({ deal, contactName, contactEmail, contactPhone, onStatusChange }: ContractSignSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]           = useState<File | null>(null);
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);

  // Comprador (cliente)
  const [signerName,  setSignerName]  = useState(contactName  ?? '');
  const [signerEmail, setSignerEmail] = useState(contactEmail ?? '');
  const [signerPhone, setSignerPhone] = useState(contactPhone ?? '');

  // Vendedora (empresa — você)
  const [sellerName,  setSellerName]  = useState('F.R.C Cintra');
  const [sellerEmail, setSellerEmail] = useState('fcintra4@hotmail.com');

  const clicksign = (deal.customFields?.clicksign ?? null) as ClicksignData | null;
  const statusInfo = clicksign?.status ? STATUS_LABELS[clicksign.status] : null;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    setSuccess(false);
  }

  async function handleSend() {
    if (!file) { setError('Selecione o arquivo PDF do contrato.'); return; }
    if (!signerEmail) { setError('Informe o e-mail do cliente.'); return; }
    if (!signerName)  { setError('Informe o nome do cliente.');  return; }

    setSending(true);
    setError(null);

    try {
      const base64 = await toBase64(file);

      const res = await fetch('/api/clicksign/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dealId:             deal.id,
          pdfBase64:          base64,
          filename:           file.name,
          signerName,
          signerEmail,
          signerPhone:        signerPhone || undefined,
          companySignerName:  sellerName  || undefined,
          companySignerEmail: sellerEmail || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar.');

      setSuccess(true);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onStatusChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar contrato.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Status atual */}
      {clicksign && statusInfo && (
        <div className={`flex items-center gap-2 p-3 rounded-lg bg-white/5 ${statusInfo.color}`}>
          {statusInfo.icon}
          <div className="flex-1">
            <div className="text-sm font-medium">{statusInfo.label}</div>
            {clicksign.signerName && (
              <div className="text-xs opacity-70">{clicksign.signerName} · {clicksign.signerEmail}</div>
            )}
            {clicksign.sentAt && (
              <div className="text-xs opacity-50">
                Enviado em {new Date(clicksign.sentAt).toLocaleDateString('pt-BR')}
              </div>
            )}
            {clicksign.signedAt && (
              <div className="text-xs opacity-50">
                Assinado em {new Date(clicksign.signedAt).toLocaleDateString('pt-BR')}
              </div>
            )}
          </div>
          {clicksign.envelopeKey && (
            <a
              href={`https://app.clicksign.com/sign/${clicksign.envelopeKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-60 hover:opacity-100"
              title="Abrir na ClickSign"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      )}

      {/* Formulário de envio */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {clicksign ? 'Reenviar contrato' : 'Enviar para assinatura'}
        </h3>

        {/* Comprador (cliente) */}
        <p className="text-xs text-slate-500 -mb-1">Comprador</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Nome do cliente"
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
          <input
            type="email"
            placeholder="E-mail do cliente"
            value={signerEmail}
            onChange={e => setSignerEmail(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
          <input
            type="tel"
            placeholder="WhatsApp do cliente (opcional)"
            value={signerPhone}
            onChange={e => setSignerPhone(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        {/* Vendedora (você) */}
        <p className="text-xs text-slate-500 -mb-1">Vendedora</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Seu nome"
            value={sellerName}
            onChange={e => setSellerName(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
          <input
            type="email"
            placeholder="Seu e-mail"
            value={sellerEmail}
            onChange={e => setSellerEmail(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        {/* Upload do PDF */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-white/10 rounded-lg p-4 text-center cursor-pointer hover:border-primary-500/50 transition-colors"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFile}
          />
          {file ? (
            <div className="flex items-center gap-2 justify-center text-sm text-white">
              <FileText className="w-4 h-4 text-primary-400" />
              <span>{file.name}</span>
              <span className="text-slate-500">({(file.size / 1024).toFixed(0)} KB)</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Upload className="w-5 h-5 text-slate-500" />
              <span className="text-xs text-slate-500">Clique para selecionar o PDF do contrato</span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> {error}
          </p>
        )}

        {success && (
          <p className="text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Contrato enviado! O cliente receberá um e-mail da ClickSign.
          </p>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !file}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {sending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
          ) : (
            <><Send className="w-4 h-4" /> Enviar para Assinatura</>
          )}
        </button>
      </div>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
