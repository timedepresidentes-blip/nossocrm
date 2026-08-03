'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export interface OrcafacilQuote {
  id: string;
  cliente_nome: string;
  cliente_cidade: string | null;
  potencia_kwp: number;
  valor_final: number | null;
  status: string;
  created_at: string;
}

const ORCAFACIL_URL = process.env.NEXT_PUBLIC_ORCAFACIL_URL ?? '';
const ORCAFACIL_KEY = process.env.NEXT_PUBLIC_ORCAFACIL_ANON_KEY ?? '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;
function getClient() {
  if (!_client && ORCAFACIL_URL && ORCAFACIL_KEY) {
    _client = createClient(ORCAFACIL_URL, ORCAFACIL_KEY);
  }
  return _client;
}

export function useOrcafacilQuotes(phone: string | null | undefined, name?: string | null) {
  const [quotes, setQuotes] = useState<OrcafacilQuote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phone) { setQuotes([]); return; }
    const client = getClient();
    if (!client) return;

    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const { data } = await client.rpc('get_orcamentos_by_phone', {
          p_telefone: phone,
          p_nome: name ?? null,
        });
        if (!cancelled) setQuotes((data as OrcafacilQuote[]) ?? []);
      } catch {
        // silencia erros de rede
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [phone, name]);

  return { quotes, loading };
}
