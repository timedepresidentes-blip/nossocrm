import type { Metadata } from 'next';
import { OrcamentosPage } from '@/features/orcamentos/OrcamentosPage';

export const metadata: Metadata = { title: 'Orçamentos | NossoCRM' };

export default function Orcamentos() {
  return <OrcamentosPage />;
}
