import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json() as { prompt: string }
    if (!prompt) return NextResponse.json({ error: 'No prompt' }, { status: 400 })

    const key = process.env.GEMINI_API_KEY
    if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY not set in .env.local' }, { status: 500 })

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
        }),
      }
    )
    if (!r.ok) {
      const errText = await r.text()
      console.error('Gemini error:', r.status, errText.slice(0, 300))
      return NextResponse.json({ error: `Gemini ${r.status}` }, { status: r.status })
    }
    const d = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const result = d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return NextResponse.json({ result })
  } catch (e) {
    console.error('API route error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
