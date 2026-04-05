'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/Topbar'
import Link from 'next/link'

interface Contact { name: string; contact: string }

export default function RegisterPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', dob: '', gender: 'Male',
    location: '', cameraLabel: '', cameraNumber: 1,
  })
  const [contacts, setContacts] = useState<Contact[]>([
    { name: '', contact: '' },
    { name: '', contact: '' },
  ])

  function setField(k: string, v: string | number) {
    setForm(f => ({ ...f, [k]: v }))
  }
  function setContact(i: number, k: keyof Contact, v: string) {
    setContacts(c => c.map((x, j) => j === i ? { ...x, [k]: v } : x))
  }
  function addContact() {
    setContacts(c => [...c, { name: '', contact: '' }])
  }
  function removeContact(i: number) {
    if (contacts.length <= 1) return
    setContacts(c => c.filter((_, j) => j !== i))
  }

  async function handleSubmit() {
    if (!form.name.trim()) return alert('Patient name is required.')
    setSaving(true)
    const payload = { ...form, contacts: contacts.filter(c => c.contact.trim()) }
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      alert('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  const label = (text: string) => (
    <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>{text}</label>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <Topbar />

      <main style={{ padding: '32px 24px', maxWidth: 680, margin: '0 auto' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <button style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-secondary)', padding: 0, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 24, cursor: 'pointer' }}>
            Back to dashboard
          </button>
        </Link>

        <h1 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 4 }}>Register new patient</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28 }}>Fill in patient and monitoring details to link a camera.</p>

        {/* Patient info */}
        <div className="card fade-up" style={{ padding: '20px 24px', marginBottom: 16 }}>
          <p className="section-label">Patient information</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              {label('Full name')}
              <input type="text" placeholder="e.g. Harold Simmons" value={form.name} onChange={e => setField('name', e.target.value)} />
            </div>
            <div>
              {label('Date of birth')}
              <input type="date" value={form.dob} onChange={e => setField('dob', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {label('Gender')}
              <select value={form.gender} onChange={e => setField('gender', e.target.value)}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
                <option>Prefer not to say</option>
              </select>
            </div>
            <div>
              {label('Patient ID')}
              <input type="text" placeholder="Auto-generated" disabled style={{ color: 'var(--text-tertiary)', cursor: 'not-allowed' }} />
            </div>
          </div>
        </div>

        {/* Contacts */}
        <div className="card fade-up" style={{ padding: '20px 24px', marginBottom: 16, animationDelay: '0.05s' }}>
          <p className="section-label">Contact information</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            These contacts receive fall alerts via Telegram or SMS.
          </p>
          {contacts.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 28px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <div>
                {i === 0 && label('Name')}
                <input type="text" placeholder="Contact name" value={c.name} onChange={e => setContact(i, 'name', e.target.value)} />
              </div>
              <div>
                {i === 0 && label('Phone or Telegram')}
                <input type="text" placeholder="+1 (555) 000-0000 or @handle" value={c.contact} onChange={e => setContact(i, 'contact', e.target.value)} />
              </div>
              <button
                onClick={() => removeContact(i)}
                style={{
                  width: 28, height: 38, border: '0.5px solid var(--border-mid)',
                  borderRadius: 8, background: 'none', color: 'var(--text-tertiary)',
                  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >x</button>
            </div>
          ))}
          <button
            onClick={addContact}
            style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--green)', padding: 0, marginTop: 4, cursor: 'pointer' }}
          >
            + Add another contact
          </button>
        </div>

        {/* Monitoring */}
        <div className="card fade-up" style={{ padding: '20px 24px', marginBottom: 28, animationDelay: '0.1s' }}>
          <p className="section-label">Monitoring setup</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              {label('Location')}
              <input type="text" placeholder="e.g. Living room" value={form.location} onChange={e => setField('location', e.target.value)} />
            </div>
            <div>
              {label('Camera label')}
              <input type="text" placeholder="e.g. Main cam" value={form.cameraLabel} onChange={e => setField('cameraLabel', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              {label('Camera number')}
              <input
                type="number" min={1} placeholder="1"
                value={form.cameraNumber}
                onChange={e => setField('cameraNumber', parseInt(e.target.value) || 1)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Link href="/dashboard"><button className="btn-outline">Cancel</button></Link>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save and go to dashboard'}
          </button>
        </div>
      </main>
    </div>
  )
}
