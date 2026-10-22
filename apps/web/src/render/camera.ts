export class Camera {
  x = 0; y = 0; zoom = 20; // px per metre
  flip = false;
  width = 1; height = 1;
  /** Fraction of screen height where y=0 sits. */
  horizon = 0.66;

  resize(w: number, h: number) { this.width = w; this.height = h; }

  sx(wx: number): number { return ((this.flip ? -wx : wx) - this.x) * this.zoom + this.width / 2; }
  sy(wy: number): number { return this.height * this.horizon - (wy - this.y) * this.zoom; }
  to(wx: number, wy: number): [number, number] { return [this.sx(wx), this.sy(wy)]; }

  /** Smoothly move toward a target framing. */
  lerpTo(x: number, y: number, zoom: number, k: number) {
    this.x += (x - this.x) * k;
    this.y += (y - this.y) * k;
    this.zoom += (zoom - this.zoom) * k;
  }
}
