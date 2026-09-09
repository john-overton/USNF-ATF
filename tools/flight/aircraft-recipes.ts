import type { AircraftId } from '../../engine/src/flight/aircraft-catalog';

/** Original import instructions only; no geometry, textures, PCM or PT tables. */
export interface AircraftRecipe {
  model: string;
  palette: string;
  pt: string;
  scale: { axis: 'length' | 'wingspan'; metres: number; reason: string };
  notes: string[];
}
export const AIRCRAFT_RECIPES: Record<AircraftId, AircraftRecipe> = {
  f14: {
    model: 'usnf97/USNF_2.LIB/F14.SH',
    palette: 'usnf97/USNF_2.LIB/PALETTE.PAL',
    pt: 'usnf97/USNF_2.LIB/F14.PT',
    scale: { axis: 'length', metres: 19.1, reason: 'Preserved F-14 presentation calibration; do not silently change the comparison aircraft.' },
    notes: ['USNF97 geometry retained as the established F-14 comparison baseline.', 'Native helper evidence is limited to documented F-14 routines, not complete native flight.'],
  },
  a4e: {
    model: 'atf-gold/ATF_2.LIB/A4.SH',
    palette: 'atf-gold/ATF_2.LIB/PALETTE.PAL',
    pt: 'usnf97/USNF_2.LIB/A4E.PT',
    scale: { axis: 'length', metres: 12.22, reason: 'Authored whole-model length; cross-check span, height, probe and hook against orthographic views.' },
    notes: ['ATF-GOLD exterior/textures; USNF97 PT/audio fallback because ATF-GOLD A4E.PTS is not a decoded BRF PT.', 'No afterburner; raw zero aftThrust maps to effective military maximum for the force fitter.', 'A-4 hook and surface hinges are authored visual approximations.'],
  },
  x31: {
    model: 'atf-gold/ATF_2.LIB/F31.SH',
    palette: 'atf-gold/ATF_2.LIB/PALETTE.PAL',
    pt: 'atf-gold/ATF_2.LIB/F31.PT',
    scale: { axis: 'wingspan', metres: 7.26, reason: 'Local F31.INF wingspan calibration; nose/probe length convention is uncertain. Preserve canard/wing proportions.' },
    notes: ['ATF-GOLD X-31 EFM game configuration; not a claim about prototype performance.', 'Canards/elevons/rudder move; nozzle vectoring and a visual dorsal brake remain unported.', 'No recovered-native profile; ATF fuel timing/unit reuse remains inferred.'],
  },
};
