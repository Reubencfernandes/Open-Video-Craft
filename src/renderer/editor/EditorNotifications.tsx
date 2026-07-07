interface EditorNotificationsProps {
  error: string | null;
  exportMessage: string | null;
}

export function EditorNotifications({ error, exportMessage }: EditorNotificationsProps) {
  return (
    <>
      {error ? (
        <div
          className="fixed right-[1.1rem] top-[4.4rem] z-40 min-h-[2.35rem] w-[min(34rem,calc(100vw-2rem))] truncate rounded-lg border border-red-400/35 bg-red-950/70 px-4 py-3 text-sm font-extrabold text-red-50 shadow-[0_18px_42px_rgb(0_0_0_/_0.35)]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {exportMessage ? (
        <div
          className="fixed right-[1.1rem] top-[4.4rem] z-40 flex min-h-[2.35rem] w-[min(28rem,calc(100vw-2rem))] items-center truncate rounded-lg border border-green-500/30 bg-green-800/35 px-3 py-2 text-sm font-extrabold text-green-100 shadow-[0_18px_42px_rgb(0_0_0_/_0.35)]"
          role="status"
          aria-live="polite"
        >
          {exportMessage}
        </div>
      ) : null}
    </>
  );
}
