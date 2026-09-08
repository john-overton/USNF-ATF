/**
 * WebGL2 capability probe. Pure: takes a context, returns a plain object. The React
 * screen renders it and the Electron shell prints it in `--probe` mode, so keep this
 * file free of DOM and framework imports.
 */
export interface GlProbeResult {
  readonly renderer: string;
  readonly vendor: string;
  /** True when `renderer`/`vendor` came from WEBGL_debug_renderer_info rather than RENDERER/VENDOR. */
  readonly unmaskedInfo: boolean;
  readonly glVersion: string;
  readonly glslVersion: string;
  readonly maxTextureSize: number;
  readonly maxVertexTextureImageUnits: number;
  readonly maxColorAttachments: number;
  readonly maxSamples: number;
  readonly maxUniformBlockSize: number;
  readonly extColorBufferFloat: boolean;
  /** Max anisotropy from EXT_texture_filter_anisotropic, or 0 when unavailable. */
  readonly maxAnisotropy: number;
  readonly extensionCount: number;
  /** Heuristic: does the renderer string look like a software rasterizer? */
  readonly softwareRenderer: boolean;
}

const SOFTWARE_PATTERNS: readonly RegExp[] = [
  /swiftshader/i,
  /llvmpipe/i,
  /softpipe/i,
  /\bsoftware\b/i,
  /microsoft basic render/i,
  /mesa offscreen/i,
];

export function looksLikeSoftwareRenderer(renderer: string, vendor = ''): boolean {
  const s = `${renderer} ${vendor}`;
  return SOFTWARE_PATTERNS.some((re) => re.test(s));
}

function getInt(gl: WebGL2RenderingContext, pname: GLenum): number {
  const v: unknown = gl.getParameter(pname);
  return typeof v === 'number' ? v : Number(v);
}

function getStr(gl: WebGL2RenderingContext, pname: GLenum): string {
  const v: unknown = gl.getParameter(pname);
  return typeof v === 'string' ? v : String(v);
}

export function probeWebGL2(gl: WebGL2RenderingContext): GlProbeResult {
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  let renderer: string;
  let vendor: string;
  let unmaskedInfo = false;
  if (debugInfo) {
    renderer = getStr(gl, debugInfo.UNMASKED_RENDERER_WEBGL);
    vendor = getStr(gl, debugInfo.UNMASKED_VENDOR_WEBGL);
    unmaskedInfo = true;
  } else {
    renderer = getStr(gl, gl.RENDERER);
    vendor = getStr(gl, gl.VENDOR);
  }

  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const maxAnisotropy = aniso ? getInt(gl, aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0;

  return {
    renderer,
    vendor,
    unmaskedInfo,
    glVersion: getStr(gl, gl.VERSION),
    glslVersion: getStr(gl, gl.SHADING_LANGUAGE_VERSION),
    maxTextureSize: getInt(gl, gl.MAX_TEXTURE_SIZE),
    maxVertexTextureImageUnits: getInt(gl, gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxColorAttachments: getInt(gl, gl.MAX_COLOR_ATTACHMENTS),
    maxSamples: getInt(gl, gl.MAX_SAMPLES),
    maxUniformBlockSize: getInt(gl, gl.MAX_UNIFORM_BLOCK_SIZE),
    extColorBufferFloat: gl.getExtension('EXT_color_buffer_float') !== null,
    maxAnisotropy,
    extensionCount: gl.getSupportedExtensions()?.length ?? 0,
    softwareRenderer: looksLikeSoftwareRenderer(renderer, vendor),
  };
}
