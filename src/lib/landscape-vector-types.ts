/** Shared path geometry for the canvas, library thumbnails and portable SVG. */
export type LandscapeVectorPath = {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
};
export type LandscapeVectorArtwork = {
  width: number;
  height: number;
  paths: LandscapeVectorPath[];
};
