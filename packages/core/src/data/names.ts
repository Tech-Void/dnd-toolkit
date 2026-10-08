/** First names by race. Shopkeepers and NPCs both draw from these; add new names at the end (seeds depend on the order). */
export const FIRST_NAMES: Record<string, string[]> = {
  human: ["Aldric", "Bertha", "Corin", "Dagna", "Edda", "Fenwick", "Greta", "Hollis", "Ilse", "Jory", "Marta", "Osric", "Rowan", "Tamsin", "Gideon", "Wilhelmina", "Cedric", "Ysolde", "Barnaby", "Mirela", "Tobias", "Agnes", "Lucan", "Petra", "Ambrose", "Hester", "Florian", "Rosalind", "Garrick", "Maud"],
  dwarf: ["Brottor", "Dagnal", "Eberk", "Gunnloda", "Helja", "Kildrak", "Orsik", "Rurik", "Thora", "Vondal", "Bardryn", "Dagrun", "Eldeth", "Falkrunn", "Gardain", "Harbek", "Kathra", "Morgran", "Riswynn", "Tordek", "Ulfgar", "Vistra", "Bruenor", "Hlin"],
  halfling: ["Andry", "Bree", "Cade", "Eldon", "Kithri", "Lyle", "Merla", "Nedda", "Perrin", "Seraphina", "Callie", "Corrin", "Garret", "Jillian", "Lavinia", "Milo", "Osborn", "Portia", "Roscoe", "Tegan", "Verna", "Wellby", "Dimble", "Pippa"],
  elf: ["Adrie", "Caelynn", "Erevan", "Faral", "Ielenia", "Laucian", "Naivara", "Quelenna", "Thamior", "Vadania", "Aelar", "Berrian", "Drusilia", "Enna", "Galinndan", "Keyleth", "Lia", "Mialee", "Peren", "Riardon", "Sariel", "Theren", "Valanthe", "Xiloscient"],
  gnome: ["Alston", "Bimpnottin", "Boddynock", "Carlin", "Ellyjobell", "Fonkin", "Nissa", "Orryn", "Roywyn", "Zook", "Breena", "Dimble", "Ellywick", "Frug", "Gerbo", "Lilli", "Nackle", "Orla", "Seebo", "Tana", "Wrenn", "Fizzwick", "Pockle"],
  "half-orc": ["Dench", "Engong", "Holg", "Imsh", "Krusk", "Myev", "Ovak", "Shautha", "Sutha", "Volen", "Baggi", "Emen", "Gell", "Henk", "Kansif", "Mhurren", "Neega", "Ront", "Thokk", "Vola", "Yevelda", "Grisha", "Ugarth", "Korra"],
  tiefling: ["Akmenos", "Bryseis", "Damakos", "Kallista", "Lerissa", "Mordai", "Nemeia", "Orianna", "Skamos", "Rieta", "Barakas", "Ekemon", "Iados", "Kairon", "Leucis", "Melech", "Pelaios", "Akta", "Ea", "Makaria", "Phelaia", "Zethra", "Caim", "Velya"],
  dragonborn: ["Arjhan", "Biri", "Donaar", "Harann", "Kava", "Medrash", "Nala", "Perra", "Sora", "Torinn", "Balasar", "Bharash", "Ghesh", "Heskan", "Kriv", "Mehen", "Nadarr", "Pandjed", "Akra", "Daar", "Farideh", "Korinn", "Rhogar", "Thava"],
};

/** Family, clan or house names by race. Half-orcs go by epithets instead. */
export const SURNAMES: Record<string, string[]> = {
  human: ["Ashdown", "Blackwood", "Crane", "Dunmore", "Fairweather", "Greaves", "Harrow", "Kettle", "Marsh", "Pennywhistle", "Thatcher", "Vane", "Ashworth", "Bramble", "Coldwater", "Durrow", "Everhart", "Fletcher", "Goodwin", "Holloway", "Ironside", "Larkin", "Merriweather", "Northcott", "Penhallow", "Quill", "Rookwood", "Stillwell", "Tanner", "Whitlock"],
  dwarf: ["Balderk", "Battlehammer", "Fireforge", "Gorunn", "Holderhek", "Ironfist", "Loderr", "Rumnaheim", "Strakeln", "Ungart", "Brawnanvil", "Dankil", "Frostbeard", "Rockseeker", "Stonehelm", "Torunn", "Deepdelver", "Hammerfall", "Oakenshield", "Coppervein"],
  halfling: ["Brushgather", "Goodbarrel", "Greenbottle", "High-hill", "Hilltopple", "Leagallow", "Tealeaf", "Thorngage", "Tosscobble", "Underbough", "Appleblossom", "Bramblefoot", "Copperkettle", "Goodbody", "Longbottom", "Puddifoot", "Quickstep", "Thistledown", "Warmwater", "Bunce", "Fairbairn"],
  elf: ["Amakiir", "Amastacia", "Galanodel", "Holimion", "Ilphelkiir", "Liadon", "Meliamne", "Nailo", "Siannodel", "Xiloscient", "Brightwood", "Evenwood", "Moonwhisper", "Nightbreeze", "Silverfrond", "Starflower", "Sunblade", "Windrivver", "Dawnsong", "Thistlemoon"],
  gnome: ["Beren", "Daergel", "Folkor", "Garrick", "Nackle", "Murnig", "Ningel", "Raulnor", "Scheppen", "Timbers", "Fizzlebang", "Gimble", "Nimblefingers", "Sprocket", "Tinkertop", "Turen", "Wobblecog", "Copperpot", "Glimmerdust", "Pocketwatch", "Quickgear", "Spindlewick"],
  tiefling: ["Ash", "Ember", "Hope", "Quarrel", "Sorrow", "Torment", "Vigil", "Whisper", "Wander", "Reverie", "Creed", "Despair", "Glory", "Mockery", "Music", "Nowhere", "Open", "Poetry", "Random", "Temerity", "Weary", "Ruin"],
  dragonborn: ["Clethtinthiallor", "Daardendrian", "Delmirev", "Drachedandion", "Kepeshkmolik", "Kerrhylon", "Myastan", "Nemmonis", "Norixius", "Prexijandilin", "Fenkenkabradon", "Kimbatuul", "Linxakasendalor", "Ophinshtalajiir", "Shestendeliath", "Turnuroth", "Verthisathurgiesh", "Yarjerit", "Clethinthir"],
};

export const EPITHETS = ["the Grim", "Skullsplitter", "the Quiet", "Tusk", "Ironhide", "the Unbowed", "Half-Ear", "Stonejaw", "the Patient", "Redhand", "Bonebiter", "the Red", "Two-Axes", "Far-Walker", "the Silent", "Ironbelly", "Wolfsbane", "the Laughing", "Broken-Tusk", "Thunderfist", "the Old", "Ashborn"];
