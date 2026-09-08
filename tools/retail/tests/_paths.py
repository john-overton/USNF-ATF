"""Shared locations for the tests; makes ``retail`` importable without install."""

import os
import sys

TOOLS_RETAIL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if TOOLS_RETAIL not in sys.path:
    sys.path.insert(0, TOOLS_RETAIL)

REPO = os.path.dirname(os.path.dirname(TOOLS_RETAIL))
GAMEASSETS = os.environ.get("USNF_GAMEASSETS", os.path.join(REPO, "gameassets"))
USNF97 = os.path.join(GAMEASSETS, "usnf97")
ATF_GOLD = os.path.join(GAMEASSETS, "atf-gold")
SCRATCHPAD = os.environ.get("USNF_SCRATCHPAD", "")


def have_disc(path: str) -> bool:
    return os.path.isfile(os.path.join(path, "SETUP.ESA"))
