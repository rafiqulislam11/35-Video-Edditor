/**
 * AI Video Editor Pro — Complete Bijoy (SutonnyMJ) ⇄ Unicode Converter Engine
 * Accurately converts between Bijoy ANSI (SutonnyMJ layout) and standard Bengali Unicode.
 * Full support for vowels, consonants, pre-kars (ি, ে, ৈ), post-kars, dual-kars (ো, ৌ),
 * ref (র্), ro-phola (্র), jo-phola (্য), hosonto (&), and all Bengali conjuncts (যুক্তাক্ষর).
 */
(function (global) {
  "use strict";

  // Bijoy character mappings
  const BIJOY_VOWEL = {
    "Av": "আ", "A": "অ", "B": "ই", "C": "ঈ", "D": "উ",
    "E": "ঊ", "F": "ঋ", "G": "এ", "H": "ঐ", "I": "ও", "J": "ঔ"
  };

  const BIJOY_CONSONANT = {
    "K": "ক", "L": "খ", "M": "গ", "N": "ঘ", "O": "ঙ",
    "P": "চ", "Q": "ছ", "R": "জ", "S": "ঝ", "T": "ঞ",
    "U": "ট", "V": "ঠ", "W": "ড", "X": "ঢ", "Y": "ণ",
    "Z": "ত", "_": "থ", "`": "দ", "a": "ধ", "b": "ন",
    "c": "প", "d": "ফ", "e": "ব", "f": "ভ", "g": "ম",
    "h": "য", "i": "র", "j": "ল", "k": "শ", "l": "ষ",
    "m": "স", "n": "হ", "o": "ড়", "p": "ঢ়", "q": "য়",
    "r": "ৎ", "s": "ং", "t": "ঃ", "u": "ঁ"
  };

  const BIJOY_MODIFIER = {
    "v": "া", "w": "ি", "x": "ী", "y": "ু", "~": "ূ",
    "„": "ৃ", "‡": "ে", "‰": "ৈ", "Š": "ৌ",
    "&": "্", "¨": "্য", "ª": "্র", "©": "র্"
  };

  // Complex multi-character and special glyph mappings in SutonnyMJ
  const BIJOY_COMPOUNDS = [
    // Pre-compound vowels
    ["Av", "আ"],

    // Special single glyph conjuncts in SutonnyMJ
    ["²", "ক্ষ"],
    ["³", "ক্ত"],
    ["µ", "ক্র"],
    ["¼", "ঙ্ক"],
    ["½", "ঙ্গ"],
    ["¾", "জ্ঞ"],
    ["¿", "ঞ্চ"],
    ["À", "ঞ্ছ"],
    ["Á", "জ্ঞ"], // commonly used for জ্ঞ in SutonnyMJ
    ["Â", "ঞ্ঝ"],
    ["Ã", "ট্ট"],
    ["Ä", "ট্ফ"],
    ["Å", "ড্ড"],
    ["Æ", "ণ্ট"],
    ["Ç", "ণ্ঠ"],
    ["È", "ণ্ড"],
    ["É", "ণ্ণ"],
    ["Ê", "ত্ম"],
    ["Ë", "থ্ব"],
    ["Ì", "দ্ম"],
    ["Í", "্ত"],
    ["Î", "ত্র"],
    ["Ï", "্থ"],
    ["Ð", "দ্ব"],
    ["Ñ", "দ্ব"],
    ["Ò", "ধ্ব"],
    ["Ó", "ন্ট"],
    ["Ô", "ন্ঠ"],
    ["Õ", "ন্ড"],
    ["Ö", "ন্ত"],
    ["×", "ন্ত্ব"],
    ["Ø", "ন্থ"],
    ["Ù", "ন্দ"],
    ["Ú", "ন্দ্ব"],
    ["Û", "ন্ধ"],
    ["Ü", "ন্ন"],
    ["Ý", "ন্ব"],
    ["Þ", "ন্ম"],
    ["ß", "ম্প"],
    ["à", "ম্ফ"],
    ["á", "ম্ব"],
    ["â", "ম্ভ"],
    ["ã", "ম্ম"],
    ["ä", "ম্বর"],
    ["å", "ম্ন"],
    ["æ", "ল্ক"],
    ["ç", "ল্গ"],
    ["è", "ল্ট"],
    ["é", "ল্ড"],
    ["ê", "ল্প"],
    ["ë", "ল্ফ"],
    ["ì", "ল্ব"],
    ["í", "ল্ম"],
    ["î", "ল্ল"],
    ["ï", "শু"],
    ["ð", "শ্চ"],
    ["ñ", "শ্ছ"],
    ["ò", "শ্ন"],
    ["ó", "শ্ব"],
    ["ô", "শ্ম"],
    ["õ", "শ্ল"],
    ["ö", "ষ্ক"],
    ["÷", "ষ্ফ"],
    ["ø", "ষ্ট"],
    ["ù", "ষ্ঠ"],
    ["ú", "ষ্ণ"],
    ["û", "ষ্প"],
    ["ü", "ষ্ফ"],
    ["ý", "ষ্ম"],
    ["þ", "স্ক"],
    ["ÿ", "ক্ষ"],
    ["¶", "ক্ষ"],

    // Multi-letter combinations
    ["bœ", "ন্ন"],
    ["cÖ", "প্র"],
    ["eª", "ব্র"],
    ["MÖ", "গ্র"],
    ["kÖ", "শ্র"],
    ["ZÖ", "ত্র"],
    ["`ª", "দ্র"],
    ["aª", "ধ্র"],
    ["fª", "ভ্র"],
    ["¯’", "স্থ"],
    ["¯œ", "স্ন"],
    ["¯ú", "স্প"],
    ["¯¿", "স্ফ"],
    ["¯^", "স্ব"],
    ["¯§", "স্ম"],
    ["¯ø", "স্ল"],
    ["¯Í", "স্ত"],
    ["¯", "স্"],
    ["k&l", "ক্ষ"],
    ["R&T", "জ্ঞ"],
    ["T&P", "ঞ্চ"],
    ["T&Q", "ঞ্ছ"],
    ["O&K", "ঙ্ক"],
    ["O&M", "ঙ্গ"],
    ["O&N", "ঙ্ঘ"],
    ["O&L", "ঙ্খ"],
    ["œ", "্ন"],
    ["n&b", "হ্ন"],
    ["n&Y", "হ্ণ"],
    ["n&g", "হ্ম"],
    ["n&j", "হ্ল"],
    ["n&e", "হ্ব"],
    ["n„", "হৃ"],
    ["ü", "হু"],
    ["n&y", "হু"],
    ["„", "ৃ"]
  ];

  // Regex pattern matching one consonant or conjunct cluster in Bijoy text
  const CLUSTER_PATTERN = "(?:bœ|cÖ|eª|MÖ|kÖ|ZÖ|`ª|aª|fª|¯’|¯œ|¯ú|¯¿|¯\\^|¯§|¯ø|¯Í|[²³µ¼-ÿ]|[a-zA-Z_`])(?:&[a-zA-Z_`])*(?:[¨ª©])?";

  const BijoyConverter = {
    /**
     * Converts Bijoy (SutonnyMJ) ANSI text to standard Unicode Bengali
     */
    toUnicode(text) {
      if (!text || typeof text !== "string") return "";

      let s = text;

      // 1. Dual kar combinations in Bijoy:
      // ‡ + Consonant cluster + v = ো (O-kar)
      // ‡ + Consonant cluster + Š = ৌ (OU-kar)
      const dualKarO = new RegExp("‡(" + CLUSTER_PATTERN + ")v", "g");
      const dualKarOU = new RegExp("‡(" + CLUSTER_PATTERN + ")Š", "g");
      s = s.replace(dualKarO, "$1ো");
      s = s.replace(dualKarOU, "$1ৌ");

      // 2. Pre-kar rearrangement:
      // w (ি), ‡ (ে), ‰ (ৈ) precede ONE consonant/conjunct unit:
      const preKarRegex = new RegExp("([w‡‰])(" + CLUSTER_PATTERN + ")", "g");
      s = s.replace(preKarRegex, function (match, kar, cluster) {
        let uKar = "ি";
        if (kar === "‡") uKar = "ে";
        if (kar === "‰") uKar = "ৈ";
        return cluster + uKar;
      });

      // 3. Ref (©):
      s = s.replace(/([a-zA-Z&_`~¯²³µ¼-ÿ]+)©/g, "র্$1");
      s = s.replace(/©([a-zA-Z&_`~¯²³µ¼-ÿ]+)/g, "র্$1");

      // 4. Replace compounds / ligatures (sorted longest first)
      const sortedCompounds = [...BIJOY_COMPOUNDS].sort((a, b) => b[0].length - a[0].length);
      sortedCompounds.forEach(([bijoy, uni]) => {
        s = s.split(bijoy).join(uni);
      });

      // 5. Replace single characters
      let out = "";
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (BIJOY_VOWEL[c]) {
          out += BIJOY_VOWEL[c];
        } else if (BIJOY_CONSONANT[c]) {
          out += BIJOY_CONSONANT[c];
        } else if (BIJOY_MODIFIER[c]) {
          out += BIJOY_MODIFIER[c];
        } else {
          out += c;
        }
      }

      // 6. Post-processing cleanup:
      out = out.replace(/্\s/g, " ");

      return out;
    },

    /**
     * Converts Unicode Bengali text to Bijoy (SutonnyMJ) ANSI
     */
    toBijoy(text) {
      if (!text || typeof text !== "string") return "";

      let s = text;

      // Inverse compounds
      const invCompounds = [...BIJOY_COMPOUNDS].sort((a, b) => b[1].length - a[1].length);

      // Handle ref: র্ + Consonant -> Consonant + ©
      s = s.replace(/র্([ক-হ])/g, "$1©");

      // Handle dual-kars: ো -> ‡...v, ৌ -> ‡...Š
      s = s.replace(/([ক-হ](?:্[ক-হ])*(?:[্য্র্ব্ম্ল্ণ্ন])?)ো/g, "‡$1v");
      s = s.replace(/([ক-হ](?:্[ক-হ])*(?:[্য্র্ব্ম্ল্ণ্ন])?)ৌ/g, "‡$1Š");

      // Handle pre-kars: ি -> w before consonant, ে -> ‡ before consonant, ৈ -> ‰ before consonant
      s = s.replace(/([ক-হ](?:্[ক-হ])*(?:[্য্র্ব্ম্ল্ণ্ন])?)ি/g, "w$1");
      s = s.replace(/([ক-হ](?:্[ক-হ])*(?:[্য্র্ব্ম্ল্ণ্ন])?)ে/g, "‡$1");
      s = s.replace(/([ক-হ](?:্[ক-হ])*(?:[্য্র্ব্ম্ল্ণ্ন])?)ৈ/g, "‰$1");

      // Replace known compounds
      invCompounds.forEach(([bijoy, uni]) => {
        s = s.split(uni).join(bijoy);
      });

      // Inverse char map
      const invVowels = {};
      Object.entries(BIJOY_VOWEL).forEach(([k, v]) => { invVowels[v] = k; });
      const invConsonants = {};
      Object.entries(BIJOY_CONSONANT).forEach(([k, v]) => { invConsonants[v] = k; });
      const invModifiers = {};
      Object.entries(BIJOY_MODIFIER).forEach(([k, v]) => { invModifiers[v] = k; });

      let out = "";
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (invVowels[c]) out += invVowels[c];
        else if (invConsonants[c]) out += invConsonants[c];
        else if (invModifiers[c]) out += invModifiers[c];
        else out += c;
      }

      return out;
    },

    /**
     * Detects if the string looks like Bijoy / SutonnyMJ ANSI text
     */
    isBijoy(str) {
      if (!str || typeof str !== "string") return false;
      // If already contains Bengali Unicode block, it is Unicode
      if (/[\u0980-\u09FF]/.test(str)) return false;

      // Check for distinct Bijoy ANSI frequency patterns
      const bijoyMarkers = /[‡‰Š²³µ¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ¶]/;
      if (bijoyMarkers.test(str)) return true;

      // Common Bijoy word syllables (e.g. Avwg, evsjv, ‡Zvgvi, ইত্যাদি)
      if (/\b(Av|ev|‡Z|wK|gZ|‡K|GK|my|K‡|cÖ)\w+/i.test(str)) return true;

      return false;
    }
  };

  global.BijoyConverter = BijoyConverter;
})(typeof window !== "undefined" ? window : globalThis);
