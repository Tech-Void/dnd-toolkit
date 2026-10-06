/**
 * Treasure data. Magic item names are from the System Reference Document 5.1
 * (CC-BY-4.0, Wizards of the Coast); see README for attribution.
 */

export type Rarity = "common" | "uncommon" | "rare" | "very rare" | "legendary";

export const GEMS: Record<number, readonly string[]> = {
  10: ["Azurite", "Banded agate", "Blue quartz", "Eye agate", "Hematite", "Lapis lazuli", "Malachite", "Moss agate", "Obsidian", "Rhodochrosite", "Tiger eye", "Turquoise"],
  50: ["Bloodstone", "Carnelian", "Chalcedony", "Chrysoprase", "Citrine", "Jasper", "Moonstone", "Onyx", "Quartz", "Sardonyx", "Star rose quartz", "Zircon"],
  100: ["Amber", "Amethyst", "Chrysoberyl", "Coral", "Garnet", "Jade", "Jet", "Pearl", "Spinel", "Tourmaline"],
  500: ["Alexandrite", "Aquamarine", "Black pearl", "Blue spinel", "Peridot", "Topaz"],
  1000: ["Black opal", "Blue sapphire", "Emerald", "Fire opal", "Opal", "Star ruby", "Star sapphire", "Yellow sapphire"],
  5000: ["Black sapphire", "Diamond", "Jacinth", "Ruby"],
};

export const ART: Record<number, readonly string[]> = {
  25: ["Silver ewer", "Carved bone statuette", "Small gold bracelet", "Cloth-of-gold vestments", "Black velvet mask stitched with silver thread", "Copper chalice with silver filigree", "Pair of engraved bone dice", "Small mirror set in a painted wooden frame", "Embroidered silk handkerchief", "Gold locket with a painted portrait inside"],
  250: ["Gold ring set with bloodstones", "Carved ivory statuette", "Large gold bracelet", "Silver necklace with a gemstone pendant", "Bronze crown", "Silk robe with gold embroidery", "Large well-made tapestry", "Brass mug with jade inlay", "Box of turquoise animal figurines", "Gold bird cage with electrum filigree"],
  750: ["Silver chalice set with moonstones", "Silver-plated steel longsword with jet set in hilt", "Carved harp of exotic wood with ivory inlay", "Small gold idol", "Gold dragon comb set with red garnets", "Bottle stopper cork embossed with gold leaf", "Ceremonial electrum dagger with a black pearl in the pommel", "Silver and gold brooch", "Obsidian statuette with gold fittings", "Painted gold war mask"],
  2500: ["Fine gold chain set with a fire opal", "Old masterpiece painting", "Embroidered silk and velvet mantle set with moonstones", "Platinum bracelet set with a sapphire", "Embroidered glove set with jewel chips", "Jeweled anklet", "Gold music box", "Gold circlet set with four aquamarines", "Eye patch with a mock eye of blue sapphire and moonstone", "Necklace string of small pink pearls"],
  7500: ["Jeweled gold crown", "Jeweled platinum ring", "Small gold statuette set with rubies", "Gold cup set with emeralds", "Gold jewelry box with platinum filigree", "Painted gold child's sarcophagus", "Jade game board with solid gold playing pieces", "Bejeweled ivory drinking horn with gold filigree"],
};

export const MAGIC_ITEMS: Record<Rarity, readonly string[]> = {
  common: ["Potion of Healing", "Potion of Climbing", "Spell Scroll (Cantrip)", "Spell Scroll (1st Level)"],
  uncommon: ["Bag of Holding", "Boots of Elvenkind", "Bracers of Archery", "Cloak of Elvenkind", "Cloak of Protection", "Decanter of Endless Water", "Driftglobe", "Gauntlets of Ogre Power", "Goggles of Night", "Immovable Rod", "Pearl of Power", "Potion of Greater Healing", "Ring of Jumping", "Sending Stones", "Wand of Magic Missiles", "Weapon +1", "Spell Scroll (2nd Level)"],
  rare: ["Amulet of Health", "Armor +1", "Belt of Dwarvenkind", "Boots of Speed", "Bracers of Defense", "Cloak of Displacement", "Flame Tongue", "Necklace of Fireballs", "Potion of Superior Healing", "Ring of Evasion", "Ring of Protection", "Wand of Fireballs", "Weapon +2", "Wings of Flying"],
  "very rare": ["Armor +2", "Carpet of Flying", "Cloak of Arachnida", "Dancing Sword", "Manual of Bodily Health", "Potion of Supreme Healing", "Ring of Regeneration", "Spellguard Shield", "Staff of Power", "Weapon +3"],
  legendary: ["Armor of Invulnerability", "Cloak of Invisibility", "Holy Avenger", "Ring of Spell Turning", "Ring of Three Wishes", "Robe of the Archmagi", "Staff of the Magi", "Vorpal Sword"],
};

/** Concrete bases for generic "+N" items so they can match real compendium entries. */
export const WEAPON_BASES = ["Longsword", "Shortsword", "Dagger", "Battleaxe", "Warhammer", "Rapier", "Longbow", "Mace", "Greatsword", "Handaxe"] as const;
export const ARMOR_BASES = ["Chain Mail", "Breastplate", "Studded Leather Armor", "Half Plate Armor", "Plate Armor", "Shield"] as const;

/** Rough market value used for totals and Foundry item prices. */
export const RARITY_VALUE_GP: Record<Rarity, number> = {
  common: 50,
  uncommon: 300,
  rare: 3000,
  "very rare": 30000,
  legendary: 100000,
};
