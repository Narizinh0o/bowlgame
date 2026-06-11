interface Props {
  count: number | null
  onStart: (mode: 'ai' | 'hotseat') => void
}

export default function MenuScreen({ count, onStart }: Props) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <div className="text-5xl">🎳</div>
      <h1 className="mt-2 text-3xl font-extrabold text-amber-400">КЛБ Боулинг-Батл</h1>
      <p className="mt-3 text-slate-300">
        Задрафти пятёрку из реальных игроков КЛБ, расставь по фреймам и выиграй матч по системе Бейкера.
      </p>
      <div className="mt-8 grid gap-3">
        <button
          onClick={() => onStart('ai')}
          disabled={!count}
          className="rounded-xl bg-amber-500 px-4 py-3 text-lg font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          Против компьютера
        </button>
        <button
          onClick={() => onStart('hotseat')}
          disabled={!count}
          className="rounded-xl bg-slate-800 px-4 py-3 text-lg font-bold text-slate-100 transition hover:bg-slate-700 disabled:opacity-50"
        >
          Вдвоём за одним экраном
        </button>
      </div>
      <p className="mt-6 text-xs text-slate-500">
        {count ? `${count} игроков · рейтинги считаются из реальной статистики лиги` : 'Загрузка игроков…'}
      </p>
    </div>
  )
}
