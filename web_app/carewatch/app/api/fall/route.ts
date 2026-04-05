import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

const filePath = path.join(process.cwd(), 'data', 'alerts.json')

function read() {
  try { return JSON.parse(readFileSync(filePath, 'utf-8')) }
  catch { return [] }
}

export async function GET() {
  return NextResponse.json(read())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const alerts = read()
  const alert = { id: `alert-${Date.now()}`, receivedAt: new Date().toISOString(), ...body }
  alerts.unshift(alert)
  // Keep last 100 alerts
  if (alerts.length > 100) alerts.splice(100)
  writeFileSync(filePath, JSON.stringify(alerts, null, 2))
  return NextResponse.json({ ok: true, alert })
}
