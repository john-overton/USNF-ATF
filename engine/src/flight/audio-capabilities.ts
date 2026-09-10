/** Capability boundaries, not synthetic triggers. Evidence: Docs/formats/audio.md. */
export const AUDIO_GAPS = Object.freeze(
  [
    {
      id: 'radar-rwr-missiles',
      status: 'blocked-missing-gameplay',
      reason: 'No radar, threat receiver or missile simulation events',
    },
    {
      id: 'wingmen',
      status: 'blocked-missing-gameplay',
      reason: 'No wingman command/response system',
    },
    {
      id: 'subsystem-damage',
      status: 'blocked-missing-gameplay',
      reason: 'Airframe HP is not a subsystem failure model; JETDAM remains unbound',
    },
    {
      id: 'ejection',
      status: 'blocked-missing-gameplay',
      reason: 'Destruction/defeat is not an ejection event; OUTFUEL remains unbound',
    },
    {
      id: 'bingo',
      status: 'unmapped-native-trigger',
      reason: 'Reserve threshold not established; fuel-empty OUTGAS is a separate supported cue',
    },
    {
      id: 'bump',
      status: 'unmapped-native-trigger',
      reason: 'Native BUMP trigger not established; do not substitute touchdown',
    },
    {
      id: 'movie-playback',
      status: 'recovered-not-integrated',
      reason: '49 CB8 soundtracks recovered; no movie player/timing integration',
    },
    {
      id: 'atf-movies',
      status: 'blocked-missing-media',
      reason:
        'Development media audit: seven ATF_10.LIB CB8 ranges truncated/absent; installation status must be audited separately',
    },
    {
      id: 'native-instruments',
      status: 'external-instrument-dependency',
      reason: 'Original Windows MIDI device/bank unknown; oscillator fallback is authored',
    },
    {
      id: 'native-score-host',
      status: 'blocked-missing-gameplay',
      reason: 'Carrier/ejection/sensor host states absent; current situation adapter is authored',
    },
  ].map((gap) => Object.freeze(gap)),
);
