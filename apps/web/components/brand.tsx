import { Grid2X2 } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span
      className={light ? "brand brand-light" : "brand"}
      aria-label="AtlasQR"
    >
      <Grid2X2 aria-hidden="true" />
      <span>AtlasQR</span>
    </span>
  );
}
