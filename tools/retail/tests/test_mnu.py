"""UI table decoder: a hand-built PL image, plus the local media when present."""

import glob
import struct
import unittest
from pathlib import Path

from _paths import TOOLS_RETAIL  # noqa: F401
from retail.mnu import MNUError, load_ui

ROOT = Path(__file__).resolve().parents[3]
EXTRACTED = ROOT / 'extracted'

CODE_VA, IDATA_VA, RELOC_VA = 0x1000, 0x2000, 0x3000


def build_dialog(rect, widgets, imports=('_DrawAction',), handler=None):
    """A minimal Phar Lap image shaped exactly like the retail dialogs.

    ``widgets`` are ``(import name, x, y, command, width, label)`` tuples; the
    label is written into the string pool at the end of CODE, as the real files
    do, and the record's class and label slots are listed in .reloc.
    """
    names = list(imports)
    # .idata: one descriptor, then the IAT, then main.dll and the hint/name pairs.
    iat = IDATA_VA + 40            # one descriptor, then the null descriptor
    name_table = iat + 4 * (len(names) + 1)
    entries = name_table + 12                      # 'main.dll' plus padding
    slots, cursor = {}, entries
    for name in names:
        slots[name] = cursor
        cursor += 2 + len(name) + 1
    idata = bytearray(struct.pack('<5I', iat, 0, 0, name_table, iat) + bytes(20))
    for name in names:
        idata += struct.pack('<I', slots[name])
    idata += struct.pack('<I', 0)
    idata += b'main.dll\0\0\0\0'
    for name in names:
        idata += struct.pack('<H', 0) + name.encode() + b'\0'

    code = bytearray(0x15)
    struct.pack_into('<4h', code, 0x04, *rect)
    relocs, labels = [], bytearray()
    records = []
    for name, x, y, command, width, label in widgets:
        start = len(code)
        record = bytearray(0x26)
        struct.pack_into('<h', record, 0x04, x)
        struct.pack_into('<h', record, 0x06, y)
        record[0x11] = command
        struct.pack_into('<H', record, 0x12, width)
        code += record
        records.append((start, name, label))
        relocs += [start, start + 0x14]
    label_base = len(code)
    positions = {}
    for _start, _name, label in records:
        positions[label] = label_base + len(labels)
        labels += label.encode() + b'\0'
    code += labels
    thunk_base = len(code)
    thunks = {}
    for index, name in enumerate(names):
        thunks[name] = CODE_VA + thunk_base + 6 * index
        code += b'\xff\x25' + struct.pack('<I', iat + 4 * names.index(name))
        relocs.append(thunk_base + 6 * index + 2)
    for start, name, label in records:
        struct.pack_into('<I', code, start, thunks[name])
        struct.pack_into('<I', code, start + 0x14, CODE_VA + positions[label])
    if handler:
        struct.pack_into('<I', code, 0, thunks[handler])
        relocs.append(0)

    reloc = bytearray()
    for page in sorted({(CODE_VA + offset) & ~0xFFF for offset in relocs}):
        block = b''.join(
            struct.pack('<H', 0x3000 | ((CODE_VA + offset) & 0xFFF))
            for offset in sorted(relocs)
            if (CODE_VA + offset) & ~0xFFF == page
        )
        reloc += struct.pack('<II', page, 8 + len(block)) + block

    sections = [(b'CODE', CODE_VA, bytes(code)), (b'.idata', IDATA_VA, bytes(idata)),
                (b'.reloc', RELOC_VA, bytes(reloc))]
    optional = bytearray(224)
    struct.pack_into('<H', optional, 0, 0x10B)
    struct.pack_into('<I', optional, 28, 0)         # image base 0, as the retail files use
    header = bytearray(b'MZ' + b'\0' * 0x7E)
    struct.pack_into('<I', header, 0x3C, 0x80)
    table = struct.pack('<HHIIIHH', 0x14C, len(sections), 0, 0, 0, len(optional), 0) + bytes(optional)
    raw = 0x80 + 4 + len(table) + 40 * len(sections)
    raw = (raw + 0x1FF) & ~0x1FF
    directory, body = bytearray(), bytearray()
    for name, va, data in sections:
        directory += struct.pack('<8sIIII', name, len(data), va, len(data), raw + len(body))
        directory += b'\0' * 16                   # a section header is 40 bytes
        body += data
    return bytes(header) + b'PL\0\0' + table + bytes(directory) + b'\0' * (raw - (0x80 + 4 + len(table) + len(directory))) + bytes(body)


class SyntheticTests(unittest.TestCase):
    def setUp(self):
        self.path = Path(EXTRACTED) / 'test-mnu-fixture.dlg'
        EXTRACTED.mkdir(exist_ok=True)

    def tearDown(self):
        self.path.unlink(missing_ok=True)

    def write(self, data):
        self.path.write_bytes(data)
        return load_ui(self.path)

    def test_header_records_and_labels(self):
        table = self.write(build_dialog(
            (379, 80, 238, 361),
            [('_DrawAction', 31, 24, 0, 180, 'Play Single Mission'),
             ('_DrawAction', 31, 56, 1, 180, 'Create Quick Mission')],
        ))
        self.assertEqual(table.kind, 'dialog')
        self.assertEqual(table.rect, (379, 80, 238, 361))
        self.assertEqual([w.type for w in table.widgets], ['_DrawAction'] * 2)
        self.assertEqual([(w.x, w.y) for w in table.widgets], [(31, 24), (31, 56)])
        self.assertEqual([w.command for w in table.widgets], [0, 1])
        self.assertEqual([w.width for w in table.widgets], [180, 180])
        self.assertEqual([w.label for w in table.widgets],
                         ['Play Single Mission', 'Create Quick Mission'])
        self.assertEqual(table.imports, ['_DrawAction'])
        self.assertEqual(table.unresolved, [])

    def test_stride_is_measured_and_classes_come_from_the_import_names(self):
        table = self.write(build_dialog(
            (0, 0, 640, 480),
            [('_DrawDial', 33, 38, 0, 20, 'Fuel'), ('_DrawRocker', 145, 52, 3, 12, 'Rounds')],
            imports=('_DrawDial', '_DrawRocker'),
        ))
        self.assertEqual([w.type for w in table.widgets], ['_DrawDial', '_DrawRocker'])
        self.assertEqual([w.size for w in table.widgets], [0x26, 0x26])
        self.assertEqual([w.label for w in table.widgets], ['Fuel', 'Rounds'])

    def test_dialog_handler_resolves_through_the_import_table(self):
        table = self.write(build_dialog(
            (1, 2, 3, 4), [('_DrawAction', 5, 6, 7, 8, 'Go')],
            imports=('_DrawAction', '_ChoosePreload'), handler='_ChoosePreload',
        ))
        self.assertEqual(table.handler, '_ChoosePreload')

    def test_a_file_without_a_code_section_is_rejected(self):
        header = bytearray(b'MZ' + b'\0' * 0x7E)
        struct.pack_into('<I', header, 0x3C, 0x80)
        optional = bytes(224)
        table = struct.pack('<HHIIIHH', 0x14C, 0, 0, 0, 0, len(optional), 0) + optional
        with self.assertRaises(MNUError):
            self.write(bytes(header) + b'PL\0\0' + table)


class LocalMediaTests(unittest.TestCase):
    """Opt-in: these read locally converted media and skip when it is absent."""

    def find(self, name, game='usnf97'):
        matches = glob.glob(str(EXTRACTED / game / '*.LIB' / name))
        if not matches:
            self.skipTest(f'local media missing: {game}/{name}')
        return sorted(matches)[0]

    def test_chooseac_is_the_main_menu(self):
        table = load_ui(self.find('CHOOSEAC.DLG'))
        self.assertEqual(table.rect, (379, 80, 238, 361))
        self.assertEqual(len(table.widgets), 8)
        self.assertEqual([w.label for w in table.widgets], [
            'Play Single Mission', 'Create Quick Mission', 'Create Pro Mission',
            'Replay Last Mission', 'Start New Campaign', 'Continue Old Campaign',
            'View Pilot Records', 'Reference'])
        self.assertEqual({w.x for w in table.widgets}, {31})
        self.assertEqual({w.width for w in table.widgets}, {180})
        self.assertEqual([w.y for w in table.widgets], [24, 56, 88, 120, 170, 202, 234, 285])

    def test_loadord_is_the_ordnance_bar(self):
        table = load_ui(self.find('LOADORD.DLG'))
        self.assertEqual(table.rect, (115, 356, 470, 102))
        self.assertEqual([w.type for w in table.widgets], [
            '_DrawRocker', '_DrawDial', '_DrawDial', '_DrawRocker',
            '_DrawAction', '_DrawAction'])
        self.assertEqual([w.label for w in table.widgets if w.label], ['Fly', 'Select Plane'])
        # Both dials decode to one position, so +4/+6 is not a dial's position.
        self.assertTrue(any('same position' in note for note in table.unresolved))

    def test_menus_carry_inline_labels_and_accelerators(self):
        table = load_ui(self.find('MAINMENU.MNU'))
        self.assertEqual(table.kind, 'menu')
        labels = {entry.label: entry.accelerator for entry in table.entries}
        self.assertEqual(labels.get('Exit to Windows'), 'Alt-F4')
        self.assertIn('Campaign', labels)
        self.assertTrue(any('not decoded' in note for note in table.unresolved))

    def test_every_table_on_the_local_discs_decodes(self):
        files = sorted(glob.glob(str(EXTRACTED / '*' / '*.LIB' / '*.MNU'))
                       + glob.glob(str(EXTRACTED / '*' / '*.LIB' / '*.DLG')))
        if not files:
            self.skipTest('local media missing')
        decoded, stubs = 0, 0
        for path in files:
            try:
                table = load_ui(path)
            except MNUError as error:
                # Four ATF network dialogs are Phar Lap stubs with no CODE section.
                self.assertIn('no CODE section', str(error))
                stubs += 1
                continue
            decoded += 1
            for widget in table.widgets:
                # A record whose class the host supplies, or that carries no label,
                # has no verified position; +4/+6 is pinned for the labelled classes.
                if widget.label:
                    self.assertLess(abs(widget.x), 1024, f'{table.name} {widget.offset:#x}')
                    self.assertLess(abs(widget.y), 1024, f'{table.name} {widget.offset:#x}')
        self.assertGreater(decoded, 150)
        self.assertLessEqual(stubs, 8)


if __name__ == '__main__':
    unittest.main()
