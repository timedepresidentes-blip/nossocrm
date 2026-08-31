'use client';

import { useEffect } from 'react';
import { gerarPropostaHtmlCRM } from '@/lib/gerarPropostaHtmlCRM';

export default function DemoPropostaPage() {
  useEffect(() => {
    const html = gerarPropostaHtmlCRM({
      clienteNome: 'João Carlos Mendonça',
      clienteCidade: 'Ribeirão Preto - SP',
      dataEmissao: new Date().toLocaleDateString('pt-BR'),
      potenciaKwp: 7.92,
      numPaineis: 18,
      painelW: 440,
      modeloPainel: 'Jinko Solar Tiger Neo 440W',
      modeloInversor: 'Growatt MIN 6000TL-X',
      qtdInversores: 1,
      tipoEstrutura: 'Metálica — telhado cerâmico',
      valorFinal: 32800,
      formaPagamento: 'Financiamento bancário',
      condicoesPagamento: 'Entrada de 30% + 48× pelo banco',
      prazoEntrega: '30 a 45 dias úteis após aprovação',
      observacoes: 'Proposta elaborada conforme análise do consumo médio mensal de 680 kWh. O sistema foi dimensionado para cobrir aproximadamente 95% da conta de energia.',
      empresa: 'SolPro Energia Solar',
      diferencial1: 'Mais de 500 instalações realizadas em toda a região com índice de satisfação de 98%.',
      diferencial2: 'Equipe certificada pela CRESESB e aprovada pela distribuidora local.',
      diferencial3: 'Garantia estendida de 12 anos no inversor e 25 anos nos módulos.',
      diferencial4: 'Acompanhamento pós-instalação com app de monitoramento em tempo real.',
      economiaAnualEstimada: 7800,
      contaMensalAtual: 680,
      paybackAnos: 4.2,
      geracaoMensalKwh: 950,
      clientesAtendidos: 520,
      validadeDias: 7,
      tema: 'ambar',
    });

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Volta para a página anterior após abrir
    window.history.back();
  }, []);

  return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
      Abrindo prévia da proposta…
    </div>
  );
}
