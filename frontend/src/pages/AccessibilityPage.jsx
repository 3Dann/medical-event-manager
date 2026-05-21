export default function AccessibilityPage() {
  return (
    <main className="max-w-2xl mx-auto p-8" dir="rtl" lang="he">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">הצהרת נגישות</h1>

      <section className="space-y-4 text-slate-700 leading-relaxed">
        <p>
          OrMed מחויבת לנגישות הדיגיטלית לאנשים עם מוגבלות.
          אנו שואפים לעמוד בדרישות תקן IS 5568 ו-WCAG 2.1 ברמה AA.
        </p>

        <h2 className="text-lg font-semibold text-slate-800 mt-6">מה כלול בנגישות המערכת</h2>
        <ul className="list-disc list-inside space-y-2 mr-4">
          <li>ניווט מלא במקלדת</li>
          <li>תמיכה בקוראי מסך (NVDA, JAWS, VoiceOver)</li>
          <li>יחסי ניגודיות עומדים בדרישות WCAG AA</li>
          <li>גופנים ניתנים להגדלה עד 200% ללא אובדן תוכן</li>
          <li>תמיכה ב-RTL מלא לשפה העברית</li>
          <li>כפתורי פעולה בגודל מינימלי 44×44 פיקסל</li>
          <li>הקראת טקסט קולית בפורטל המטופל</li>
        </ul>

        <h2 className="text-lg font-semibold text-slate-800 mt-6">בעיות נגישות ידועות</h2>
        <p>אנו עובדים על שיפור מתמיד. בעיות ידועות כוללות:</p>
        <ul className="list-disc list-inside space-y-2 mr-4">
          <li>חלק מהטפסים המורכבים עדיין בתהליך שיפור נגישות</li>
          <li>ניווט מקלדת בשדות תאריך בתהליך שיפור</li>
        </ul>

        <h2 className="text-lg font-semibold text-slate-800 mt-6">יצירת קשר בנושא נגישות</h2>
        <p>
          נתקלת בבעיית נגישות? נשמח לשמוע:{' '}
          <a href="mailto:accessibility@ormed.co.il" className="text-blue-600 hover:underline">
            accessibility@ormed.co.il
          </a>
        </p>
        <p className="text-sm text-slate-500 mt-4">
          עודכן לאחרונה: מאי 2026 | תקן IS 5568 | WCAG 2.1 AA
        </p>
      </section>
    </main>
  )
}
