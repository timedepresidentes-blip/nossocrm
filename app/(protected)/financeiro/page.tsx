import type { Metadata } from 'next';
import { FinanceiroPage } from '@/features/financeiro/FinanceiroPage';

export const metadata: Metadata = { title: 'Financeiro | NossoCRM' };

export default function Financeiro() {
  return <FinanceiroPage />;
}
