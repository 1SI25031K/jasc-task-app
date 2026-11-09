export default function RootLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="読み込み中"
      className="flex h-screen w-screen overflow-hidden bg-surface"
    >
      <span className="sr-only">読み込み中...</span>

      {/* 左サイドナビゲーション スケルトン (Permanent Drawer 280px) */}
      <div className="hidden lg:flex w-[280px] shrink-0 flex-col gap-3 p-4 bg-surface">
        <div className="h-10 w-44 rounded-full m3-shimmer mb-6" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-12 w-full rounded-[28px] m3-shimmer" />
          ))}
        </div>
      </div>

      {/* メイン領域 スケルトン */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-surface">
        {/* 上部バー スケルトン (64px) */}
        <div className="h-16 px-6 flex items-center justify-between bg-surface">
          <div className="h-6 w-48 rounded-full m3-shimmer" />
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full m3-shimmer" />
            <div className="h-9 w-9 rounded-full m3-shimmer" />
          </div>
        </div>

        {/* 本文グリッド スケルトン */}
        <div className="flex-1 p-6 max-w-4xl w-full mx-auto space-y-6 overflow-y-auto">
          <div className="h-14 w-full rounded-full m3-shimmer" />
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-24 rounded-[8px] m3-shimmer" />
            ))}
          </div>
          <div className="rounded-[28px] bg-surface-container-lowest p-6 space-y-4">
            <div className="h-6 w-1/3 rounded-full m3-shimmer" />
            <div className="h-12 w-full rounded-[16px] m3-shimmer" />
            <div className="h-12 w-full rounded-[16px] m3-shimmer" />
            <div className="h-12 w-full rounded-[16px] m3-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}
