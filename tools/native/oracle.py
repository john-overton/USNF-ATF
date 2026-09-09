"""Research-only PE32 memory oracle. Never bundles, patches, or launches Windows.

Requires locally supplied executable and optional unicorn in an isolated venv.
Only explicitly called routines run; caller owns globals, ABI and bounds.
"""
from pathlib import Path
import struct
from unicorn import Uc, UC_ARCH_X86, UC_MODE_32
from unicorn.x86_const import UC_X86_REG_ESP, UC_X86_REG_EAX

STACK = 0x70000000
SCRATCH = 0x60000000
STOP = 0x71000000


def load_pe(path):
    data = Path(path).read_bytes()
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    if data[pe:pe+4] != b'PE\0\0':
        raise ValueError('requires a PE executable')
    machine, count = struct.unpack_from('<HH', data, pe+4)
    opt_size = struct.unpack_from('<H', data, pe+20)[0]
    opt = pe + 24
    if machine != 0x14c or struct.unpack_from('<H', data, opt)[0] != 0x10b:
        raise ValueError('requires PE32 i386')
    image_base = struct.unpack_from('<I', data, opt+28)[0]
    image_size = struct.unpack_from('<I', data, opt+56)[0]
    if image_size > 32*1024*1024:
        raise ValueError('image exceeds research bound')
    uc = Uc(UC_ARCH_X86, UC_MODE_32)
    uc.mem_map(image_base, (image_size+4095)&~4095)
    headers = struct.unpack_from('<I', data, opt+60)[0]
    uc.mem_write(image_base, data[:headers])
    for i in range(count):
        offset = opt + opt_size + i*40
        rva, size, raw = struct.unpack_from('<III', data, offset+12)
        if raw+size > len(data) or rva+size > image_size:
            raise ValueError('section outside image')
        uc.mem_write(image_base+rva, data[raw:raw+size])
    for region in (STACK, SCRATCH):
        uc.mem_map(region, 0x100000)
    uc.mem_map(STOP, 4096)
    return uc


def call(uc, address, args=(), registers=None, instruction_limit=100000):
    """Place cdecl/stdcall stack arguments, run to sentinel; return raw EAX.

    No import stubs: an unmapped dependency or instruction limit fails visibly.
    The caller must explicitly seed the routine's register arguments/globals.
    """
    stack = STACK + 0x80000
    uc.mem_write(stack, struct.pack('<'+'I'*(len(args)+1), STOP, *(a & 0xffffffff for a in args)))
    uc.reg_write(UC_X86_REG_ESP, stack)
    for register, value in (registers or {}).items():
        uc.reg_write(register, value & 0xffffffff)
    uc.emu_start(address, STOP, count=instruction_limit)
    from unicorn.x86_const import UC_X86_REG_EIP
    if uc.reg_read(UC_X86_REG_EIP) != STOP:
        raise RuntimeError('native routine did not reach return sentinel within instruction bound')
    return uc.reg_read(UC_X86_REG_EAX)
