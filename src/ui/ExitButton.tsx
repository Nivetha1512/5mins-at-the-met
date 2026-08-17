import "./ui.css";

export type ExitButtonProps = {
  onExit: () => void;
};

/** Top-right control to quit the overlay. */
export function ExitButton({ onExit }: ExitButtonProps) {
  return (
    <button type="button" className="ui-exit" onClick={onExit} aria-label="Exit app">
      Exit
    </button>
  );
}
