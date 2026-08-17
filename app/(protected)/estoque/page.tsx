import type { Metadata } from 'next';
import { EstoquePage } from '@/features/estoque/EstoquePage';

export const metadata: Metadata = { title: 'Estoque | NossoCRM' };

export default function Estoque() {
  return <EstoquePage />;
}
