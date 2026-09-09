"""Validate native clock arithmetic with deterministic QPC import inputs.

This intentionally stubs only the Windows clock query, not flight behavior.
"""
import argparse,json,struct
from pathlib import Path
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP,UC_X86_REG_EIP,UC_X86_REG_EAX
from oracle import load_pe,call,STOP
parser=argparse.ArgumentParser()
parser.add_argument('--exe',required=True)
parser.add_argument('--out',required=True)
args=parser.parse_args()
uc=load_pe(args.exe)
qpc_hook=STOP+0x100
uc.mem_write(0x54e5f8,struct.pack('<I',qpc_hook))
inputs={}
def hook(uc,address,size,user):
 if address!=qpc_hook:return
 sp=uc.reg_read(UC_X86_REG_ESP)
 ret,output=struct.unpack('<II',uc.mem_read(sp,8))
 uc.mem_write(output,struct.pack('<q',inputs['counter']))
 uc.reg_write(UC_X86_REG_EAX,1);uc.reg_write(UC_X86_REG_ESP,sp+8);uc.reg_write(UC_X86_REG_EIP,ret)
uc.hook_add(UC_HOOK_CODE,hook)
rows=[]
for frequency in [1000,10000000,1000000000]:
 for milliseconds in [0,1,500,1000,5000,60000]:
  start=1234567890123;counter=start+frequency*milliseconds//1000;inputs['counter']=counter
  uc.mem_write(0x4bf868,struct.pack('<q',frequency))
  uc.mem_write(0x4fdde0,struct.pack('<q',start))
  call(uc,0x40e770)
  ticks=struct.unpack('<I',uc.mem_read(0x4fddfc,4))[0]
  assert ticks==256*milliseconds//1000
  call(uc,0x40e590,(ticks,12,34))
  seconds=struct.unpack('<H',uc.mem_read(0x4fddf0,2))[0]
  assert seconds==milliseconds//1000
  rows.append(dict(frequency=frequency,milliseconds=milliseconds,ticks=ticks,currentTime=seconds))
result={'scope':'Actual native QPC-to-ticks arithmetic and TIMEInit executed; QueryPerformanceCounter import supplied deterministic test counters via explicit hook; no whole-game clock run','rows':rows}
Path(args.out).parent.mkdir(parents=True,exist_ok=True)
Path(args.out).write_text(json.dumps(result,indent=2))
print(len(rows),'native clock conversion cases pass')
