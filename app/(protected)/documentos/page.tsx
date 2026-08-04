import type { Metadata } from 'next';
import { DocumentsPage } from '@/features/documents/DocumentsPage';

export const metadata: Metadata = { title: 'Documentos | NossoCRM' };

export default function Documentos() {
  return <DocumentsPage />;
}
