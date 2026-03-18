'use client'
import { useState, useRef, useCallback } from 'react'

export default function QueryDock({ onQuery, isLoading, suggestions }: {
  onQuery: (q: string) => void
  isLoading: boolean
  suggestions: string[]
}) {
  const [value, setValue] = useState('')
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const taRef  = useRef<HTMLTextAreaElement>(null)
  const recRef = useRef<SpeechRecognition | null>(null)
  const vtRef  = useRef('')

  const submit = useCallback(() => {
    const q = value.trim()
    if (!q || isLoading) return
    setValue('')
    if (taRef.current) taRef.current.style.height = 'auto'
    onQuery(q)
  }, [value, isLoading, onQuery])

  const resize = () => {
    const el = taRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 130) + 'px' }
  }

  // ── Minimal inline voice ──────────────────────────────────────────────────
  const toggleVoice = () => {
    const SR = (window as Record<string,unknown>).SpeechRecognition as typeof SpeechRecognition
              || (window as Record<string,unknown>).webkitSpeechRecognition as typeof SpeechRecognition
    if (!SR) { alert('Voice not supported. Use Chrome or Edge.'); return }

    if (recRef.current) { recRef.current.abort(); return }

    const rec = new SR()
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US'
    recRef.current = rec
    vtRef.current = ''

    rec.onstart = () => { setVoiceActive(true); setVoiceText('Listening…') }

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let final = '', interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t; else interim += t
      }
      const cur = final || interim
      vtRef.current = cur
      setVoiceText(cur || 'Listening…')
    }

    rec.onend = () => {
      const t = vtRef.current.trim()
      setVoiceActive(false); setVoiceText(''); recRef.current = null
      document.getElementById('voice-btn')?.classList.remove('listening')
      if (t) { setValue(t); setTimeout(() => onQuery(t), 150) }
    }

    rec.onerror = () => { setVoiceActive(false); setVoiceText(''); recRef.current = null; document.getElementById('voice-btn')?.classList.remove('listening') }

    document.getElementById('voice-btn')?.classList.add('listening')
    rec.start()
  }

  return (
    <div className="query-dock">
      <div className="query-box">
        <div className="query-row">
          {/* Minimal voice — inline indicator only */}
          <div className="voice-wrap">
            <button id="voice-btn" className="voice-btn" onClick={toggleVoice} title="Voice input">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            </button>
            {/* Small inline indicator — no fullscreen */}
            <div className={`voice-inline ${voiceActive ? 'active' : ''}`}>
              <div className="voice-bars">
                <span/><span/><span/><span/><span/>
              </div>
              {voiceText && <span style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{voiceText}</span>}
            </div>
          </div>

          <textarea
            ref={taRef} className="query-textarea" value={value} rows={1}
            placeholder="Ask anything about your data…"
            onChange={e => { setValue(e.target.value); resize() }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          />
          <button className={`send-btn ${isLoading ? 'loading' : ''}`} onClick={submit}>
            <svg viewBox="0 0 24 24" fill="white"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>
          </button>
        </div>

        <div className="chips-row">
          {suggestions.slice(0, 6).map((s, i) => (
            <div key={i} className="ex-chip" onClick={() => { setValue(s); taRef.current?.focus() }}>{s}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
