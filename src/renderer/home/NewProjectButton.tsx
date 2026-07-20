import { Plus } from "lucide-react";
import { BubbleActionButton } from "../BubbleActionButton";

/** Primary Home action: a scalable glossy pink button with halftone edge light. */
export function NewProjectButton(props: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <BubbleActionButton
      aria-label="New Project"
      className="size-10 shrink-0 rounded-xl text-sm font-extrabold md:mt-4 md:size-11 xl:mt-5 xl:h-12 xl:w-full xl:rounded-2xl"
      data-new-project-button
      title="New Project"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Plus size={17} strokeWidth={2.6} />
      <span className="hidden xl:inline">New Project</span>
    </BubbleActionButton>
  );
}
