import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
      <div className="text-center max-w-sm">
        <div className="text-8xl font-black text-slate-200 mb-4">404</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">הדף לא נמצא</h1>
        <p className="text-slate-500 mb-8">הקישור שפתחת אינו קיים במערכת.</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 min-h-[44px]"
        >
          חזרה לדף הבית
        </button>
      </div>
    </main>
  )
}
