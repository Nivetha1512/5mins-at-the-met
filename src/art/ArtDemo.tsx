import { useEffect, useRef, useState } from "react";
import { type Artwork } from "../shared/types";
import { nextArtwork } from "./catalog";
import { ArtPainter } from "./painter";

const CONSTRUCT_MS = 10_000;
const DISSOLVE_MS = 30_000;

type Phase = "construct" | "dissolve";

/**
 * Isolated construct → dissolve preview loop. Not mounted in App.tsx (Agent 0).
 * Preview: temporarily render `<ArtDemo />` from `src/main.tsx`, or see README.
 */
export function ArtDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [phase, setPhase] = useState<Phase>("construct");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const painter = new ArtPainter(canvas);
    let cancelled = false;
    let currentId: string | undefined;

    const loop = async () => {
      while (!cancelled) {
        const next = nextArtwork(currentId);
        currentId = next.id;
        setArtwork(next);
        setPhase("construct");
        try {
          await painter.construct(next.id, CONSTRUCT_MS);
          if (cancelled) break;
          setPhase("dissolve");
          await painter.dissolve(DISSOLVE_MS);
        } catch (err) {
          console.error("ArtDemo loop failed", err);
        }
      }
    };

    void loop();

    return () => {
      cancelled = true;
      painter.destroy();
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0b0b0b",
        color: "#f4f1ea",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      {artwork ? (
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom: 24,
            maxWidth: 640,
            padding: "16px 20px",
            background: "rgba(8, 8, 8, 0.55)",
            backdropFilter: "blur(8px)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>
            {phase === "construct" ? "Constructing" : "Dissolving (30s)"}
          </div>
          <div style={{ fontSize: 22, marginTop: 6 }}>{artwork.title}</div>
          <div style={{ fontSize: 15, opacity: 0.85, marginTop: 2 }}>
            {artwork.artist}, {artwork.year}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.45, margin: "10px 0 0", opacity: 0.9 }}>
            {artwork.description}
          </p>
        </div>
      ) : null}
    </div>
  );
}
