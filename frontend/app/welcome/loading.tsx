export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <div className="w-full max-w-[430px] mx-auto flex flex-col min-h-screen shadow-2xl">
        <div className="h-12 bg-[#0A1628]" />
        <div className="bg-[#0A1628] pt-6 pb-4 px-4 flex flex-col items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-[#1A2B4A] animate-pulse" />
          <div className="w-48 h-8 rounded-xl bg-[#1A2B4A] animate-pulse" />
          <div className="w-24 h-6 rounded bg-[#1A2B4A] animate-pulse" />
        </div>
        <div className="flex-1 bg-white rounded-t-3xl -mt-2 px-4 py-5 flex flex-col gap-4">
          <div className="w-32 h-4 rounded bg-gray-200 animate-pulse" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-20 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
