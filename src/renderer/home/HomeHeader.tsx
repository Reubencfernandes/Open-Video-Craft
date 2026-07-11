/** Dashboard greeting, project search, and notification entry point. */
import { Bell, Search } from "lucide-react";

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
        <label className="flex h-11 w-[min(30vw,360px)] items-center gap-2 rounded-xl border border-white/[0.055] bg-white/[0.035] px-4 text-slate-500 focus-within:border-violet-400/30">
          <Search size={17} />
          <input className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" type="search" placeholder="Search projects..." value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} />
        </label>
        <button className="grid size-11 place-items-center rounded-xl border border-white/[0.055] bg-white/[0.035] text-slate-300 hover:bg-white/[0.07] hover:text-white" type="button" title="Notifications">
          <Bell size={17} />
        </button>
      </div>
    </header>
  );
}
