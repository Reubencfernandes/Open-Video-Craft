/** Dashboard greeting and project search. */
import { Search } from "lucide-react";

export function HomeHeader(props: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <header className="flex items-start justify-between gap-8">
      <div>
        <h1 className="m-0 text-[1.65rem] font-semibold tracking-[-0.03em] text-white">Welcome back! <span aria-hidden="true">👋</span></h1>
        <p className="m-0 mt-1.5 text-sm text-slate-400">Create, edit and transform your ideas into amazing videos.</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex h-11 w-[min(30vw,360px)] items-center gap-2 rounded-xl bg-white/[0.035] px-4 text-slate-500 ring-amber-400/30 focus-within:ring-1">
          <Search size={17} />
          <input className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" type="search" placeholder="Search projects..." value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} />
        </label>
      </div>
    </header>
  );
}
