'use client'
import { forwardRef, useImperativeHandle, useState, useRef } from 'react'

const STEPS = ['Understanding question','Scanning dataset','Selecting charts','Generating insights','Building dashboard']

export function ThinkingBar({ visible, step }: { visible: boolean; step: number }) {
  return (
    <div className={`thinking-wrap ${visible ? 'visible' : ''}`}>
      <div className="thinking-card">
        <div className="think-steps">
          {STEPS.map((s,i) => (
            <div key={i} className={`think-step ${i<step?'done':i===step?'active':''}`}>
              <div className="ts-dot"/><span>{s}</span>
            </div>
          ))}
        </div>
        <div className="think-track">
          <div className="think-fill" style={{width:`${Math.min((step/STEPS.length)*100,100)}%`}}/>
        </div>
      </div>
    </div>
  )
}

export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-glyph">◈</div>
      <h2>Your dashboard will appear here</h2>
      <p>Ask a business question above to generate your first chart</p>
    </div>
  )
}

export function VoiceOverlay({ onTranscript: _ }: { onTranscript: (t: string) => void }) {
  return null
}

const Toast = forwardRef<(msg: string) => void, Record<string, never>>((_p, ref) => {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout>>()
  useImperativeHandle(ref, () => (m: string) => {
    setMsg(m); setShow(true)
    clearTimeout(t.current)
    t.current = setTimeout(() => setShow(false), 3200)
  })
  return <div className={`toast ${show ? 'show' : ''}`}>{msg}</div>
})
Toast.displayName = 'Toast'
export default Toast
export { Toast }
