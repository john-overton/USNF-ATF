/**
 * Retail asset importer (build plan phase 5). Phase 1 only fixes the input contract:
 * the importer reads CD media first (SETUP.ESA plus root *.LIB), an installed folder
 * second (build plan 0.3). Decoders arrive when the phase 0 format notes exist.
 */

export type ImportSource =
  | {
      readonly kind: 'disc-folder';
      /** Folder containing SETUP.ESA and the root *.LIB files (a mounted CD or extracted ISO). */
      readonly path: string;
      readonly esaPath: string;
      readonly libPaths: readonly string[];
    }
  | {
      readonly kind: 'install-folder';
      /** Folder of an installed Windows copy; the LIBs sit alongside the executable. */
      readonly path: string;
      readonly libPaths: readonly string[];
    };

export type ImportTitle = 'usnf97' | 'atf-gold';

export interface DetectResult {
  readonly source: ImportSource;
  readonly title: ImportTitle;
}

/**
 * Inspect a folder and decide whether it is disc media, an install, or neither.
 * TODO(phase 5): look for SETUP.ESA + USNF_*.LIB / ATF_*.LIB through the platform fs
 * and validate the EALIB magic; return undefined when nothing recognisable is present.
 */
export function detectSource(_path: string): Promise<DetectResult | undefined> {
  return Promise.resolve(undefined);
}
