'use client'
export default function Error({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Algo deu errado</h2>
      <pre style={{ textAlign: 'left', background: '#1e1e2e', color: '#f38ba8', padding: '1rem', borderRadius: '8px', overflow: 'auto', maxWidth: '800px', margin: '1rem auto', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
        {error?.message}
        {'\n\n'}
        {error?.stack}
      </pre>
      <button onClick={() => reset()}>Tentar novamente</button>
    </div>
  )
}
