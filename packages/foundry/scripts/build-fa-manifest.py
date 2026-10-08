"""Build static/fa-manifest.json: the Forgotten Adventures art the map painters use, by slot.

Usage:  python packages/foundry/scripts/build-fa-manifest.py "B:/assets for dnd/FA_Assets_Webp" [copy-to]

With copy-to (e.g. "%LOCALAPPDATA%/FoundryVTT/Data/fa-assets"), the files the manifest uses are
copied there too (only new ones), so Foundry can load them from a fast drive.

Only paths and grid sizes go in the manifest (no art). Foundry serves the files themselves from a
folder linked into its Data directory (default name: fa-assets).

Each slot maps family -> [[path, w, h], ...]. A family is the asset name minus its variant code and
size ("Tree_Green", "Crate_Wood_Ashen_Breads"), so a map can stick to one look per slot. Props are
sized in grid squares (FA paints at 200 px a square and puts the size in the filename); textures
are sized by how many squares one tile spans.
"""

import json
import os
import re
import struct
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else r"B:/assets for dnd/FA_Assets_Webp"
OUT = os.path.join(os.path.dirname(__file__), "..", "static", "fa-manifest.json")
PX = 200  # FA's pixels per grid square

C = "!Core_Settlements"
W = "Woodlands/!Wilderness"

# slot -> (include regex on the relative path, exclude regex or None, max size in squares or None)
PROPS = {
    "tree": (rf"^{W}/Flora/Trees/Tree_(Green|Multicolor\d?)_[A-Z]\d+_\d+x\d+\.webp$", None, 6),
    "treeShadow": (rf"^{W}/Flora/Trees/Tree_Shadows/Tree_Shadow_[A-Z]\d+_\d+x\d+\.webp$", None, None),
    "bareTree": (rf"^{W}/Flora/Trees/Bare_Trees/Bare_Tree_[A-Za-z]+_[A-Z]\d+_\d+x\d+\.webp$", None, 9),
    "bush": (rf"^{W}/Flora/Bushes/Bush_.*\.webp$", None, 2),
    "boulder": (rf"^{W}/Decor/Rocks/Boulders/.*\.webp$", None, 3),
    "rock": (rf"^{W}/Decor/Rocks/Rock_.*\.webp$", None, 2),
    "log": (r"^(Woodlands|Mountain)/!Wilderness/Flora/Trees/Logs/.*\.webp$", None, 6),
    "stump": (rf"^{W}/Flora/Trees/Stumps/.*\.webp$", None, 4),
    "fir": (r"^Mountain/!Wilderness/Flora/Trees/Fir_Tree_[^/]*\.webp$", None, 4),
    "stalagmite": (r"^Mountain/!Wilderness/Decor/Rocks/Stalagmites/Stalagmite_(?!Hole).*\.webp$", None, 2),
    "mushrooms": (r"^Underdark/!Wilderness/Flora/Mushrooms/Mushroom_Large_(Brown|Tan|Black|White)\d?_.*_[12]x[12]\.webp$", None, 2),
    "rubble": (rf"^{C}/Structures/Rubble/Rubble_Piles/Stone/Rubble_Pile_.*\.webp$", r"(_Corner|_Straight|Bloody|Volcanic)", 3),
    "rubblePiece": (rf"^{C}/Structures/Rubble/Rubble_Pieces/(Stone|Brick)/.*\.webp$", None, 1),
    "debris": (rf"^{C}/Structures/Rubble/Rubble_Pieces/Wood/.*\.webp$", None, 2),
    "pillar": (rf"^{C}/Structures/Building/Pillars/Stone/Pillar_.*_1x1\.webp$", None, 1),
    "pillarBroken": (rf"^{C}/Structures/Building/Pillars/Stone/Broken/.*_1x1\.webp$", r"(Bloody|Headstone|Volcanic)", 1),
    "altar": (rf"^{C}/Furniture/Altars/Altar_Stone_.*\.webp$", None, 3),
    "table": (rf"^{C}/Furniture/Tables/Rectangle_Tables/(Filled/)?Table_Rectangle_[^/]*\.webp$", None, 3),
    "tableBroken": (rf"^{C}/Furniture/Tables/Rectangle_Tables/(Broken|Fallen)/[^/]*\.webp$", None, 3),
    "chair": (rf"^{C}/Furniture/Seating/Chairs/Chair_Wood[^/]*_1x1\.webp$", None, 1),
    "stool": (rf"^{C}/Furniture/Seating/(Stools|Chairs)/Stool_[^/]*_1x1\.webp$", None, 1),
    "bench": (rf"^{C}/Furniture/Seating/Benches/Bench_[^/]*\.webp$", None, 4),
    "barrel": (rf"^{C}/Decor/Storage/Barrels/(Filled/)?Barrel_(?!Band)[^/]*_1x1\.webp$", r"(TNT|Oil|Metal)", 1),
    "crate": (rf"^{C}/Decor/Storage/Boxes_and_Crates/Crates/(Filled/)?Crate_(?!Lid)[^/]*_1x1\.webp$", None, 1),
    "sack": (rf"^{C}/Decor/Storage/Sacks/Sack_[^/]*_1x1\.webp$", None, 1),
    "counter": (rf"^{C}/Furniture/Tables/Bars_and_Counters/Bar_Wood_[^/]*_[35]x1\.webp$", r"Rusty", 5),
    "shelf": (rf"^{C}/Furniture/Shelves/(Filled/)?Shelf_[^/]*\.webp$", None, 4),
    "bookcase": (rf"^{C}/Furniture/Shelves/Bookshelves/Bookcase_[^/]*\.webp$", None, 4),
    "bed": (rf"^{C}/Furniture/Bedding/Beds/Single_Beds/[^/]*_1x2\.webp$", None, 2),
    "bedroll": (rf"^{C}/Furniture/Bedding/Bedrolls_and_Sleeping_Bags/Bedrolls/[^/]*\.webp$", None, 2),
    "chest": (rf"^{C}/Decor/Storage/Chests/(Treasure_Chests/)?(Treasure_)?Chest_[^/]*_1x1\.webp$", None, 1),
    "hearth": (rf"^{C}/Structures/Building/Fireplaces/Fireplaces_Chimneyless/[^/]*\.webp$", None, 2),
    "rug": (rf"^{C}/Decor/Rugs_and_Carpets/Rugs/(Rectangle/Rectangle_(Medium|Large|Huge)|Circle/Circle_Large)/Rug_[^/]*\.webp$", r"Black", 5),
    "stairs": (rf"^{C}/Structures/Building/Stairs_and_Ladders/Stairs_(Wood|Stone)/Stairs_(Wood|Stone)_[A-Za-z]+_[A-Z]_1x3\.webp$", None, 3),
    "campfire": (rf"^{C}/Lightsources/Campfires_and_Firepits/Campfire_[^/]*_Lit_[^/]*\.webp$", None, 2),
    "tent": (rf"^{C}/Structures/Shelters/Tents/Tent_(Cloth|Leather)_[^/]*_\d+x\d+\.webp$", None, 4),
    "cart": (rf"^{C}/Vehicles/Carts_and_Wagons/(Filled/)?Cart_[^/]*\.webp$", None, 4),
    "well": (rf"^{C}/Structures/Water_Structures/Wells/Well_Stone_[^/]*\.webp$", None, 2),
    "wellCover": (rf"^{C}/Structures/Water_Structures/Wells/Well_(Cover|Winch)_[^/]*\.webp$", None, 2),
    "skeleton": (r"^Horror/!Wilderness/Decor/Bones/Humanoid_Skeletons/[^/]*\.webp$", None, 2),
    "bones": (r"^Horror/!Wilderness/Decor/Bones/Beast_Bones/(Long_and_Flat|Ribs_and_Ribcages)/[^/]*\.webp$", None, 2),
    "cobweb": (r"^!Effects/Webs/Cobwebs/[^/]*\.webp$", None, 3),
    "coffin": (rf"^{C}/Burial_and_Graves/Coffins/[^/]*\.webp$", None, 2),
    "sarcophagus": (rf"^{C}/Burial_and_Graves/Sarcophagi/[^/]*\.webp$", None, 3),
    "weaponRack": (rf"^{C}/Combat/Weapons/Weapon_Racks/[^/]*\.webp$", None, 3),
    "torch": (rf"^{C}/Lightsources/Torches_and_Sconces/Outdoor_Torch/[^/]*_1x1\.webp$", None, 1),
    "puddle": (rf"^{W}/Decor/Puddles/[^/]*\.webp$", None, 3),
    "flowers": (rf"^{W}/Flora/Flowers/[^/]*\.webp$", None, 1),
    "grassTuft": (rf"^{W}/Flora/Grass/[^/]*\.webp$", None, 1),
    "hay": (rf"^{C}/Natural_Decor/Hay/[^/]*\.webp$", None, 2),
    "door": (rf"^{C}/Structures/Building/Doors/Door_Wood_[A-Za-z]+_[A-Z]\d?_1x1\.webp$", None, 1),
    "window": (rf"^{C}/Structures/Building/Windows/Window_Wood_[A-Za-z]+_[A-Z]_1x1\.webp$", None, 1),
    "wallTorch": (rf"^{C}/Lightsources/Torches_and_Sconces/Wall_Torch_[^/]*_1x1\.webp$", None, 1),
    "brazier": (rf"^{C}/Lightsources/Braziers/Brazier_(Metal_[A-Za-z]+_[A-Z]\d|Red_[A-Z]_Lit)_1x1\.webp$", None, 1),
    "streetLamp": (rf"^{C}/Lightsources/Lamps/Lamp_Street_Metal_[A-Za-z]+_[A-Z]_1x1\.webp$", None, 1),
    "candles": (rf"^{C}/Lightsources/Candles/Candle_[^/]*_1x1\.webp$", None, 1),
    "forge": (rf"^{C}/Workplace_Equipment/Smithing/Forges/Forge_Lit_[^/]*\.webp$", None, 3),
    "anvil": (rf"^{C}/Workplace_Equipment/Smithing/.*Anvil_Metal_[^/]*_1x[12]\.webp$", None, 2),
    "mineCart": (rf"^{C}/Workplace_Equipment/Mining/Mine_Carts/MineCart_[^/]*_1x[12]\.webp$", None, 2),
    "support": (rf"^{C}/Structures/Beams_and_Supports/[^/]*Support_[^/]*_2x1\.webp$", None, 2),
    "cauldron": (rf"^{C}/Workplace_Equipment/Alchemy/Cauldron_Metal_[^/]*_1x1\.webp$", None, 1),
    "cage": (rf"^{C}/Decor/Restraints_and_Torture/Cages/Cage_Metal_[^/]*\.webp$", None, 2),
    "chains": (rf"^{C}/Decor/Restraints_and_Torture/Restraints_and_Chains/[^/]*_1x1\.webp$", None, 1),
    "pew": (rf"^{C}/Furniture/Seating/Benches/Pews/Pew_[^/]*\.webp$", None, 4),
    "cupboard": (rf"^{C}/Furniture/Cupboards_and_Wardrobes/Cupboard_Wood_[^/]*_2x1\.webp$", None, 2),
    "bookstand": (rf"^{C}/.*Bookstand_Metal_[^/]*_1x1\.webp$", None, 1),
    "desk": (rf"^{C}/Furniture/Tables/Desks/[^/]*_2x1\.webp$", None, 2),
    "glassware": (rf"^{C}/Workplace_Equipment/Alchemy/Glassware/.*_1x1\.webp$", None, 1),
    "tombstone": (rf"^{C}/Burial_and_Graves/Tombstones/Tombstone_(?!Base)[^/]*_1x1\.webp$", None, 1),
    "grave": (rf"^{C}/Burial_and_Graves/Graves/Dirt_Graves/[^/]*_\d+x\d+\.webp$", None, 3),
    "statue": (rf"^{C}/Structures/Statues/Statue_[^/]*_2x2\.webp$", None, 2),
    "boat": (rf"^{C}/Vehicles/Boats/Rowboat_[^/]*_1x3\.webp$", None, 3),
    "crops": (rf"^{C}/Workplace_Equipment/Farming/Crops/(Cabbages|Carrots|Strawberries)/[^/]*_1x1\.webp$", None, 1),
    "fence": (rf"^{C}/Structures/Building/Railings_and_Fences/Fence_Wood_A/Fence_Wood_[A-Za-z]+_A_Straight_[A-Z]_1x\d\.webp$", None, 3),
    "reeds": (r"^Swamp/!Wilderness/Flora/Water_Plants/.*_1x1\.webp$", None, 1),
    "lever": (rf"^{C}/Structures/Mechanical_Parts/Levers/Lever_[^/]*_1x1\.webp$", None, 1),
    "plateCircle": (r"^!Effects/Magic/Magic_Circles/MagicCircle_Engraved_[^/]*_2x2\.webp$", None, 2),
    "runeCircle": (r"^!Effects/Magic/Magic_Circles/MagicCircle_Arcane_(Blue|Purple|White)_[^/]*_2x2\.webp$", None, 2),
    "throne": (rf"^{C}/Furniture/Seating/Thrones/Throne_[^/]*_1x2\.webp$", None, 2),
}

# slot -> include regex (textures: jpg or webp tiles)
TEXTURES = {
    "grass": rf"^{W}/Textures/Grass/(Grass_[A-G]|Short_Grass_C|Patchy_Grass_A)_\d+\.jpg$",
    "forest": rf"^{W}/Textures/Forest/(Forest_Floor_(Leaves|Needles)_[A-D]|Clover_A)_\d+\.jpg$",
    "dirt": rf"^{W}/Textures/Dirt/(Dirt_[A-F]|Grassy_Dirt_[AB])_\d+\.jpg$",
    "path": rf"^{W}/Textures/Dirt/(Rocky_Dirt|Dirt_[A-C])[_\w]*\.jpg$",
    "cobble": rf"^{C}/Textures/Stone_Floors/(Cobblestone_A|Cobblestone_Square_[AB])_\d+\.jpg$",
    "flagstone": rf"^{C}/Textures/Stone_Floors/(Large_Flagstone_[AB]|Flat_Stone_Floor_A)_\d+\.jpg$",
    "tiles": rf"^{C}/Textures/Stone_Square_Tiles/Stone_Tiles_[A-E]_\d+\.jpg$",
    "wood": rf"^{C}/Textures/Wooden_Floors/Wooden_Flooring_[A-D]_(Ashen|Dark|Light|Walnut|Red)\.jpg$",
    "cave": r"^(Mountain|Woodlands)/!Wilderness/Textures/(Rock|Dirt)/Cave_Floor_\d+_[A-Z]\.jpg$",
    "rock": r"^Mountain/!Wilderness/Textures/Rock/(Rock_Texture_[A-H]|Rock_[A-F])_\d+\.jpg$",
    "water": r"^Aquatic/!Wilderness/Textures/Water/Water_(Calm_A|A)_?\d*\.jpg$",
    "swampWater": r"^Swamp/!Wilderness/Textures/Water/Water_(Still|Calm)_[A-H]_?\d*\.jpg$",
    "timber": rf"^{C}/Textures/Wood/Wood_Texture_[^/]*\.jpg$",
    "mud": r"^Swamp/!Wilderness/Textures/Mud/[^/]*\.jpg$",
    "marsh": r"^Swamp/!Wilderness/Textures/Marsh/[^/]*\.jpg$",
    "roof": rf"^{C}/Textures/Roof/Roof_Texture_(Slate|Tile|Wood)_[^/]*\.(webp|jpg)$",
}

# slot -> include regex (looping webm animations)
EFFECTS = {
    "animFire": r"^!Effects/Animations/Fire_CampfireMask_[^/]*\.webm$",
    "animBrazier": r"^!Effects/Animations/Fire_Brazier_[^/]*\.webm$",
    "fireflies": r"^!Effects/Animations/Fireflies_[^/]*\.webm$",
    "flies": r"^!Effects/Animations/Flies_[^/]*\.webm$",
    "dust": r"^!Effects/Animations/DustParticles_[^/]*\.webm$",
    "drops": r"^!Effects/Animations/Water_Droplets_[^/]*\.webm$",
    "spores": r"^!Effects/Animations/Spores_[^/]*\.webm$",
    "sparkles": r"^!Effects/Animations/Sparkles_A[12]_[^/]*\.webm$",
}

SIZE = re.compile(r"_(\d+)x(\d+)\.webp$")
FAMILY = re.compile(r"(_[A-Z]\d*)?(_Side)?_\d+x\d+\.webp$")
TEX_FAMILY = re.compile(r"(_\d+)?(_[A-Z]\d?)?\.(jpg|webp)$")


def image_size(path):
    """Width, height of a jpg or webp, from its header."""
    with open(path, "rb") as f:
        head = f.read(40)
        if head[:4] == b"RIFF":
            fmt = head[12:16]
            if fmt == b"VP8X":
                return 1 + int.from_bytes(head[24:27], "little"), 1 + int.from_bytes(head[27:30], "little")
            if fmt == b"VP8L":
                bits = int.from_bytes(head[21:25], "little")
                return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
            return int.from_bytes(head[26:28], "little") & 0x3FFF, int.from_bytes(head[28:30], "little") & 0x3FFF
        f.seek(2)
        while True:
            marker, length = struct.unpack(">HH", f.read(4))
            if marker in (0xFFC0, 0xFFC1, 0xFFC2):
                f.read(1)
                h, w = struct.unpack(">HH", f.read(4))
                return w, h
            f.seek(length - 2, 1)


def main():
    files = []
    for d, _, names in os.walk(ROOT):
        rel = os.path.relpath(d, ROOT).replace(os.sep, "/")
        files.extend(f"{rel}/{n}" for n in names)
    print(f"{len(files)} files under {ROOT}")
    out = {"version": 1, "pxPerSquare": PX, "props": {}, "textures": {}, "effects": {}}
    for slot, (inc, exc, cap) in PROPS.items():
        rx, ex = re.compile(inc), re.compile(exc) if exc else None
        fams = {}
        for f in files:
            if not rx.search(f) or (ex and ex.search(f)):
                continue
            m = SIZE.search(f)
            if not m:
                continue
            w, h = int(m.group(1)), int(m.group(2))
            if cap and max(w, h) > cap:
                continue
            name = f.rsplit("/", 1)[1]
            fams.setdefault(FAMILY.sub("", name), []).append([f, w, h])
        out["props"][slot] = fams
        print(f"  {slot:12s} {sum(len(v) for v in fams.values()):5d} in {len(fams)} families")
    for slot, inc in TEXTURES.items():
        rx = re.compile(inc)
        fams = {}
        for f in files:
            if not rx.search(f):
                continue
            w, _ = image_size(os.path.join(ROOT, f))
            name = f.rsplit("/", 1)[1]
            fams.setdefault(TEX_FAMILY.sub("", name), []).append([f, round(w / PX, 2), round(w / PX, 2)])
        out["textures"][slot] = fams
        print(f"  tex:{slot:8s} {sum(len(v) for v in fams.values()):5d} in {len(fams)} families")
    for slot, inc in EFFECTS.items():
        rx = re.compile(inc)
        hits = [[f, 1, 1] for f in files if rx.search(f)]
        out["effects"][slot] = {slot: hits} if hits else {}
        print(f"  fx:{slot:9s} {len(hits):5d}")
    with open(OUT, "w", encoding="utf8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {os.path.normpath(OUT)} ({os.path.getsize(OUT) // 1024} KB)")
    if len(sys.argv) > 2:
        import shutil
        dest = os.path.expandvars(sys.argv[2])
        used = {e[0] for sec in ("props", "textures", "effects") for slot in out[sec].values() for fam in slot.values() for e in fam}
        new = 0
        for f in sorted(used):
            target = os.path.join(dest, f)
            if os.path.exists(target):
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copy2(os.path.join(ROOT, f), target)
            new += 1
        print(f"copied {new} new files to {dest} ({len(used)} in use)")


if __name__ == "__main__":
    main()
