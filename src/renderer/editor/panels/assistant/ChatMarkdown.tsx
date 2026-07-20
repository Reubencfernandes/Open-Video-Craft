import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function externalHttpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Safe Markdown used for model output. Raw HTML is ignored and links leave via guarded IPC. */
export function ChatMarkdown(props: { children: string }) {
  return (
    <div className="min-w-0 break-words [overflow-wrap:anywhere]
        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
        [&_p]:my-1.5 [&_p]:whitespace-pre-wrap
        [&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-sm [&_h1]:font-extrabold
        [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-[0.8rem] [&_h2]:font-extrabold
        [&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:font-extrabold
        [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4
        [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-4
        [&_li]:pl-0.5 [&_li>p]:my-0
        [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-2.5 [&_blockquote]:text-neutral-400
        [&_hr]:my-3 [&_hr]:border-white/10
        [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/45 [&_pre]:p-2.5
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.68rem]
        [&_code]:rounded [&_code]:bg-black/35 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.72rem] [&_code]:text-neutral-100
        [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-left
        [&_th]:border [&_th]:border-white/15 [&_th]:bg-white/[0.06] [&_th]:px-2 [&_th]:py-1 [&_th]:font-bold
        [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1
        [&_input]:mr-1.5 [&_input]:accent-white
        [&_strong]:font-extrabold [&_strong]:text-white">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const safeHref = externalHttpUrl(href);
            return safeHref ? (
              <a
                className="font-semibold text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200"
                href={safeHref}
                onClick={(event) => {
                  event.preventDefault();
                  void window.openVideoCraft.app.openExternal(safeHref);
                }}
              >
                {children}
              </a>
            ) : <span>{children}</span>;
          }
        }}
      >
        {props.children}
      </Markdown>
    </div>
  );
}
