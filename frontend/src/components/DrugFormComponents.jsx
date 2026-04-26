import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import MedicationAutocomplete from './MedicationAutocomplete'

export const INDICATION_OPTIONS = [
  'יתר לחץ דם', 'סוכרת', 'כולסטרול גבוה', 'אי ספיקת לב', 'פרפור פרוזדורים',
  'מניעת קרישי דם', 'כאב', 'דיכאון / חרדה', 'אפילפסיה', 'תת פעילות בלוטת תריס',
  'רפלוקס / קיבה', 'אוסטאופורוזיס', 'מחלה אוטואימונית', 'פרקינסון', 'אחר',
]

export const FREQUENCY_OPTIONS = [
  'פעם ביום', 'פעמיים ביום', 'שלוש פעמים ביום', 'ארבע פעמים ביום',
  'כל 8 שעות', 'כל 12 שעות', 'פעם בשבוע', 'לפי הצורך (PRN)', 'אחר',
]

// ── Drug → Indication auto-suggestion map ─────────────────────────────────────
export const DRUG_INDICATION_MAP = {
  // כאב / אנטי-דלקתי
  'Acamol': 'כאב', 'Paracetamol': 'כאב', 'Optalgin': 'כאב', 'Dipyrone': 'כאב',
  'Ibufen': 'כאב', 'Ibuprofen': 'כאב', 'Advil': 'כאב',
  'Voltaren': 'כאב', 'Diclofenac': 'כאב',
  'Arcoxia': 'כאב', 'Etoricoxib': 'כאב', 'Celebrex': 'כאב', 'Celecoxib': 'כאב',
  'Naproxen': 'כאב', 'Proxen': 'כאב', 'Indocid': 'כאב',
  'Tramadol': 'כאב', 'Tramadex': 'כאב', 'Zaldiar': 'כאב', 'Ultram': 'כאב',
  'Lyrica': 'כאב', 'Pregabalin': 'כאב', 'Neurontin': 'כאב', 'Gabapentin': 'כאב',
  'Oxycontin': 'כאב', 'Oxycodone': 'כאב', 'Norspan': 'כאב', 'Buprenorphine': 'כאב',
  'Fentanyl': 'כאב', 'Durogesic': 'כאב', 'Morphine': 'כאב',
  // כולסטרול
  'Lipitor': 'כולסטרול גבוה', 'Atorvastatin': 'כולסטרול גבוה',
  'Crestor': 'כולסטרול גבוה', 'Rosuvastatin': 'כולסטרול גבוה',
  'Zocor': 'כולסטרול גבוה', 'Simvastatin': 'כולסטרול גבוה',
  'Pravastatin': 'כולסטרול גבוה', 'Fluvastatin': 'כולסטרול גבוה',
  'Ezetimibe': 'כולסטרול גבוה', 'Ezetrol': 'כולסטרול גבוה', 'Inegy': 'כולסטרול גבוה',
  'Repatha': 'כולסטרול גבוה', 'Praluent': 'כולסטרול גבוה',
  'Fenofibrate': 'כולסטרול גבוה', 'Lipanthyl': 'כולסטרול גבוה',
  'Omega-3': 'כולסטרול גבוה', 'Omacor': 'כולסטרול גבוה',
  // סוכרת
  'Glucophage': 'סוכרת', 'Metformin': 'סוכרת',
  'Januvia': 'סוכרת', 'Sitagliptin': 'סוכרת',
  'Trajenta': 'סוכרת', 'Linagliptin': 'סוכרת',
  'Galvus': 'סוכרת', 'Vildagliptin': 'סוכרת',
  'Jardiance': 'סוכרת', 'Empagliflozin': 'סוכרת',
  'Forxiga': 'סוכרת', 'Dapagliflozin': 'סוכרת',
  'Invokana': 'סוכרת', 'Canagliflozin': 'סוכרת',
  'Ozempic': 'סוכרת', 'Semaglutide': 'סוכרת', 'Rybelsus': 'סוכרת',
  'Victoza': 'סוכרת', 'Liraglutide': 'סוכרת',
  'Trulicity': 'סוכרת', 'Dulaglutide': 'סוכרת',
  'Lantus': 'סוכרת', 'Levemir': 'סוכרת', 'Tresiba': 'סוכרת', 'Toujeo': 'סוכרת',
  'Novorapid': 'סוכרת', 'Humalog': 'סוכרת', 'Apidra': 'סוכרת',
  'Amaryl': 'סוכרת', 'Glimepiride': 'סוכרת', 'Gliclazide': 'סוכרת',
  // יתר לחץ דם
  'Enalapril': 'יתר לחץ דם', 'Ramipril': 'יתר לחץ דם', 'Tritace': 'יתר לחץ דם',
  'Lisinopril': 'יתר לחץ דם', 'Zestril': 'יתר לחץ דם',
  'Perindopril': 'יתר לחץ דם', 'Coversyl': 'יתר לחץ דם', 'Captopril': 'יתר לחץ דם',
  'Losartan': 'יתר לחץ דם', 'Cozaar': 'יתר לחץ דם',
  'Valsartan': 'יתר לחץ דם', 'Diovan': 'יתר לחץ דם',
  'Irbesartan': 'יתר לחץ דם', 'Candesartan': 'יתר לחץ דם', 'Olmesartan': 'יתר לחץ דם',
  'Concor': 'יתר לחץ דם', 'Bisoprolol': 'יתר לחץ דם',
  'Betaloc': 'יתר לחץ דם', 'Metoprolol': 'יתר לחץ דם',
  'Atenolol': 'יתר לחץ דם', 'Carvedilol': 'יתר לחץ דם',
  'Norvasc': 'יתר לחץ דם', 'Amlodipine': 'יתר לחץ דם', 'Amlopin': 'יתר לחץ דם',
  'Felodipine': 'יתר לחץ דם', 'Nifedipine': 'יתר לחץ דם',
  'Verapamil': 'יתר לחץ דם', 'Diltiazem': 'יתר לחץ דם',
  'Doxazosin': 'יתר לחץ דם', 'Moxonidine': 'יתר לחץ דם',
  'Hydrochlorothiazide': 'יתר לחץ דם', 'Indapamide': 'יתר לחץ דם',
  // אי ספיקת לב
  'Entresto': 'אי ספיקת לב', 'Digoxin': 'אי ספיקת לב', 'Lanoxin': 'אי ספיקת לב',
  'Lasix': 'אי ספיקת לב', 'Furosemide': 'אי ספיקת לב',
  'Aldactone': 'אי ספיקת לב', 'Spironolactone': 'אי ספיקת לב',
  'Inspra': 'אי ספיקת לב', 'Amiodarone': 'פרפור פרוזדורים', 'Cordarone': 'פרפור פרוזדורים',
  'Ivabradine': 'אי ספיקת לב', 'Procoralan': 'אי ספיקת לב',
  // נוגדי קרישה / אנטי-טסיות
  'Coumadin': 'מניעת קרישי דם', 'Warfarin': 'מניעת קרישי דם',
  'Xarelto': 'מניעת קרישי דם', 'Rivaroxaban': 'מניעת קרישי דם',
  'Eliquis': 'מניעת קרישי דם', 'Apixaban': 'מניעת קרישי דם',
  'Pradaxa': 'מניעת קרישי דם', 'Dabigatran': 'מניעת קרישי דם',
  'Plavix': 'מניעת קרישי דם', 'Clopidogrel': 'מניעת קרישי דם',
  'Brilique': 'מניעת קרישי דם', 'Ticagrelor': 'מניעת קרישי דם',
  'Aspirin Cardio': 'מניעת קרישי דם', 'Aspirin': 'מניעת קרישי דם',
  'Clexane': 'מניעת קרישי דם', 'Enoxaparin': 'מניעת קרישי דם',
  // בלוטת תריס
  'Eltroxin': 'תת פעילות בלוטת תריס', 'Euthyrox': 'תת פעילות בלוטת תריס',
  'Levothyroxine': 'תת פעילות בלוטת תריס', 'Synthroid': 'תת פעילות בלוטת תריס',
  // פסיכיאטריה
  'Cipralex': 'דיכאון / חרדה', 'Escitalopram': 'דיכאון / חרדה',
  'Prozac': 'דיכאון / חרדה', 'Fluoxetine': 'דיכאון / חרדה',
  'Zoloft': 'דיכאון / חרדה', 'Sertraline': 'דיכאון / חרדה',
  'Effexor': 'דיכאון / חרדה', 'Venlafaxine': 'דיכאון / חרדה',
  'Cymbalta': 'דיכאון / חרדה', 'Duloxetine': 'דיכאון / חרדה',
  'Remeron': 'דיכאון / חרדה', 'Mirtazapine': 'דיכאון / חרדה',
  'Paroxetine': 'דיכאון / חרדה', 'Citalopram': 'דיכאון / חרדה',
  'Anafranil': 'דיכאון / חרדה', 'Clomipramine': 'דיכאון / חרדה',
  'Amitriptyline': 'דיכאון / חרדה', 'Bupropion': 'דיכאון / חרדה',
  'Xanax': 'דיכאון / חרדה', 'Alprazolam': 'דיכאון / חרדה',
  'Valium': 'דיכאון / חרדה', 'Diazepam': 'דיכאון / חרדה',
  'Lorazepam': 'דיכאון / חרדה', 'Lorivan': 'דיכאון / חרדה',
  'Stilnox': 'דיכאון / חרדה', 'Zolpidem': 'דיכאון / חרדה',
  'Risperdal': 'דיכאון / חרדה', 'Risperidone': 'דיכאון / חרדה',
  'Zyprexa': 'דיכאון / חרדה', 'Olanzapine': 'דיכאון / חרדה',
  'Seroquel': 'דיכאון / חרדה', 'Quetiapine': 'דיכאון / חרדה',
  'Abilify': 'דיכאון / חרדה', 'Lithium': 'דיכאון / חרדה',
  // אפילפסיה
  'Tegretol': 'אפילפסיה', 'Carbamazepine': 'אפילפסיה',
  'Depakine': 'אפילפסיה', 'Valproic Acid': 'אפילפסיה',
  'Lamictal': 'אפילפסיה', 'Lamotrigine': 'אפילפסיה',
  'Keppra': 'אפילפסיה', 'Levetiracetam': 'אפילפסיה',
  'Topamax': 'אפילפסיה', 'Topiramate': 'אפילפסיה',
  'Rivotril': 'אפילפסיה', 'Clonazepam': 'אפילפסיה',
  'Phenobarbital': 'אפילפסיה', 'Phenytoin': 'אפילפסיה',
  'Trileptal': 'אפילפסיה', 'Oxcarbazepine': 'אפילפסיה',
  // רפלוקס / קיבה
  'Losec': 'רפלוקס / קיבה', 'Omeprazole': 'רפלוקס / קיבה', 'Omepradex': 'רפלוקס / קיבה',
  'Nexium': 'רפלוקס / קיבה', 'Esomeprazole': 'רפלוקס / קיבה',
  'Controloc': 'רפלוקס / קיבה', 'Pantoprazole': 'רפלוקס / קיבה',
  'Lansoprazole': 'רפלוקס / קיבה', 'Rabeprazole': 'רפלוקס / קיבה',
  'Zantac': 'רפלוקס / קיבה', 'Motilium': 'רפלוקס / קיבה',
  'Primpiran': 'רפלוקס / קיבה', 'Metoclopramide': 'רפלוקס / קיבה',
  // אוסטאופורוזיס
  'Fosamax': 'אוסטאופורוזיס', 'Alendronate': 'אוסטאופורוזיס',
  'Bonviva': 'אוסטאופורוזיס', 'Actonel': 'אוסטאופורוזיס',
  'Prolia': 'אוסטאופורוזיס', 'Denosumab': 'אוסטאופורוזיס',
  'Evenity': 'אוסטאופורוזיס', 'Forteo': 'אוסטאופורוזיס',
  // מחלה אוטואימונית
  'Humira': 'מחלה אוטואימונית', 'Adalimumab': 'מחלה אוטואימונית',
  'Enbrel': 'מחלה אוטואימונית', 'Etanercept': 'מחלה אוטואימונית',
  'Remicade': 'מחלה אוטואימונית', 'Infliximab': 'מחלה אוטואימונית',
  'Actemra': 'מחלה אוטואימונית', 'Orencia': 'מחלה אוטואימונית',
  'Rinvoq': 'מחלה אוטואימונית', 'Xeljanz': 'מחלה אוטואימונית',
  'Cosentyx': 'מחלה אוטואימונית', 'Stelara': 'מחלה אוטואימונית',
  'Methotrexate': 'מחלה אוטואימונית', 'Plaquenil': 'מחלה אוטואימונית',
  'Hydroxychloroquine': 'מחלה אוטואימונית', 'Arava': 'מחלה אוטואימונית',
  'Imuran': 'מחלה אוטואימונית', 'CellCept': 'מחלה אוטואימונית',
  // פרקינסון
  'Madopar': 'פרקינסון', 'Sinemet': 'פרקינסון', 'Levodopa': 'פרקינסון',
  'Azilect': 'פרקינסון', 'Rasagiline': 'פרקינסון', 'Mirapex': 'פרקינסון',
  'Requip': 'פרקינסון', 'Neupro': 'פרקינסון',
}

// ── Portal ────────────────────────────────────────────────────────────────────
export function DropdownPortal({ inputRef, open, children }) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  useEffect(() => {
    if (!open || !inputRef?.current) return
    const r = inputRef.current.getBoundingClientRect()
    setPos({ top: r.bottom, left: r.left, width: r.width })
  }, [open, inputRef])
  if (!open) return null
  return createPortal(
    <div style={{ position: 'fixed', top: pos.top + 4, left: pos.left, width: pos.width, zIndex: 9999 }}>
      {children}
    </div>,
    document.body
  )
}

// ── IndicationCombobox ────────────────────────────────────────────────────────
export function IndicationCombobox({ value, onChange, className = 'input w-full' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = query.trim()
    ? INDICATION_OPTIONS.filter(o => o.includes(query.trim()))
    : INDICATION_OPTIONS

  return (
    <div ref={wrapRef}>
      <input
        ref={inputRef} className={className} placeholder="הקלד או בחר התוויה" value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        data-form-type="other" name="indication-combobox"
      />
      <DropdownPortal inputRef={inputRef} open={open && filtered.length > 0}>
        <ul className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto text-sm">
          {filtered.map(opt => (
            <li key={opt} onMouseDown={() => { setQuery(opt); onChange(opt); setOpen(false) }}
              className="px-4 py-2 cursor-pointer hover:bg-blue-50 border-b border-slate-100 last:border-0">{opt}</li>
          ))}
        </ul>
      </DropdownPortal>
    </div>
  )
}

// ── DosageCombobox ────────────────────────────────────────────────────────────
export function DosageCombobox({ value, onChange, suggestions, className = 'input w-full' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = query.trim()
    ? suggestions.filter(s => s.toLowerCase().startsWith(query.toLowerCase().trim()))
    : suggestions

  return (
    <div ref={wrapRef}>
      <input
        ref={inputRef} className={className}
        placeholder={suggestions.length > 0 ? `מינון (${suggestions.slice(0, 3).join(' / ')})` : 'מינון (למשל: 10mg)'}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        data-form-type="other" name="dosage-combobox"
      />
      <DropdownPortal inputRef={inputRef} open={open && filtered.length > 0}>
        <ul className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-44 overflow-y-auto text-sm">
          {filtered.map(d => (
            <li key={d} onMouseDown={() => { setQuery(d); onChange(d); setOpen(false) }}
              className="px-4 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-slate-100 last:border-0 font-medium text-slate-700">{d}</li>
          ))}
        </ul>
      </DropdownPortal>
    </div>
  )
}

// ── MedicationCard — shared add/edit form ─────────────────────────────────────
export function MedicationCard({ med, onChange, onRemove }) {
  const [dosageSuggestions, setDosageSuggestions] = useState([])
  const [interactionsText, setInteractionsText] = useState('')
  const [showInteractions, setShowInteractions] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [showExtra, setShowExtra] = useState(
    () => !!(med.start_date || med.end_date || med.notes || med.is_active === false)
  )

  const handleDrugSelect = (drug) => {
    const mappedIndication = DRUG_INDICATION_MAP[drug.name] || ''
    const newIndication = mappedIndication || med.indication || ''
    onChange({ ...med, name: drug.name, generic_name: drug.generic_name || med.generic_name || '', indication: newIndication })
    setInteractionsText('')
    setShowInteractions(false)
  }

  const handleEnrichment = (data) => {
    setEnriching(false)
    // Update dosage suggestions if openFDA has better data
    if (data.dosages?.length) setDosageSuggestions(data.dosages)
    // Auto-fill indication if empty and openFDA has one
    if (data.indication && !med.indication) {
      // Map long English text to our Hebrew options or use as-is
      const mapped = Object.entries(DRUG_INDICATION_MAP).find(([k]) =>
        k.toLowerCase() === med.name?.toLowerCase()
      )
      if (!mapped) onChange(prev => ({ ...prev, indication: data.indication }))
    }
    // Store interaction text for display
    if (data.interactions_text) setInteractionsText(data.interactions_text)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label text-xs">שם תרופה *</label>
          <MedicationAutocomplete
            value={med.name}
            onChange={handleDrugSelect}
            onDosagesAvailable={d => setDosageSuggestions(d || [])}
            onEnrichment={data => { setEnriching(false); handleEnrichment(data) }}
          />
        </div>
        <div>
          <label className="label text-xs">מינון</label>
          <DosageCombobox
            value={med.dosage || ''}
            onChange={v => onChange({ ...med, dosage: v })}
            suggestions={dosageSuggestions}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label text-xs">תדירות</label>
          <select
            className="input"
            value={med.frequency || ''}
            onChange={e => onChange({ ...med, frequency: e.target.value })}
          >
            <option value="">— בחר —</option>
            {FREQUENCY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">התוויה (סיבת הטיפול)</label>
          <IndicationCombobox
            value={med.indication || ''}
            onChange={v => onChange({ ...med, indication: v })}
          />
        </div>
      </div>

      {/* ── Collapsible extra fields ─────────────────────────────────── */}
      <div className="border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={() => setShowExtra(v => !v)}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 select-none"
        >
          <span>{showExtra ? '▾' : '▸'}</span>
          שדות נוספים
          {(med.start_date || med.end_date || med.notes) && !showExtra && (
            <span className="mr-1 w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
          )}
        </button>
        {showExtra && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">תאריך התחלה</label>
                <input type="date" className="input" value={med.start_date || ''}
                  onChange={e => onChange({ ...med, start_date: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">תאריך סיום</label>
                <input type="date" className="input" value={med.end_date || ''}
                  onChange={e => onChange({ ...med, end_date: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label text-xs">הערות</label>
              <textarea className="input" rows={2} value={med.notes || ''}
                onChange={e => onChange({ ...med, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="med-is-active" checked={med.is_active !== false}
                onChange={e => onChange({ ...med, is_active: e.target.checked })} className="w-4 h-4" />
              <label htmlFor="med-is-active" className="text-sm text-slate-700">תרופה פעילה</label>
            </div>
          </div>
        )}
      </div>

      {onRemove && (
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
            ✕ הסר תרופה
          </button>
        </div>
      )}
    </div>
  )
}

// ── MedRow — horizontal medication row for lists ──────────────────────────────
export function MedRow({ med, onEdit, onDelete, onToggle }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 bg-white rounded-xl border border-slate-200 ${!med.is_active ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap text-sm">
        <span className="font-semibold text-slate-800">{med.name}</span>
        {med.hebrew_name && <span className="text-xs text-blue-600">{med.hebrew_name}</span>}
        {med.dosage && (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">{med.dosage}</span>
        )}
        {med.frequency && (
          <span className="text-slate-500 text-xs">· {med.frequency}</span>
        )}
        {med.indication && (
          <span className="text-blue-600 text-xs font-medium">· {med.indication}</span>
        )}
        {!med.is_active && (
          <span className="text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">לא פעיל</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onToggle && (
          <button onClick={() => onToggle(med)} title={med.is_active ? 'השהה' : 'הפעל'}
            className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">
            {med.is_active ? '⏸' : '▶'}
          </button>
        )}
        {onEdit && (
          <button onClick={() => onEdit(med)}
            className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">✏️</button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(med.id || med._idx)}
            className="text-xs px-2 py-1 rounded-lg border border-red-100 text-red-400 hover:bg-red-50">🗑</button>
        )}
      </div>
    </div>
  )
}
