/** Dashboard greeting and project search. */
import { Search } from "lucide-react";

export function HomeHeader(props: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <header className="flex min-w-0 shrink-0 flex-col items-stretch justify-between gap-4 bg-[#121214] px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-8 xl:px-7">
      <div className="min-w-0">
        <h1 className="m-0 text-xl font-semibold tracking-[-0.025em] text-white">Projects</h1>
        <p className="m-0 mt-1 text-xs text-neutral-500">Create, manage, and continue your video work.</p>
      </div>
      <div className="flex min-w-0 items-center gap-2 lg:w-[min(42vw,34rem)]">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-black/25 px-3.5 text-neutral-600 transition-colors focus-within:bg-black/40 focus-within:text-neutral-300">
          <Search size={16} />
          <input className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-neutral-600" type="search" placeholder="Search projects, recordings, and edits…" value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} />
        </label>
      </div>
    </header>
  );
}
