import type { DatabaseSync } from 'node:sqlite';
import type { LightLevel, Soil } from './options.js';

// Starter catalog written from general houseplant knowledge, NOT verified against a primary source.
// Every entry is imported with verified = 0; the user confirms or corrects entries in the UI.
// Toxicity follows the cautious reading (cats and children): when in doubt, flagged as toxic.

export interface CatalogEntry {
  latin_name: string;
  name_nl: string;
  name_en: string;
  synonyms?: string;
  light_min: LightLevel;
  light_max: LightLevel;
  water_summer_days: number;
  water_winter_days: number;
  soil: Soil;
  toxic: 0 | 1;
  feed_tip: string;
  repot_tip: string;
  prune_tip: string;
  description: string;
}

const S = 'shade', H = 'half_shade', I = 'indirect', F = 'full_sun';

const FEED = {
  succ: 'Zomer: 1× per maand met cactus-/succulentenvoeding. Winter: niet voeden.',
  leaf: 'Groeiseizoen (apr–sep): elke 2–4 weken verdunde kamerplantenvoeding. Winter: niet of hooguit half sterk.',
  palm: 'Groeiseizoen: maandelijks palmenvoeding of verdunde kamerplantenvoeding. Winter: niet voeden.',
  fern: 'Groeiseizoen: elke 4 weken op half sterkte. Winter: niet voeden.',
  flower: 'Tijdens groei en bloei elke 2 weken bloeiplantenvoeding. Rustperiode: niet voeden.',
  orchid: 'Groeiseizoen: elke 2 weken zwakke orchideeënvoeding (halve dosering). Rustperiode: niet voeden.',
  brom: 'Weinig nodig: hooguit zeer verdund in de zomer, bij voorkeur in de trechter.',
};
const REPOT = {
  succ: 'Om de 2–3 jaar in het voorjaar; pot liever krap dan te groot, met een gat in de bodem.',
  slow: 'Zelden: om de 2–3 jaar in het voorjaar, pas als de pot vol wortels zit.',
  leaf: 'Om de 1–2 jaar in het voorjaar, een maat groter, zodra wortels uit de pot groeien.',
  fast: 'Elk voorjaar of om het jaar; snelle groeier die snel een grotere pot vult.',
  orchid: 'Om de 1–2 jaar direct na de bloei, in vers orchideeënbastmengsel in een doorzichtige pot.',
  brom: 'Nauwelijks nodig; de plant is klein en na de bloei sterft de moederplant af. Verpot jonge uitlopers.',
};
const PRUNE = {
  none: 'Meestal niet nodig; verwijder alleen verdroogde of beschadigde bladeren.',
  trim: 'Snoei in het voorjaar lange of kale stengels terug; de stekken kun je laten wortelen.',
  top: 'In het voorjaar de top inkorten om de plant te laten vertakken; draag handschoenen (melksap).',
  leaf: 'Knip verdroogde bladeren tot aan de basis af; snijd nooit de groeipunt weg.',
  spent: 'Knip uitgebloeide bloemen en verdroogde delen weg.',
};

type Opts = Partial<CatalogEntry> & Pick<CatalogEntry, 'light_min' | 'light_max'>;
const e = (
  latin: string,
  nl: string,
  en: string,
  water: [number, number],
  soil: Soil,
  toxic: 0 | 1,
  feed: string,
  repot: string,
  prune: string,
  description: string,
  o: Opts,
): CatalogEntry => ({
  latin_name: latin,
  name_nl: nl,
  name_en: en,
  water_summer_days: water[0],
  water_winter_days: water[1],
  soil,
  toxic,
  feed_tip: feed,
  repot_tip: repot,
  prune_tip: prune,
  description,
  ...o,
});

export const CATALOG: CatalogEntry[] = [
  // Aroids
  e('Monstera deliciosa', 'Gatenplant', 'Swiss cheese plant', [7, 14], 'airy', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Geef water als de bovenste 3–5 cm droog is. Houdt van een mosstok om aan te klimmen.', { light_min: H, light_max: I, synonyms: 'Monstera' }),
  e('Monstera adansonii', 'Kleine gatenplant', 'Swiss cheese vine', [6, 12], 'airy', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Klimt of hangt; houdt van hogere luchtvochtigheid.', { light_min: H, light_max: I }),
  e('Epipremnum aureum', 'Scindapsus', 'Golden pothos', [7, 14], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Zeer vergevingsgezind. Laat de bovenste laag tussen beurten droog worden.', { light_min: H, light_max: I, synonyms: 'Pothos, Scindapsus aureus, Devil\'s ivy, Epipremnum' }),
  e('Scindapsus pictus', 'Satijnpothos', 'Satin pothos', [8, 16], 'airy', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Iets droger houden dan Epipremnum; verdraagt minder natte voeten.', { light_min: H, light_max: I }),
  e('Philodendron hederaceum', 'Klimmende philodendron', 'Heartleaf philodendron', [7, 14], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Makkelijke klim- of hangplant.', { light_min: H, light_max: I, synonyms: 'Philodendron scandens, Philodendron' }),
  e('Thaumatophyllum bipinnatifidum', 'Splitbladige philodendron', 'Tree philodendron', [7, 14], 'standard', 1, FEED.leaf, REPOT.fast, PRUNE.trim,
    'Groot en breed; geef ruimte. Laat de bovenste laag drogen.', { light_min: H, light_max: I, synonyms: 'Philodendron bipinnatifidum, Philodendron selloum, Philodendron' }),
  e('Philodendron gloriosum', 'Philodendron gloriosum', 'Velvet-leaf philodendron', [7, 14], 'airy', 1, FEED.leaf, REPOT.leaf, PRUNE.none,
    'Kruipt over de grond; laat de wortelstok boven de aarde.', { light_min: H, light_max: I }),
  e('Spathiphyllum wallisii', 'Lepelplant', 'Peace lily', [5, 9], 'standard', 1, FEED.flower, REPOT.leaf, PRUNE.leaf,
    'Hangt slap als hij dorst heeft; geef dan flink water. Verdraagt weinig licht, maar bloeit alleen bij genoeg licht.', { light_min: S, light_max: I, synonyms: 'Spathiphyllum, Vredeslelie' }),
  e('Zamioculcas zamiifolia', 'ZZ-plant', 'ZZ plant', [21, 35], 'airy', 1, FEED.leaf, REPOT.slow, PRUNE.none,
    'Slaat water op in de knollen: liever te droog dan te nat. Zeer sterk.', { light_min: S, light_max: I, synonyms: 'Zamioculcas, Zanzibar gem' }),
  e('Dieffenbachia seguine', 'Dieffenbachia', 'Dumb cane', [7, 12], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Giftig sap; huid en mond kunnen geïrriteerd raken. Niet te koud zetten.', { light_min: H, light_max: I, synonyms: 'Dieffenbachia' }),
  e('Aglaonema commutatum', 'Aglaonema', 'Chinese evergreen', [8, 14], 'standard', 1, FEED.leaf, REPOT.slow, PRUNE.none,
    'Zeer geschikt voor wat minder licht; niet kouder dan 15 °C.', { light_min: S, light_max: I, synonyms: 'Aglaonema' }),
  e('Anthurium andraeanum', 'Anthurium', 'Flamingo flower', [7, 12], 'orchid_bark', 1, FEED.flower, REPOT.leaf, PRUNE.spent,
    'Houdt van een luchtige, bastrijke mix en hoge luchtvochtigheid.', { light_min: H, light_max: I, synonyms: 'Flamingoplant' }),
  e('Alocasia amazonica', 'Alocasia', 'African mask plant', [7, 14], 'airy', 1, FEED.leaf, REPOT.leaf, PRUNE.leaf,
    'Gevoelig voor te nat en te koud; vaak rustperiode in de winter.', { light_min: H, light_max: I, synonyms: 'Alocasia polly, Alocasia' }),
  e('Alocasia zebrina', 'Alocasia zebrina', 'Zebra elephant ear', [7, 14], 'airy', 1, FEED.leaf, REPOT.leaf, PRUNE.leaf,
    'Hoge luchtvochtigheid en gelijkmatig vochtig, niet nat.', { light_min: H, light_max: I }),
  e('Colocasia esculenta', 'Taro', 'Elephant ear', [4, 8], 'moist', 1, FEED.leaf, REPOT.fast, PRUNE.leaf,
    'Dorstig en groot; verdraagt een natte ondergrond.', { light_min: I, light_max: F, synonyms: 'Olifantsoor, Colocasia' }),
  e('Caladium bicolor', 'Caladium', 'Angel wings', [6, 12], 'moist', 1, FEED.leaf, REPOT.fast, PRUNE.leaf,
    'Gaat in de winter in rust; knol dan droog houden.', { light_min: H, light_max: I, synonyms: 'Kaladium' }),
  e('Syngonium podophyllum', 'Pijlpuntplant', 'Arrowhead plant', [7, 12], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Snelle groeier; houdt van hogere luchtvochtigheid.', { light_min: H, light_max: I, synonyms: 'Syngonium' }),
  e('Rhaphidophora tetrasperma', 'Mini-monstera', 'Mini monstera', [7, 12], 'airy', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Klimt snel; geef een mosstok.', { light_min: H, light_max: I, synonyms: 'Monstera minima' }),

  // Ficus
  e('Ficus elastica', 'Rubberplant', 'Rubber plant', [7, 14], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Veeg de bladeren af. Verplaatsen of tocht kan bladverlies geven. Melksap is irriterend.', { light_min: H, light_max: F, synonyms: 'Ficus' }),
  e('Ficus lyrata', 'Vioolbladplant', 'Fiddle-leaf fig', [7, 12], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Wil een vaste plek met veel licht; houd de aarde gelijkmatig vochtig.', { light_min: I, light_max: F, synonyms: 'Ficus' }),
  e('Ficus benjamina', 'Treurvijg', 'Weeping fig', [7, 12], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Verliest bladeren bij verplaatsen of tocht; vaste plek kiezen.', { light_min: I, light_max: F, synonyms: 'Ficus' }),
  e('Ficus microcarpa', 'Chinese vijg', 'Chinese banyan', [7, 14], 'standard', 1, FEED.leaf, REPOT.slow, PRUNE.trim,
    'Vaak als bonsai of met dikke stam verkocht.', { light_min: I, light_max: F, synonyms: 'Ficus ginseng, Ficus' }),
  e('Ficus pumila', 'Klimvijg', 'Creeping fig', [5, 9], 'moist', 1, FEED.leaf, REPOT.fast, PRUNE.trim,
    'Droogt snel uit; houd gelijkmatig vochtig.', { light_min: H, light_max: I, synonyms: 'Ficus' }),

  // Palms
  e('Chamaedorea elegans', 'Berghamedorea', 'Parlor palm', [7, 12], 'standard', 0, FEED.palm, REPOT.slow, PRUNE.leaf,
    'Kat-veilig en zeer geschikt voor schaduw. Niet te nat.', { light_min: S, light_max: I, synonyms: 'Kamerpalm, Palm' }),
  e('Howea forsteriana', 'Kentiapalm', 'Kentia palm', [7, 12], 'standard', 0, FEED.palm, REPOT.slow, PRUNE.leaf,
    'Traag en sterk; houdt niet van natte voeten.', { light_min: H, light_max: I, synonyms: 'Palm' }),
  e('Dypsis lutescens', 'Areca-palm', 'Areca palm', [6, 12], 'standard', 0, FEED.palm, REPOT.leaf, PRUNE.leaf,
    'Gelijkmatig vochtig; bruine punten wijzen op droge lucht.', { light_min: I, light_max: F, synonyms: 'Palm, Goudvruchtpalm, Chrysalidocarpus lutescens' }),
  e('Rhapis excelsa', 'Waaierpalm', 'Lady palm', [7, 14], 'standard', 0, FEED.palm, REPOT.slow, PRUNE.leaf,
    'Zeer robuust; verdraagt wat minder licht.', { light_min: H, light_max: I, synonyms: 'Palm' }),
  e('Phoenix roebelenii', 'Dwergdadelpalm', 'Pygmy date palm', [7, 12], 'standard', 0, FEED.palm, REPOT.slow, PRUNE.leaf,
    'Veel licht; scherpe stekels aan de bladstelen.', { light_min: I, light_max: F, synonyms: 'Palm' }),

  // Dracaena, Yucca, relatives
  e('Dracaena trifasciata', 'Sansevieria', 'Snake plant', [14, 28], 'cactus', 1, FEED.succ, REPOT.slow, PRUNE.none,
    'Liever te droog dan te nat. Rot snel door natte voeten, vooral in de winter.', { light_min: S, light_max: F, synonyms: 'Sansevieria trifasciata, Sansevieria, Zwaardlelie, Vrouwentong, Snake plant' }),
  e('Dracaena angolensis', 'Cilindrische sansevieria', 'Cylindrical snake plant', [14, 28], 'cactus', 1, FEED.succ, REPOT.slow, PRUNE.none,
    'Rolronde bladeren; verzorging als Sansevieria.', { light_min: S, light_max: F, synonyms: 'Sansevieria cylindrica, Sansevieria' }),
  e('Dracaena fragrans', 'Drakenboom', 'Corn plant', [7, 14], 'standard', 1, FEED.leaf, REPOT.slow, PRUNE.top,
    'Gevoelig voor fluoride in kraanwater (bruine punten); lauw, kalkarm water helpt.', { light_min: H, light_max: I, synonyms: 'Dracaena, Dracaena massangeana' }),
  e('Dracaena marginata', 'Draceaena marginata', 'Madagascar dragon tree', [10, 18], 'standard', 1, FEED.leaf, REPOT.slow, PRUNE.top,
    'Sterk en traag; de stam kun je terugsnoeien om nieuwe loten te krijgen.', { light_min: H, light_max: I, synonyms: 'Dracaena reflexa, Drakenboom, Dracaena' }),
  e('Dracaena reflexa', 'Dracaena reflexa', 'Song of India', [7, 14], 'standard', 1, FEED.leaf, REPOT.slow, PRUNE.top,
    'Heldere plek zonder volle zon; niet nat houden.', { light_min: H, light_max: I, synonyms: 'Dracaena' }),
  e('Yucca gigantea', 'Palmlelie', 'Spineless yucca', [14, 28], 'cactus', 1, FEED.succ, REPOT.slow, PRUNE.top,
    'Droog laten worden; veel licht. Stam kan worden ingekort.', { light_min: I, light_max: F, synonyms: 'Yucca elephantipes, Yucca' }),
  e('Cordyline fruticosa', 'Koolpalm', 'Ti plant', [6, 12], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Houdt van gelijkmatig vocht en hogere luchtvochtigheid.', { light_min: H, light_max: I, synonyms: 'Cordyline' }),

  // Succulents and cacti
  e('Aloe vera', 'Aloë vera', 'Aloe vera', [21, 42], 'cactus', 1, FEED.succ, REPOT.succ, PRUNE.none,
    'Veel licht; goed laten uitdrogen. Het gel is niet giftig voor de huid, maar het sap in het blad wel bij inname.', { light_min: I, light_max: F, synonyms: 'Aloe barbadensis' }),
  e('Gonialoe variegata', 'Tijgeraloë', 'Tiger aloe', [21, 42], 'cactus', 1, FEED.succ, REPOT.succ, PRUNE.none,
    'Kleine aloë voor een lichte plek.', { light_min: I, light_max: F, synonyms: 'Aloe variegata' }),
  e('Haworthiopsis fasciata', 'Zebraplantje', 'Zebra haworthia', [21, 42], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.none,
    'Kleine succulent; kan wat minder licht aan.', { light_min: H, light_max: I, synonyms: 'Haworthia fasciata, Haworthia' }),
  e('Crassula ovata', 'Pennyboom', 'Jade plant', [14, 35], 'cactus', 1, FEED.succ, REPOT.succ, PRUNE.top,
    'Rimpelende bladeren = dorst. Veel licht geeft compacte groei.', { light_min: I, light_max: F, synonyms: 'Geldboom, Jade plant, Crassula' }),
  e('Echeveria elegans', 'Echeveria', 'Mexican snowball', [14, 35], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.none,
    'Veel licht, anders rekt hij uit. Water nooit in de rozet laten staan.', { light_min: I, light_max: F, synonyms: 'Echeveria' }),
  e('Sedum morganianum', 'Ezelsstaart', 'Donkey\'s tail', [21, 42], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.none,
    'Bladeren vallen makkelijk af; zo min mogelijk aanraken.', { light_min: I, light_max: F, synonyms: 'Sedum' }),
  e('Senecio rowleyanus', 'Erwtenplant', 'String of pearls', [14, 28], 'cactus', 1, FEED.succ, REPOT.succ, PRUNE.trim,
    'Hangplant; platte bolletjes betekenen dorst. Niet te nat.', { light_min: I, light_max: F, synonyms: 'Parelsnoer, Curio rowleyanus' }),
  e('Kalanchoe blossfeldiana', 'Kalanchoë', 'Flaming Katy', [10, 21], 'cactus', 1, FEED.flower, REPOT.slow, PRUNE.spent,
    'Bloeit weer na een korte-dagperiode van ± 6 weken met 14 uur donker.', { light_min: I, light_max: F, synonyms: 'Vlammende Katy, Kalanchoe' }),
  e('Euphorbia trigona', 'Afrikaanse melkboom', 'African milk tree', [14, 35], 'cactus', 1, FEED.succ, REPOT.succ, PRUNE.top,
    'Melksap is irriterend; draag handschoenen bij snoeien.', { light_min: I, light_max: F, synonyms: 'Euphorbia' }),
  e('Euphorbia milii', 'Christusdoorn', 'Crown of thorns', [14, 28], 'cactus', 1, FEED.succ, REPOT.succ, PRUNE.top,
    'Giftig sap en doornen; draag handschoenen.', { light_min: I, light_max: F, synonyms: 'Euphorbia' }),
  e('Euphorbia pulcherrima', 'Kerstster', 'Poinsettia', [7, 10], 'standard', 1, FEED.flower, REPOT.slow, PRUNE.top,
    'Bloeit in de winter; geen tocht en niet in de kou. Melksap kan de huid irriteren.', { light_min: I, light_max: F, synonyms: 'Poinsettia' }),
  e('Opuntia microdasys', 'Konijnenoorcactus', 'Bunny ears cactus', [21, 56], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.none,
    'Heel veel licht, nauwelijks water in de winter. Glochiden (fijne haartjes) prikken lastig.', { light_min: F, light_max: F, synonyms: 'Cactus, Opuntia' }),
  e('Echinocactus grusonii', 'Schoonmoedersstoel', 'Golden barrel cactus', [21, 56], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.none,
    'Veel zon, droog in de winter.', { light_min: F, light_max: F, synonyms: 'Cactus' }),
  e('Mammillaria', 'Mammillaria', 'Pincushion cactus', [21, 56], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.none,
    'Kleine cactus, bloeit met een krans bloemen als hij een koele, droge winter heeft.', { light_min: I, light_max: F, synonyms: 'Cactus' }),
  e('Cactaceae', 'Cactus', 'Cactus', [21, 42], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.none,
    'Algemene cactus: veel licht, goed laten uitdrogen en in de winter vrijwel droog houden. Niet alle cactussen zijn hetzelfde, zoek bij twijfel de exacte soort.', { light_min: I, light_max: F, synonyms: 'Cactus' }),
  e('Schlumbergera truncata', 'Kerstcactus', 'Christmas cactus', [8, 16], 'airy', 0, FEED.flower, REPOT.slow, PRUNE.spent,
    'Geen cactus uit de woestijn: gelijkmatig licht vochtig. Knopvorming door koele nachten en kortere dagen.', { light_min: H, light_max: I, synonyms: 'Schlumbergera, Zygocactus' }),
  e('Hatiora gaertneri', 'Paascactus', 'Easter cactus', [8, 16], 'airy', 0, FEED.flower, REPOT.slow, PRUNE.spent,
    'Bloeit in het voorjaar; verzorging als de kerstcactus.', { light_min: H, light_max: I, synonyms: 'Rhipsalidopsis' }),
  e('Rhipsalis baccifera', 'Draadcactus', 'Mistletoe cactus', [8, 16], 'airy', 0, FEED.succ, REPOT.slow, PRUNE.trim,
    'Epifytische hangplant; houdt van lichte vochtigheid.', { light_min: H, light_max: I, synonyms: 'Rhipsalis' }),
  e('Portulacaria afra', 'Spekboom', 'Elephant bush', [14, 28], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.top,
    'Vergevingsgezinde succulent; snoeien geeft een bossige vorm.', { light_min: I, light_max: F, synonyms: 'Olifantsboom' }),
  e('Aeonium arboreum', 'Aeonium', 'Tree aeonium', [14, 28], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.top,
    'Groeit in de winter, rust in de zomerhitte; dan weinig water.', { light_min: I, light_max: F, synonyms: 'Aeonium' }),

  // Hanging and trailing
  e('Chlorophytum comosum', 'Graslelie', 'Spider plant', [7, 12], 'standard', 0, FEED.leaf, REPOT.fast, PRUNE.leaf,
    'Kat-veilig; bruine punten door kalk of droge lucht. Uitlopers kun je als stek gebruiken.', { light_min: H, light_max: I, synonyms: 'Chlorophytum' }),
  e('Tradescantia zebrina', 'Zebrakruid', 'Inch plant', [5, 9], 'standard', 1, FEED.leaf, REPOT.fast, PRUNE.trim,
    'Sap kan de huid irriteren. Knip regelmatig terug voor een volle plant.', { light_min: I, light_max: F, synonyms: 'Tradescantia, Zebrina pendula' }),
  e('Hedera helix', 'Klimop', 'English ivy', [6, 12], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Koele plek met veel lucht; spint bij droge, warme lucht.', { light_min: H, light_max: I, synonyms: 'Hedera' }),
  e('Ceropegia woodii', 'Hartjesplant', 'String of hearts', [14, 28], 'cactus', 0, FEED.succ, REPOT.succ, PRUNE.trim,
    'Hangende succulent; goed laten drogen.', { light_min: I, light_max: F, synonyms: 'Rozenkransplant' }),
  e('Hoya carnosa', 'Wasbloem', 'Wax plant', [14, 28], 'airy', 0, FEED.flower, REPOT.slow, PRUNE.none,
    'Snijd de bloemstelen na de bloei niet af; hij bloeit daar weer.', { light_min: I, light_max: F, synonyms: 'Hoya' }),
  e('Hoya kerrii', 'Hartjeshoya', 'Sweetheart hoya', [14, 28], 'airy', 0, FEED.succ, REPOT.slow, PRUNE.none,
    'Vlezig blad; veel licht en weinig water.', { light_min: I, light_max: F, synonyms: 'Hoya' }),
  e('Cissus rhombifolia', 'Kamerwingerd', 'Grape ivy', [7, 12], 'standard', 0, FEED.leaf, REPOT.leaf, PRUNE.trim,
    'Verdraagt halfschaduw; niet te koud.', { light_min: H, light_max: I, synonyms: 'Cissus, Druivenplant' }),
  e('Nematanthus gregarius', 'Goudvisplant', 'Goldfish plant', [7, 12], 'airy', 0, FEED.flower, REPOT.slow, PRUNE.trim,
    'Hangplant; bloeit het best met veel licht en wat krap in de pot.', { light_min: H, light_max: I, synonyms: 'Nematanthus' }),
  e('Aeschynanthus radicans', 'Lipstickplant', 'Lipstick plant', [7, 12], 'orchid_bark', 0, FEED.flower, REPOT.slow, PRUNE.trim,
    'Hangplant met rode bloemen; houdt van warmte en vochtige lucht.', { light_min: H, light_max: I, synonyms: 'Aeschynanthus' }),

  // Ferns
  e('Nephrolepis exaltata', 'Zwaardvaren', 'Boston fern', [4, 7], 'moist', 0, FEED.fern, REPOT.fast, PRUNE.leaf,
    'Houd gelijkmatig vochtig en geef luchtvochtigheid. Kat-veilig.', { light_min: H, light_max: I, synonyms: 'Varen, Boston fern' }),
  e('Asplenium nidus', 'Nestvaren', 'Bird\'s nest fern', [6, 10], 'moist', 0, FEED.fern, REPOT.slow, PRUNE.leaf,
    'Geef water langs de rand, niet in het hart van de rozet.', { light_min: H, light_max: I, synonyms: 'Varen' }),
  e('Adiantum raddianum', 'Venushaar', 'Maidenhair fern', [3, 6], 'moist', 0, FEED.fern, REPOT.fast, PRUNE.leaf,
    'Gevoelig: nooit uit laten drogen. Knip bij verdroging alles tot op de grond af.', { light_min: H, light_max: I, synonyms: 'Varen, Adiantum' }),
  e('Platycerium bifurcatum', 'Hertshoornvaren', 'Staghorn fern', [7, 14], 'orchid_bark', 0, FEED.fern, REPOT.slow, PRUNE.leaf,
    'Epifyt: dompel de wortelkluit af en toe in water in plaats van gieten.', { light_min: H, light_max: I, synonyms: 'Varen' }),

  // Prayer-plant family
  e('Calathea orbifolia', 'Calathea orbifolia', 'Calathea orbifolia', [5, 9], 'moist', 0, FEED.leaf, REPOT.leaf, PRUNE.leaf,
    'Gebruik lauw, kalkarm water; hoge luchtvochtigheid. Kat-veilig.', { light_min: H, light_max: I, synonyms: 'Calathea, Goeppertia orbifolia' }),
  e('Goeppertia makoyana', 'Pauwenplant', 'Peacock plant', [5, 9], 'moist', 0, FEED.leaf, REPOT.leaf, PRUNE.leaf,
    'Lauw, kalkarm water; hoge luchtvochtigheid.', { light_min: H, light_max: I, synonyms: 'Calathea makoyana, Calathea' }),
  e('Goeppertia insignis', 'Calathea lancifolia', 'Rattlesnake plant', [5, 9], 'moist', 0, FEED.leaf, REPOT.leaf, PRUNE.leaf,
    'Lauw, kalkarm water; hoge luchtvochtigheid.', { light_min: H, light_max: I, synonyms: 'Calathea lancifolia, Calathea' }),
  e('Maranta leuconeura', 'Gebedsplant', 'Prayer plant', [5, 9], 'moist', 0, FEED.leaf, REPOT.leaf, PRUNE.leaf,
    'Klapt \'s avonds de bladeren omhoog. Gelijkmatig vochtig en geen volle zon.', { light_min: H, light_max: I, synonyms: 'Maranta' }),
  e('Stromanthe sanguinea', 'Stromanthe', 'Triostar', [5, 9], 'moist', 0, FEED.leaf, REPOT.leaf, PRUNE.leaf,
    'Gevoelig voor droge lucht; gelijkmatig vochtig.', { light_min: H, light_max: I, synonyms: 'Stromanthe triostar' }),

  // Pilea and friends
  e('Pilea peperomioides', 'Pannenkoekplant', 'Chinese money plant', [7, 12], 'standard', 0, FEED.leaf, REPOT.fast, PRUNE.none,
    'Draai de pot regelmatig voor een gelijkmatige groei. Uitlopers kun je losmaken en apart planten.', { light_min: H, light_max: I, synonyms: 'Pilea, Ufo-plant' }),
  e('Peperomia obtusifolia', 'Peperomia', 'Baby rubber plant', [10, 18], 'airy', 0, FEED.leaf, REPOT.slow, PRUNE.top,
    'Vlezig blad slaat water op: liever te droog dan te nat.', { light_min: H, light_max: I, synonyms: 'Peperomia' }),
  e('Peperomia argyreia', 'Watermeloen-peperomia', 'Watermelon peperomia', [10, 18], 'airy', 0, FEED.leaf, REPOT.slow, PRUNE.none,
    'Vlezig blad slaat water op: liever te droog dan te nat.', { light_min: H, light_max: I, synonyms: 'Peperomia' }),
  e('Soleirolia soleirolii', 'Babytranen', 'Baby\'s tears', [3, 6], 'moist', 0, FEED.fern, REPOT.fast, PRUNE.trim,
    'Mosachtig kussen; nooit droog laten komen.', { light_min: H, light_max: I }),
  e('Fittonia albivenis', 'Mozaïekplant', 'Nerve plant', [4, 7], 'moist', 0, FEED.fern, REPOT.fast, PRUNE.trim,
    'Hangt direct slap bij droogte maar herstelt snel na water. Houdt van luchtvochtigheid.', { light_min: H, light_max: I, synonyms: 'Fittonia' }),
  e('Hypoestes phyllostachya', 'Sproetenplant', 'Polka dot plant', [5, 9], 'moist', 0, FEED.leaf, REPOT.fast, PRUNE.top,
    'Knip regelmatig de toppen af voor een bossige plant.', { light_min: H, light_max: I, synonyms: 'Hypoestes' }),
  e('Begonia maculata', 'Begonia maculata', 'Polka dot begonia', [7, 12], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Geen water op de bladeren (meeldauw); laat de bovenste laag drogen.', { light_min: H, light_max: I, synonyms: 'Begonia' }),
  e('Begonia rex', 'Rexbegonia', 'Rex begonia', [6, 10], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.leaf,
    'Geen water op de bladeren; gelijkmatig licht vochtig.', { light_min: H, light_max: I, synonyms: 'Begonia' }),
  e('Coleus scutellarioides', 'Siernetel', 'Coleus', [4, 8], 'standard', 1, FEED.leaf, REPOT.fast, PRUNE.top,
    'Knijp bloemen weg om de kleur van het blad te behouden.', { light_min: I, light_max: F, synonyms: 'Plectranthus scutellarioides' }),
  e('Oxalis triangularis', 'Klaverzuring', 'Purple shamrock', [7, 12], 'standard', 1, FEED.flower, REPOT.fast, PRUNE.leaf,
    'Kan in rust gaan; dan weinig water tot er weer blad komt.', { light_min: H, light_max: I, synonyms: 'Oxalis' }),

  // Flowering plants
  e('Phalaenopsis', 'Vlinderorchidee', 'Moth orchid', [7, 10], 'orchid_bark', 0, FEED.orchid, REPOT.orchid,
    'Na de bloei: knip de bloemstengel boven het 2e–3e oog af (kans op een zijtak), of helemaal weg als hij bruin wordt.',
    'Dompel de pot 10–15 min in water en laat goed uitlekken; nooit water in het hart van de plant. Kat-veilig.',
    { light_min: H, light_max: I, synonyms: 'Orchidee, Orchid' }),
  e('Saintpaulia ionantha', 'Kaaps viooltje', 'African violet', [5, 8], 'moist', 0, FEED.flower, REPOT.slow, PRUNE.spent,
    'Geef water onderlangs en niet op de bladeren. Gebruik lauw water.', { light_min: H, light_max: I, synonyms: 'Streptocarpus ionanthus, Saintpaulia' }),
  e('Hibiscus rosa-sinensis', 'Chinese roos', 'Hibiscus', [4, 8], 'standard', 1, FEED.flower, REPOT.fast, PRUNE.top,
    'Veel licht en gelijkmatig vocht; knoppen vallen bij verplaatsen of tocht. Voorzichtigheidshalve als giftig gemarkeerd.', { light_min: I, light_max: F, synonyms: 'Hibiscus' }),
  e('Clivia miniata', 'Clivia', 'Bush lily', [10, 28], 'standard', 1, FEED.flower, REPOT.slow, PRUNE.spent,
    'Bloeit na een koele, droge rustperiode in de winter. Verpot niet te vaak.', { light_min: H, light_max: I, synonyms: 'Kafferlelie' }),
  e('Cyclamen persicum', 'Alpenviooltje', 'Cyclamen', [4, 7], 'standard', 1, FEED.flower, REPOT.slow, PRUNE.spent,
    'Koel zetten en onderlangs water geven. Gaat in de zomer in rust.', { light_min: H, light_max: I, synonyms: 'Cyclaam' }),
  e('Hippeastrum', 'Amaryllis', 'Amaryllis', [7, 14], 'standard', 1, FEED.flower, REPOT.slow,
    'Snijd de bloemstengel na de bloei af; laat het blad staan en voed de bol tot de rustperiode.',
    'Bol is giftig. Laat de bol na het groeiseizoen enkele weken droog en koel rusten.',
    { light_min: I, light_max: F, synonyms: 'Ridderster' }),
  e('Guzmania lingulata', 'Guzmania', 'Scarlet star', [7, 14], 'orchid_bark', 0, FEED.brom, REPOT.brom, PRUNE.none,
    'Houd de trechter in het hart gevuld met water en ververs het regelmatig.', { light_min: H, light_max: I, synonyms: 'Bromelia' }),
  e('Aechmea fasciata', 'Lanspunt', 'Urn plant', [7, 14], 'orchid_bark', 0, FEED.brom, REPOT.brom, PRUNE.none,
    'Vul de trechter met water; kan na de bloei jonge uitlopers geven.', { light_min: I, light_max: F, synonyms: 'Bromelia, Aechmea' }),
  e('Tillandsia', 'Luchtplant', 'Air plant', [7, 10], 'standard', 0, FEED.brom, 'Wordt niet in aarde geplant; kan op een stukje hout of in een schaal liggen.', PRUNE.none,
    'Week 20–30 min per week in water of spuit goed; schud en laat daarna goed drogen.', { light_min: H, light_max: I, synonyms: 'Air plant' }),
  e('Pelargonium', 'Geranium', 'Geranium', [4, 10], 'standard', 1, FEED.flower, REPOT.fast, PRUNE.top,
    'Veel licht en een luchtige plek; knip verwelkte bloemen af.', { light_min: I, light_max: F, synonyms: 'Pelargonium zonale' }),

  // Larger specimens and misc.
  e('Beaucarnea recurvata', 'Olifantspoot', 'Ponytail palm', [21, 35], 'cactus', 0, FEED.succ, REPOT.slow, PRUNE.none,
    'Slaat water op in de dikke voet. Kat-veilig, maar katten kauwen graag op het blad.', { light_min: I, light_max: F, synonyms: 'Beaucarnea' }),
  e('Pachira aquatica', 'Geldboom', 'Money tree', [10, 18], 'standard', 0, FEED.leaf, REPOT.slow, PRUNE.trim,
    'Slaat water op in de stam; liever te droog dan te nat.', { light_min: H, light_max: I, synonyms: 'Pachira' }),
  e('Schefflera arboricola', 'Schefflera', 'Dwarf umbrella tree', [7, 14], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Verliest blad bij te nat of tocht.', { light_min: H, light_max: I, synonyms: 'Vingeraralia' }),
  e('Fatsia japonica', 'Vingerplant', 'Japanese aralia', [7, 12], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Houdt van een koele plek; te warm geeft hangende bladeren. Voorzichtigheidshalve als giftig gemarkeerd.', { light_min: S, light_max: I, synonyms: 'Fatsia' }),
  e('Aspidistra elatior', 'Aspidistra', 'Cast iron plant', [10, 18], 'standard', 0, FEED.leaf, REPOT.slow, PRUNE.leaf,
    'Vrijwel onverwoestbaar; verdraagt veel schaduw.', { light_min: S, light_max: H, synonyms: 'Kamerplant, Cast iron plant' }),
  e('Strelitzia reginae', 'Paradijsvogelbloem', 'Bird of paradise', [7, 14], 'standard', 1, FEED.leaf, REPOT.slow, PRUNE.leaf,
    'Veel licht en ruimte; bloeit pas na enkele jaren bij genoeg licht.', { light_min: I, light_max: F, synonyms: 'Strelitzia' }),
  e('Codiaeum variegatum', 'Croton', 'Croton', [5, 9], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Veel licht voor de kleur; laat bladeren vallen bij tocht of verplaatsen. Melksap irriteert.', { light_min: I, light_max: F, synonyms: 'Codiaeum' }),
  e('Coffea arabica', 'Koffieplant', 'Coffee plant', [6, 10], 'standard', 1, FEED.leaf, REPOT.leaf, PRUNE.top,
    'Gelijkmatig vochtig; geen kou of tocht.', { light_min: H, light_max: I, synonyms: 'Koffie' }),
  e('Cycas revoluta', 'Sagopalm', 'Sago palm', [14, 28], 'cactus', 1, FEED.palm, REPOT.slow,
    'Verwijder alleen verdroogde bladeren.',
    'Zeer giftig, vooral de zaden en stam; voor kat of kind liever niet binnenhalen. Traag groeiend.',
    { light_min: I, light_max: F, synonyms: 'Cycas' }),
];

const SYNC_FIELDS = [
  'name_nl', 'name_en', 'synonyms', 'light_min', 'light_max', 'water_summer_days', 'water_winter_days',
  'soil', 'toxic', 'feed_tip', 'repot_tip', 'prune_tip', 'description',
] as const;

/**
 * Inserts catalog entries that are missing and refreshes untouched ones.
 * Entries the user has edited (user_edited = 1) or that are not from the catalog are never overwritten.
 */
export function syncCatalog(db: DatabaseSync, entries: CatalogEntry[] = CATALOG): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  const find = db.prepare("SELECT id, source, user_edited FROM species WHERE latin_name = ? AND source = 'catalog'");
  const taken = db.prepare('SELECT id FROM species WHERE name = ?');
  const insert = db.prepare(`INSERT INTO species (name, latin_name, ${SYNC_FIELDS.join(',')}, toxic_cat, toxic_child, source, verified)
    VALUES (?, ?, ${SYNC_FIELDS.map(() => '?').join(',')}, ?, ?, 'catalog', 0)`);
  const update = db.prepare(`UPDATE species SET ${SYNC_FIELDS.map((f) => `${f} = ?`).join(',')} WHERE id = ?`);
  db.exec('BEGIN');
  try {
    for (const c of entries) {
      const row = find.get(c.latin_name) as { id: number; user_edited: number } | undefined;
      const values = SYNC_FIELDS.map((f) => c[f] ?? null) as any[];
      if (!row) {
        if (taken.get(c.latin_name)) continue; // a user-created species already owns this name
        insert.run(c.latin_name, c.latin_name, ...values, c.toxic, c.toxic);
        added++;
      } else if (!row.user_edited) {
        update.run(...values, row.id);
        updated++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { added, updated };
}
