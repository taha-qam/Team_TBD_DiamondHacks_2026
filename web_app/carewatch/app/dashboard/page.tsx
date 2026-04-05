'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Topbar from '@/components/Topbar'

interface Contact { name: string; contact: string }
interface Patient {
  id: string; name: string; dob: string; gender: string
  contacts: Contact[]; location: string; cameraLabel: string
  cameraNumber: number; active: boolean
}
interface Alert {
  id: string; receivedAt: string; timestamp: string
  patient: { id: string; name: string }
  monitoring: { location: string; cameraNumber: number }
  image?: string
}

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL || 'http://localhost:8080'

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function age(dob: string) {
  const d = new Date(dob)
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  return `${Math.floor(s/3600)}h ago`
}

export default function Dashboard() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)

  useEffect(() => {
    fetch('/api/patients').then(r => r.json()).then(setPatients)
    fetch('/api/fall').then(r => r.json()).then(setAlerts)
    const iv = setInterval(() => {
      fetch('/api/fall').then(r => r.json()).then(setAlerts)
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  const activePatient = patients[0]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <Topbar />

      <main style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 2 }}>Monitoring dashboard</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{patients.length} patient{patients.length !== 1 ? 's' : ''} registered</p>
          </div>
          {alerts.length > 0 && (
            <div style={{
              background: '#FEF2F2', border: '0.5px solid #FECACA',
              borderRadius: 8, padding: '6px 14px',
              fontSize: 12, color: '#B91C1C', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} className="live-dot" />
              {alerts.length} fall alert{alerts.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

          {/* Left: feeds */}
          <div>
            {patients.length === 0 ? (
              <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>No patients registered yet.</p>
                <Link href="/register"><button className="btn-primary">Register first patient</button></Link>
              </div>
            ) : (
              <>
                {/* Patient card */}
                {activePatient && (
                  <div className="card fade-up" style={{ marginBottom: 16, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'var(--green-dim)', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 500, color: 'var(--green-text)',
                      }}>{initials(activePatient.name)}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 500, fontSize: 14 }}>{activePatient.name}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {activePatient.gender} · {age(activePatient.dob)} yrs · {activePatient.location}
                        </p>
                      </div>
                      <div style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 100,
                        background: 'var(--green-dim)', color: 'var(--green-text)', fontWeight: 500,
                      }}>Active</div>
                    </div>

                    {/* Feed grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 16 }}>
                      {/* Live feed */}
                      <div style={{ border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{activePatient.cameraLabel}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cam {activePatient.cameraNumber}</span>
                        </div>
                        <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0a1a12', overflow: 'hidden' }}>
                          <img
                            src={STREAM_URL}
                            alt="Live feed"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <div style={{
                            position: 'absolute', top: 8, left: 8,
                            background: 'rgba(0,0,0,0.55)', borderRadius: 4,
                            padding: '2px 8px', fontSize: 11, color: '#fff',
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1D9E75', display: 'inline-block' }} className="live-dot" />
                            LIVE
                          </div>
                        </div>
                        <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--green-text)', background: 'var(--green-dim)', borderRadius: 100, padding: '2px 8px' }}>Monitoring active</span>
                        </div>
                      </div>

                      {/* Placeholder cam 2 */}
                      <div style={{ border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', opacity: 0.45 }}>
                        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>Camera 2</span>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Not connected</span>
                        </div>
                        <div style={{ aspectRatio: '16/9', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No feed</span>
                        </div>
                        <div style={{ padding: '8px 14px' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--surface)', borderRadius: 100, padding: '2px 8px' }}>Offline</span>
                        </div>
                      </div>
                    </div>

                    {/* Contacts */}
                    <div style={{ padding: '12px 20px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 24 }}>
                      {activePatient.contacts.map((c, i) => (
                        <div key={i}>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{c.name}</p>
                          <p style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>{c.contact}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: alerts */}
          <div>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Fall alerts</span>
                {alerts.length > 0 && (
                  <span style={{ fontSize: 11, background: '#FEE2E2', color: '#B91C1C', borderRadius: 100, padding: '2px 8px' }}>{alerts.length}</span>
                )}
              </div>

              {alerts.length === 0 ? (
                <div style={{ padding: '32px 18px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No alerts yet</p>
                </div>
              ) : (
                <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                  {alerts.map((a) => (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAlert(a)}
                      style={{
                        padding: '12px 18px',
                        borderBottom: '0.5px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#B91C1C' }}>Fall detected</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--mono)' }}>{timeAgo(a.receivedAt)}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.patient?.name} · {a.monitoring?.location}</p>
                      {a.image && <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 3 }}>Image captured ↗</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Alert modal */}
      {selectedAlert && (
        <div
          onClick={() => setSelectedAlert(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card fade-up"
            style={{ width: '100%', maxWidth: 480, padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#B91C1C' }}>Fall alert</span>
              <button onClick={() => setSelectedAlert(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-tertiary)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                ['Patient', selectedAlert.patient?.name],
                ['Location', selectedAlert.monitoring?.location],
                ['Camera', `#${selectedAlert.monitoring?.cameraNumber}`],
                ['Time', new Date(selectedAlert.receivedAt).toLocaleTimeString()],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</p>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{val}</p>
                </div>
              ))}
            </div>
            {selectedAlert.image && (
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '0.5px solid var(--border)' }}>
                <img src={`data:image/jpeg;base64,${selectedAlert.image}`} alt="Fall capture" style={{ width: '100%', display: 'block' }} />
                <p style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>Captured at moment of confirmation</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
