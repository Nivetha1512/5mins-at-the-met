import "./ui.css";

export type BackToWorkProps = {
  onBackToWork: () => void;
};

/** Corner control on break: abort the painting and resume studying. */
export function BackToWork({ onBackToWork }: BackToWorkProps) {
  return (
    <button type="button" className="ui-back-to-work" onClick={onBackToWork}>
      Back to work
    </button>
  );
}
