// The lines a room works through, in order, one scroll each. Short on purpose:
// a line is finished by a handful of people in a few minutes. Each line is one
// column of the scroll; punctuation is left out, as it is in a handscroll.
// Pinyin is per character, in the same order, for visitors who don't read
// Chinese.

export interface Text {
  id: string;
  lines: string[];
  pinyin: string[][];
  source: string;
  sourceEn: string;
  translation: string;
}

export const TEXTS: Text[] = [
  {
    id: "lanting",
    lines: ["群贤毕至", "少长咸集"],
    pinyin: [
      ["qún", "xián", "bì", "zhì"],
      ["shào", "zhǎng", "xián", "jí"],
    ],
    source: "王羲之《兰亭集序》",
    sourceEn: "Wang Xizhi, Preface to the Orchid Pavilion Poems (353)",
    translation: "All the worthies have come; young and old are gathered here.",
  },
  {
    id: "haineicun",
    lines: ["海内存知己", "天涯若比邻"],
    pinyin: [
      ["hǎi", "nèi", "cún", "zhī", "jǐ"],
      ["tiān", "yá", "ruò", "bǐ", "lín"],
    ],
    source: "王勃《送杜少府之任蜀州》",
    sourceEn: "Wang Bo, Farewell to Vice-Prefect Du",
    translation: "While a true friend is somewhere within the seas, the ends of the earth are next door.",
  },
  {
    id: "zhongren",
    lines: ["众人拾柴", "火焰高"],
    pinyin: [
      ["zhòng", "rén", "shí", "chái"],
      ["huǒ", "yàn", "gāo"],
    ],
    source: "谚语",
    sourceEn: "Proverb",
    translation: "When everyone gathers firewood, the flames burn high.",
  },
  {
    id: "chunxiao",
    lines: ["春眠不觉晓", "处处闻啼鸟"],
    pinyin: [
      ["chūn", "mián", "bù", "jué", "xiǎo"],
      ["chù", "chù", "wén", "tí", "niǎo"],
    ],
    source: "孟浩然《春晓》",
    sourceEn: "Meng Haoran, Spring Dawn",
    translation: "Sleeping in spring, I miss the dawn; everywhere I hear birds singing.",
  },
  {
    id: "sanren",
    lines: ["三人行", "必有我师焉"],
    pinyin: [
      ["sān", "rén", "xíng"],
      ["bì", "yǒu", "wǒ", "shī", "yān"],
    ],
    source: "《论语·述而》",
    sourceEn: "The Analects, Shu Er",
    translation: "Walking with two others, I am sure to find a teacher.",
  },
  {
    id: "jingyesi",
    lines: ["床前明月光", "疑是地上霜"],
    pinyin: [
      ["chuáng", "qián", "míng", "yuè", "guāng"],
      ["yí", "shì", "dì", "shàng", "shuāng"],
    ],
    source: "李白《静夜思》",
    sourceEn: "Li Bai, Quiet Night Thoughts",
    translation: "Moonlight before my bed; I take it for frost on the ground.",
  },
  {
    id: "dengguanque",
    lines: ["欲穷千里目", "更上一层楼"],
    pinyin: [
      ["yù", "qióng", "qiān", "lǐ", "mù"],
      ["gèng", "shàng", "yī", "céng", "lóu"],
    ],
    source: "王之涣《登鹳雀楼》",
    sourceEn: "Wang Zhihuan, On the Stork Tower",
    translation: "To see a thousand li further, climb one more storey.",
  },
  {
    id: "shuidiao",
    lines: ["但愿人长久", "千里共婵娟"],
    pinyin: [
      ["dàn", "yuàn", "rén", "cháng", "jiǔ"],
      ["qiān", "lǐ", "gòng", "chán", "juān"],
    ],
    source: "苏轼《水调歌头》",
    sourceEn: "Su Shi, Prelude to Water Melody",
    translation: "May we all live long, and share this moon a thousand li apart.",
  },
];

export const textById = (id: string): Text | undefined => TEXTS.find((t) => t.id === id);

// Every character of a text in writing order, with its column and pinyin.
export function characters(text: Text): { char: string; pinyin: string; column: number }[] {
  return text.lines.flatMap((line, column) =>
    [...line].map((char, i) => ({ char, pinyin: text.pinyin[column][i], column })),
  );
}
