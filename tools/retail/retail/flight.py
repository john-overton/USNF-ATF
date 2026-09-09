"""Convert a locally supplied USNF97 F14.PT into attributed flight parameters.

Original runtime force laws are not present in PT. This exports exact data and
explicit unit assumptions, not a recovered implementation of _PLANEProc.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from .pt import PlaneType, load_pt

LB_KG = 0.45359237
LBF_N = 4.4482216152605
FT_M = 0.3048
OBJ_RAW_FIELDS = ('_minSpeed', '_maxSpeed', '_cornerSpeed', '_acc', '_dacc')
RAW_FIELDS = ('_gpullDrag', 'coefDrag', 'airBrakesDrag', 'wheelBrakesDrag',
              'flapsDrag', 'gearDrag', 'bayDrag', 'flapsLift', 'loadedDrag',
              'loadedGpullDrag', 'loadedElevator', 'loadedAileron', 'loadedRudder',
              'fuelConsumption', 'aftFuelConsumption', 'throttleAcc', 'throttleDacc',
              'gpullAOA', 'lowAOASpeed', 'lowAOAPitch', 'turbulencePercent',
              'stallWarningDelay', 'stallDelay', 'stallSeverity', 'stallPitchDown',
              'crashSpeedForward', 'crashSpeedSide', 'crashSpeedVertical',
              'crashPitch', 'crashRoll', 'structureWarnLimit', 'structureLimit',
              'rudderSlip', 'rudderDrag', 'rudderBank', 'negGLimit')


def convert(pt: PlaneType, source_bytes: bytes, source_file: str = 'F14.PT') -> dict:
    # The USNF vs ATF variant is material: ATF changes device drag and G envelopes.
    # This is a bounded F14 converter, not an archive/game autodetector.
    if (Path(source_file).name.upper() != 'F14.PT' or pt.labeled
            or pt.obj.get('typeSize') != 632 or pt.env_min != -4 or pt.env_max != 9):
        raise ValueError('requires the unlabelled USNF97 F14.PT variant (-4..9 G, typeSize 632)')
    if not (0 < pt.weight < pt.max_takeoff_weight < 1_000_000
            and 0 < pt.internal_fuel < pt.max_takeoff_weight
            and 0 < pt.thrust <= pt.aft_thrust < 1_000_000):
        raise ValueError('unsupported aircraft mass/thrust bounds')
    envelopes = []
    native_envelopes = []
    for e in pt.envelopes:
        if not 3 <= e.count <= 20 or len(e.points) < e.count:
            raise ValueError('invalid envelope polygon size')
        if not (isinstance(e.max_speed, int) and isinstance(e.stall_lift, int)
                and 0 <= e.max_speed < e.count and 0 <= e.stall_lift < e.count):
            raise ValueError('invalid native envelope header indices')
        points = e.points[:e.count]
        if any(not 0 <= s <= 10000 or not 0 <= h <= 200000 for s, h in points):
            raise ValueError('envelope coordinates outside supported bounds')
        native_envelopes.append({'g': e.gload, 'count': e.count,
            'maxSpeedIndex': e.max_speed, 'stallLiftIndex': e.stall_lift,
            'points': [{'speedFps': speed, 'altitudeFt': altitude} for speed, altitude in points]})
        envelopes.append({'g': e.gload, 'points': [
            {'speedMps': s * FT_M, 'altitudeM': h * FT_M} for s, h in points]})
    if [e['g'] for e in envelopes] != list(range(-4, 10)):
        raise ValueError('missing or unordered USNF97 F14 envelope rows')
    raw = {}
    keys = list(RAW_FIELDS) + [k for k in pt.plane if k.startswith(('_bv.', '_brv.', 'rudderYaw.', 'puffRot.', 'spin'))]
    for k in keys:
        v = pt.plane[k]
        if not isinstance(v, int):
            raise ValueError(f'noninteger {k}')
        if k in ('fuelConsumption', 'aftFuelConsumption'):
            unit = 'probable lb/s'
        elif k.endswith('Drag') or k in ('coefDrag', 'flapsLift', 'stallSeverity'):
            unit = 'probable 8.8 fixed point'
        else:
            unit = 'unknown'
        raw[k] = {'value': v, 'unit': unit, 'confidence': 'field name aligned from labelled ATF; runtime use unverified'}
    structure = [pt.plane[f'structure[{i}]'] for i in range(2)]
    if any(not isinstance(value, int) or not 0 < value <= 10000 for value in structure):
        raise ValueError('invalid structural speed limits')
    for k in OBJ_RAW_FIELDS:
        value = pt.obj[k]
        if not isinstance(value, int):
            raise ValueError(f'noninteger OBJ_TYPE {k}')
        raw[k] = {'value': value, 'unit': 'raw OBJ_TYPE integer; runtime scaling applies',
                  'confidence': 'field name aligned from labelled ATF; no unit conversion'}
    return {'schemaVersion': 1, 'source': {'game': 'usnf97', 'file': source_file,
            'sha256': hashlib.sha256(source_bytes).hexdigest()}, 'name': pt.long_name,
            'emptyMassKg': pt.weight * LB_KG, 'fuelCapacityKg': pt.internal_fuel * LB_KG,
            'maxTakeoffMassKg': pt.max_takeoff_weight * LB_KG,
            'militaryThrustN': pt.thrust * LBF_N, 'afterburnerThrustN': pt.aft_thrust * LBF_N,
            'envelopes': envelopes, 'native': {'envelopes': native_envelopes,
                'structuralSpeedFps': {'seaLevel': structure[0], 'at36000Ft': structure[1]}}, 'rawFields': raw,
            'semantics': {'mass': 'lb to kg', 'thrust': 'total-engine lbf to N',
                          'envelope': 'ft/s and ft to m/s and m; polygon sustain interpretation inferred',
                          'runtime': 'PT facts only; selected executable routines are translated separately'}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pt', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    result = convert(load_pt(str(args.pt)), args.pt.read_bytes(), args.pt.name)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f"Exported {result['name']}: {len(result['envelopes'])} attributed envelope rows to {args.out}")


if __name__ == '__main__':
    main()
