const COUNTRY_ROWS = [
    ["AF", "AFG", "Afganistán"], ["AX", "ALA", "Islas Åland"], ["AL", "ALB", "Albania"], ["DZ", "DZA", "Argelia"],
    ["AS", "ASM", "Samoa Americana"], ["AD", "AND", "Andorra"], ["AO", "AGO", "Angola"], ["AI", "AIA", "Anguila"],
    ["AQ", "ATA", "Antártida"], ["AG", "ATG", "Antigua y Barbuda"], ["AR", "ARG", "Argentina"], ["AM", "ARM", "Armenia"],
    ["AW", "ABW", "Aruba"], ["AU", "AUS", "Australia"], ["AT", "AUT", "Austria"], ["AZ", "AZE", "Azerbaiyán"],
    ["BS", "BHS", "Bahamas"], ["BH", "BHR", "Baréin"], ["BD", "BGD", "Bangladés"], ["BB", "BRB", "Barbados"],
    ["BY", "BLR", "Bielorrusia"], ["BE", "BEL", "Bélgica"], ["BZ", "BLZ", "Belice"], ["BJ", "BEN", "Benín"],
    ["BM", "BMU", "Bermudas"], ["BT", "BTN", "Bután"], ["BO", "BOL", "Bolivia"], ["BQ", "BES", "Bonaire, San Eustaquio y Saba"],
    ["BA", "BIH", "Bosnia y Herzegovina"], ["BW", "BWA", "Botsuana"], ["BV", "BVT", "Isla Bouvet"], ["BR", "BRA", "Brasil"],
    ["IO", "IOT", "Territorio Británico del Océano Índico"], ["BN", "BRN", "Brunéi"], ["BG", "BGR", "Bulgaria"], ["BF", "BFA", "Burkina Faso"],
    ["BI", "BDI", "Burundi"], ["CV", "CPV", "Cabo Verde"], ["KH", "KHM", "Camboya"], ["CM", "CMR", "Camerún"],
    ["CA", "CAN", "Canadá"], ["KY", "CYM", "Islas Caimán"], ["CF", "CAF", "República Centroafricana"], ["TD", "TCD", "Chad"],
    ["CL", "CHL", "Chile"], ["CN", "CHN", "China"], ["CX", "CXR", "Isla de Navidad"], ["CC", "CCK", "Islas Cocos"],
    ["CO", "COL", "Colombia"], ["KM", "COM", "Comoras"], ["CG", "COG", "Congo"], ["CD", "COD", "Congo (República Democrática)"],
    ["CK", "COK", "Islas Cook"], ["CR", "CRI", "Costa Rica"], ["CI", "CIV", "Costa de Marfil"], ["HR", "HRV", "Croacia"],
    ["CU", "CUB", "Cuba"], ["CW", "CUW", "Curazao"], ["CY", "CYP", "Chipre"], ["CZ", "CZE", "Chequia"],
    ["DK", "DNK", "Dinamarca"], ["DJ", "DJI", "Yibuti"], ["DM", "DMA", "Dominica"], ["DO", "DOM", "República Dominicana"],
    ["EC", "ECU", "Ecuador"], ["EG", "EGY", "Egipto"], ["SV", "SLV", "El Salvador"], ["GQ", "GNQ", "Guinea Ecuatorial"],
    ["ER", "ERI", "Eritrea"], ["EE", "EST", "Estonia"], ["SZ", "SWZ", "Esuatini"], ["ET", "ETH", "Etiopía"],
    ["FK", "FLK", "Islas Malvinas"], ["FO", "FRO", "Islas Feroe"], ["FJ", "FJI", "Fiyi"], ["FI", "FIN", "Finlandia"],
    ["FR", "FRA", "Francia"], ["GF", "GUF", "Guayana Francesa"], ["PF", "PYF", "Polinesia Francesa"], ["TF", "ATF", "Tierras Australes Francesas"],
    ["GA", "GAB", "Gabón"], ["GM", "GMB", "Gambia"], ["GE", "GEO", "Georgia"], ["DE", "DEU", "Alemania"],
    ["GH", "GHA", "Ghana"], ["GI", "GIB", "Gibraltar"], ["GR", "GRC", "Grecia"], ["GL", "GRL", "Groenlandia"],
    ["GD", "GRD", "Granada"], ["GP", "GLP", "Guadalupe"], ["GU", "GUM", "Guam"], ["GT", "GTM", "Guatemala"],
    ["GG", "GGY", "Guernsey"], ["GN", "GIN", "Guinea"], ["GW", "GNB", "Guinea-Bisáu"], ["GY", "GUY", "Guyana"],
    ["HT", "HTI", "Haití"], ["HM", "HMD", "Islas Heard y McDonald"], ["VA", "VAT", "Ciudad del Vaticano"], ["HN", "HND", "Honduras"],
    ["HK", "HKG", "Hong Kong"], ["HU", "HUN", "Hungría"], ["IS", "ISL", "Islandia"], ["IN", "IND", "India"],
    ["ID", "IDN", "Indonesia"], ["IR", "IRN", "Irán"], ["IQ", "IRQ", "Irak"], ["IE", "IRL", "Irlanda"],
    ["IM", "IMN", "Isla de Man"], ["IL", "ISR", "Israel"], ["IT", "ITA", "Italia"], ["JM", "JAM", "Jamaica"],
    ["JP", "JPN", "Japón"], ["JE", "JEY", "Jersey"], ["JO", "JOR", "Jordania"], ["KZ", "KAZ", "Kazajistán"],
    ["KE", "KEN", "Kenia"], ["KI", "KIR", "Kiribati"], ["KP", "PRK", "Corea del Norte"], ["KR", "KOR", "Corea del Sur"],
    ["KW", "KWT", "Kuwait"], ["KG", "KGZ", "Kirguistán"], ["LA", "LAO", "Laos"], ["LV", "LVA", "Letonia"],
    ["LB", "LBN", "Líbano"], ["LS", "LSO", "Lesoto"], ["LR", "LBR", "Liberia"], ["LY", "LBY", "Libia"],
    ["LI", "LIE", "Liechtenstein"], ["LT", "LTU", "Lituania"], ["LU", "LUX", "Luxemburgo"], ["MO", "MAC", "Macao"],
    ["MG", "MDG", "Madagascar"], ["MW", "MWI", "Malaui"], ["MY", "MYS", "Malasia"], ["MV", "MDV", "Maldivas"],
    ["ML", "MLI", "Malí"], ["MT", "MLT", "Malta"], ["MH", "MHL", "Islas Marshall"], ["MQ", "MTQ", "Martinica"],
    ["MR", "MRT", "Mauritania"], ["MU", "MUS", "Mauricio"], ["YT", "MYT", "Mayotte"], ["MX", "MEX", "México"],
    ["FM", "FSM", "Micronesia"], ["MD", "MDA", "Moldavia"], ["MC", "MCO", "Mónaco"], ["MN", "MNG", "Mongolia"],
    ["ME", "MNE", "Montenegro"], ["MS", "MSR", "Montserrat"], ["MA", "MAR", "Marruecos"], ["MZ", "MOZ", "Mozambique"],
    ["MM", "MMR", "Myanmar"], ["NA", "NAM", "Namibia"], ["NR", "NRU", "Nauru"], ["NP", "NPL", "Nepal"],
    ["NL", "NLD", "Países Bajos"], ["NC", "NCL", "Nueva Caledonia"], ["NZ", "NZL", "Nueva Zelanda"], ["NI", "NIC", "Nicaragua"],
    ["NE", "NER", "Níger"], ["NG", "NGA", "Nigeria"], ["NU", "NIU", "Niue"], ["NF", "NFK", "Isla Norfolk"],
    ["MK", "MKD", "Macedonia del Norte"], ["MP", "MNP", "Islas Marianas del Norte"], ["NO", "NOR", "Noruega"], ["OM", "OMN", "Omán"],
    ["PK", "PAK", "Pakistán"], ["PW", "PLW", "Palaos"], ["PS", "PSE", "Palestina"], ["PA", "PAN", "Panamá"],
    ["PG", "PNG", "Papúa Nueva Guinea"], ["PY", "PRY", "Paraguay"], ["PE", "PER", "Perú"], ["PH", "PHL", "Filipinas"],
    ["PN", "PCN", "Islas Pitcairn"], ["PL", "POL", "Polonia"], ["PT", "PRT", "Portugal"], ["PR", "PRI", "Puerto Rico"],
    ["QA", "QAT", "Catar"], ["RE", "REU", "Reunión"], ["RO", "ROU", "Rumanía"], ["RU", "RUS", "Rusia"],
    ["RW", "RWA", "Ruanda"], ["BL", "BLM", "San Bartolomé"], ["SH", "SHN", "Santa Elena"], ["KN", "KNA", "San Cristóbal y Nieves"],
    ["LC", "LCA", "Santa Lucía"], ["MF", "MAF", "San Martín (parte francesa)"], ["PM", "SPM", "San Pedro y Miquelón"], ["VC", "VCT", "San Vicente y las Granadinas"],
    ["WS", "WSM", "Samoa"], ["SM", "SMR", "San Marino"], ["ST", "STP", "Santo Tomé y Príncipe"], ["SA", "SAU", "Arabia Saudita"],
    ["SN", "SEN", "Senegal"], ["RS", "SRB", "Serbia"], ["SC", "SYC", "Seychelles"], ["SL", "SLE", "Sierra Leona"],
    ["SG", "SGP", "Singapur"], ["SX", "SXM", "Sint Maarten"], ["SK", "SVK", "Eslovaquia"], ["SI", "SVN", "Eslovenia"],
    ["SB", "SLB", "Islas Salomón"], ["SO", "SOM", "Somalia"], ["ZA", "ZAF", "Sudáfrica"], ["GS", "SGS", "Georgia del Sur y Sandwich del Sur"],
    ["SS", "SSD", "Sudán del Sur"], ["ES", "ESP", "España"], ["LK", "LKA", "Sri Lanka"], ["SD", "SDN", "Sudán"],
    ["SR", "SUR", "Surinam"], ["SJ", "SJM", "Svalbard y Jan Mayen"], ["SE", "SWE", "Suecia"], ["CH", "CHE", "Suiza"],
    ["SY", "SYR", "Siria"], ["TW", "TWN", "Taiwán"], ["TJ", "TJK", "Tayikistán"], ["TZ", "TZA", "Tanzania"],
    ["TH", "THA", "Tailandia"], ["TL", "TLS", "Timor-Leste"], ["TG", "TGO", "Togo"], ["TK", "TKL", "Tokelau"],
    ["TO", "TON", "Tonga"], ["TT", "TTO", "Trinidad y Tobago"], ["TN", "TUN", "Túnez"], ["TR", "TUR", "Turquía"],
    ["TM", "TKM", "Turkmenistán"], ["TC", "TCA", "Islas Turcas y Caicos"], ["TV", "TUV", "Tuvalu"], ["UG", "UGA", "Uganda"],
    ["UA", "UKR", "Ucrania"], ["AE", "ARE", "Emiratos Árabes Unidos"], ["GB", "GBR", "Reino Unido"], ["US", "USA", "Estados Unidos"],
    ["UM", "UMI", "Islas Ultramarinas Menores de EE. UU."], ["UY", "URY", "Uruguay"], ["UZ", "UZB", "Uzbekistán"], ["VU", "VUT", "Vanuatu"],
    ["VE", "VEN", "Venezuela"], ["VN", "VNM", "Vietnam"], ["VG", "VGB", "Islas Vírgenes Británicas"], ["VI", "VIR", "Islas Vírgenes de EE. UU."],
    ["WF", "WLF", "Wallis y Futuna"], ["EH", "ESH", "Sáhara Occidental"], ["YE", "YEM", "Yemen"], ["ZM", "ZMB", "Zambia"], ["ZW", "ZWE", "Zimbabue"],
];

function toFlag(iso2) {
    return String(iso2 || "").toUpperCase().replace(/[A-Z]/g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
}

export const COUNTRY_OPTIONS = COUNTRY_ROWS
    .map(([iso2, code, name]) => ({ iso2, code, name, flag: toFlag(iso2) }))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));

export function findCountry(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return COUNTRY_OPTIONS.find((country) => country.code === normalized || country.iso2 === normalized) || null;
}
