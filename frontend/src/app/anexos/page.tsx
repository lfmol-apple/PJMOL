// frontend/src/app/anexos/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AnexosHome() {
  const [extratoId, setExtratoId] = useState('');
  const router = useRouter();

  function go() {
    const id = (extratoId || '').trim();
    if (!id) return;
    router.push(`/anexos/${encodeURIComponent(id)}`);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') go();
  }

  return (
    <div style={{ maxWidth: 520, margin: '40px auto', padding: 16, fontFamily: 'Inter, system-ui, Arial' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Anexos</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>
        Informe o <b>Extrato ID</b> para abrir a tela de anexos.
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Ex.: 1"
          value={extratoId}
          onChange={(e) => setExtratoId(e.target.value)}
          onKeyDown={onKey}
          style={{ flex: 1, border: '1px solid #ddd', padding: 10, borderRadius: 8 }}
        />
        <button
          onClick={go}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #222',
            background: '#111',
            color: 'white',
            fontWeight: 600,
            cursor: extratoId ? 'pointer' : 'not-allowed',
            opacity: extratoId ? 1 : 0.6,
          }}
        >
          Abrir
        </button>
      </div>
    </div>
  );
}
