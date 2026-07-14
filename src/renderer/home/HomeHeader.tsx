/** Dashboard greeting and project search. */
import { Search } from "lucide-react";

export function HomeHeader(props: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <header className="flex min-w-0 flex-col items-stretch justify-between gap-4 lg:flex-row lg:items-start lg:gap-8">
      <div className="min-w-0">
        <h1 className="m-0 text-[1.65rem] font-semibold tracking-[-0.03em] text-white">Welcome back! <span aria-hidden="true">👋</span></h1>
        <p className="m-0 mt-1.5 text-sm text-slate-400">Create, edit and transform your ideas into amazing videos.</p>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-xl bg-white/[0.06] px-4 text-neutral-500 ring-white/25 focus-within:ring-1 lg:w-[min(30vw,360px)]">
          <Search size={17} />
          <input className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" type="search" placeholder="Search projects..." value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} />
        </label>
      </div>
    </header>
  );
}
