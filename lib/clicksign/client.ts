const BASE_URL = process.env.CLICKSIGN_BASE_URL ?? 'https://app.clicksign.com';
const API_KEY  = process.env.CLICKSIGN_API_KEY ?? '';

const HEADERS = {
  'Authorization': `Bearer ${API_KEY}`,
  'Accept': 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ClickSign ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface ClicksignEnvelope {
  id: string;
  key: string;
  status: string;
  name: string;
}

export interface ClicksignDocument {
  id: string;
  filename: string;
}

export interface ClicksignSigner {
  id: string;
  name: string;
  email: string;
}

// Posição da assinatura em coordenadas relativas (0–1) por página
export interface SignaturePosition {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function createEnvelope(name: string): Promise<ClicksignEnvelope> {
  const res = await request<{ data: { id: string; attributes: { key: string; status: string; name: string } } }>(
    'POST',
    '/api/v3/envelopes',
    { data: { type: 'envelopes', attributes: { name, locale: 'pt-BR', auto_close: true } } },
  );
  return {
    id: res.data.id,
    key: res.data.attributes.key,
    status: res.data.attributes.status,
    name: res.data.attributes.name,
  };
}

export async function addDocument(envelopeId: string, filename: string, base64: string): Promise<ClicksignDocument> {
  const res = await request<{ data: { id: string; attributes: { filename: string } } }>(
    'POST',
    `/api/v3/envelopes/${envelopeId}/documents`,
    { data: { type: 'documents', attributes: { filename, content_base64: base64 } } },
  );
  return { id: res.data.id, filename: res.data.attributes.filename };
}

export async function addSigner(
  envelopeId: string,
  name: string,
  email: string,
  phone?: string,
): Promise<ClicksignSigner> {
  const attrs: Record<string, string> = { name, email, locale: 'pt-BR', delivery: 'email' };
  if (phone) attrs.phone_number = phone.replace(/\D/g, '');
  const res = await request<{ data: { id: string; attributes: { name: string; email: string } } }>(
    'POST',
    `/api/v3/envelopes/${envelopeId}/signers`,
    { data: { type: 'signers', attributes: attrs } },
  );
  return { id: res.data.id, name: res.data.attributes.name, email: res.data.attributes.email };
}

export async function addRequirement(
  envelopeId: string,
  documentId: string,
  signerId: string,
  position: SignaturePosition,
  action: 'sign' | 'initial' | 'approve' = 'sign',
): Promise<void> {
  await request(
    'POST',
    `/api/v3/envelopes/${envelopeId}/requirements`,
    {
      data: {
        type: 'requirements',
        attributes: {
          action,
          document_id: documentId,
          signer_id: signerId,
          ...position,
        },
      },
    },
  );
}

export async function activateEnvelope(envelopeId: string): Promise<void> {
  await request('PATCH', `/api/v3/envelopes/${envelopeId}`, {
    data: { type: 'envelopes', id: envelopeId, attributes: { status: 'running' } },
  });
}

export async function getEnvelope(envelopeId: string): Promise<ClicksignEnvelope> {
  const res = await request<{ data: { id: string; attributes: { key: string; status: string; name: string } } }>(
    'GET',
    `/api/v3/envelopes/${envelopeId}`,
  );
  return {
    id: res.data.id,
    key: res.data.attributes.key,
    status: res.data.attributes.status,
    name: res.data.attributes.name,
  };
}
