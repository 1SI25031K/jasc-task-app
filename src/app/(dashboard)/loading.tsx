export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="画面を読み込み中"
      className="space-y-6 w-full max-w-4xl mx-auto"
    >
      <span className="sr-only">読み込み中...</span>

      {/* ページタイトル スケルトン */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-full m3-shimmer" />
        <div className="h-4 w-72 rounded-full m3-shimmer" />
      </div>

      {/* フィルター・チップ スケルトン */}
      <div className="flex gap-2 overflow-hidden py-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-24 shrink-0 rounded-[8px] m3-shimmer" />
        ))}
      </div>

      {/* カード・一覧リスト スケルトン */}
      <div className="rounded-[28px] bg-surface-container-lowest p-6 space-y-4">
        <div className="h-6 w-1/4 rounded-full m3-shimmer" />
        <div className="h-16 w-full rounded-[16px] m3-shimmer" />
        <div className="h-16 w-full rounded-[16px] m3-shimmer" />
        <div className="h-16 w-full rounded-[16px] m3-shimmer" />
        <div className="h-16 w-full rounded-[16px] m3-shimmer" />
      </div>
    </div>
  );
}
