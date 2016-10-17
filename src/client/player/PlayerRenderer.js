import { Renderer } from 'soundworks/client';

/**
 * A simple canvas renderer, used e.g. to change screen's background color.
 */
export default class PlayerRenderer extends Renderer {
  constructor() {
    super(0); // update rate = 0: synchronize updates to frame rate

    // local attributes
    this.bkgChangeColor = false;
    this.bkgColor = [0,0,0];
  }

  /**
   * Initialize rederer state.
   * @param {Number} dt - time since last update in seconds.
   */
  init() {}

  /**
   * Update rederer state.
   * @param {Number} dt - time since last update in seconds.
   */
  update(dt) {}

  /**
   * Draw into canvas.
   * Method is called by animation frame loop in current frame rate.
   * @param {CanvasRenderingContext2D} ctx - canvas 2D rendering context
   */
  render(ctx) {
    // set background color
    if (this.bkgChangeColor) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgb(" + this.bkgColor[0] + ", " + this.bkgColor[1] + ", " + this.bkgColor[2] + ")";
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fill();
      ctx.restore();
      this.bkgChangeColor = false;
    }
  }

  /**
   * Tell render to change background color at next update.
   * @param {Array} rgbArray - RGB color array
   */
  setBkgColor(rgbArray) {
    this.bkgColor = rgbArray;
    this.bkgChangeColor = true;
  }

}
