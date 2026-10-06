/**
 * Built-in monster catalog: creatures from the System Reference Document 5.1
 * (CC-BY-4.0, Wizards of the Coast); see README for attribution.
 *
 * Row format: "Name|CR|type|tags|roles"
 *   tags  — race/subtype, theme and terrain words used by tag search. "anyrace" marks
 *           generic NPC statblocks that can be reskinned to any race ("Elf Scout").
 *   roles — minion brute skirmisher artillery caster controller leader solo
 *
 * Inside Foundry the catalog is built from the user's compendiums instead, and these
 * rows only enrich matching entries with roles and tags.
 */
export const SRD_MONSTER_ROWS = `
Acolyte|1/4|humanoid|anyrace cult temple urban|caster
Archmage|12|humanoid|anyrace mage urban|caster leader solo
Assassin|8|humanoid|anyrace criminal urban|skirmisher
Bandit|1/8|humanoid|anyrace bandit criminal grassland forest hill coast|minion
Bandit Captain|2|humanoid|anyrace bandit criminal pirate|leader
Berserker|2|humanoid|anyrace tribal hill mountain arctic|brute
Commoner|0|humanoid|anyrace civilian urban|minion
Cult Fanatic|2|humanoid|anyrace cult|leader caster
Cultist|1/8|humanoid|anyrace cult|minion
Druid|2|humanoid|anyrace forest|caster
Gladiator|5|humanoid|anyrace urban arena|brute
Guard|1/8|humanoid|anyrace military urban|minion
Knight|3|humanoid|anyrace military noble|leader brute
Mage|6|humanoid|anyrace mage urban|caster artillery
Noble|1/8|humanoid|anyrace civilian noble urban|leader
Priest|2|humanoid|anyrace temple cult urban|caster leader
Scout|1/2|humanoid|anyrace bandit military forest hill grassland|artillery
Spy|1|humanoid|anyrace covert criminal urban|skirmisher
Thug|1/2|humanoid|anyrace bandit criminal mercenary urban|brute
Tribal Warrior|1/8|humanoid|anyrace tribal|minion
Veteran|3|humanoid|anyrace military mercenary|brute leader
Orc|1/2|humanoid|orc hill mountain forest grassland|brute
Goblin|1/4|humanoid|goblinoid goblin forest hill underdark dungeon|skirmisher minion
Hobgoblin|1/2|humanoid|goblinoid hobgoblin military hill forest|brute
Bugbear|1|humanoid|goblinoid bugbear forest underdark dungeon|brute skirmisher
Gnoll|1/2|humanoid|gnoll grassland desert forest hill|brute
Kobold|1/8|humanoid|kobold dungeon underdark mountain|minion
Lizardfolk|1/2|humanoid|lizardfolk swamp|brute
Sahuagin|1/2|humanoid|sahuagin coast underwater|brute
Drow|1/4|humanoid|elf drow underdark|skirmisher
Duergar|1|humanoid|dwarf duergar underdark|brute
Deep Gnome|1/2|humanoid|gnome underdark|skirmisher
Merfolk|1/8|humanoid|merfolk coast underwater|minion
Grimlock|1/4|humanoid|grimlock underdark|brute minion
Werewolf|3|humanoid|human shapechanger lycanthrope forest|brute
Wererat|2|humanoid|human shapechanger lycanthrope urban|skirmisher
Wereboar|4|humanoid|human shapechanger lycanthrope forest|brute
Weretiger|4|humanoid|human shapechanger lycanthrope forest|skirmisher
Werebear|5|humanoid|human shapechanger lycanthrope forest arctic|brute
Half-Red Dragon Veteran|5|humanoid|human dragon military|brute leader
Skeleton|1/4|undead|skeleton dungeon crypt|minion artillery
Zombie|1/4|undead|zombie dungeon crypt swamp|minion brute
Warhorse Skeleton|1/2|undead|skeleton crypt|brute
Ogre Zombie|2|undead|zombie giant crypt|brute
Minotaur Skeleton|2|undead|skeleton crypt dungeon|brute
Ghoul|1|undead|crypt dungeon swamp|brute
Ghast|2|undead|crypt dungeon|brute leader
Shadow|1/2|undead|incorporeal dungeon underdark|skirmisher
Specter|1|undead|incorporeal crypt|skirmisher
Will-o'-Wisp|2|undead|incorporeal swamp forest|skirmisher
Wight|3|undead|crypt|leader brute
Mummy|3|undead|crypt desert|brute
Ghost|4|undead|incorporeal crypt urban|controller
Wraith|5|undead|incorporeal crypt|leader
Vampire Spawn|5|undead|vampire crypt urban|skirmisher
Vampire|13|undead|vampire shapechanger crypt urban|solo leader
Mummy Lord|15|undead|crypt desert|solo leader caster
Lich|21|undead|mage crypt|solo caster
Lemure|0|fiend|devil hell|minion
Dretch|1/4|fiend|demon abyss|minion
Imp|1|fiend|devil hell cult|skirmisher
Quasit|1|fiend|demon abyss cult|skirmisher
Bearded Devil|3|fiend|devil hell|brute
Hell Hound|3|fiend|hell|brute
Nightmare|3|fiend|hell|skirmisher
Succubus/Incubus|4|fiend|shapechanger cult urban|controller
Barbed Devil|5|fiend|devil hell|skirmisher
Night Hag|5|fiend|hag|caster
Vrock|6|fiend|demon abyss|brute
Chain Devil|8|fiend|devil hell|controller
Hezrou|8|fiend|demon abyss|brute
Bone Devil|9|fiend|devil hell|brute
Glabrezu|9|fiend|demon abyss|caster brute
Horned Devil|11|fiend|devil hell|brute
Erinyes|12|fiend|devil hell|artillery leader
Nalfeshnee|13|fiend|demon abyss|brute leader
Rakshasa|13|fiend|urban|caster solo
Ice Devil|14|fiend|devil hell arctic|brute
Marilith|16|fiend|demon abyss|leader solo
Balor|19|fiend|demon abyss|solo leader
Pit Fiend|20|fiend|devil hell|solo leader
Sprite|1/4|fey|forest|artillery
Blink Dog|1/4|fey|forest grassland|skirmisher
Satyr|1/2|fey|forest|skirmisher
Dryad|1|fey|forest|controller
Sea Hag|2|fey|hag coast swamp|caster
Green Hag|3|fey|hag forest swamp|caster
Ogre|2|giant|hill forest mountain swamp|brute
Ettin|4|giant|hill mountain underdark|brute
Troll|5|giant|forest swamp mountain arctic|brute
Hill Giant|5|giant|hill|brute
Oni|7|giant|urban forest|caster skirmisher
Stone Giant|7|giant|mountain underdark|artillery brute
Frost Giant|8|giant|arctic mountain|brute
Fire Giant|9|giant|mountain underdark|brute
Cloud Giant|9|giant|mountain|caster
Storm Giant|13|giant|coast underwater mountain|solo
Cockatrice|1/2|monstrosity|grassland|skirmisher
Darkmantle|1/2|monstrosity|underdark dungeon|skirmisher
Rust Monster|1/2|monstrosity|underdark dungeon|skirmisher
Worg|1/2|monstrosity|mount forest grassland hill|skirmisher
Death Dog|1|monstrosity|desert|brute
Harpy|1|monstrosity|coast mountain|controller
Hippogriff|1|monstrosity|mount mountain hill|skirmisher
Ankheg|2|monstrosity|grassland forest|brute
Ettercap|2|monstrosity|spider forest|controller
Griffon|2|monstrosity|mount mountain hill|skirmisher
Grick|2|monstrosity|underdark dungeon|skirmisher
Mimic|2|monstrosity|shapechanger dungeon|brute
Basilisk|3|monstrosity|mountain underdark|controller
Doppelganger|3|monstrosity|shapechanger urban|skirmisher
Manticore|3|monstrosity|mountain hill|artillery
Minotaur|3|monstrosity|dungeon underdark|brute
Owlbear|3|monstrosity|forest|brute
Phase Spider|3|monstrosity|spider forest underdark|skirmisher
Winter Wolf|3|monstrosity|wolf arctic|brute
Lamia|4|monstrosity|desert|caster
Bulette|5|monstrosity|grassland hill mountain|brute
Gorgon|5|monstrosity|grassland hill|brute
Chimera|6|monstrosity|mountain hill|brute
Medusa|6|monstrosity|dungeon|controller
Hydra|8|monstrosity|swamp coast|solo brute
Behir|11|monstrosity|underdark mountain|solo
Remorhaz|11|monstrosity|arctic|solo brute
Roc|11|monstrosity|mountain coast|solo
Purple Worm|15|monstrosity|underdark desert|solo
Kraken|23|monstrosity|underwater|solo
Gibbering Mouther|2|aberration|underdark dungeon|controller
Chuul|4|aberration|swamp underdark|brute
Otyugh|5|aberration|dungeon urban|brute
Cloaker|8|aberration|underdark|skirmisher
Aboleth|10|aberration|underdark underwater|solo controller
Flying Sword|1/4|construct|animated dungeon|minion skirmisher
Animated Armor|1|construct|animated dungeon|brute
Rug of Smothering|2|construct|animated dungeon|controller
Flesh Golem|5|construct|golem dungeon|brute
Shield Guardian|7|construct|dungeon|brute
Clay Golem|9|construct|golem|brute
Stone Golem|10|construct|golem|brute
Iron Golem|16|construct|golem|solo brute
Steam Mephit|1/4|elemental|mephit fire water|skirmisher
Dust Mephit|1/2|elemental|mephit earth air desert|skirmisher
Ice Mephit|1/2|elemental|mephit water air arctic|skirmisher
Magma Mephit|1/2|elemental|mephit fire earth|skirmisher
Magmin|1/2|elemental|fire|minion
Azer|2|elemental|fire|brute
Gargoyle|2|elemental|earth dungeon urban|skirmisher
Air Elemental|5|elemental|air|skirmisher
Earth Elemental|5|elemental|earth|brute
Fire Elemental|5|elemental|fire|brute
Water Elemental|5|elemental|water coast|brute
Salamander|5|elemental|fire|brute
Xorn|5|elemental|earth underdark|brute
Invisible Stalker|6|elemental|air|skirmisher
Djinni|11|elemental|air genie|solo caster
Efreeti|11|elemental|fire genie|solo caster
Pseudodragon|1/4|dragon|forest|skirmisher
Brass Dragon Wyrmling|1|dragon|metallic desert|brute
Copper Dragon Wyrmling|1|dragon|metallic hill|brute
Black Dragon Wyrmling|2|dragon|chromatic swamp|brute
Green Dragon Wyrmling|2|dragon|chromatic forest|brute
White Dragon Wyrmling|2|dragon|chromatic arctic|brute
Blue Dragon Wyrmling|3|dragon|chromatic desert|brute
Red Dragon Wyrmling|4|dragon|chromatic mountain|brute
Wyvern|6|dragon|mountain hill|brute
Young White Dragon|6|dragon|chromatic arctic|solo
Young Black Dragon|7|dragon|chromatic swamp|solo
Young Green Dragon|8|dragon|chromatic forest|solo
Young Blue Dragon|9|dragon|chromatic desert|solo
Young Red Dragon|10|dragon|chromatic mountain|solo
Adult White Dragon|13|dragon|chromatic arctic|solo
Adult Black Dragon|14|dragon|chromatic swamp|solo
Adult Green Dragon|15|dragon|chromatic forest|solo
Adult Blue Dragon|16|dragon|chromatic desert|solo
Adult Red Dragon|17|dragon|chromatic mountain|solo
Dragon Turtle|17|dragon|underwater coast|solo
Ancient Red Dragon|24|dragon|chromatic mountain|solo
Gray Ooze|1/2|ooze|dungeon underdark|brute
Gelatinous Cube|2|ooze|dungeon|brute
Ochre Jelly|2|ooze|dungeon underdark|brute
Black Pudding|4|ooze|dungeon underdark|brute
Violet Fungus|1/4|plant|fungus underdark|brute
Awakened Tree|2|plant|forest|brute
Shambling Mound|5|plant|swamp forest|brute
Treant|9|plant|forest|solo brute
Pegasus|2|celestial|mount grassland mountain|skirmisher
Couatl|4|celestial|desert grassland|caster
Unicorn|5|celestial|forest|caster
Deva|10|celestial|angel|caster leader
Planetar|16|celestial|angel|solo
Solar|21|celestial|angel|solo
Giant Rat|1/8|beast|vermin urban dungeon|minion
Stirge|1/8|beast|dungeon swamp forest underdark|minion skirmisher
Giant Crab|1/8|beast|coast|minion
Wolf|1/4|beast|wolf forest grassland hill arctic|skirmisher
Giant Bat|1/4|beast|underdark dungeon|skirmisher
Giant Centipede|1/4|beast|vermin underdark dungeon|minion
Giant Frog|1/4|beast|swamp|minion
Giant Poisonous Snake|1/4|beast|swamp forest desert|skirmisher
Giant Wolf Spider|1/4|beast|spider forest desert|skirmisher
Panther|1/4|beast|forest|skirmisher
Swarm of Bats|1/4|beast|swarm underdark|skirmisher
Swarm of Rats|1/4|beast|swarm vermin urban dungeon|brute
Ape|1/2|beast|forest|brute
Black Bear|1/2|beast|bear forest|brute
Crocodile|1/2|beast|swamp|brute
Reef Shark|1/2|beast|shark underwater|brute
Swarm of Insects|1/2|beast|swarm vermin forest swamp|brute
Brown Bear|1|beast|bear forest hill arctic|brute
Dire Wolf|1|beast|wolf forest hill|brute
Giant Eagle|1|beast|mount mountain hill|skirmisher
Giant Hyena|1|beast|grassland desert|brute
Giant Octopus|1|beast|underwater|controller
Giant Spider|1|beast|spider forest underdark dungeon|controller
Giant Toad|1|beast|swamp|brute
Lion|1|beast|grassland desert|brute
Tiger|1|beast|forest grassland|brute
Giant Boar|2|beast|forest grassland|brute
Giant Constrictor Snake|2|beast|swamp forest underwater|controller
Giant Elk|2|beast|forest grassland|brute
Hunter Shark|2|beast|shark underwater|brute
Plesiosaurus|2|beast|dinosaur underwater|brute
Polar Bear|2|beast|bear arctic|brute
Saber-Toothed Tiger|2|beast|arctic mountain|brute
Giant Scorpion|3|beast|desert|brute
Killer Whale|3|beast|underwater|brute
Elephant|4|beast|grassland|brute
Giant Crocodile|5|beast|swamp|brute
Giant Shark|5|beast|shark underwater|brute
Triceratops|5|beast|dinosaur grassland|brute
Mammoth|6|beast|arctic grassland|brute
Giant Ape|7|beast|forest|brute
Tyrannosaurus Rex|8|beast|dinosaur grassland|solo brute
`;
