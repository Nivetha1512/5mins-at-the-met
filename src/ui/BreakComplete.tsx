import type { Artwork } from "../shared";
import "./ui.css";

export type BreakCompleteProps = {
  artwork: Artwork;
  onStartNext: () => void;
};

export function BreakComplete({ artwork, onStartNext }: BreakCompleteProps) {
  return (
    <div className="ui-break" role="dialog" aria-labelledby="ui-break-title">
      <div className="ui-break__caption">
        <h2 id="ui-break-title" className="ui-break__title">
          {artwork.title}
        </h2>
        <p className="ui-break__meta">
          {artwork.artist}, {artwork.year}
        </p>
        <p className="ui-break__description">{artwork.description}</p>
        <p className="ui-break__prompt">The gallery is still. Begin the next study when you are ready.</p>
        <button type="button" className="ui-btn" onClick={onStartNext}>
          Start next session
        </button>
      </div>
    </div>
  );
}
