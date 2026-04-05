'use client'
import Link from 'next/link'

export default function Topbar() {
  return (
    <header style={{
      background: 'var(--card)',
      borderBottom: '0.5px solid var(--border)',
      height: 52,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <Link href="/dashboard" style={{ textDecoration: 'none' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          care<span style={{ color: 'var(--green)' }}>watch</span>
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/register">
          <button className="btn-outline" style={{ fontSize: 12, height: 32, padding: '0 14px' }}>
            + New patient
          </button>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'var(--green-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 500, color: 'var(--green-text)',
          }}>AN</div>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Angelo</span>
        </div>
      </div>
    </header>
  )
}
