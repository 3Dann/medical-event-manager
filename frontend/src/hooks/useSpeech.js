import { useState, useCallback, useRef } from 'react'

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false)
  const uttRef = useRef(null)

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const speak = useCallback((text) => {
    if (!supported) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'he-IL'
    utt.rate = 0.9
    utt.onstart = () => setSpeaking(true)
    utt.onend = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    uttRef.current = utt
    window.speechSynthesis.speak(utt)
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  return { speak, stop, speaking, supported }
}
