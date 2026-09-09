// CDP-only experiment: quadruple atlas texels without changing product/data limits.
// Upscaling preserves content; this measures GPU allocation/sampling, not sharper imagery.
(() => {
  const p = WebGL2RenderingContext.prototype;
  const storage = p.texStorage2D, upload = p.texSubImage2D;
  const probe = window.__textureAllocationProbe = { allocations: 0, uploads: 0 };
  p.texStorage2D = function (...args) {
    if (args[3] === 3071 && args[4] === 3072) {
      args[1] += 1; args[3] *= 2; args[4] *= 2;
      probe.allocations++;
      probe.width = args[3]; probe.height = args[4];
      probe.maxTextureSize = this.getParameter(this.MAX_TEXTURE_SIZE);
    }
    return storage.apply(this, args);
  };
  p.texSubImage2D = function (...args) {
    if (args[4] === 3071 && args[5] === 3072 && args[8] instanceof Uint8Array) {
      const start = performance.now(), w = args[4], h = args[5];
      const src = new Uint32Array(args[8].buffer, args[8].byteOffset, w * h);
      const dst = new Uint32Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        const row = y * w * 4;
        for (let x = 0; x < w; x++) dst[row + 2*x] = dst[row + 2*x + 1] = src[y*w+x];
        dst.copyWithin(row + 2*w, row, row + 2*w);
      }
      args[4] *= 2; args[5] *= 2; args[8] = new Uint8Array(dst.buffer);
      // Retain the enlarged source like a production DataTexture would.
      window.__textureAllocationPixels = args[8];
      probe.expansionMs = performance.now() - start;
      probe.uploads++; probe.rawBytes = dst.byteLength;
      let bytes = 0;
      for (let x=args[4], y=args[5];;x=Math.max(1,x>>1),y=Math.max(1,y>>1)) {
        bytes += x*y*4; if(x===1 && y===1) break;
      }
      probe.gpuMipBytes = bytes;
    }
    return upload.apply(this, args);
  };
})();
