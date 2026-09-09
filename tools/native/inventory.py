"""Inventory local PE32/SMS and bounded flight disassembly without execution.

python3 tools/native/inventory.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE \
  --sms extracted/usnf97/SETUP.ESA/USNF.SMS --out extracted/native-flight
"""
import argparse
import hashlib
import json
import struct
import subprocess
from pathlib import Path


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--exe', required=True)
    p.add_argument('--sms', required=True)
    p.add_argument('--out', required=True)
    args = p.parse_args()
    exe, sms = Path(args.exe).read_bytes(), Path(args.sms).read_bytes()
    count = struct.unpack_from('<I', sms)[0]
    base = 4 + 8*count
    if count > 100000 or base > len(sms):
        raise ValueError('invalid SMS table')
    symbols = []
    for i in range(count):
        offset, va = struct.unpack_from('<II', sms, 4+i*8)
        start = base+offset
        end = sms.find(b'\0', start)
        if start >= len(sms) or end < start:
            raise ValueError('SMS string outside file')
        symbols.append({'name': sms[start:end].decode('ascii'), 'va': hex(va)})
    if [s['name'] for s in symbols] != sorted(s['name'] for s in symbols):
        raise ValueError('SMS names are not sorted as the native binary search requires')
    pe = struct.unpack_from('<I', exe, 60)[0]
    machine, sections = struct.unpack_from('<HH', exe, pe+4)
    opt = pe+24
    imagebase = struct.unpack_from('<I', exe, opt+28)[0]
    optional_size = struct.unpack_from('<H', exe, pe+20)[0]
    section_rows = []
    for i in range(sections):
        o = opt+optional_size+40*i
        vsize,rva,size,raw = struct.unpack_from('<IIII', exe, o+8)
        section_rows.append({'name': exe[o:o+8].rstrip(b'\0').decode('ascii'),
                             'rva':rva,'virtualSize':vsize,'rawSize':size,'rawOffset':raw})
    ranges = {'brf-symbol':(0x498cfe,0x498d57),'symbol-loader':(0x448e60,0x448fa9),
              'symbol-resolver':(0x448fd0,0x44905f),'planeproc':(0x485780,0x4857bc),
              'envelope':(0x483080,0x483382)}
    hashes = {}
    out = Path(args.out)
    out.mkdir(parents=True,exist_ok=True)
    for name,(start,stop) in ranges.items():
        section = next(s for s in section_rows if s['rva'] <= start-imagebase < s['rva']+s['rawSize'])
        offset = start-imagebase-section['rva']+section['rawOffset']
        hashes[name] = {'startVA':hex(start),'stopVA':hex(stop),
                        'sha256':hashlib.sha256(exe[offset:offset+stop-start]).hexdigest()}
        result = subprocess.run(['objdump','-d',f'--start-address={start}',f'--stop-address={stop}',args.exe],check=True,capture_output=True,text=True)
        (out/f'{name}-disassembly.txt').write_text(result.stdout)
    report = {'exeSha256':hashlib.sha256(exe).hexdigest(),'smsSha256':hashlib.sha256(sms).hexdigest(),
              'exeBytes':len(exe),'smsBytes':len(sms),'machine':hex(machine),'imageBase':hex(imagebase),
              'symbolCount':count,'sections':section_rows,'ranges':hashes}
    (out/'inventory.json').write_text(json.dumps(report,indent=2))
    (out/'symbols.json').write_text(json.dumps(symbols,indent=2))
    (out/'headers.txt').write_text(subprocess.run(['objdump','--private-headers',args.exe],check=True,capture_output=True,text=True).stdout)
    print(json.dumps(report,indent=2))

if __name__ == '__main__':
    main()
