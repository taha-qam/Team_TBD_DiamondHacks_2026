import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

const filePath = path.join(process.cwd(), 'data', 'patients.json')

function read() {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

export async function GET() {
  return NextResponse.json(read())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const patients = read()
  const newPatient = {
    id: `patient-${Date.now()}`,
    active: false,
    ...body,
  }
  patients.push(newPatient)
  writeFileSync(filePath, JSON.stringify(patients, null, 2))
  return NextResponse.json(newPatient)
}
