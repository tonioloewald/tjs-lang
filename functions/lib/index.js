import { createRequire } from 'node:module'
var __require = /* @__PURE__ */ createRequire(import.meta.url)

// ../node_modules/acorn/dist/acorn.mjs
var astralIdentifierCodes = [
  509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574,
  3, 9, 9, 7, 9, 32, 4, 318, 1, 80, 3, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3,
  1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13,
  9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2,
  10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17,
  10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9,
  7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9,
  120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 343, 9, 54, 7,
  2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1,
  2, 4, 9, 9, 330, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465,
  27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0,
  12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 543, 4, 4, 5, 9, 7, 3, 6, 31, 3,
  149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16,
  3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2,
  9, 726, 6, 110, 6, 6, 9, 4759, 9, 787719, 239,
]
var astralIdentifierStartCodes = [
  0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48,
  31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39,
  9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310,
  10, 21, 11, 7, 25, 5, 2, 41, 2, 8, 70, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11,
  22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 71, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2,
  28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56,
  50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 2, 60, 28, 11, 0, 9,
  21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30,
  0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6,
  2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0,
  19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21,
  2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26,
  38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7,
  3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 200,
  32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2,
  31, 15, 0, 328, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 110, 18, 195,
  2637, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18,
  78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 129, 74, 6, 0, 67,
  12, 65, 1, 2, 0, 29, 6135, 9, 1237, 42, 9, 8936, 3, 2, 6, 2, 1, 2, 290, 16, 0,
  30, 2, 3, 0, 15, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2,
  1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3,
  2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2,
  24, 2, 30, 2, 24, 2, 7, 1845, 30, 7, 5, 262, 61, 147, 44, 11, 6, 17, 0, 322,
  29, 19, 43, 485, 27, 229, 29, 3, 0, 496, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67,
  8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2,
  0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2,
  6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4153, 7,
  221, 3, 5761, 15, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 4191,
]
var nonASCIIidentifierChars =
  '‌‍·̀-ͯ·҃-֑҇-ׇֽֿׁׂׅׄؐ-ًؚ-٩ٰۖ-ۜ۟-۪ۤۧۨ-ۭ۰-۹ܑܰ-݊ަ-ް߀-߉߫-߽߳ࠖ-࠙ࠛ-ࠣࠥ-ࠧࠩ-࡙࠭-࡛ࢗ-࢟࣊-ࣣ࣡-ःऺ-़ा-ॏ॑-ॗॢॣ०-९ঁ-ঃ়া-ৄেৈো-্ৗৢৣ০-৯৾ਁ-ਃ਼ਾ-ੂੇੈੋ-੍ੑ੦-ੱੵઁ-ઃ઼ા-ૅે-ૉો-્ૢૣ૦-૯ૺ-૿ଁ-ଃ଼ା-ୄେୈୋ-୍୕-ୗୢୣ୦-୯ஂா-ூெ-ைொ-்ௗ௦-௯ఀ-ఄ఼ా-ౄె-ైొ-్ౕౖౢౣ౦-౯ಁ-ಃ಼ಾ-ೄೆ-ೈೊ-್ೕೖೢೣ೦-೯ೳഀ-ഃ഻഼ാ-ൄെ-ൈൊ-്ൗൢൣ൦-൯ඁ-ඃ්ා-ුූෘ-ෟ෦-෯ෲෳัิ-ฺ็-๎๐-๙ັິ-ຼ່-໎໐-໙༘༙༠-༩༹༵༷༾༿ཱ-྄྆྇ྍ-ྗྙ-ྼ࿆ါ-ှ၀-၉ၖ-ၙၞ-ၠၢ-ၤၧ-ၭၱ-ၴႂ-ႍႏ-ႝ፝-፟፩-፱ᜒ-᜕ᜲ-᜴ᝒᝓᝲᝳ឴-៓៝០-៩᠋-᠍᠏-᠙ᢩᤠ-ᤫᤰ-᤻᥆-᥏᧐-᧚ᨗ-ᨛᩕ-ᩞ᩠-᩿᩼-᪉᪐-᪙᪰-᪽ᪿ-ᫎᬀ-ᬄ᬴-᭄᭐-᭙᭫-᭳ᮀ-ᮂᮡ-ᮭ᮰-᮹᯦-᯳ᰤ-᰷᱀-᱉᱐-᱙᳐-᳔᳒-᳨᳭᳴᳷-᳹᷀-᷿‌‍‿⁀⁔⃐-⃥⃜⃡-⃰⳯-⵿⳱ⷠ-〪ⷿ-゙゚〯・꘠-꘩꙯ꙴ-꙽ꚞꚟ꛰꛱ꠂ꠆ꠋꠣ-ꠧ꠬ꢀꢁꢴ-ꣅ꣐-꣙꣠-꣱ꣿ-꤉ꤦ-꤭ꥇ-꥓ꦀ-ꦃ꦳-꧀꧐-꧙ꧥ꧰-꧹ꨩ-ꨶꩃꩌꩍ꩐-꩙ꩻ-ꩽꪰꪲ-ꪴꪷꪸꪾ꪿꫁ꫫ-ꫯꫵ꫶ꯣ-ꯪ꯬꯭꯰-꯹ﬞ︀-️︠-︯︳︴﹍-﹏０-９＿･'
var nonASCIIidentifierStartChars =
  'ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆՙՠ-ֈא-תׯ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࡠ-ࡪࡰ-ࢇࢉ-ࢎࢠ-ࣉऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱৼਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡૹଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘ-ౚౝౠౡಀಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽೝೞೠೡೱೲഄ-ഌഎ-ഐഒ-ഺഽൎൔ-ൖൟ-ൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄຆ-ຊຌ-ຣລວ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜑᜟ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡸᢀ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭌᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᲀ-ᲊᲐ-ᲺᲽ-Ჿᳩ-ᳬᳮ-ᳳᳵᳶᳺᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼⁱⁿₐ-ₜℂℇℊ-ℓℕ℘-ℝℤΩℨK-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞ々-〇〡-〩〱-〵〸-〼ぁ-ゖ゛-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆿㇰ-ㇿ㐀-䶿一-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛯꜗ-ꜟꜢ-ꞈꞋ-ꟍꟐꟑꟓꟕ-Ƛꟲ-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꣽꣾꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭩꭰ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻﹰ-ﹴﹶ-ﻼＡ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ'
var reservedWords = {
  3: 'abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile',
  5: 'class enum extends super const export import',
  6: 'enum',
  strict:
    'implements interface let package private protected public static yield',
  strictBind: 'eval arguments',
}
var ecma5AndLessKeywords =
  'break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this'
var keywords$1 = {
  5: ecma5AndLessKeywords,
  '5module': ecma5AndLessKeywords + ' export import',
  6: ecma5AndLessKeywords + ' const class extends export import super',
}
var keywordRelationalOperator = /^in(stanceof)?$/
var nonASCIIidentifierStart = new RegExp(
  '[' + nonASCIIidentifierStartChars + ']'
)
var nonASCIIidentifier = new RegExp(
  '[' + nonASCIIidentifierStartChars + nonASCIIidentifierChars + ']'
)
function isInAstralSet(code, set) {
  var pos = 65536
  for (var i = 0; i < set.length; i += 2) {
    pos += set[i]
    if (pos > code) {
      return false
    }
    pos += set[i + 1]
    if (pos >= code) {
      return true
    }
  }
  return false
}
function isIdentifierStart(code, astral) {
  if (code < 65) {
    return code === 36
  }
  if (code < 91) {
    return true
  }
  if (code < 97) {
    return code === 95
  }
  if (code < 123) {
    return true
  }
  if (code <= 65535) {
    return (
      code >= 170 && nonASCIIidentifierStart.test(String.fromCharCode(code))
    )
  }
  if (astral === false) {
    return false
  }
  return isInAstralSet(code, astralIdentifierStartCodes)
}
function isIdentifierChar(code, astral) {
  if (code < 48) {
    return code === 36
  }
  if (code < 58) {
    return true
  }
  if (code < 65) {
    return false
  }
  if (code < 91) {
    return true
  }
  if (code < 97) {
    return code === 95
  }
  if (code < 123) {
    return true
  }
  if (code <= 65535) {
    return code >= 170 && nonASCIIidentifier.test(String.fromCharCode(code))
  }
  if (astral === false) {
    return false
  }
  return (
    isInAstralSet(code, astralIdentifierStartCodes) ||
    isInAstralSet(code, astralIdentifierCodes)
  )
}
var TokenType = function TokenType2(label, conf) {
  if (conf === undefined) conf = {}
  this.label = label
  this.keyword = conf.keyword
  this.beforeExpr = !!conf.beforeExpr
  this.startsExpr = !!conf.startsExpr
  this.isLoop = !!conf.isLoop
  this.isAssign = !!conf.isAssign
  this.prefix = !!conf.prefix
  this.postfix = !!conf.postfix
  this.binop = conf.binop || null
  this.updateContext = null
}
function binop(name, prec) {
  return new TokenType(name, { beforeExpr: true, binop: prec })
}
var beforeExpr = { beforeExpr: true }
var startsExpr = { startsExpr: true }
var keywords = {}
function kw(name, options) {
  if (options === undefined) options = {}
  options.keyword = name
  return (keywords[name] = new TokenType(name, options))
}
var types$1 = {
  num: new TokenType('num', startsExpr),
  regexp: new TokenType('regexp', startsExpr),
  string: new TokenType('string', startsExpr),
  name: new TokenType('name', startsExpr),
  privateId: new TokenType('privateId', startsExpr),
  eof: new TokenType('eof'),
  bracketL: new TokenType('[', { beforeExpr: true, startsExpr: true }),
  bracketR: new TokenType(']'),
  braceL: new TokenType('{', { beforeExpr: true, startsExpr: true }),
  braceR: new TokenType('}'),
  parenL: new TokenType('(', { beforeExpr: true, startsExpr: true }),
  parenR: new TokenType(')'),
  comma: new TokenType(',', beforeExpr),
  semi: new TokenType(';', beforeExpr),
  colon: new TokenType(':', beforeExpr),
  dot: new TokenType('.'),
  question: new TokenType('?', beforeExpr),
  questionDot: new TokenType('?.'),
  arrow: new TokenType('=>', beforeExpr),
  template: new TokenType('template'),
  invalidTemplate: new TokenType('invalidTemplate'),
  ellipsis: new TokenType('...', beforeExpr),
  backQuote: new TokenType('`', startsExpr),
  dollarBraceL: new TokenType('${', { beforeExpr: true, startsExpr: true }),
  eq: new TokenType('=', { beforeExpr: true, isAssign: true }),
  assign: new TokenType('_=', { beforeExpr: true, isAssign: true }),
  incDec: new TokenType('++/--', {
    prefix: true,
    postfix: true,
    startsExpr: true,
  }),
  prefix: new TokenType('!/~', {
    beforeExpr: true,
    prefix: true,
    startsExpr: true,
  }),
  logicalOR: binop('||', 1),
  logicalAND: binop('&&', 2),
  bitwiseOR: binop('|', 3),
  bitwiseXOR: binop('^', 4),
  bitwiseAND: binop('&', 5),
  equality: binop('==/!=/===/!==', 6),
  relational: binop('</>/<=/>=', 7),
  bitShift: binop('<</>>/>>>', 8),
  plusMin: new TokenType('+/-', {
    beforeExpr: true,
    binop: 9,
    prefix: true,
    startsExpr: true,
  }),
  modulo: binop('%', 10),
  star: binop('*', 10),
  slash: binop('/', 10),
  starstar: new TokenType('**', { beforeExpr: true }),
  coalesce: binop('??', 1),
  _break: kw('break'),
  _case: kw('case', beforeExpr),
  _catch: kw('catch'),
  _continue: kw('continue'),
  _debugger: kw('debugger'),
  _default: kw('default', beforeExpr),
  _do: kw('do', { isLoop: true, beforeExpr: true }),
  _else: kw('else', beforeExpr),
  _finally: kw('finally'),
  _for: kw('for', { isLoop: true }),
  _function: kw('function', startsExpr),
  _if: kw('if'),
  _return: kw('return', beforeExpr),
  _switch: kw('switch'),
  _throw: kw('throw', beforeExpr),
  _try: kw('try'),
  _var: kw('var'),
  _const: kw('const'),
  _while: kw('while', { isLoop: true }),
  _with: kw('with'),
  _new: kw('new', { beforeExpr: true, startsExpr: true }),
  _this: kw('this', startsExpr),
  _super: kw('super', startsExpr),
  _class: kw('class', startsExpr),
  _extends: kw('extends', beforeExpr),
  _export: kw('export'),
  _import: kw('import', startsExpr),
  _null: kw('null', startsExpr),
  _true: kw('true', startsExpr),
  _false: kw('false', startsExpr),
  _in: kw('in', { beforeExpr: true, binop: 7 }),
  _instanceof: kw('instanceof', { beforeExpr: true, binop: 7 }),
  _typeof: kw('typeof', { beforeExpr: true, prefix: true, startsExpr: true }),
  _void: kw('void', { beforeExpr: true, prefix: true, startsExpr: true }),
  _delete: kw('delete', { beforeExpr: true, prefix: true, startsExpr: true }),
}
var lineBreak = /\r\n?|\n|\u2028|\u2029/
var lineBreakG = new RegExp(lineBreak.source, 'g')
function isNewLine(code) {
  return code === 10 || code === 13 || code === 8232 || code === 8233
}
function nextLineBreak(code, from, end) {
  if (end === undefined) end = code.length
  for (var i = from; i < end; i++) {
    var next = code.charCodeAt(i)
    if (isNewLine(next)) {
      return i < end - 1 && next === 13 && code.charCodeAt(i + 1) === 10
        ? i + 2
        : i + 1
    }
  }
  return -1
}
var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/
var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g
var ref = Object.prototype
var hasOwnProperty = ref.hasOwnProperty
var toString = ref.toString
var hasOwn =
  Object.hasOwn ||
  function (obj, propName) {
    return hasOwnProperty.call(obj, propName)
  }
var isArray =
  Array.isArray ||
  function (obj) {
    return toString.call(obj) === '[object Array]'
  }
var regexpCache = Object.create(null)
function wordsRegexp(words) {
  return (
    regexpCache[words] ||
    (regexpCache[words] = new RegExp('^(?:' + words.replace(/ /g, '|') + ')$'))
  )
}
function codePointToString(code) {
  if (code <= 65535) {
    return String.fromCharCode(code)
  }
  code -= 65536
  return String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320)
}
var loneSurrogate =
  /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/
var Position = function Position2(line, col) {
  this.line = line
  this.column = col
}
Position.prototype.offset = function offset(n) {
  return new Position(this.line, this.column + n)
}
var SourceLocation = function SourceLocation2(p, start, end) {
  this.start = start
  this.end = end
  if (p.sourceFile !== null) {
    this.source = p.sourceFile
  }
}
function getLineInfo(input, offset2) {
  for (var line = 1, cur = 0; ; ) {
    var nextBreak = nextLineBreak(input, cur, offset2)
    if (nextBreak < 0) {
      return new Position(line, offset2 - cur)
    }
    ++line
    cur = nextBreak
  }
}
var defaultOptions = {
  ecmaVersion: null,
  sourceType: 'script',
  onInsertedSemicolon: null,
  onTrailingComma: null,
  allowReserved: null,
  allowReturnOutsideFunction: false,
  allowImportExportEverywhere: false,
  allowAwaitOutsideFunction: null,
  allowSuperOutsideMethod: null,
  allowHashBang: false,
  checkPrivateFields: true,
  locations: false,
  onToken: null,
  onComment: null,
  ranges: false,
  program: null,
  sourceFile: null,
  directSourceFile: null,
  preserveParens: false,
}
var warnedAboutEcmaVersion = false
function getOptions(opts) {
  var options = {}
  for (var opt in defaultOptions) {
    options[opt] = opts && hasOwn(opts, opt) ? opts[opt] : defaultOptions[opt]
  }
  if (options.ecmaVersion === 'latest') {
    options.ecmaVersion = 1e8
  } else if (options.ecmaVersion == null) {
    if (
      !warnedAboutEcmaVersion &&
      typeof console === 'object' &&
      console.warn
    ) {
      warnedAboutEcmaVersion = true
      console.warn(`Since Acorn 8.0.0, options.ecmaVersion is required.
Defaulting to 2020, but this will stop working in the future.`)
    }
    options.ecmaVersion = 11
  } else if (options.ecmaVersion >= 2015) {
    options.ecmaVersion -= 2009
  }
  if (options.allowReserved == null) {
    options.allowReserved = options.ecmaVersion < 5
  }
  if (!opts || opts.allowHashBang == null) {
    options.allowHashBang = options.ecmaVersion >= 14
  }
  if (isArray(options.onToken)) {
    var tokens = options.onToken
    options.onToken = function (token) {
      return tokens.push(token)
    }
  }
  if (isArray(options.onComment)) {
    options.onComment = pushComment(options, options.onComment)
  }
  return options
}
function pushComment(options, array) {
  return function (block, text, start, end, startLoc, endLoc) {
    var comment = {
      type: block ? 'Block' : 'Line',
      value: text,
      start,
      end,
    }
    if (options.locations) {
      comment.loc = new SourceLocation(this, startLoc, endLoc)
    }
    if (options.ranges) {
      comment.range = [start, end]
    }
    array.push(comment)
  }
}
var SCOPE_TOP = 1
var SCOPE_FUNCTION = 2
var SCOPE_ASYNC = 4
var SCOPE_GENERATOR = 8
var SCOPE_ARROW = 16
var SCOPE_SIMPLE_CATCH = 32
var SCOPE_SUPER = 64
var SCOPE_DIRECT_SUPER = 128
var SCOPE_CLASS_STATIC_BLOCK = 256
var SCOPE_CLASS_FIELD_INIT = 512
var SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_CLASS_STATIC_BLOCK
function functionFlags(async, generator) {
  return (
    SCOPE_FUNCTION |
    (async ? SCOPE_ASYNC : 0) |
    (generator ? SCOPE_GENERATOR : 0)
  )
}
var BIND_NONE = 0
var BIND_VAR = 1
var BIND_LEXICAL = 2
var BIND_FUNCTION = 3
var BIND_SIMPLE_CATCH = 4
var BIND_OUTSIDE = 5
var Parser = function Parser2(options, input, startPos) {
  this.options = options = getOptions(options)
  this.sourceFile = options.sourceFile
  this.keywords = wordsRegexp(
    keywords$1[
      options.ecmaVersion >= 6
        ? 6
        : options.sourceType === 'module'
        ? '5module'
        : 5
    ]
  )
  var reserved = ''
  if (options.allowReserved !== true) {
    reserved =
      reservedWords[
        options.ecmaVersion >= 6 ? 6 : options.ecmaVersion === 5 ? 5 : 3
      ]
    if (options.sourceType === 'module') {
      reserved += ' await'
    }
  }
  this.reservedWords = wordsRegexp(reserved)
  var reservedStrict = (reserved ? reserved + ' ' : '') + reservedWords.strict
  this.reservedWordsStrict = wordsRegexp(reservedStrict)
  this.reservedWordsStrictBind = wordsRegexp(
    reservedStrict + ' ' + reservedWords.strictBind
  )
  this.input = String(input)
  this.containsEsc = false
  if (startPos) {
    this.pos = startPos
    this.lineStart =
      this.input.lastIndexOf(
        `
`,
        startPos - 1
      ) + 1
    this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length
  } else {
    this.pos = this.lineStart = 0
    this.curLine = 1
  }
  this.type = types$1.eof
  this.value = null
  this.start = this.end = this.pos
  this.startLoc = this.endLoc = this.curPosition()
  this.lastTokEndLoc = this.lastTokStartLoc = null
  this.lastTokStart = this.lastTokEnd = this.pos
  this.context = this.initialContext()
  this.exprAllowed = true
  this.inModule = options.sourceType === 'module'
  this.strict = this.inModule || this.strictDirective(this.pos)
  this.potentialArrowAt = -1
  this.potentialArrowInForAwait = false
  this.yieldPos = this.awaitPos = this.awaitIdentPos = 0
  this.labels = []
  this.undefinedExports = Object.create(null)
  if (
    this.pos === 0 &&
    options.allowHashBang &&
    this.input.slice(0, 2) === '#!'
  ) {
    this.skipLineComment(2)
  }
  this.scopeStack = []
  this.enterScope(SCOPE_TOP)
  this.regexpState = null
  this.privateNameStack = []
}
var prototypeAccessors = {
  inFunction: { configurable: true },
  inGenerator: { configurable: true },
  inAsync: { configurable: true },
  canAwait: { configurable: true },
  allowSuper: { configurable: true },
  allowDirectSuper: { configurable: true },
  treatFunctionsAsVar: { configurable: true },
  allowNewDotTarget: { configurable: true },
  inClassStaticBlock: { configurable: true },
}
Parser.prototype.parse = function parse() {
  var node = this.options.program || this.startNode()
  this.nextToken()
  return this.parseTopLevel(node)
}
prototypeAccessors.inFunction.get = function () {
  return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0
}
prototypeAccessors.inGenerator.get = function () {
  return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0
}
prototypeAccessors.inAsync.get = function () {
  return (this.currentVarScope().flags & SCOPE_ASYNC) > 0
}
prototypeAccessors.canAwait.get = function () {
  for (var i = this.scopeStack.length - 1; i >= 0; i--) {
    var ref2 = this.scopeStack[i]
    var flags = ref2.flags
    if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) {
      return false
    }
    if (flags & SCOPE_FUNCTION) {
      return (flags & SCOPE_ASYNC) > 0
    }
  }
  return (
    (this.inModule && this.options.ecmaVersion >= 13) ||
    this.options.allowAwaitOutsideFunction
  )
}
prototypeAccessors.allowSuper.get = function () {
  var ref2 = this.currentThisScope()
  var flags = ref2.flags
  return (flags & SCOPE_SUPER) > 0 || this.options.allowSuperOutsideMethod
}
prototypeAccessors.allowDirectSuper.get = function () {
  return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0
}
prototypeAccessors.treatFunctionsAsVar.get = function () {
  return this.treatFunctionsAsVarInScope(this.currentScope())
}
prototypeAccessors.allowNewDotTarget.get = function () {
  for (var i = this.scopeStack.length - 1; i >= 0; i--) {
    var ref2 = this.scopeStack[i]
    var flags = ref2.flags
    if (
      flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT) ||
      (flags & SCOPE_FUNCTION && !(flags & SCOPE_ARROW))
    ) {
      return true
    }
  }
  return false
}
prototypeAccessors.inClassStaticBlock.get = function () {
  return (this.currentVarScope().flags & SCOPE_CLASS_STATIC_BLOCK) > 0
}
Parser.extend = function extend() {
  var plugins = [],
    len = arguments.length
  while (len--) plugins[len] = arguments[len]
  var cls = this
  for (var i = 0; i < plugins.length; i++) {
    cls = plugins[i](cls)
  }
  return cls
}
Parser.parse = function parse2(input, options) {
  return new this(options, input).parse()
}
Parser.parseExpressionAt = function parseExpressionAt(input, pos, options) {
  var parser = new this(options, input, pos)
  parser.nextToken()
  return parser.parseExpression()
}
Parser.tokenizer = function tokenizer(input, options) {
  return new this(options, input)
}
Object.defineProperties(Parser.prototype, prototypeAccessors)
var pp$9 = Parser.prototype
var literal = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/
pp$9.strictDirective = function (start) {
  if (this.options.ecmaVersion < 5) {
    return false
  }
  for (;;) {
    skipWhiteSpace.lastIndex = start
    start += skipWhiteSpace.exec(this.input)[0].length
    var match = literal.exec(this.input.slice(start))
    if (!match) {
      return false
    }
    if ((match[1] || match[2]) === 'use strict') {
      skipWhiteSpace.lastIndex = start + match[0].length
      var spaceAfter = skipWhiteSpace.exec(this.input),
        end = spaceAfter.index + spaceAfter[0].length
      var next = this.input.charAt(end)
      return (
        next === ';' ||
        next === '}' ||
        (lineBreak.test(spaceAfter[0]) &&
          !(
            /[(`.[+\-/*%<>=,?^&]/.test(next) ||
            (next === '!' && this.input.charAt(end + 1) === '=')
          ))
      )
    }
    start += match[0].length
    skipWhiteSpace.lastIndex = start
    start += skipWhiteSpace.exec(this.input)[0].length
    if (this.input[start] === ';') {
      start++
    }
  }
}
pp$9.eat = function (type) {
  if (this.type === type) {
    this.next()
    return true
  } else {
    return false
  }
}
pp$9.isContextual = function (name) {
  return this.type === types$1.name && this.value === name && !this.containsEsc
}
pp$9.eatContextual = function (name) {
  if (!this.isContextual(name)) {
    return false
  }
  this.next()
  return true
}
pp$9.expectContextual = function (name) {
  if (!this.eatContextual(name)) {
    this.unexpected()
  }
}
pp$9.canInsertSemicolon = function () {
  return (
    this.type === types$1.eof ||
    this.type === types$1.braceR ||
    lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  )
}
pp$9.insertSemicolon = function () {
  if (this.canInsertSemicolon()) {
    if (this.options.onInsertedSemicolon) {
      this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc)
    }
    return true
  }
}
pp$9.semicolon = function () {
  if (!this.eat(types$1.semi) && !this.insertSemicolon()) {
    this.unexpected()
  }
}
pp$9.afterTrailingComma = function (tokType, notNext) {
  if (this.type === tokType) {
    if (this.options.onTrailingComma) {
      this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc)
    }
    if (!notNext) {
      this.next()
    }
    return true
  }
}
pp$9.expect = function (type) {
  this.eat(type) || this.unexpected()
}
pp$9.unexpected = function (pos) {
  this.raise(pos != null ? pos : this.start, 'Unexpected token')
}
var DestructuringErrors = function DestructuringErrors2() {
  this.shorthandAssign =
    this.trailingComma =
    this.parenthesizedAssign =
    this.parenthesizedBind =
    this.doubleProto =
      -1
}
pp$9.checkPatternErrors = function (refDestructuringErrors, isAssign) {
  if (!refDestructuringErrors) {
    return
  }
  if (refDestructuringErrors.trailingComma > -1) {
    this.raiseRecoverable(
      refDestructuringErrors.trailingComma,
      'Comma is not permitted after the rest element'
    )
  }
  var parens = isAssign
    ? refDestructuringErrors.parenthesizedAssign
    : refDestructuringErrors.parenthesizedBind
  if (parens > -1) {
    this.raiseRecoverable(
      parens,
      isAssign ? 'Assigning to rvalue' : 'Parenthesized pattern'
    )
  }
}
pp$9.checkExpressionErrors = function (refDestructuringErrors, andThrow) {
  if (!refDestructuringErrors) {
    return false
  }
  var shorthandAssign = refDestructuringErrors.shorthandAssign
  var doubleProto = refDestructuringErrors.doubleProto
  if (!andThrow) {
    return shorthandAssign >= 0 || doubleProto >= 0
  }
  if (shorthandAssign >= 0) {
    this.raise(
      shorthandAssign,
      'Shorthand property assignments are valid only in destructuring patterns'
    )
  }
  if (doubleProto >= 0) {
    this.raiseRecoverable(doubleProto, 'Redefinition of __proto__ property')
  }
}
pp$9.checkYieldAwaitInDefaultParams = function () {
  if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos)) {
    this.raise(this.yieldPos, 'Yield expression cannot be a default value')
  }
  if (this.awaitPos) {
    this.raise(this.awaitPos, 'Await expression cannot be a default value')
  }
}
pp$9.isSimpleAssignTarget = function (expr) {
  if (expr.type === 'ParenthesizedExpression') {
    return this.isSimpleAssignTarget(expr.expression)
  }
  return expr.type === 'Identifier' || expr.type === 'MemberExpression'
}
var pp$8 = Parser.prototype
pp$8.parseTopLevel = function (node) {
  var exports = Object.create(null)
  if (!node.body) {
    node.body = []
  }
  while (this.type !== types$1.eof) {
    var stmt = this.parseStatement(null, true, exports)
    node.body.push(stmt)
  }
  if (this.inModule) {
    for (
      var i = 0, list = Object.keys(this.undefinedExports);
      i < list.length;
      i += 1
    ) {
      var name = list[i]
      this.raiseRecoverable(
        this.undefinedExports[name].start,
        "Export '" + name + "' is not defined"
      )
    }
  }
  this.adaptDirectivePrologue(node.body)
  this.next()
  node.sourceType = this.options.sourceType
  return this.finishNode(node, 'Program')
}
var loopLabel = { kind: 'loop' }
var switchLabel = { kind: 'switch' }
pp$8.isLet = function (context) {
  if (this.options.ecmaVersion < 6 || !this.isContextual('let')) {
    return false
  }
  skipWhiteSpace.lastIndex = this.pos
  var skip = skipWhiteSpace.exec(this.input)
  var next = this.pos + skip[0].length,
    nextCh = this.input.charCodeAt(next)
  if (nextCh === 91 || nextCh === 92) {
    return true
  }
  if (context) {
    return false
  }
  if (nextCh === 123 || (nextCh > 55295 && nextCh < 56320)) {
    return true
  }
  if (isIdentifierStart(nextCh, true)) {
    var pos = next + 1
    while (isIdentifierChar((nextCh = this.input.charCodeAt(pos)), true)) {
      ++pos
    }
    if (nextCh === 92 || (nextCh > 55295 && nextCh < 56320)) {
      return true
    }
    var ident = this.input.slice(next, pos)
    if (!keywordRelationalOperator.test(ident)) {
      return true
    }
  }
  return false
}
pp$8.isAsyncFunction = function () {
  if (this.options.ecmaVersion < 8 || !this.isContextual('async')) {
    return false
  }
  skipWhiteSpace.lastIndex = this.pos
  var skip = skipWhiteSpace.exec(this.input)
  var next = this.pos + skip[0].length,
    after
  return (
    !lineBreak.test(this.input.slice(this.pos, next)) &&
    this.input.slice(next, next + 8) === 'function' &&
    (next + 8 === this.input.length ||
      !(
        isIdentifierChar((after = this.input.charCodeAt(next + 8))) ||
        (after > 55295 && after < 56320)
      ))
  )
}
pp$8.isUsingKeyword = function (isAwaitUsing, isFor) {
  if (
    this.options.ecmaVersion < 17 ||
    !this.isContextual(isAwaitUsing ? 'await' : 'using')
  ) {
    return false
  }
  skipWhiteSpace.lastIndex = this.pos
  var skip = skipWhiteSpace.exec(this.input)
  var next = this.pos + skip[0].length
  if (lineBreak.test(this.input.slice(this.pos, next))) {
    return false
  }
  if (isAwaitUsing) {
    var awaitEndPos = next + 5,
      after
    if (
      this.input.slice(next, awaitEndPos) !== 'using' ||
      awaitEndPos === this.input.length ||
      isIdentifierChar((after = this.input.charCodeAt(awaitEndPos))) ||
      (after > 55295 && after < 56320)
    ) {
      return false
    }
    skipWhiteSpace.lastIndex = awaitEndPos
    var skipAfterUsing = skipWhiteSpace.exec(this.input)
    if (
      skipAfterUsing &&
      lineBreak.test(
        this.input.slice(awaitEndPos, awaitEndPos + skipAfterUsing[0].length)
      )
    ) {
      return false
    }
  }
  if (isFor) {
    var ofEndPos = next + 2,
      after$1
    if (this.input.slice(next, ofEndPos) === 'of') {
      if (
        ofEndPos === this.input.length ||
        (!isIdentifierChar((after$1 = this.input.charCodeAt(ofEndPos))) &&
          !(after$1 > 55295 && after$1 < 56320))
      ) {
        return false
      }
    }
  }
  var ch = this.input.charCodeAt(next)
  return isIdentifierStart(ch, true) || ch === 92
}
pp$8.isAwaitUsing = function (isFor) {
  return this.isUsingKeyword(true, isFor)
}
pp$8.isUsing = function (isFor) {
  return this.isUsingKeyword(false, isFor)
}
pp$8.parseStatement = function (context, topLevel, exports) {
  var starttype = this.type,
    node = this.startNode(),
    kind
  if (this.isLet(context)) {
    starttype = types$1._var
    kind = 'let'
  }
  switch (starttype) {
    case types$1._break:
    case types$1._continue:
      return this.parseBreakContinueStatement(node, starttype.keyword)
    case types$1._debugger:
      return this.parseDebuggerStatement(node)
    case types$1._do:
      return this.parseDoStatement(node)
    case types$1._for:
      return this.parseForStatement(node)
    case types$1._function:
      if (
        context &&
        (this.strict || (context !== 'if' && context !== 'label')) &&
        this.options.ecmaVersion >= 6
      ) {
        this.unexpected()
      }
      return this.parseFunctionStatement(node, false, !context)
    case types$1._class:
      if (context) {
        this.unexpected()
      }
      return this.parseClass(node, true)
    case types$1._if:
      return this.parseIfStatement(node)
    case types$1._return:
      return this.parseReturnStatement(node)
    case types$1._switch:
      return this.parseSwitchStatement(node)
    case types$1._throw:
      return this.parseThrowStatement(node)
    case types$1._try:
      return this.parseTryStatement(node)
    case types$1._const:
    case types$1._var:
      kind = kind || this.value
      if (context && kind !== 'var') {
        this.unexpected()
      }
      return this.parseVarStatement(node, kind)
    case types$1._while:
      return this.parseWhileStatement(node)
    case types$1._with:
      return this.parseWithStatement(node)
    case types$1.braceL:
      return this.parseBlock(true, node)
    case types$1.semi:
      return this.parseEmptyStatement(node)
    case types$1._export:
    case types$1._import:
      if (this.options.ecmaVersion > 10 && starttype === types$1._import) {
        skipWhiteSpace.lastIndex = this.pos
        var skip = skipWhiteSpace.exec(this.input)
        var next = this.pos + skip[0].length,
          nextCh = this.input.charCodeAt(next)
        if (nextCh === 40 || nextCh === 46) {
          return this.parseExpressionStatement(node, this.parseExpression())
        }
      }
      if (!this.options.allowImportExportEverywhere) {
        if (!topLevel) {
          this.raise(
            this.start,
            "'import' and 'export' may only appear at the top level"
          )
        }
        if (!this.inModule) {
          this.raise(
            this.start,
            "'import' and 'export' may appear only with 'sourceType: module'"
          )
        }
      }
      return starttype === types$1._import
        ? this.parseImport(node)
        : this.parseExport(node, exports)
    default:
      if (this.isAsyncFunction()) {
        if (context) {
          this.unexpected()
        }
        this.next()
        return this.parseFunctionStatement(node, true, !context)
      }
      var usingKind = this.isAwaitUsing(false)
        ? 'await using'
        : this.isUsing(false)
        ? 'using'
        : null
      if (usingKind) {
        if (topLevel && this.options.sourceType === 'script') {
          this.raise(
            this.start,
            'Using declaration cannot appear in the top level when source type is `script`'
          )
        }
        if (usingKind === 'await using') {
          if (!this.canAwait) {
            this.raise(
              this.start,
              'Await using cannot appear outside of async function'
            )
          }
          this.next()
        }
        this.next()
        this.parseVar(node, false, usingKind)
        this.semicolon()
        return this.finishNode(node, 'VariableDeclaration')
      }
      var maybeName = this.value,
        expr = this.parseExpression()
      if (
        starttype === types$1.name &&
        expr.type === 'Identifier' &&
        this.eat(types$1.colon)
      ) {
        return this.parseLabeledStatement(node, maybeName, expr, context)
      } else {
        return this.parseExpressionStatement(node, expr)
      }
  }
}
pp$8.parseBreakContinueStatement = function (node, keyword) {
  var isBreak = keyword === 'break'
  this.next()
  if (this.eat(types$1.semi) || this.insertSemicolon()) {
    node.label = null
  } else if (this.type !== types$1.name) {
    this.unexpected()
  } else {
    node.label = this.parseIdent()
    this.semicolon()
  }
  var i = 0
  for (; i < this.labels.length; ++i) {
    var lab = this.labels[i]
    if (node.label == null || lab.name === node.label.name) {
      if (lab.kind != null && (isBreak || lab.kind === 'loop')) {
        break
      }
      if (node.label && isBreak) {
        break
      }
    }
  }
  if (i === this.labels.length) {
    this.raise(node.start, 'Unsyntactic ' + keyword)
  }
  return this.finishNode(node, isBreak ? 'BreakStatement' : 'ContinueStatement')
}
pp$8.parseDebuggerStatement = function (node) {
  this.next()
  this.semicolon()
  return this.finishNode(node, 'DebuggerStatement')
}
pp$8.parseDoStatement = function (node) {
  this.next()
  this.labels.push(loopLabel)
  node.body = this.parseStatement('do')
  this.labels.pop()
  this.expect(types$1._while)
  node.test = this.parseParenExpression()
  if (this.options.ecmaVersion >= 6) {
    this.eat(types$1.semi)
  } else {
    this.semicolon()
  }
  return this.finishNode(node, 'DoWhileStatement')
}
pp$8.parseForStatement = function (node) {
  this.next()
  var awaitAt =
    this.options.ecmaVersion >= 9 &&
    this.canAwait &&
    this.eatContextual('await')
      ? this.lastTokStart
      : -1
  this.labels.push(loopLabel)
  this.enterScope(0)
  this.expect(types$1.parenL)
  if (this.type === types$1.semi) {
    if (awaitAt > -1) {
      this.unexpected(awaitAt)
    }
    return this.parseFor(node, null)
  }
  var isLet = this.isLet()
  if (this.type === types$1._var || this.type === types$1._const || isLet) {
    var init$1 = this.startNode(),
      kind = isLet ? 'let' : this.value
    this.next()
    this.parseVar(init$1, true, kind)
    this.finishNode(init$1, 'VariableDeclaration')
    return this.parseForAfterInit(node, init$1, awaitAt)
  }
  var startsWithLet = this.isContextual('let'),
    isForOf = false
  var usingKind = this.isUsing(true)
    ? 'using'
    : this.isAwaitUsing(true)
    ? 'await using'
    : null
  if (usingKind) {
    var init$2 = this.startNode()
    this.next()
    if (usingKind === 'await using') {
      this.next()
    }
    this.parseVar(init$2, true, usingKind)
    this.finishNode(init$2, 'VariableDeclaration')
    return this.parseForAfterInit(node, init$2, awaitAt)
  }
  var containsEsc = this.containsEsc
  var refDestructuringErrors = new DestructuringErrors()
  var initPos = this.start
  var init =
    awaitAt > -1
      ? this.parseExprSubscripts(refDestructuringErrors, 'await')
      : this.parseExpression(true, refDestructuringErrors)
  if (
    this.type === types$1._in ||
    (isForOf = this.options.ecmaVersion >= 6 && this.isContextual('of'))
  ) {
    if (awaitAt > -1) {
      if (this.type === types$1._in) {
        this.unexpected(awaitAt)
      }
      node.await = true
    } else if (isForOf && this.options.ecmaVersion >= 8) {
      if (
        init.start === initPos &&
        !containsEsc &&
        init.type === 'Identifier' &&
        init.name === 'async'
      ) {
        this.unexpected()
      } else if (this.options.ecmaVersion >= 9) {
        node.await = false
      }
    }
    if (startsWithLet && isForOf) {
      this.raise(
        init.start,
        "The left-hand side of a for-of loop may not start with 'let'."
      )
    }
    this.toAssignable(init, false, refDestructuringErrors)
    this.checkLValPattern(init)
    return this.parseForIn(node, init)
  } else {
    this.checkExpressionErrors(refDestructuringErrors, true)
  }
  if (awaitAt > -1) {
    this.unexpected(awaitAt)
  }
  return this.parseFor(node, init)
}
pp$8.parseForAfterInit = function (node, init, awaitAt) {
  if (
    (this.type === types$1._in ||
      (this.options.ecmaVersion >= 6 && this.isContextual('of'))) &&
    init.declarations.length === 1
  ) {
    if (this.options.ecmaVersion >= 9) {
      if (this.type === types$1._in) {
        if (awaitAt > -1) {
          this.unexpected(awaitAt)
        }
      } else {
        node.await = awaitAt > -1
      }
    }
    return this.parseForIn(node, init)
  }
  if (awaitAt > -1) {
    this.unexpected(awaitAt)
  }
  return this.parseFor(node, init)
}
pp$8.parseFunctionStatement = function (node, isAsync, declarationPosition) {
  this.next()
  return this.parseFunction(
    node,
    FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT),
    false,
    isAsync
  )
}
pp$8.parseIfStatement = function (node) {
  this.next()
  node.test = this.parseParenExpression()
  node.consequent = this.parseStatement('if')
  node.alternate = this.eat(types$1._else) ? this.parseStatement('if') : null
  return this.finishNode(node, 'IfStatement')
}
pp$8.parseReturnStatement = function (node) {
  if (!this.inFunction && !this.options.allowReturnOutsideFunction) {
    this.raise(this.start, "'return' outside of function")
  }
  this.next()
  if (this.eat(types$1.semi) || this.insertSemicolon()) {
    node.argument = null
  } else {
    node.argument = this.parseExpression()
    this.semicolon()
  }
  return this.finishNode(node, 'ReturnStatement')
}
pp$8.parseSwitchStatement = function (node) {
  this.next()
  node.discriminant = this.parseParenExpression()
  node.cases = []
  this.expect(types$1.braceL)
  this.labels.push(switchLabel)
  this.enterScope(0)
  var cur
  for (var sawDefault = false; this.type !== types$1.braceR; ) {
    if (this.type === types$1._case || this.type === types$1._default) {
      var isCase = this.type === types$1._case
      if (cur) {
        this.finishNode(cur, 'SwitchCase')
      }
      node.cases.push((cur = this.startNode()))
      cur.consequent = []
      this.next()
      if (isCase) {
        cur.test = this.parseExpression()
      } else {
        if (sawDefault) {
          this.raiseRecoverable(this.lastTokStart, 'Multiple default clauses')
        }
        sawDefault = true
        cur.test = null
      }
      this.expect(types$1.colon)
    } else {
      if (!cur) {
        this.unexpected()
      }
      cur.consequent.push(this.parseStatement(null))
    }
  }
  this.exitScope()
  if (cur) {
    this.finishNode(cur, 'SwitchCase')
  }
  this.next()
  this.labels.pop()
  return this.finishNode(node, 'SwitchStatement')
}
pp$8.parseThrowStatement = function (node) {
  this.next()
  if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) {
    this.raise(this.lastTokEnd, 'Illegal newline after throw')
  }
  node.argument = this.parseExpression()
  this.semicolon()
  return this.finishNode(node, 'ThrowStatement')
}
var empty$1 = []
pp$8.parseCatchClauseParam = function () {
  var param = this.parseBindingAtom()
  var simple = param.type === 'Identifier'
  this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0)
  this.checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL)
  this.expect(types$1.parenR)
  return param
}
pp$8.parseTryStatement = function (node) {
  this.next()
  node.block = this.parseBlock()
  node.handler = null
  if (this.type === types$1._catch) {
    var clause = this.startNode()
    this.next()
    if (this.eat(types$1.parenL)) {
      clause.param = this.parseCatchClauseParam()
    } else {
      if (this.options.ecmaVersion < 10) {
        this.unexpected()
      }
      clause.param = null
      this.enterScope(0)
    }
    clause.body = this.parseBlock(false)
    this.exitScope()
    node.handler = this.finishNode(clause, 'CatchClause')
  }
  node.finalizer = this.eat(types$1._finally) ? this.parseBlock() : null
  if (!node.handler && !node.finalizer) {
    this.raise(node.start, 'Missing catch or finally clause')
  }
  return this.finishNode(node, 'TryStatement')
}
pp$8.parseVarStatement = function (node, kind, allowMissingInitializer) {
  this.next()
  this.parseVar(node, false, kind, allowMissingInitializer)
  this.semicolon()
  return this.finishNode(node, 'VariableDeclaration')
}
pp$8.parseWhileStatement = function (node) {
  this.next()
  node.test = this.parseParenExpression()
  this.labels.push(loopLabel)
  node.body = this.parseStatement('while')
  this.labels.pop()
  return this.finishNode(node, 'WhileStatement')
}
pp$8.parseWithStatement = function (node) {
  if (this.strict) {
    this.raise(this.start, "'with' in strict mode")
  }
  this.next()
  node.object = this.parseParenExpression()
  node.body = this.parseStatement('with')
  return this.finishNode(node, 'WithStatement')
}
pp$8.parseEmptyStatement = function (node) {
  this.next()
  return this.finishNode(node, 'EmptyStatement')
}
pp$8.parseLabeledStatement = function (node, maybeName, expr, context) {
  for (var i$1 = 0, list = this.labels; i$1 < list.length; i$1 += 1) {
    var label = list[i$1]
    if (label.name === maybeName) {
      this.raise(expr.start, "Label '" + maybeName + "' is already declared")
    }
  }
  var kind = this.type.isLoop
    ? 'loop'
    : this.type === types$1._switch
    ? 'switch'
    : null
  for (var i = this.labels.length - 1; i >= 0; i--) {
    var label$1 = this.labels[i]
    if (label$1.statementStart === node.start) {
      label$1.statementStart = this.start
      label$1.kind = kind
    } else {
      break
    }
  }
  this.labels.push({ name: maybeName, kind, statementStart: this.start })
  node.body = this.parseStatement(
    context
      ? context.indexOf('label') === -1
        ? context + 'label'
        : context
      : 'label'
  )
  this.labels.pop()
  node.label = expr
  return this.finishNode(node, 'LabeledStatement')
}
pp$8.parseExpressionStatement = function (node, expr) {
  node.expression = expr
  this.semicolon()
  return this.finishNode(node, 'ExpressionStatement')
}
pp$8.parseBlock = function (createNewLexicalScope, node, exitStrict) {
  if (createNewLexicalScope === undefined) createNewLexicalScope = true
  if (node === undefined) node = this.startNode()
  node.body = []
  this.expect(types$1.braceL)
  if (createNewLexicalScope) {
    this.enterScope(0)
  }
  while (this.type !== types$1.braceR) {
    var stmt = this.parseStatement(null)
    node.body.push(stmt)
  }
  if (exitStrict) {
    this.strict = false
  }
  this.next()
  if (createNewLexicalScope) {
    this.exitScope()
  }
  return this.finishNode(node, 'BlockStatement')
}
pp$8.parseFor = function (node, init) {
  node.init = init
  this.expect(types$1.semi)
  node.test = this.type === types$1.semi ? null : this.parseExpression()
  this.expect(types$1.semi)
  node.update = this.type === types$1.parenR ? null : this.parseExpression()
  this.expect(types$1.parenR)
  node.body = this.parseStatement('for')
  this.exitScope()
  this.labels.pop()
  return this.finishNode(node, 'ForStatement')
}
pp$8.parseForIn = function (node, init) {
  var isForIn = this.type === types$1._in
  this.next()
  if (
    init.type === 'VariableDeclaration' &&
    init.declarations[0].init != null &&
    (!isForIn ||
      this.options.ecmaVersion < 8 ||
      this.strict ||
      init.kind !== 'var' ||
      init.declarations[0].id.type !== 'Identifier')
  ) {
    this.raise(
      init.start,
      (isForIn ? 'for-in' : 'for-of') +
        ' loop variable declaration may not have an initializer'
    )
  }
  node.left = init
  node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign()
  this.expect(types$1.parenR)
  node.body = this.parseStatement('for')
  this.exitScope()
  this.labels.pop()
  return this.finishNode(node, isForIn ? 'ForInStatement' : 'ForOfStatement')
}
pp$8.parseVar = function (node, isFor, kind, allowMissingInitializer) {
  node.declarations = []
  node.kind = kind
  for (;;) {
    var decl = this.startNode()
    this.parseVarId(decl, kind)
    if (this.eat(types$1.eq)) {
      decl.init = this.parseMaybeAssign(isFor)
    } else if (
      !allowMissingInitializer &&
      kind === 'const' &&
      !(
        this.type === types$1._in ||
        (this.options.ecmaVersion >= 6 && this.isContextual('of'))
      )
    ) {
      this.unexpected()
    } else if (
      !allowMissingInitializer &&
      (kind === 'using' || kind === 'await using') &&
      this.options.ecmaVersion >= 17 &&
      this.type !== types$1._in &&
      !this.isContextual('of')
    ) {
      this.raise(
        this.lastTokEnd,
        'Missing initializer in ' + kind + ' declaration'
      )
    } else if (
      !allowMissingInitializer &&
      decl.id.type !== 'Identifier' &&
      !(isFor && (this.type === types$1._in || this.isContextual('of')))
    ) {
      this.raise(
        this.lastTokEnd,
        'Complex binding patterns require an initialization value'
      )
    } else {
      decl.init = null
    }
    node.declarations.push(this.finishNode(decl, 'VariableDeclarator'))
    if (!this.eat(types$1.comma)) {
      break
    }
  }
  return node
}
pp$8.parseVarId = function (decl, kind) {
  decl.id =
    kind === 'using' || kind === 'await using'
      ? this.parseIdent()
      : this.parseBindingAtom()
  this.checkLValPattern(
    decl.id,
    kind === 'var' ? BIND_VAR : BIND_LEXICAL,
    false
  )
}
var FUNC_STATEMENT = 1
var FUNC_HANGING_STATEMENT = 2
var FUNC_NULLABLE_ID = 4
pp$8.parseFunction = function (
  node,
  statement,
  allowExpressionBody,
  isAsync,
  forInit
) {
  this.initFunction(node)
  if (
    this.options.ecmaVersion >= 9 ||
    (this.options.ecmaVersion >= 6 && !isAsync)
  ) {
    if (this.type === types$1.star && statement & FUNC_HANGING_STATEMENT) {
      this.unexpected()
    }
    node.generator = this.eat(types$1.star)
  }
  if (this.options.ecmaVersion >= 8) {
    node.async = !!isAsync
  }
  if (statement & FUNC_STATEMENT) {
    node.id =
      statement & FUNC_NULLABLE_ID && this.type !== types$1.name
        ? null
        : this.parseIdent()
    if (node.id && !(statement & FUNC_HANGING_STATEMENT)) {
      this.checkLValSimple(
        node.id,
        this.strict || node.generator || node.async
          ? this.treatFunctionsAsVar
            ? BIND_VAR
            : BIND_LEXICAL
          : BIND_FUNCTION
      )
    }
  }
  var oldYieldPos = this.yieldPos,
    oldAwaitPos = this.awaitPos,
    oldAwaitIdentPos = this.awaitIdentPos
  this.yieldPos = 0
  this.awaitPos = 0
  this.awaitIdentPos = 0
  this.enterScope(functionFlags(node.async, node.generator))
  if (!(statement & FUNC_STATEMENT)) {
    node.id = this.type === types$1.name ? this.parseIdent() : null
  }
  this.parseFunctionParams(node)
  this.parseFunctionBody(node, allowExpressionBody, false, forInit)
  this.yieldPos = oldYieldPos
  this.awaitPos = oldAwaitPos
  this.awaitIdentPos = oldAwaitIdentPos
  return this.finishNode(
    node,
    statement & FUNC_STATEMENT ? 'FunctionDeclaration' : 'FunctionExpression'
  )
}
pp$8.parseFunctionParams = function (node) {
  this.expect(types$1.parenL)
  node.params = this.parseBindingList(
    types$1.parenR,
    false,
    this.options.ecmaVersion >= 8
  )
  this.checkYieldAwaitInDefaultParams()
}
pp$8.parseClass = function (node, isStatement) {
  this.next()
  var oldStrict = this.strict
  this.strict = true
  this.parseClassId(node, isStatement)
  this.parseClassSuper(node)
  var privateNameMap = this.enterClassBody()
  var classBody = this.startNode()
  var hadConstructor = false
  classBody.body = []
  this.expect(types$1.braceL)
  while (this.type !== types$1.braceR) {
    var element = this.parseClassElement(node.superClass !== null)
    if (element) {
      classBody.body.push(element)
      if (
        element.type === 'MethodDefinition' &&
        element.kind === 'constructor'
      ) {
        if (hadConstructor) {
          this.raiseRecoverable(
            element.start,
            'Duplicate constructor in the same class'
          )
        }
        hadConstructor = true
      } else if (
        element.key &&
        element.key.type === 'PrivateIdentifier' &&
        isPrivateNameConflicted(privateNameMap, element)
      ) {
        this.raiseRecoverable(
          element.key.start,
          "Identifier '#" + element.key.name + "' has already been declared"
        )
      }
    }
  }
  this.strict = oldStrict
  this.next()
  node.body = this.finishNode(classBody, 'ClassBody')
  this.exitClassBody()
  return this.finishNode(
    node,
    isStatement ? 'ClassDeclaration' : 'ClassExpression'
  )
}
pp$8.parseClassElement = function (constructorAllowsSuper) {
  if (this.eat(types$1.semi)) {
    return null
  }
  var ecmaVersion = this.options.ecmaVersion
  var node = this.startNode()
  var keyName = ''
  var isGenerator = false
  var isAsync = false
  var kind = 'method'
  var isStatic = false
  if (this.eatContextual('static')) {
    if (ecmaVersion >= 13 && this.eat(types$1.braceL)) {
      this.parseClassStaticBlock(node)
      return node
    }
    if (this.isClassElementNameStart() || this.type === types$1.star) {
      isStatic = true
    } else {
      keyName = 'static'
    }
  }
  node.static = isStatic
  if (!keyName && ecmaVersion >= 8 && this.eatContextual('async')) {
    if (
      (this.isClassElementNameStart() || this.type === types$1.star) &&
      !this.canInsertSemicolon()
    ) {
      isAsync = true
    } else {
      keyName = 'async'
    }
  }
  if (!keyName && (ecmaVersion >= 9 || !isAsync) && this.eat(types$1.star)) {
    isGenerator = true
  }
  if (!keyName && !isAsync && !isGenerator) {
    var lastValue = this.value
    if (this.eatContextual('get') || this.eatContextual('set')) {
      if (this.isClassElementNameStart()) {
        kind = lastValue
      } else {
        keyName = lastValue
      }
    }
  }
  if (keyName) {
    node.computed = false
    node.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc)
    node.key.name = keyName
    this.finishNode(node.key, 'Identifier')
  } else {
    this.parseClassElementName(node)
  }
  if (
    ecmaVersion < 13 ||
    this.type === types$1.parenL ||
    kind !== 'method' ||
    isGenerator ||
    isAsync
  ) {
    var isConstructor = !node.static && checkKeyName(node, 'constructor')
    var allowsDirectSuper = isConstructor && constructorAllowsSuper
    if (isConstructor && kind !== 'method') {
      this.raise(node.key.start, "Constructor can't have get/set modifier")
    }
    node.kind = isConstructor ? 'constructor' : kind
    this.parseClassMethod(node, isGenerator, isAsync, allowsDirectSuper)
  } else {
    this.parseClassField(node)
  }
  return node
}
pp$8.isClassElementNameStart = function () {
  return (
    this.type === types$1.name ||
    this.type === types$1.privateId ||
    this.type === types$1.num ||
    this.type === types$1.string ||
    this.type === types$1.bracketL ||
    this.type.keyword
  )
}
pp$8.parseClassElementName = function (element) {
  if (this.type === types$1.privateId) {
    if (this.value === 'constructor') {
      this.raise(
        this.start,
        "Classes can't have an element named '#constructor'"
      )
    }
    element.computed = false
    element.key = this.parsePrivateIdent()
  } else {
    this.parsePropertyName(element)
  }
}
pp$8.parseClassMethod = function (
  method,
  isGenerator,
  isAsync,
  allowsDirectSuper
) {
  var key = method.key
  if (method.kind === 'constructor') {
    if (isGenerator) {
      this.raise(key.start, "Constructor can't be a generator")
    }
    if (isAsync) {
      this.raise(key.start, "Constructor can't be an async method")
    }
  } else if (method.static && checkKeyName(method, 'prototype')) {
    this.raise(
      key.start,
      'Classes may not have a static property named prototype'
    )
  }
  var value = (method.value = this.parseMethod(
    isGenerator,
    isAsync,
    allowsDirectSuper
  ))
  if (method.kind === 'get' && value.params.length !== 0) {
    this.raiseRecoverable(value.start, 'getter should have no params')
  }
  if (method.kind === 'set' && value.params.length !== 1) {
    this.raiseRecoverable(value.start, 'setter should have exactly one param')
  }
  if (method.kind === 'set' && value.params[0].type === 'RestElement') {
    this.raiseRecoverable(
      value.params[0].start,
      'Setter cannot use rest params'
    )
  }
  return this.finishNode(method, 'MethodDefinition')
}
pp$8.parseClassField = function (field) {
  if (checkKeyName(field, 'constructor')) {
    this.raise(
      field.key.start,
      "Classes can't have a field named 'constructor'"
    )
  } else if (field.static && checkKeyName(field, 'prototype')) {
    this.raise(
      field.key.start,
      "Classes can't have a static field named 'prototype'"
    )
  }
  if (this.eat(types$1.eq)) {
    this.enterScope(SCOPE_CLASS_FIELD_INIT | SCOPE_SUPER)
    field.value = this.parseMaybeAssign()
    this.exitScope()
  } else {
    field.value = null
  }
  this.semicolon()
  return this.finishNode(field, 'PropertyDefinition')
}
pp$8.parseClassStaticBlock = function (node) {
  node.body = []
  var oldLabels = this.labels
  this.labels = []
  this.enterScope(SCOPE_CLASS_STATIC_BLOCK | SCOPE_SUPER)
  while (this.type !== types$1.braceR) {
    var stmt = this.parseStatement(null)
    node.body.push(stmt)
  }
  this.next()
  this.exitScope()
  this.labels = oldLabels
  return this.finishNode(node, 'StaticBlock')
}
pp$8.parseClassId = function (node, isStatement) {
  if (this.type === types$1.name) {
    node.id = this.parseIdent()
    if (isStatement) {
      this.checkLValSimple(node.id, BIND_LEXICAL, false)
    }
  } else {
    if (isStatement === true) {
      this.unexpected()
    }
    node.id = null
  }
}
pp$8.parseClassSuper = function (node) {
  node.superClass = this.eat(types$1._extends)
    ? this.parseExprSubscripts(null, false)
    : null
}
pp$8.enterClassBody = function () {
  var element = { declared: Object.create(null), used: [] }
  this.privateNameStack.push(element)
  return element.declared
}
pp$8.exitClassBody = function () {
  var ref2 = this.privateNameStack.pop()
  var declared = ref2.declared
  var used = ref2.used
  if (!this.options.checkPrivateFields) {
    return
  }
  var len = this.privateNameStack.length
  var parent = len === 0 ? null : this.privateNameStack[len - 1]
  for (var i = 0; i < used.length; ++i) {
    var id = used[i]
    if (!hasOwn(declared, id.name)) {
      if (parent) {
        parent.used.push(id)
      } else {
        this.raiseRecoverable(
          id.start,
          "Private field '#" +
            id.name +
            "' must be declared in an enclosing class"
        )
      }
    }
  }
}
function isPrivateNameConflicted(privateNameMap, element) {
  var name = element.key.name
  var curr = privateNameMap[name]
  var next = 'true'
  if (
    element.type === 'MethodDefinition' &&
    (element.kind === 'get' || element.kind === 'set')
  ) {
    next = (element.static ? 's' : 'i') + element.kind
  }
  if (
    (curr === 'iget' && next === 'iset') ||
    (curr === 'iset' && next === 'iget') ||
    (curr === 'sget' && next === 'sset') ||
    (curr === 'sset' && next === 'sget')
  ) {
    privateNameMap[name] = 'true'
    return false
  } else if (!curr) {
    privateNameMap[name] = next
    return false
  } else {
    return true
  }
}
function checkKeyName(node, name) {
  var computed = node.computed
  var key = node.key
  return (
    !computed &&
    ((key.type === 'Identifier' && key.name === name) ||
      (key.type === 'Literal' && key.value === name))
  )
}
pp$8.parseExportAllDeclaration = function (node, exports) {
  if (this.options.ecmaVersion >= 11) {
    if (this.eatContextual('as')) {
      node.exported = this.parseModuleExportName()
      this.checkExport(exports, node.exported, this.lastTokStart)
    } else {
      node.exported = null
    }
  }
  this.expectContextual('from')
  if (this.type !== types$1.string) {
    this.unexpected()
  }
  node.source = this.parseExprAtom()
  if (this.options.ecmaVersion >= 16) {
    node.attributes = this.parseWithClause()
  }
  this.semicolon()
  return this.finishNode(node, 'ExportAllDeclaration')
}
pp$8.parseExport = function (node, exports) {
  this.next()
  if (this.eat(types$1.star)) {
    return this.parseExportAllDeclaration(node, exports)
  }
  if (this.eat(types$1._default)) {
    this.checkExport(exports, 'default', this.lastTokStart)
    node.declaration = this.parseExportDefaultDeclaration()
    return this.finishNode(node, 'ExportDefaultDeclaration')
  }
  if (this.shouldParseExportStatement()) {
    node.declaration = this.parseExportDeclaration(node)
    if (node.declaration.type === 'VariableDeclaration') {
      this.checkVariableExport(exports, node.declaration.declarations)
    } else {
      this.checkExport(exports, node.declaration.id, node.declaration.id.start)
    }
    node.specifiers = []
    node.source = null
    if (this.options.ecmaVersion >= 16) {
      node.attributes = []
    }
  } else {
    node.declaration = null
    node.specifiers = this.parseExportSpecifiers(exports)
    if (this.eatContextual('from')) {
      if (this.type !== types$1.string) {
        this.unexpected()
      }
      node.source = this.parseExprAtom()
      if (this.options.ecmaVersion >= 16) {
        node.attributes = this.parseWithClause()
      }
    } else {
      for (var i = 0, list = node.specifiers; i < list.length; i += 1) {
        var spec = list[i]
        this.checkUnreserved(spec.local)
        this.checkLocalExport(spec.local)
        if (spec.local.type === 'Literal') {
          this.raise(
            spec.local.start,
            'A string literal cannot be used as an exported binding without `from`.'
          )
        }
      }
      node.source = null
      if (this.options.ecmaVersion >= 16) {
        node.attributes = []
      }
    }
    this.semicolon()
  }
  return this.finishNode(node, 'ExportNamedDeclaration')
}
pp$8.parseExportDeclaration = function (node) {
  return this.parseStatement(null)
}
pp$8.parseExportDefaultDeclaration = function () {
  var isAsync
  if (this.type === types$1._function || (isAsync = this.isAsyncFunction())) {
    var fNode = this.startNode()
    this.next()
    if (isAsync) {
      this.next()
    }
    return this.parseFunction(
      fNode,
      FUNC_STATEMENT | FUNC_NULLABLE_ID,
      false,
      isAsync
    )
  } else if (this.type === types$1._class) {
    var cNode = this.startNode()
    return this.parseClass(cNode, 'nullableID')
  } else {
    var declaration = this.parseMaybeAssign()
    this.semicolon()
    return declaration
  }
}
pp$8.checkExport = function (exports, name, pos) {
  if (!exports) {
    return
  }
  if (typeof name !== 'string') {
    name = name.type === 'Identifier' ? name.name : name.value
  }
  if (hasOwn(exports, name)) {
    this.raiseRecoverable(pos, "Duplicate export '" + name + "'")
  }
  exports[name] = true
}
pp$8.checkPatternExport = function (exports, pat) {
  var type = pat.type
  if (type === 'Identifier') {
    this.checkExport(exports, pat, pat.start)
  } else if (type === 'ObjectPattern') {
    for (var i = 0, list = pat.properties; i < list.length; i += 1) {
      var prop = list[i]
      this.checkPatternExport(exports, prop)
    }
  } else if (type === 'ArrayPattern') {
    for (var i$1 = 0, list$1 = pat.elements; i$1 < list$1.length; i$1 += 1) {
      var elt = list$1[i$1]
      if (elt) {
        this.checkPatternExport(exports, elt)
      }
    }
  } else if (type === 'Property') {
    this.checkPatternExport(exports, pat.value)
  } else if (type === 'AssignmentPattern') {
    this.checkPatternExport(exports, pat.left)
  } else if (type === 'RestElement') {
    this.checkPatternExport(exports, pat.argument)
  }
}
pp$8.checkVariableExport = function (exports, decls) {
  if (!exports) {
    return
  }
  for (var i = 0, list = decls; i < list.length; i += 1) {
    var decl = list[i]
    this.checkPatternExport(exports, decl.id)
  }
}
pp$8.shouldParseExportStatement = function () {
  return (
    this.type.keyword === 'var' ||
    this.type.keyword === 'const' ||
    this.type.keyword === 'class' ||
    this.type.keyword === 'function' ||
    this.isLet() ||
    this.isAsyncFunction()
  )
}
pp$8.parseExportSpecifier = function (exports) {
  var node = this.startNode()
  node.local = this.parseModuleExportName()
  node.exported = this.eatContextual('as')
    ? this.parseModuleExportName()
    : node.local
  this.checkExport(exports, node.exported, node.exported.start)
  return this.finishNode(node, 'ExportSpecifier')
}
pp$8.parseExportSpecifiers = function (exports) {
  var nodes = [],
    first = true
  this.expect(types$1.braceL)
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma)
      if (this.afterTrailingComma(types$1.braceR)) {
        break
      }
    } else {
      first = false
    }
    nodes.push(this.parseExportSpecifier(exports))
  }
  return nodes
}
pp$8.parseImport = function (node) {
  this.next()
  if (this.type === types$1.string) {
    node.specifiers = empty$1
    node.source = this.parseExprAtom()
  } else {
    node.specifiers = this.parseImportSpecifiers()
    this.expectContextual('from')
    node.source =
      this.type === types$1.string ? this.parseExprAtom() : this.unexpected()
  }
  if (this.options.ecmaVersion >= 16) {
    node.attributes = this.parseWithClause()
  }
  this.semicolon()
  return this.finishNode(node, 'ImportDeclaration')
}
pp$8.parseImportSpecifier = function () {
  var node = this.startNode()
  node.imported = this.parseModuleExportName()
  if (this.eatContextual('as')) {
    node.local = this.parseIdent()
  } else {
    this.checkUnreserved(node.imported)
    node.local = node.imported
  }
  this.checkLValSimple(node.local, BIND_LEXICAL)
  return this.finishNode(node, 'ImportSpecifier')
}
pp$8.parseImportDefaultSpecifier = function () {
  var node = this.startNode()
  node.local = this.parseIdent()
  this.checkLValSimple(node.local, BIND_LEXICAL)
  return this.finishNode(node, 'ImportDefaultSpecifier')
}
pp$8.parseImportNamespaceSpecifier = function () {
  var node = this.startNode()
  this.next()
  this.expectContextual('as')
  node.local = this.parseIdent()
  this.checkLValSimple(node.local, BIND_LEXICAL)
  return this.finishNode(node, 'ImportNamespaceSpecifier')
}
pp$8.parseImportSpecifiers = function () {
  var nodes = [],
    first = true
  if (this.type === types$1.name) {
    nodes.push(this.parseImportDefaultSpecifier())
    if (!this.eat(types$1.comma)) {
      return nodes
    }
  }
  if (this.type === types$1.star) {
    nodes.push(this.parseImportNamespaceSpecifier())
    return nodes
  }
  this.expect(types$1.braceL)
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma)
      if (this.afterTrailingComma(types$1.braceR)) {
        break
      }
    } else {
      first = false
    }
    nodes.push(this.parseImportSpecifier())
  }
  return nodes
}
pp$8.parseWithClause = function () {
  var nodes = []
  if (!this.eat(types$1._with)) {
    return nodes
  }
  this.expect(types$1.braceL)
  var attributeKeys = {}
  var first = true
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma)
      if (this.afterTrailingComma(types$1.braceR)) {
        break
      }
    } else {
      first = false
    }
    var attr = this.parseImportAttribute()
    var keyName =
      attr.key.type === 'Identifier' ? attr.key.name : attr.key.value
    if (hasOwn(attributeKeys, keyName)) {
      this.raiseRecoverable(
        attr.key.start,
        "Duplicate attribute key '" + keyName + "'"
      )
    }
    attributeKeys[keyName] = true
    nodes.push(attr)
  }
  return nodes
}
pp$8.parseImportAttribute = function () {
  var node = this.startNode()
  node.key =
    this.type === types$1.string
      ? this.parseExprAtom()
      : this.parseIdent(this.options.allowReserved !== 'never')
  this.expect(types$1.colon)
  if (this.type !== types$1.string) {
    this.unexpected()
  }
  node.value = this.parseExprAtom()
  return this.finishNode(node, 'ImportAttribute')
}
pp$8.parseModuleExportName = function () {
  if (this.options.ecmaVersion >= 13 && this.type === types$1.string) {
    var stringLiteral = this.parseLiteral(this.value)
    if (loneSurrogate.test(stringLiteral.value)) {
      this.raise(
        stringLiteral.start,
        'An export name cannot include a lone surrogate.'
      )
    }
    return stringLiteral
  }
  return this.parseIdent(true)
}
pp$8.adaptDirectivePrologue = function (statements) {
  for (
    var i = 0;
    i < statements.length && this.isDirectiveCandidate(statements[i]);
    ++i
  ) {
    statements[i].directive = statements[i].expression.raw.slice(1, -1)
  }
}
pp$8.isDirectiveCandidate = function (statement) {
  return (
    this.options.ecmaVersion >= 5 &&
    statement.type === 'ExpressionStatement' &&
    statement.expression.type === 'Literal' &&
    typeof statement.expression.value === 'string' &&
    (this.input[statement.start] === '"' || this.input[statement.start] === "'")
  )
}
var pp$7 = Parser.prototype
pp$7.toAssignable = function (node, isBinding, refDestructuringErrors) {
  if (this.options.ecmaVersion >= 6 && node) {
    switch (node.type) {
      case 'Identifier':
        if (this.inAsync && node.name === 'await') {
          this.raise(
            node.start,
            "Cannot use 'await' as identifier inside an async function"
          )
        }
        break
      case 'ObjectPattern':
      case 'ArrayPattern':
      case 'AssignmentPattern':
      case 'RestElement':
        break
      case 'ObjectExpression':
        node.type = 'ObjectPattern'
        if (refDestructuringErrors) {
          this.checkPatternErrors(refDestructuringErrors, true)
        }
        for (var i = 0, list = node.properties; i < list.length; i += 1) {
          var prop = list[i]
          this.toAssignable(prop, isBinding)
          if (
            prop.type === 'RestElement' &&
            (prop.argument.type === 'ArrayPattern' ||
              prop.argument.type === 'ObjectPattern')
          ) {
            this.raise(prop.argument.start, 'Unexpected token')
          }
        }
        break
      case 'Property':
        if (node.kind !== 'init') {
          this.raise(
            node.key.start,
            "Object pattern can't contain getter or setter"
          )
        }
        this.toAssignable(node.value, isBinding)
        break
      case 'ArrayExpression':
        node.type = 'ArrayPattern'
        if (refDestructuringErrors) {
          this.checkPatternErrors(refDestructuringErrors, true)
        }
        this.toAssignableList(node.elements, isBinding)
        break
      case 'SpreadElement':
        node.type = 'RestElement'
        this.toAssignable(node.argument, isBinding)
        if (node.argument.type === 'AssignmentPattern') {
          this.raise(
            node.argument.start,
            'Rest elements cannot have a default value'
          )
        }
        break
      case 'AssignmentExpression':
        if (node.operator !== '=') {
          this.raise(
            node.left.end,
            "Only '=' operator can be used for specifying default value."
          )
        }
        node.type = 'AssignmentPattern'
        delete node.operator
        this.toAssignable(node.left, isBinding)
        break
      case 'ParenthesizedExpression':
        this.toAssignable(node.expression, isBinding, refDestructuringErrors)
        break
      case 'ChainExpression':
        this.raiseRecoverable(
          node.start,
          'Optional chaining cannot appear in left-hand side'
        )
        break
      case 'MemberExpression':
        if (!isBinding) {
          break
        }
      default:
        this.raise(node.start, 'Assigning to rvalue')
    }
  } else if (refDestructuringErrors) {
    this.checkPatternErrors(refDestructuringErrors, true)
  }
  return node
}
pp$7.toAssignableList = function (exprList, isBinding) {
  var end = exprList.length
  for (var i = 0; i < end; i++) {
    var elt = exprList[i]
    if (elt) {
      this.toAssignable(elt, isBinding)
    }
  }
  if (end) {
    var last = exprList[end - 1]
    if (
      this.options.ecmaVersion === 6 &&
      isBinding &&
      last &&
      last.type === 'RestElement' &&
      last.argument.type !== 'Identifier'
    ) {
      this.unexpected(last.argument.start)
    }
  }
  return exprList
}
pp$7.parseSpread = function (refDestructuringErrors) {
  var node = this.startNode()
  this.next()
  node.argument = this.parseMaybeAssign(false, refDestructuringErrors)
  return this.finishNode(node, 'SpreadElement')
}
pp$7.parseRestBinding = function () {
  var node = this.startNode()
  this.next()
  if (this.options.ecmaVersion === 6 && this.type !== types$1.name) {
    this.unexpected()
  }
  node.argument = this.parseBindingAtom()
  return this.finishNode(node, 'RestElement')
}
pp$7.parseBindingAtom = function () {
  if (this.options.ecmaVersion >= 6) {
    switch (this.type) {
      case types$1.bracketL:
        var node = this.startNode()
        this.next()
        node.elements = this.parseBindingList(types$1.bracketR, true, true)
        return this.finishNode(node, 'ArrayPattern')
      case types$1.braceL:
        return this.parseObj(true)
    }
  }
  return this.parseIdent()
}
pp$7.parseBindingList = function (
  close,
  allowEmpty,
  allowTrailingComma,
  allowModifiers
) {
  var elts = [],
    first = true
  while (!this.eat(close)) {
    if (first) {
      first = false
    } else {
      this.expect(types$1.comma)
    }
    if (allowEmpty && this.type === types$1.comma) {
      elts.push(null)
    } else if (allowTrailingComma && this.afterTrailingComma(close)) {
      break
    } else if (this.type === types$1.ellipsis) {
      var rest = this.parseRestBinding()
      this.parseBindingListItem(rest)
      elts.push(rest)
      if (this.type === types$1.comma) {
        this.raiseRecoverable(
          this.start,
          'Comma is not permitted after the rest element'
        )
      }
      this.expect(close)
      break
    } else {
      elts.push(this.parseAssignableListItem(allowModifiers))
    }
  }
  return elts
}
pp$7.parseAssignableListItem = function (allowModifiers) {
  var elem = this.parseMaybeDefault(this.start, this.startLoc)
  this.parseBindingListItem(elem)
  return elem
}
pp$7.parseBindingListItem = function (param) {
  return param
}
pp$7.parseMaybeDefault = function (startPos, startLoc, left) {
  left = left || this.parseBindingAtom()
  if (this.options.ecmaVersion < 6 || !this.eat(types$1.eq)) {
    return left
  }
  var node = this.startNodeAt(startPos, startLoc)
  node.left = left
  node.right = this.parseMaybeAssign()
  return this.finishNode(node, 'AssignmentPattern')
}
pp$7.checkLValSimple = function (expr, bindingType, checkClashes) {
  if (bindingType === undefined) bindingType = BIND_NONE
  var isBind = bindingType !== BIND_NONE
  switch (expr.type) {
    case 'Identifier':
      if (this.strict && this.reservedWordsStrictBind.test(expr.name)) {
        this.raiseRecoverable(
          expr.start,
          (isBind ? 'Binding ' : 'Assigning to ') +
            expr.name +
            ' in strict mode'
        )
      }
      if (isBind) {
        if (bindingType === BIND_LEXICAL && expr.name === 'let') {
          this.raiseRecoverable(
            expr.start,
            'let is disallowed as a lexically bound name'
          )
        }
        if (checkClashes) {
          if (hasOwn(checkClashes, expr.name)) {
            this.raiseRecoverable(expr.start, 'Argument name clash')
          }
          checkClashes[expr.name] = true
        }
        if (bindingType !== BIND_OUTSIDE) {
          this.declareName(expr.name, bindingType, expr.start)
        }
      }
      break
    case 'ChainExpression':
      this.raiseRecoverable(
        expr.start,
        'Optional chaining cannot appear in left-hand side'
      )
      break
    case 'MemberExpression':
      if (isBind) {
        this.raiseRecoverable(expr.start, 'Binding member expression')
      }
      break
    case 'ParenthesizedExpression':
      if (isBind) {
        this.raiseRecoverable(expr.start, 'Binding parenthesized expression')
      }
      return this.checkLValSimple(expr.expression, bindingType, checkClashes)
    default:
      this.raise(expr.start, (isBind ? 'Binding' : 'Assigning to') + ' rvalue')
  }
}
pp$7.checkLValPattern = function (expr, bindingType, checkClashes) {
  if (bindingType === undefined) bindingType = BIND_NONE
  switch (expr.type) {
    case 'ObjectPattern':
      for (var i = 0, list = expr.properties; i < list.length; i += 1) {
        var prop = list[i]
        this.checkLValInnerPattern(prop, bindingType, checkClashes)
      }
      break
    case 'ArrayPattern':
      for (var i$1 = 0, list$1 = expr.elements; i$1 < list$1.length; i$1 += 1) {
        var elem = list$1[i$1]
        if (elem) {
          this.checkLValInnerPattern(elem, bindingType, checkClashes)
        }
      }
      break
    default:
      this.checkLValSimple(expr, bindingType, checkClashes)
  }
}
pp$7.checkLValInnerPattern = function (expr, bindingType, checkClashes) {
  if (bindingType === undefined) bindingType = BIND_NONE
  switch (expr.type) {
    case 'Property':
      this.checkLValInnerPattern(expr.value, bindingType, checkClashes)
      break
    case 'AssignmentPattern':
      this.checkLValPattern(expr.left, bindingType, checkClashes)
      break
    case 'RestElement':
      this.checkLValPattern(expr.argument, bindingType, checkClashes)
      break
    default:
      this.checkLValPattern(expr, bindingType, checkClashes)
  }
}
var TokContext = function TokContext2(
  token,
  isExpr,
  preserveSpace,
  override,
  generator
) {
  this.token = token
  this.isExpr = !!isExpr
  this.preserveSpace = !!preserveSpace
  this.override = override
  this.generator = !!generator
}
var types = {
  b_stat: new TokContext('{', false),
  b_expr: new TokContext('{', true),
  b_tmpl: new TokContext('${', false),
  p_stat: new TokContext('(', false),
  p_expr: new TokContext('(', true),
  q_tmpl: new TokContext('`', true, true, function (p) {
    return p.tryReadTemplateToken()
  }),
  f_stat: new TokContext('function', false),
  f_expr: new TokContext('function', true),
  f_expr_gen: new TokContext('function', true, false, null, true),
  f_gen: new TokContext('function', false, false, null, true),
}
var pp$6 = Parser.prototype
pp$6.initialContext = function () {
  return [types.b_stat]
}
pp$6.curContext = function () {
  return this.context[this.context.length - 1]
}
pp$6.braceIsBlock = function (prevType) {
  var parent = this.curContext()
  if (parent === types.f_expr || parent === types.f_stat) {
    return true
  }
  if (
    prevType === types$1.colon &&
    (parent === types.b_stat || parent === types.b_expr)
  ) {
    return !parent.isExpr
  }
  if (
    prevType === types$1._return ||
    (prevType === types$1.name && this.exprAllowed)
  ) {
    return lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  }
  if (
    prevType === types$1._else ||
    prevType === types$1.semi ||
    prevType === types$1.eof ||
    prevType === types$1.parenR ||
    prevType === types$1.arrow
  ) {
    return true
  }
  if (prevType === types$1.braceL) {
    return parent === types.b_stat
  }
  if (
    prevType === types$1._var ||
    prevType === types$1._const ||
    prevType === types$1.name
  ) {
    return false
  }
  return !this.exprAllowed
}
pp$6.inGeneratorContext = function () {
  for (var i = this.context.length - 1; i >= 1; i--) {
    var context = this.context[i]
    if (context.token === 'function') {
      return context.generator
    }
  }
  return false
}
pp$6.updateContext = function (prevType) {
  var update,
    type = this.type
  if (type.keyword && prevType === types$1.dot) {
    this.exprAllowed = false
  } else if ((update = type.updateContext)) {
    update.call(this, prevType)
  } else {
    this.exprAllowed = type.beforeExpr
  }
}
pp$6.overrideContext = function (tokenCtx) {
  if (this.curContext() !== tokenCtx) {
    this.context[this.context.length - 1] = tokenCtx
  }
}
types$1.parenR.updateContext = types$1.braceR.updateContext = function () {
  if (this.context.length === 1) {
    this.exprAllowed = true
    return
  }
  var out = this.context.pop()
  if (out === types.b_stat && this.curContext().token === 'function') {
    out = this.context.pop()
  }
  this.exprAllowed = !out.isExpr
}
types$1.braceL.updateContext = function (prevType) {
  this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr)
  this.exprAllowed = true
}
types$1.dollarBraceL.updateContext = function () {
  this.context.push(types.b_tmpl)
  this.exprAllowed = true
}
types$1.parenL.updateContext = function (prevType) {
  var statementParens =
    prevType === types$1._if ||
    prevType === types$1._for ||
    prevType === types$1._with ||
    prevType === types$1._while
  this.context.push(statementParens ? types.p_stat : types.p_expr)
  this.exprAllowed = true
}
types$1.incDec.updateContext = function () {}
types$1._function.updateContext = types$1._class.updateContext = function (
  prevType
) {
  if (
    prevType.beforeExpr &&
    prevType !== types$1._else &&
    !(prevType === types$1.semi && this.curContext() !== types.p_stat) &&
    !(
      prevType === types$1._return &&
      lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
    ) &&
    !(
      (prevType === types$1.colon || prevType === types$1.braceL) &&
      this.curContext() === types.b_stat
    )
  ) {
    this.context.push(types.f_expr)
  } else {
    this.context.push(types.f_stat)
  }
  this.exprAllowed = false
}
types$1.colon.updateContext = function () {
  if (this.curContext().token === 'function') {
    this.context.pop()
  }
  this.exprAllowed = true
}
types$1.backQuote.updateContext = function () {
  if (this.curContext() === types.q_tmpl) {
    this.context.pop()
  } else {
    this.context.push(types.q_tmpl)
  }
  this.exprAllowed = false
}
types$1.star.updateContext = function (prevType) {
  if (prevType === types$1._function) {
    var index = this.context.length - 1
    if (this.context[index] === types.f_expr) {
      this.context[index] = types.f_expr_gen
    } else {
      this.context[index] = types.f_gen
    }
  }
  this.exprAllowed = true
}
types$1.name.updateContext = function (prevType) {
  var allowed = false
  if (this.options.ecmaVersion >= 6 && prevType !== types$1.dot) {
    if (
      (this.value === 'of' && !this.exprAllowed) ||
      (this.value === 'yield' && this.inGeneratorContext())
    ) {
      allowed = true
    }
  }
  this.exprAllowed = allowed
}
var pp$5 = Parser.prototype
pp$5.checkPropClash = function (prop, propHash, refDestructuringErrors) {
  if (this.options.ecmaVersion >= 9 && prop.type === 'SpreadElement') {
    return
  }
  if (
    this.options.ecmaVersion >= 6 &&
    (prop.computed || prop.method || prop.shorthand)
  ) {
    return
  }
  var key = prop.key
  var name
  switch (key.type) {
    case 'Identifier':
      name = key.name
      break
    case 'Literal':
      name = String(key.value)
      break
    default:
      return
  }
  var kind = prop.kind
  if (this.options.ecmaVersion >= 6) {
    if (name === '__proto__' && kind === 'init') {
      if (propHash.proto) {
        if (refDestructuringErrors) {
          if (refDestructuringErrors.doubleProto < 0) {
            refDestructuringErrors.doubleProto = key.start
          }
        } else {
          this.raiseRecoverable(key.start, 'Redefinition of __proto__ property')
        }
      }
      propHash.proto = true
    }
    return
  }
  name = '$' + name
  var other = propHash[name]
  if (other) {
    var redefinition
    if (kind === 'init') {
      redefinition = (this.strict && other.init) || other.get || other.set
    } else {
      redefinition = other.init || other[kind]
    }
    if (redefinition) {
      this.raiseRecoverable(key.start, 'Redefinition of property')
    }
  } else {
    other = propHash[name] = {
      init: false,
      get: false,
      set: false,
    }
  }
  other[kind] = true
}
pp$5.parseExpression = function (forInit, refDestructuringErrors) {
  var startPos = this.start,
    startLoc = this.startLoc
  var expr = this.parseMaybeAssign(forInit, refDestructuringErrors)
  if (this.type === types$1.comma) {
    var node = this.startNodeAt(startPos, startLoc)
    node.expressions = [expr]
    while (this.eat(types$1.comma)) {
      node.expressions.push(
        this.parseMaybeAssign(forInit, refDestructuringErrors)
      )
    }
    return this.finishNode(node, 'SequenceExpression')
  }
  return expr
}
pp$5.parseMaybeAssign = function (
  forInit,
  refDestructuringErrors,
  afterLeftParse
) {
  if (this.isContextual('yield')) {
    if (this.inGenerator) {
      return this.parseYield(forInit)
    } else {
      this.exprAllowed = false
    }
  }
  var ownDestructuringErrors = false,
    oldParenAssign = -1,
    oldTrailingComma = -1,
    oldDoubleProto = -1
  if (refDestructuringErrors) {
    oldParenAssign = refDestructuringErrors.parenthesizedAssign
    oldTrailingComma = refDestructuringErrors.trailingComma
    oldDoubleProto = refDestructuringErrors.doubleProto
    refDestructuringErrors.parenthesizedAssign =
      refDestructuringErrors.trailingComma = -1
  } else {
    refDestructuringErrors = new DestructuringErrors()
    ownDestructuringErrors = true
  }
  var startPos = this.start,
    startLoc = this.startLoc
  if (this.type === types$1.parenL || this.type === types$1.name) {
    this.potentialArrowAt = this.start
    this.potentialArrowInForAwait = forInit === 'await'
  }
  var left = this.parseMaybeConditional(forInit, refDestructuringErrors)
  if (afterLeftParse) {
    left = afterLeftParse.call(this, left, startPos, startLoc)
  }
  if (this.type.isAssign) {
    var node = this.startNodeAt(startPos, startLoc)
    node.operator = this.value
    if (this.type === types$1.eq) {
      left = this.toAssignable(left, false, refDestructuringErrors)
    }
    if (!ownDestructuringErrors) {
      refDestructuringErrors.parenthesizedAssign =
        refDestructuringErrors.trailingComma =
        refDestructuringErrors.doubleProto =
          -1
    }
    if (refDestructuringErrors.shorthandAssign >= left.start) {
      refDestructuringErrors.shorthandAssign = -1
    }
    if (this.type === types$1.eq) {
      this.checkLValPattern(left)
    } else {
      this.checkLValSimple(left)
    }
    node.left = left
    this.next()
    node.right = this.parseMaybeAssign(forInit)
    if (oldDoubleProto > -1) {
      refDestructuringErrors.doubleProto = oldDoubleProto
    }
    return this.finishNode(node, 'AssignmentExpression')
  } else {
    if (ownDestructuringErrors) {
      this.checkExpressionErrors(refDestructuringErrors, true)
    }
  }
  if (oldParenAssign > -1) {
    refDestructuringErrors.parenthesizedAssign = oldParenAssign
  }
  if (oldTrailingComma > -1) {
    refDestructuringErrors.trailingComma = oldTrailingComma
  }
  return left
}
pp$5.parseMaybeConditional = function (forInit, refDestructuringErrors) {
  var startPos = this.start,
    startLoc = this.startLoc
  var expr = this.parseExprOps(forInit, refDestructuringErrors)
  if (this.checkExpressionErrors(refDestructuringErrors)) {
    return expr
  }
  if (this.eat(types$1.question)) {
    var node = this.startNodeAt(startPos, startLoc)
    node.test = expr
    node.consequent = this.parseMaybeAssign()
    this.expect(types$1.colon)
    node.alternate = this.parseMaybeAssign(forInit)
    return this.finishNode(node, 'ConditionalExpression')
  }
  return expr
}
pp$5.parseExprOps = function (forInit, refDestructuringErrors) {
  var startPos = this.start,
    startLoc = this.startLoc
  var expr = this.parseMaybeUnary(refDestructuringErrors, false, false, forInit)
  if (this.checkExpressionErrors(refDestructuringErrors)) {
    return expr
  }
  return expr.start === startPos && expr.type === 'ArrowFunctionExpression'
    ? expr
    : this.parseExprOp(expr, startPos, startLoc, -1, forInit)
}
pp$5.parseExprOp = function (
  left,
  leftStartPos,
  leftStartLoc,
  minPrec,
  forInit
) {
  var prec = this.type.binop
  if (prec != null && (!forInit || this.type !== types$1._in)) {
    if (prec > minPrec) {
      var logical =
        this.type === types$1.logicalOR || this.type === types$1.logicalAND
      var coalesce = this.type === types$1.coalesce
      if (coalesce) {
        prec = types$1.logicalAND.binop
      }
      var op = this.value
      this.next()
      var startPos = this.start,
        startLoc = this.startLoc
      var right = this.parseExprOp(
        this.parseMaybeUnary(null, false, false, forInit),
        startPos,
        startLoc,
        prec,
        forInit
      )
      var node = this.buildBinary(
        leftStartPos,
        leftStartLoc,
        left,
        right,
        op,
        logical || coalesce
      )
      if (
        (logical && this.type === types$1.coalesce) ||
        (coalesce &&
          (this.type === types$1.logicalOR || this.type === types$1.logicalAND))
      ) {
        this.raiseRecoverable(
          this.start,
          'Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses'
        )
      }
      return this.parseExprOp(
        node,
        leftStartPos,
        leftStartLoc,
        minPrec,
        forInit
      )
    }
  }
  return left
}
pp$5.buildBinary = function (startPos, startLoc, left, right, op, logical) {
  if (right.type === 'PrivateIdentifier') {
    this.raise(
      right.start,
      'Private identifier can only be left side of binary expression'
    )
  }
  var node = this.startNodeAt(startPos, startLoc)
  node.left = left
  node.operator = op
  node.right = right
  return this.finishNode(
    node,
    logical ? 'LogicalExpression' : 'BinaryExpression'
  )
}
pp$5.parseMaybeUnary = function (
  refDestructuringErrors,
  sawUnary,
  incDec,
  forInit
) {
  var startPos = this.start,
    startLoc = this.startLoc,
    expr
  if (this.isContextual('await') && this.canAwait) {
    expr = this.parseAwait(forInit)
    sawUnary = true
  } else if (this.type.prefix) {
    var node = this.startNode(),
      update = this.type === types$1.incDec
    node.operator = this.value
    node.prefix = true
    this.next()
    node.argument = this.parseMaybeUnary(null, true, update, forInit)
    this.checkExpressionErrors(refDestructuringErrors, true)
    if (update) {
      this.checkLValSimple(node.argument)
    } else if (
      this.strict &&
      node.operator === 'delete' &&
      isLocalVariableAccess(node.argument)
    ) {
      this.raiseRecoverable(
        node.start,
        'Deleting local variable in strict mode'
      )
    } else if (
      node.operator === 'delete' &&
      isPrivateFieldAccess(node.argument)
    ) {
      this.raiseRecoverable(node.start, 'Private fields can not be deleted')
    } else {
      sawUnary = true
    }
    expr = this.finishNode(
      node,
      update ? 'UpdateExpression' : 'UnaryExpression'
    )
  } else if (!sawUnary && this.type === types$1.privateId) {
    if (
      (forInit || this.privateNameStack.length === 0) &&
      this.options.checkPrivateFields
    ) {
      this.unexpected()
    }
    expr = this.parsePrivateIdent()
    if (this.type !== types$1._in) {
      this.unexpected()
    }
  } else {
    expr = this.parseExprSubscripts(refDestructuringErrors, forInit)
    if (this.checkExpressionErrors(refDestructuringErrors)) {
      return expr
    }
    while (this.type.postfix && !this.canInsertSemicolon()) {
      var node$1 = this.startNodeAt(startPos, startLoc)
      node$1.operator = this.value
      node$1.prefix = false
      node$1.argument = expr
      this.checkLValSimple(expr)
      this.next()
      expr = this.finishNode(node$1, 'UpdateExpression')
    }
  }
  if (!incDec && this.eat(types$1.starstar)) {
    if (sawUnary) {
      this.unexpected(this.lastTokStart)
    } else {
      return this.buildBinary(
        startPos,
        startLoc,
        expr,
        this.parseMaybeUnary(null, false, false, forInit),
        '**',
        false
      )
    }
  } else {
    return expr
  }
}
function isLocalVariableAccess(node) {
  return (
    node.type === 'Identifier' ||
    (node.type === 'ParenthesizedExpression' &&
      isLocalVariableAccess(node.expression))
  )
}
function isPrivateFieldAccess(node) {
  return (
    (node.type === 'MemberExpression' &&
      node.property.type === 'PrivateIdentifier') ||
    (node.type === 'ChainExpression' &&
      isPrivateFieldAccess(node.expression)) ||
    (node.type === 'ParenthesizedExpression' &&
      isPrivateFieldAccess(node.expression))
  )
}
pp$5.parseExprSubscripts = function (refDestructuringErrors, forInit) {
  var startPos = this.start,
    startLoc = this.startLoc
  var expr = this.parseExprAtom(refDestructuringErrors, forInit)
  if (
    expr.type === 'ArrowFunctionExpression' &&
    this.input.slice(this.lastTokStart, this.lastTokEnd) !== ')'
  ) {
    return expr
  }
  var result = this.parseSubscripts(expr, startPos, startLoc, false, forInit)
  if (refDestructuringErrors && result.type === 'MemberExpression') {
    if (refDestructuringErrors.parenthesizedAssign >= result.start) {
      refDestructuringErrors.parenthesizedAssign = -1
    }
    if (refDestructuringErrors.parenthesizedBind >= result.start) {
      refDestructuringErrors.parenthesizedBind = -1
    }
    if (refDestructuringErrors.trailingComma >= result.start) {
      refDestructuringErrors.trailingComma = -1
    }
  }
  return result
}
pp$5.parseSubscripts = function (base, startPos, startLoc, noCalls, forInit) {
  var maybeAsyncArrow =
    this.options.ecmaVersion >= 8 &&
    base.type === 'Identifier' &&
    base.name === 'async' &&
    this.lastTokEnd === base.end &&
    !this.canInsertSemicolon() &&
    base.end - base.start === 5 &&
    this.potentialArrowAt === base.start
  var optionalChained = false
  while (true) {
    var element = this.parseSubscript(
      base,
      startPos,
      startLoc,
      noCalls,
      maybeAsyncArrow,
      optionalChained,
      forInit
    )
    if (element.optional) {
      optionalChained = true
    }
    if (element === base || element.type === 'ArrowFunctionExpression') {
      if (optionalChained) {
        var chainNode = this.startNodeAt(startPos, startLoc)
        chainNode.expression = element
        element = this.finishNode(chainNode, 'ChainExpression')
      }
      return element
    }
    base = element
  }
}
pp$5.shouldParseAsyncArrow = function () {
  return !this.canInsertSemicolon() && this.eat(types$1.arrow)
}
pp$5.parseSubscriptAsyncArrow = function (
  startPos,
  startLoc,
  exprList,
  forInit
) {
  return this.parseArrowExpression(
    this.startNodeAt(startPos, startLoc),
    exprList,
    true,
    forInit
  )
}
pp$5.parseSubscript = function (
  base,
  startPos,
  startLoc,
  noCalls,
  maybeAsyncArrow,
  optionalChained,
  forInit
) {
  var optionalSupported = this.options.ecmaVersion >= 11
  var optional = optionalSupported && this.eat(types$1.questionDot)
  if (noCalls && optional) {
    this.raise(
      this.lastTokStart,
      'Optional chaining cannot appear in the callee of new expressions'
    )
  }
  var computed = this.eat(types$1.bracketL)
  if (
    computed ||
    (optional &&
      this.type !== types$1.parenL &&
      this.type !== types$1.backQuote) ||
    this.eat(types$1.dot)
  ) {
    var node = this.startNodeAt(startPos, startLoc)
    node.object = base
    if (computed) {
      node.property = this.parseExpression()
      this.expect(types$1.bracketR)
    } else if (this.type === types$1.privateId && base.type !== 'Super') {
      node.property = this.parsePrivateIdent()
    } else {
      node.property = this.parseIdent(this.options.allowReserved !== 'never')
    }
    node.computed = !!computed
    if (optionalSupported) {
      node.optional = optional
    }
    base = this.finishNode(node, 'MemberExpression')
  } else if (!noCalls && this.eat(types$1.parenL)) {
    var refDestructuringErrors = new DestructuringErrors(),
      oldYieldPos = this.yieldPos,
      oldAwaitPos = this.awaitPos,
      oldAwaitIdentPos = this.awaitIdentPos
    this.yieldPos = 0
    this.awaitPos = 0
    this.awaitIdentPos = 0
    var exprList = this.parseExprList(
      types$1.parenR,
      this.options.ecmaVersion >= 8,
      false,
      refDestructuringErrors
    )
    if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
      this.checkPatternErrors(refDestructuringErrors, false)
      this.checkYieldAwaitInDefaultParams()
      if (this.awaitIdentPos > 0) {
        this.raise(
          this.awaitIdentPos,
          "Cannot use 'await' as identifier inside an async function"
        )
      }
      this.yieldPos = oldYieldPos
      this.awaitPos = oldAwaitPos
      this.awaitIdentPos = oldAwaitIdentPos
      return this.parseSubscriptAsyncArrow(
        startPos,
        startLoc,
        exprList,
        forInit
      )
    }
    this.checkExpressionErrors(refDestructuringErrors, true)
    this.yieldPos = oldYieldPos || this.yieldPos
    this.awaitPos = oldAwaitPos || this.awaitPos
    this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos
    var node$1 = this.startNodeAt(startPos, startLoc)
    node$1.callee = base
    node$1.arguments = exprList
    if (optionalSupported) {
      node$1.optional = optional
    }
    base = this.finishNode(node$1, 'CallExpression')
  } else if (this.type === types$1.backQuote) {
    if (optional || optionalChained) {
      this.raise(
        this.start,
        'Optional chaining cannot appear in the tag of tagged template expressions'
      )
    }
    var node$2 = this.startNodeAt(startPos, startLoc)
    node$2.tag = base
    node$2.quasi = this.parseTemplate({ isTagged: true })
    base = this.finishNode(node$2, 'TaggedTemplateExpression')
  }
  return base
}
pp$5.parseExprAtom = function (refDestructuringErrors, forInit, forNew) {
  if (this.type === types$1.slash) {
    this.readRegexp()
  }
  var node,
    canBeArrow = this.potentialArrowAt === this.start
  switch (this.type) {
    case types$1._super:
      if (!this.allowSuper) {
        this.raise(this.start, "'super' keyword outside a method")
      }
      node = this.startNode()
      this.next()
      if (this.type === types$1.parenL && !this.allowDirectSuper) {
        this.raise(node.start, 'super() call outside constructor of a subclass')
      }
      if (
        this.type !== types$1.dot &&
        this.type !== types$1.bracketL &&
        this.type !== types$1.parenL
      ) {
        this.unexpected()
      }
      return this.finishNode(node, 'Super')
    case types$1._this:
      node = this.startNode()
      this.next()
      return this.finishNode(node, 'ThisExpression')
    case types$1.name:
      var startPos = this.start,
        startLoc = this.startLoc,
        containsEsc = this.containsEsc
      var id = this.parseIdent(false)
      if (
        this.options.ecmaVersion >= 8 &&
        !containsEsc &&
        id.name === 'async' &&
        !this.canInsertSemicolon() &&
        this.eat(types$1._function)
      ) {
        this.overrideContext(types.f_expr)
        return this.parseFunction(
          this.startNodeAt(startPos, startLoc),
          0,
          false,
          true,
          forInit
        )
      }
      if (canBeArrow && !this.canInsertSemicolon()) {
        if (this.eat(types$1.arrow)) {
          return this.parseArrowExpression(
            this.startNodeAt(startPos, startLoc),
            [id],
            false,
            forInit
          )
        }
        if (
          this.options.ecmaVersion >= 8 &&
          id.name === 'async' &&
          this.type === types$1.name &&
          !containsEsc &&
          (!this.potentialArrowInForAwait ||
            this.value !== 'of' ||
            this.containsEsc)
        ) {
          id = this.parseIdent(false)
          if (this.canInsertSemicolon() || !this.eat(types$1.arrow)) {
            this.unexpected()
          }
          return this.parseArrowExpression(
            this.startNodeAt(startPos, startLoc),
            [id],
            true,
            forInit
          )
        }
      }
      return id
    case types$1.regexp:
      var value = this.value
      node = this.parseLiteral(value.value)
      node.regex = { pattern: value.pattern, flags: value.flags }
      return node
    case types$1.num:
    case types$1.string:
      return this.parseLiteral(this.value)
    case types$1._null:
    case types$1._true:
    case types$1._false:
      node = this.startNode()
      node.value =
        this.type === types$1._null ? null : this.type === types$1._true
      node.raw = this.type.keyword
      this.next()
      return this.finishNode(node, 'Literal')
    case types$1.parenL:
      var start = this.start,
        expr = this.parseParenAndDistinguishExpression(canBeArrow, forInit)
      if (refDestructuringErrors) {
        if (
          refDestructuringErrors.parenthesizedAssign < 0 &&
          !this.isSimpleAssignTarget(expr)
        ) {
          refDestructuringErrors.parenthesizedAssign = start
        }
        if (refDestructuringErrors.parenthesizedBind < 0) {
          refDestructuringErrors.parenthesizedBind = start
        }
      }
      return expr
    case types$1.bracketL:
      node = this.startNode()
      this.next()
      node.elements = this.parseExprList(
        types$1.bracketR,
        true,
        true,
        refDestructuringErrors
      )
      return this.finishNode(node, 'ArrayExpression')
    case types$1.braceL:
      this.overrideContext(types.b_expr)
      return this.parseObj(false, refDestructuringErrors)
    case types$1._function:
      node = this.startNode()
      this.next()
      return this.parseFunction(node, 0)
    case types$1._class:
      return this.parseClass(this.startNode(), false)
    case types$1._new:
      return this.parseNew()
    case types$1.backQuote:
      return this.parseTemplate()
    case types$1._import:
      if (this.options.ecmaVersion >= 11) {
        return this.parseExprImport(forNew)
      } else {
        return this.unexpected()
      }
    default:
      return this.parseExprAtomDefault()
  }
}
pp$5.parseExprAtomDefault = function () {
  this.unexpected()
}
pp$5.parseExprImport = function (forNew) {
  var node = this.startNode()
  if (this.containsEsc) {
    this.raiseRecoverable(this.start, 'Escape sequence in keyword import')
  }
  this.next()
  if (this.type === types$1.parenL && !forNew) {
    return this.parseDynamicImport(node)
  } else if (this.type === types$1.dot) {
    var meta = this.startNodeAt(node.start, node.loc && node.loc.start)
    meta.name = 'import'
    node.meta = this.finishNode(meta, 'Identifier')
    return this.parseImportMeta(node)
  } else {
    this.unexpected()
  }
}
pp$5.parseDynamicImport = function (node) {
  this.next()
  node.source = this.parseMaybeAssign()
  if (this.options.ecmaVersion >= 16) {
    if (!this.eat(types$1.parenR)) {
      this.expect(types$1.comma)
      if (!this.afterTrailingComma(types$1.parenR)) {
        node.options = this.parseMaybeAssign()
        if (!this.eat(types$1.parenR)) {
          this.expect(types$1.comma)
          if (!this.afterTrailingComma(types$1.parenR)) {
            this.unexpected()
          }
        }
      } else {
        node.options = null
      }
    } else {
      node.options = null
    }
  } else {
    if (!this.eat(types$1.parenR)) {
      var errorPos = this.start
      if (this.eat(types$1.comma) && this.eat(types$1.parenR)) {
        this.raiseRecoverable(
          errorPos,
          'Trailing comma is not allowed in import()'
        )
      } else {
        this.unexpected(errorPos)
      }
    }
  }
  return this.finishNode(node, 'ImportExpression')
}
pp$5.parseImportMeta = function (node) {
  this.next()
  var containsEsc = this.containsEsc
  node.property = this.parseIdent(true)
  if (node.property.name !== 'meta') {
    this.raiseRecoverable(
      node.property.start,
      "The only valid meta property for import is 'import.meta'"
    )
  }
  if (containsEsc) {
    this.raiseRecoverable(
      node.start,
      "'import.meta' must not contain escaped characters"
    )
  }
  if (
    this.options.sourceType !== 'module' &&
    !this.options.allowImportExportEverywhere
  ) {
    this.raiseRecoverable(
      node.start,
      "Cannot use 'import.meta' outside a module"
    )
  }
  return this.finishNode(node, 'MetaProperty')
}
pp$5.parseLiteral = function (value) {
  var node = this.startNode()
  node.value = value
  node.raw = this.input.slice(this.start, this.end)
  if (node.raw.charCodeAt(node.raw.length - 1) === 110) {
    node.bigint =
      node.value != null
        ? node.value.toString()
        : node.raw.slice(0, -1).replace(/_/g, '')
  }
  this.next()
  return this.finishNode(node, 'Literal')
}
pp$5.parseParenExpression = function () {
  this.expect(types$1.parenL)
  var val = this.parseExpression()
  this.expect(types$1.parenR)
  return val
}
pp$5.shouldParseArrow = function (exprList) {
  return !this.canInsertSemicolon()
}
pp$5.parseParenAndDistinguishExpression = function (canBeArrow, forInit) {
  var startPos = this.start,
    startLoc = this.startLoc,
    val,
    allowTrailingComma = this.options.ecmaVersion >= 8
  if (this.options.ecmaVersion >= 6) {
    this.next()
    var innerStartPos = this.start,
      innerStartLoc = this.startLoc
    var exprList = [],
      first = true,
      lastIsComma = false
    var refDestructuringErrors = new DestructuringErrors(),
      oldYieldPos = this.yieldPos,
      oldAwaitPos = this.awaitPos,
      spreadStart
    this.yieldPos = 0
    this.awaitPos = 0
    while (this.type !== types$1.parenR) {
      first ? (first = false) : this.expect(types$1.comma)
      if (allowTrailingComma && this.afterTrailingComma(types$1.parenR, true)) {
        lastIsComma = true
        break
      } else if (this.type === types$1.ellipsis) {
        spreadStart = this.start
        exprList.push(this.parseParenItem(this.parseRestBinding()))
        if (this.type === types$1.comma) {
          this.raiseRecoverable(
            this.start,
            'Comma is not permitted after the rest element'
          )
        }
        break
      } else {
        exprList.push(
          this.parseMaybeAssign(
            false,
            refDestructuringErrors,
            this.parseParenItem
          )
        )
      }
    }
    var innerEndPos = this.lastTokEnd,
      innerEndLoc = this.lastTokEndLoc
    this.expect(types$1.parenR)
    if (
      canBeArrow &&
      this.shouldParseArrow(exprList) &&
      this.eat(types$1.arrow)
    ) {
      this.checkPatternErrors(refDestructuringErrors, false)
      this.checkYieldAwaitInDefaultParams()
      this.yieldPos = oldYieldPos
      this.awaitPos = oldAwaitPos
      return this.parseParenArrowList(startPos, startLoc, exprList, forInit)
    }
    if (!exprList.length || lastIsComma) {
      this.unexpected(this.lastTokStart)
    }
    if (spreadStart) {
      this.unexpected(spreadStart)
    }
    this.checkExpressionErrors(refDestructuringErrors, true)
    this.yieldPos = oldYieldPos || this.yieldPos
    this.awaitPos = oldAwaitPos || this.awaitPos
    if (exprList.length > 1) {
      val = this.startNodeAt(innerStartPos, innerStartLoc)
      val.expressions = exprList
      this.finishNodeAt(val, 'SequenceExpression', innerEndPos, innerEndLoc)
    } else {
      val = exprList[0]
    }
  } else {
    val = this.parseParenExpression()
  }
  if (this.options.preserveParens) {
    var par = this.startNodeAt(startPos, startLoc)
    par.expression = val
    return this.finishNode(par, 'ParenthesizedExpression')
  } else {
    return val
  }
}
pp$5.parseParenItem = function (item) {
  return item
}
pp$5.parseParenArrowList = function (startPos, startLoc, exprList, forInit) {
  return this.parseArrowExpression(
    this.startNodeAt(startPos, startLoc),
    exprList,
    false,
    forInit
  )
}
var empty = []
pp$5.parseNew = function () {
  if (this.containsEsc) {
    this.raiseRecoverable(this.start, 'Escape sequence in keyword new')
  }
  var node = this.startNode()
  this.next()
  if (this.options.ecmaVersion >= 6 && this.type === types$1.dot) {
    var meta = this.startNodeAt(node.start, node.loc && node.loc.start)
    meta.name = 'new'
    node.meta = this.finishNode(meta, 'Identifier')
    this.next()
    var containsEsc = this.containsEsc
    node.property = this.parseIdent(true)
    if (node.property.name !== 'target') {
      this.raiseRecoverable(
        node.property.start,
        "The only valid meta property for new is 'new.target'"
      )
    }
    if (containsEsc) {
      this.raiseRecoverable(
        node.start,
        "'new.target' must not contain escaped characters"
      )
    }
    if (!this.allowNewDotTarget) {
      this.raiseRecoverable(
        node.start,
        "'new.target' can only be used in functions and class static block"
      )
    }
    return this.finishNode(node, 'MetaProperty')
  }
  var startPos = this.start,
    startLoc = this.startLoc
  node.callee = this.parseSubscripts(
    this.parseExprAtom(null, false, true),
    startPos,
    startLoc,
    true,
    false
  )
  if (this.eat(types$1.parenL)) {
    node.arguments = this.parseExprList(
      types$1.parenR,
      this.options.ecmaVersion >= 8,
      false
    )
  } else {
    node.arguments = empty
  }
  return this.finishNode(node, 'NewExpression')
}
pp$5.parseTemplateElement = function (ref2) {
  var isTagged = ref2.isTagged
  var elem = this.startNode()
  if (this.type === types$1.invalidTemplate) {
    if (!isTagged) {
      this.raiseRecoverable(
        this.start,
        'Bad escape sequence in untagged template literal'
      )
    }
    elem.value = {
      raw: this.value.replace(
        /\r\n?/g,
        `
`
      ),
      cooked: null,
    }
  } else {
    elem.value = {
      raw: this.input.slice(this.start, this.end).replace(
        /\r\n?/g,
        `
`
      ),
      cooked: this.value,
    }
  }
  this.next()
  elem.tail = this.type === types$1.backQuote
  return this.finishNode(elem, 'TemplateElement')
}
pp$5.parseTemplate = function (ref2) {
  if (ref2 === undefined) ref2 = {}
  var isTagged = ref2.isTagged
  if (isTagged === undefined) isTagged = false
  var node = this.startNode()
  this.next()
  node.expressions = []
  var curElt = this.parseTemplateElement({ isTagged })
  node.quasis = [curElt]
  while (!curElt.tail) {
    if (this.type === types$1.eof) {
      this.raise(this.pos, 'Unterminated template literal')
    }
    this.expect(types$1.dollarBraceL)
    node.expressions.push(this.parseExpression())
    this.expect(types$1.braceR)
    node.quasis.push((curElt = this.parseTemplateElement({ isTagged })))
  }
  this.next()
  return this.finishNode(node, 'TemplateLiteral')
}
pp$5.isAsyncProp = function (prop) {
  return (
    !prop.computed &&
    prop.key.type === 'Identifier' &&
    prop.key.name === 'async' &&
    (this.type === types$1.name ||
      this.type === types$1.num ||
      this.type === types$1.string ||
      this.type === types$1.bracketL ||
      this.type.keyword ||
      (this.options.ecmaVersion >= 9 && this.type === types$1.star)) &&
    !lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  )
}
pp$5.parseObj = function (isPattern, refDestructuringErrors) {
  var node = this.startNode(),
    first = true,
    propHash = {}
  node.properties = []
  this.next()
  while (!this.eat(types$1.braceR)) {
    if (!first) {
      this.expect(types$1.comma)
      if (
        this.options.ecmaVersion >= 5 &&
        this.afterTrailingComma(types$1.braceR)
      ) {
        break
      }
    } else {
      first = false
    }
    var prop = this.parseProperty(isPattern, refDestructuringErrors)
    if (!isPattern) {
      this.checkPropClash(prop, propHash, refDestructuringErrors)
    }
    node.properties.push(prop)
  }
  return this.finishNode(node, isPattern ? 'ObjectPattern' : 'ObjectExpression')
}
pp$5.parseProperty = function (isPattern, refDestructuringErrors) {
  var prop = this.startNode(),
    isGenerator,
    isAsync,
    startPos,
    startLoc
  if (this.options.ecmaVersion >= 9 && this.eat(types$1.ellipsis)) {
    if (isPattern) {
      prop.argument = this.parseIdent(false)
      if (this.type === types$1.comma) {
        this.raiseRecoverable(
          this.start,
          'Comma is not permitted after the rest element'
        )
      }
      return this.finishNode(prop, 'RestElement')
    }
    prop.argument = this.parseMaybeAssign(false, refDestructuringErrors)
    if (
      this.type === types$1.comma &&
      refDestructuringErrors &&
      refDestructuringErrors.trailingComma < 0
    ) {
      refDestructuringErrors.trailingComma = this.start
    }
    return this.finishNode(prop, 'SpreadElement')
  }
  if (this.options.ecmaVersion >= 6) {
    prop.method = false
    prop.shorthand = false
    if (isPattern || refDestructuringErrors) {
      startPos = this.start
      startLoc = this.startLoc
    }
    if (!isPattern) {
      isGenerator = this.eat(types$1.star)
    }
  }
  var containsEsc = this.containsEsc
  this.parsePropertyName(prop)
  if (
    !isPattern &&
    !containsEsc &&
    this.options.ecmaVersion >= 8 &&
    !isGenerator &&
    this.isAsyncProp(prop)
  ) {
    isAsync = true
    isGenerator = this.options.ecmaVersion >= 9 && this.eat(types$1.star)
    this.parsePropertyName(prop)
  } else {
    isAsync = false
  }
  this.parsePropertyValue(
    prop,
    isPattern,
    isGenerator,
    isAsync,
    startPos,
    startLoc,
    refDestructuringErrors,
    containsEsc
  )
  return this.finishNode(prop, 'Property')
}
pp$5.parseGetterSetter = function (prop) {
  var kind = prop.key.name
  this.parsePropertyName(prop)
  prop.value = this.parseMethod(false)
  prop.kind = kind
  var paramCount = prop.kind === 'get' ? 0 : 1
  if (prop.value.params.length !== paramCount) {
    var start = prop.value.start
    if (prop.kind === 'get') {
      this.raiseRecoverable(start, 'getter should have no params')
    } else {
      this.raiseRecoverable(start, 'setter should have exactly one param')
    }
  } else {
    if (prop.kind === 'set' && prop.value.params[0].type === 'RestElement') {
      this.raiseRecoverable(
        prop.value.params[0].start,
        'Setter cannot use rest params'
      )
    }
  }
}
pp$5.parsePropertyValue = function (
  prop,
  isPattern,
  isGenerator,
  isAsync,
  startPos,
  startLoc,
  refDestructuringErrors,
  containsEsc
) {
  if ((isGenerator || isAsync) && this.type === types$1.colon) {
    this.unexpected()
  }
  if (this.eat(types$1.colon)) {
    prop.value = isPattern
      ? this.parseMaybeDefault(this.start, this.startLoc)
      : this.parseMaybeAssign(false, refDestructuringErrors)
    prop.kind = 'init'
  } else if (this.options.ecmaVersion >= 6 && this.type === types$1.parenL) {
    if (isPattern) {
      this.unexpected()
    }
    prop.method = true
    prop.value = this.parseMethod(isGenerator, isAsync)
    prop.kind = 'init'
  } else if (
    !isPattern &&
    !containsEsc &&
    this.options.ecmaVersion >= 5 &&
    !prop.computed &&
    prop.key.type === 'Identifier' &&
    (prop.key.name === 'get' || prop.key.name === 'set') &&
    this.type !== types$1.comma &&
    this.type !== types$1.braceR &&
    this.type !== types$1.eq
  ) {
    if (isGenerator || isAsync) {
      this.unexpected()
    }
    this.parseGetterSetter(prop)
  } else if (
    this.options.ecmaVersion >= 6 &&
    !prop.computed &&
    prop.key.type === 'Identifier'
  ) {
    if (isGenerator || isAsync) {
      this.unexpected()
    }
    this.checkUnreserved(prop.key)
    if (prop.key.name === 'await' && !this.awaitIdentPos) {
      this.awaitIdentPos = startPos
    }
    if (isPattern) {
      prop.value = this.parseMaybeDefault(
        startPos,
        startLoc,
        this.copyNode(prop.key)
      )
    } else if (this.type === types$1.eq && refDestructuringErrors) {
      if (refDestructuringErrors.shorthandAssign < 0) {
        refDestructuringErrors.shorthandAssign = this.start
      }
      prop.value = this.parseMaybeDefault(
        startPos,
        startLoc,
        this.copyNode(prop.key)
      )
    } else {
      prop.value = this.copyNode(prop.key)
    }
    prop.kind = 'init'
    prop.shorthand = true
  } else {
    this.unexpected()
  }
}
pp$5.parsePropertyName = function (prop) {
  if (this.options.ecmaVersion >= 6) {
    if (this.eat(types$1.bracketL)) {
      prop.computed = true
      prop.key = this.parseMaybeAssign()
      this.expect(types$1.bracketR)
      return prop.key
    } else {
      prop.computed = false
    }
  }
  return (prop.key =
    this.type === types$1.num || this.type === types$1.string
      ? this.parseExprAtom()
      : this.parseIdent(this.options.allowReserved !== 'never'))
}
pp$5.initFunction = function (node) {
  node.id = null
  if (this.options.ecmaVersion >= 6) {
    node.generator = node.expression = false
  }
  if (this.options.ecmaVersion >= 8) {
    node.async = false
  }
}
pp$5.parseMethod = function (isGenerator, isAsync, allowDirectSuper) {
  var node = this.startNode(),
    oldYieldPos = this.yieldPos,
    oldAwaitPos = this.awaitPos,
    oldAwaitIdentPos = this.awaitIdentPos
  this.initFunction(node)
  if (this.options.ecmaVersion >= 6) {
    node.generator = isGenerator
  }
  if (this.options.ecmaVersion >= 8) {
    node.async = !!isAsync
  }
  this.yieldPos = 0
  this.awaitPos = 0
  this.awaitIdentPos = 0
  this.enterScope(
    functionFlags(isAsync, node.generator) |
      SCOPE_SUPER |
      (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0)
  )
  this.expect(types$1.parenL)
  node.params = this.parseBindingList(
    types$1.parenR,
    false,
    this.options.ecmaVersion >= 8
  )
  this.checkYieldAwaitInDefaultParams()
  this.parseFunctionBody(node, false, true, false)
  this.yieldPos = oldYieldPos
  this.awaitPos = oldAwaitPos
  this.awaitIdentPos = oldAwaitIdentPos
  return this.finishNode(node, 'FunctionExpression')
}
pp$5.parseArrowExpression = function (node, params, isAsync, forInit) {
  var oldYieldPos = this.yieldPos,
    oldAwaitPos = this.awaitPos,
    oldAwaitIdentPos = this.awaitIdentPos
  this.enterScope(functionFlags(isAsync, false) | SCOPE_ARROW)
  this.initFunction(node)
  if (this.options.ecmaVersion >= 8) {
    node.async = !!isAsync
  }
  this.yieldPos = 0
  this.awaitPos = 0
  this.awaitIdentPos = 0
  node.params = this.toAssignableList(params, true)
  this.parseFunctionBody(node, true, false, forInit)
  this.yieldPos = oldYieldPos
  this.awaitPos = oldAwaitPos
  this.awaitIdentPos = oldAwaitIdentPos
  return this.finishNode(node, 'ArrowFunctionExpression')
}
pp$5.parseFunctionBody = function (node, isArrowFunction, isMethod, forInit) {
  var isExpression = isArrowFunction && this.type !== types$1.braceL
  var oldStrict = this.strict,
    useStrict = false
  if (isExpression) {
    node.body = this.parseMaybeAssign(forInit)
    node.expression = true
    this.checkParams(node, false)
  } else {
    var nonSimple =
      this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node.params)
    if (!oldStrict || nonSimple) {
      useStrict = this.strictDirective(this.end)
      if (useStrict && nonSimple) {
        this.raiseRecoverable(
          node.start,
          "Illegal 'use strict' directive in function with non-simple parameter list"
        )
      }
    }
    var oldLabels = this.labels
    this.labels = []
    if (useStrict) {
      this.strict = true
    }
    this.checkParams(
      node,
      !oldStrict &&
        !useStrict &&
        !isArrowFunction &&
        !isMethod &&
        this.isSimpleParamList(node.params)
    )
    if (this.strict && node.id) {
      this.checkLValSimple(node.id, BIND_OUTSIDE)
    }
    node.body = this.parseBlock(false, undefined, useStrict && !oldStrict)
    node.expression = false
    this.adaptDirectivePrologue(node.body.body)
    this.labels = oldLabels
  }
  this.exitScope()
}
pp$5.isSimpleParamList = function (params) {
  for (var i = 0, list = params; i < list.length; i += 1) {
    var param = list[i]
    if (param.type !== 'Identifier') {
      return false
    }
  }
  return true
}
pp$5.checkParams = function (node, allowDuplicates) {
  var nameHash = Object.create(null)
  for (var i = 0, list = node.params; i < list.length; i += 1) {
    var param = list[i]
    this.checkLValInnerPattern(
      param,
      BIND_VAR,
      allowDuplicates ? null : nameHash
    )
  }
}
pp$5.parseExprList = function (
  close,
  allowTrailingComma,
  allowEmpty,
  refDestructuringErrors
) {
  var elts = [],
    first = true
  while (!this.eat(close)) {
    if (!first) {
      this.expect(types$1.comma)
      if (allowTrailingComma && this.afterTrailingComma(close)) {
        break
      }
    } else {
      first = false
    }
    var elt = undefined
    if (allowEmpty && this.type === types$1.comma) {
      elt = null
    } else if (this.type === types$1.ellipsis) {
      elt = this.parseSpread(refDestructuringErrors)
      if (
        refDestructuringErrors &&
        this.type === types$1.comma &&
        refDestructuringErrors.trailingComma < 0
      ) {
        refDestructuringErrors.trailingComma = this.start
      }
    } else {
      elt = this.parseMaybeAssign(false, refDestructuringErrors)
    }
    elts.push(elt)
  }
  return elts
}
pp$5.checkUnreserved = function (ref2) {
  var start = ref2.start
  var end = ref2.end
  var name = ref2.name
  if (this.inGenerator && name === 'yield') {
    this.raiseRecoverable(
      start,
      "Cannot use 'yield' as identifier inside a generator"
    )
  }
  if (this.inAsync && name === 'await') {
    this.raiseRecoverable(
      start,
      "Cannot use 'await' as identifier inside an async function"
    )
  }
  if (!(this.currentThisScope().flags & SCOPE_VAR) && name === 'arguments') {
    this.raiseRecoverable(
      start,
      "Cannot use 'arguments' in class field initializer"
    )
  }
  if (this.inClassStaticBlock && (name === 'arguments' || name === 'await')) {
    this.raise(
      start,
      'Cannot use ' + name + ' in class static initialization block'
    )
  }
  if (this.keywords.test(name)) {
    this.raise(start, "Unexpected keyword '" + name + "'")
  }
  if (
    this.options.ecmaVersion < 6 &&
    this.input.slice(start, end).indexOf('\\') !== -1
  ) {
    return
  }
  var re = this.strict ? this.reservedWordsStrict : this.reservedWords
  if (re.test(name)) {
    if (!this.inAsync && name === 'await') {
      this.raiseRecoverable(
        start,
        "Cannot use keyword 'await' outside an async function"
      )
    }
    this.raiseRecoverable(start, "The keyword '" + name + "' is reserved")
  }
}
pp$5.parseIdent = function (liberal) {
  var node = this.parseIdentNode()
  this.next(!!liberal)
  this.finishNode(node, 'Identifier')
  if (!liberal) {
    this.checkUnreserved(node)
    if (node.name === 'await' && !this.awaitIdentPos) {
      this.awaitIdentPos = node.start
    }
  }
  return node
}
pp$5.parseIdentNode = function () {
  var node = this.startNode()
  if (this.type === types$1.name) {
    node.name = this.value
  } else if (this.type.keyword) {
    node.name = this.type.keyword
    if (
      (node.name === 'class' || node.name === 'function') &&
      (this.lastTokEnd !== this.lastTokStart + 1 ||
        this.input.charCodeAt(this.lastTokStart) !== 46)
    ) {
      this.context.pop()
    }
    this.type = types$1.name
  } else {
    this.unexpected()
  }
  return node
}
pp$5.parsePrivateIdent = function () {
  var node = this.startNode()
  if (this.type === types$1.privateId) {
    node.name = this.value
  } else {
    this.unexpected()
  }
  this.next()
  this.finishNode(node, 'PrivateIdentifier')
  if (this.options.checkPrivateFields) {
    if (this.privateNameStack.length === 0) {
      this.raise(
        node.start,
        "Private field '#" +
          node.name +
          "' must be declared in an enclosing class"
      )
    } else {
      this.privateNameStack[this.privateNameStack.length - 1].used.push(node)
    }
  }
  return node
}
pp$5.parseYield = function (forInit) {
  if (!this.yieldPos) {
    this.yieldPos = this.start
  }
  var node = this.startNode()
  this.next()
  if (
    this.type === types$1.semi ||
    this.canInsertSemicolon() ||
    (this.type !== types$1.star && !this.type.startsExpr)
  ) {
    node.delegate = false
    node.argument = null
  } else {
    node.delegate = this.eat(types$1.star)
    node.argument = this.parseMaybeAssign(forInit)
  }
  return this.finishNode(node, 'YieldExpression')
}
pp$5.parseAwait = function (forInit) {
  if (!this.awaitPos) {
    this.awaitPos = this.start
  }
  var node = this.startNode()
  this.next()
  node.argument = this.parseMaybeUnary(null, true, false, forInit)
  return this.finishNode(node, 'AwaitExpression')
}
var pp$4 = Parser.prototype
pp$4.raise = function (pos, message) {
  var loc = getLineInfo(this.input, pos)
  message += ' (' + loc.line + ':' + loc.column + ')'
  if (this.sourceFile) {
    message += ' in ' + this.sourceFile
  }
  var err = new SyntaxError(message)
  err.pos = pos
  err.loc = loc
  err.raisedAt = this.pos
  throw err
}
pp$4.raiseRecoverable = pp$4.raise
pp$4.curPosition = function () {
  if (this.options.locations) {
    return new Position(this.curLine, this.pos - this.lineStart)
  }
}
var pp$3 = Parser.prototype
var Scope = function Scope2(flags) {
  this.flags = flags
  this.var = []
  this.lexical = []
  this.functions = []
}
pp$3.enterScope = function (flags) {
  this.scopeStack.push(new Scope(flags))
}
pp$3.exitScope = function () {
  this.scopeStack.pop()
}
pp$3.treatFunctionsAsVarInScope = function (scope) {
  return (
    scope.flags & SCOPE_FUNCTION || (!this.inModule && scope.flags & SCOPE_TOP)
  )
}
pp$3.declareName = function (name, bindingType, pos) {
  var redeclared = false
  if (bindingType === BIND_LEXICAL) {
    var scope = this.currentScope()
    redeclared =
      scope.lexical.indexOf(name) > -1 ||
      scope.functions.indexOf(name) > -1 ||
      scope.var.indexOf(name) > -1
    scope.lexical.push(name)
    if (this.inModule && scope.flags & SCOPE_TOP) {
      delete this.undefinedExports[name]
    }
  } else if (bindingType === BIND_SIMPLE_CATCH) {
    var scope$1 = this.currentScope()
    scope$1.lexical.push(name)
  } else if (bindingType === BIND_FUNCTION) {
    var scope$2 = this.currentScope()
    if (this.treatFunctionsAsVar) {
      redeclared = scope$2.lexical.indexOf(name) > -1
    } else {
      redeclared =
        scope$2.lexical.indexOf(name) > -1 || scope$2.var.indexOf(name) > -1
    }
    scope$2.functions.push(name)
  } else {
    for (var i = this.scopeStack.length - 1; i >= 0; --i) {
      var scope$3 = this.scopeStack[i]
      if (
        (scope$3.lexical.indexOf(name) > -1 &&
          !(
            scope$3.flags & SCOPE_SIMPLE_CATCH && scope$3.lexical[0] === name
          )) ||
        (!this.treatFunctionsAsVarInScope(scope$3) &&
          scope$3.functions.indexOf(name) > -1)
      ) {
        redeclared = true
        break
      }
      scope$3.var.push(name)
      if (this.inModule && scope$3.flags & SCOPE_TOP) {
        delete this.undefinedExports[name]
      }
      if (scope$3.flags & SCOPE_VAR) {
        break
      }
    }
  }
  if (redeclared) {
    this.raiseRecoverable(
      pos,
      "Identifier '" + name + "' has already been declared"
    )
  }
}
pp$3.checkLocalExport = function (id) {
  if (
    this.scopeStack[0].lexical.indexOf(id.name) === -1 &&
    this.scopeStack[0].var.indexOf(id.name) === -1
  ) {
    this.undefinedExports[id.name] = id
  }
}
pp$3.currentScope = function () {
  return this.scopeStack[this.scopeStack.length - 1]
}
pp$3.currentVarScope = function () {
  for (var i = this.scopeStack.length - 1; ; i--) {
    var scope = this.scopeStack[i]
    if (
      scope.flags &
      (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK)
    ) {
      return scope
    }
  }
}
pp$3.currentThisScope = function () {
  for (var i = this.scopeStack.length - 1; ; i--) {
    var scope = this.scopeStack[i]
    if (
      scope.flags &
        (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK) &&
      !(scope.flags & SCOPE_ARROW)
    ) {
      return scope
    }
  }
}
var Node = function Node2(parser, pos, loc) {
  this.type = ''
  this.start = pos
  this.end = 0
  if (parser.options.locations) {
    this.loc = new SourceLocation(parser, loc)
  }
  if (parser.options.directSourceFile) {
    this.sourceFile = parser.options.directSourceFile
  }
  if (parser.options.ranges) {
    this.range = [pos, 0]
  }
}
var pp$2 = Parser.prototype
pp$2.startNode = function () {
  return new Node(this, this.start, this.startLoc)
}
pp$2.startNodeAt = function (pos, loc) {
  return new Node(this, pos, loc)
}
function finishNodeAt(node, type, pos, loc) {
  node.type = type
  node.end = pos
  if (this.options.locations) {
    node.loc.end = loc
  }
  if (this.options.ranges) {
    node.range[1] = pos
  }
  return node
}
pp$2.finishNode = function (node, type) {
  return finishNodeAt.call(
    this,
    node,
    type,
    this.lastTokEnd,
    this.lastTokEndLoc
  )
}
pp$2.finishNodeAt = function (node, type, pos, loc) {
  return finishNodeAt.call(this, node, type, pos, loc)
}
pp$2.copyNode = function (node) {
  var newNode = new Node(this, node.start, this.startLoc)
  for (var prop in node) {
    newNode[prop] = node[prop]
  }
  return newNode
}
var scriptValuesAddedInUnicode =
  'Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sunu Sunuwar Todhri Todr Tulu_Tigalari Tutg Unknown Zzzz'
var ecma9BinaryProperties =
  'ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS'
var ecma10BinaryProperties = ecma9BinaryProperties + ' Extended_Pictographic'
var ecma11BinaryProperties = ecma10BinaryProperties
var ecma12BinaryProperties =
  ecma11BinaryProperties + ' EBase EComp EMod EPres ExtPict'
var ecma13BinaryProperties = ecma12BinaryProperties
var ecma14BinaryProperties = ecma13BinaryProperties
var unicodeBinaryProperties = {
  9: ecma9BinaryProperties,
  10: ecma10BinaryProperties,
  11: ecma11BinaryProperties,
  12: ecma12BinaryProperties,
  13: ecma13BinaryProperties,
  14: ecma14BinaryProperties,
}
var ecma14BinaryPropertiesOfStrings =
  'Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji'
var unicodeBinaryPropertiesOfStrings = {
  9: '',
  10: '',
  11: '',
  12: '',
  13: '',
  14: ecma14BinaryPropertiesOfStrings,
}
var unicodeGeneralCategoryValues =
  'Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu'
var ecma9ScriptValues =
  'Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb'
var ecma10ScriptValues =
  ecma9ScriptValues +
  ' Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd'
var ecma11ScriptValues =
  ecma10ScriptValues +
  ' Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho'
var ecma12ScriptValues =
  ecma11ScriptValues +
  ' Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi'
var ecma13ScriptValues =
  ecma12ScriptValues +
  ' Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith'
var ecma14ScriptValues = ecma13ScriptValues + ' ' + scriptValuesAddedInUnicode
var unicodeScriptValues = {
  9: ecma9ScriptValues,
  10: ecma10ScriptValues,
  11: ecma11ScriptValues,
  12: ecma12ScriptValues,
  13: ecma13ScriptValues,
  14: ecma14ScriptValues,
}
var data = {}
function buildUnicodeData(ecmaVersion) {
  var d = (data[ecmaVersion] = {
    binary: wordsRegexp(
      unicodeBinaryProperties[ecmaVersion] + ' ' + unicodeGeneralCategoryValues
    ),
    binaryOfStrings: wordsRegexp(unicodeBinaryPropertiesOfStrings[ecmaVersion]),
    nonBinary: {
      General_Category: wordsRegexp(unicodeGeneralCategoryValues),
      Script: wordsRegexp(unicodeScriptValues[ecmaVersion]),
    },
  })
  d.nonBinary.Script_Extensions = d.nonBinary.Script
  d.nonBinary.gc = d.nonBinary.General_Category
  d.nonBinary.sc = d.nonBinary.Script
  d.nonBinary.scx = d.nonBinary.Script_Extensions
}
for (i = 0, list = [9, 10, 11, 12, 13, 14]; i < list.length; i += 1) {
  ecmaVersion = list[i]
  buildUnicodeData(ecmaVersion)
}
var ecmaVersion
var i
var list
var pp$1 = Parser.prototype
var BranchID = function BranchID2(parent, base) {
  this.parent = parent
  this.base = base || this
}
BranchID.prototype.separatedFrom = function separatedFrom(alt) {
  for (var self = this; self; self = self.parent) {
    for (var other = alt; other; other = other.parent) {
      if (self.base === other.base && self !== other) {
        return true
      }
    }
  }
  return false
}
BranchID.prototype.sibling = function sibling() {
  return new BranchID(this.parent, this.base)
}
var RegExpValidationState = function RegExpValidationState2(parser) {
  this.parser = parser
  this.validFlags =
    'gim' +
    (parser.options.ecmaVersion >= 6 ? 'uy' : '') +
    (parser.options.ecmaVersion >= 9 ? 's' : '') +
    (parser.options.ecmaVersion >= 13 ? 'd' : '') +
    (parser.options.ecmaVersion >= 15 ? 'v' : '')
  this.unicodeProperties =
    data[parser.options.ecmaVersion >= 14 ? 14 : parser.options.ecmaVersion]
  this.source = ''
  this.flags = ''
  this.start = 0
  this.switchU = false
  this.switchV = false
  this.switchN = false
  this.pos = 0
  this.lastIntValue = 0
  this.lastStringValue = ''
  this.lastAssertionIsQuantifiable = false
  this.numCapturingParens = 0
  this.maxBackReference = 0
  this.groupNames = Object.create(null)
  this.backReferenceNames = []
  this.branchID = null
}
RegExpValidationState.prototype.reset = function reset(start, pattern, flags) {
  var unicodeSets = flags.indexOf('v') !== -1
  var unicode = flags.indexOf('u') !== -1
  this.start = start | 0
  this.source = pattern + ''
  this.flags = flags
  if (unicodeSets && this.parser.options.ecmaVersion >= 15) {
    this.switchU = true
    this.switchV = true
    this.switchN = true
  } else {
    this.switchU = unicode && this.parser.options.ecmaVersion >= 6
    this.switchV = false
    this.switchN = unicode && this.parser.options.ecmaVersion >= 9
  }
}
RegExpValidationState.prototype.raise = function raise(message) {
  this.parser.raiseRecoverable(
    this.start,
    'Invalid regular expression: /' + this.source + '/: ' + message
  )
}
RegExpValidationState.prototype.at = function at(i2, forceU) {
  if (forceU === undefined) forceU = false
  var s = this.source
  var l = s.length
  if (i2 >= l) {
    return -1
  }
  var c = s.charCodeAt(i2)
  if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i2 + 1 >= l) {
    return c
  }
  var next = s.charCodeAt(i2 + 1)
  return next >= 56320 && next <= 57343 ? (c << 10) + next - 56613888 : c
}
RegExpValidationState.prototype.nextIndex = function nextIndex(i2, forceU) {
  if (forceU === undefined) forceU = false
  var s = this.source
  var l = s.length
  if (i2 >= l) {
    return l
  }
  var c = s.charCodeAt(i2),
    next
  if (
    !(forceU || this.switchU) ||
    c <= 55295 ||
    c >= 57344 ||
    i2 + 1 >= l ||
    (next = s.charCodeAt(i2 + 1)) < 56320 ||
    next > 57343
  ) {
    return i2 + 1
  }
  return i2 + 2
}
RegExpValidationState.prototype.current = function current(forceU) {
  if (forceU === undefined) forceU = false
  return this.at(this.pos, forceU)
}
RegExpValidationState.prototype.lookahead = function lookahead(forceU) {
  if (forceU === undefined) forceU = false
  return this.at(this.nextIndex(this.pos, forceU), forceU)
}
RegExpValidationState.prototype.advance = function advance(forceU) {
  if (forceU === undefined) forceU = false
  this.pos = this.nextIndex(this.pos, forceU)
}
RegExpValidationState.prototype.eat = function eat(ch, forceU) {
  if (forceU === undefined) forceU = false
  if (this.current(forceU) === ch) {
    this.advance(forceU)
    return true
  }
  return false
}
RegExpValidationState.prototype.eatChars = function eatChars(chs, forceU) {
  if (forceU === undefined) forceU = false
  var pos = this.pos
  for (var i2 = 0, list2 = chs; i2 < list2.length; i2 += 1) {
    var ch = list2[i2]
    var current2 = this.at(pos, forceU)
    if (current2 === -1 || current2 !== ch) {
      return false
    }
    pos = this.nextIndex(pos, forceU)
  }
  this.pos = pos
  return true
}
pp$1.validateRegExpFlags = function (state) {
  var validFlags = state.validFlags
  var flags = state.flags
  var u = false
  var v = false
  for (var i2 = 0; i2 < flags.length; i2++) {
    var flag = flags.charAt(i2)
    if (validFlags.indexOf(flag) === -1) {
      this.raise(state.start, 'Invalid regular expression flag')
    }
    if (flags.indexOf(flag, i2 + 1) > -1) {
      this.raise(state.start, 'Duplicate regular expression flag')
    }
    if (flag === 'u') {
      u = true
    }
    if (flag === 'v') {
      v = true
    }
  }
  if (this.options.ecmaVersion >= 15 && u && v) {
    this.raise(state.start, 'Invalid regular expression flag')
  }
}
function hasProp(obj) {
  for (var _ in obj) {
    return true
  }
  return false
}
pp$1.validateRegExpPattern = function (state) {
  this.regexp_pattern(state)
  if (
    !state.switchN &&
    this.options.ecmaVersion >= 9 &&
    hasProp(state.groupNames)
  ) {
    state.switchN = true
    this.regexp_pattern(state)
  }
}
pp$1.regexp_pattern = function (state) {
  state.pos = 0
  state.lastIntValue = 0
  state.lastStringValue = ''
  state.lastAssertionIsQuantifiable = false
  state.numCapturingParens = 0
  state.maxBackReference = 0
  state.groupNames = Object.create(null)
  state.backReferenceNames.length = 0
  state.branchID = null
  this.regexp_disjunction(state)
  if (state.pos !== state.source.length) {
    if (state.eat(41)) {
      state.raise("Unmatched ')'")
    }
    if (state.eat(93) || state.eat(125)) {
      state.raise('Lone quantifier brackets')
    }
  }
  if (state.maxBackReference > state.numCapturingParens) {
    state.raise('Invalid escape')
  }
  for (
    var i2 = 0, list2 = state.backReferenceNames;
    i2 < list2.length;
    i2 += 1
  ) {
    var name = list2[i2]
    if (!state.groupNames[name]) {
      state.raise('Invalid named capture referenced')
    }
  }
}
pp$1.regexp_disjunction = function (state) {
  var trackDisjunction = this.options.ecmaVersion >= 16
  if (trackDisjunction) {
    state.branchID = new BranchID(state.branchID, null)
  }
  this.regexp_alternative(state)
  while (state.eat(124)) {
    if (trackDisjunction) {
      state.branchID = state.branchID.sibling()
    }
    this.regexp_alternative(state)
  }
  if (trackDisjunction) {
    state.branchID = state.branchID.parent
  }
  if (this.regexp_eatQuantifier(state, true)) {
    state.raise('Nothing to repeat')
  }
  if (state.eat(123)) {
    state.raise('Lone quantifier brackets')
  }
}
pp$1.regexp_alternative = function (state) {
  while (state.pos < state.source.length && this.regexp_eatTerm(state)) {}
}
pp$1.regexp_eatTerm = function (state) {
  if (this.regexp_eatAssertion(state)) {
    if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
      if (state.switchU) {
        state.raise('Invalid quantifier')
      }
    }
    return true
  }
  if (
    state.switchU
      ? this.regexp_eatAtom(state)
      : this.regexp_eatExtendedAtom(state)
  ) {
    this.regexp_eatQuantifier(state)
    return true
  }
  return false
}
pp$1.regexp_eatAssertion = function (state) {
  var start = state.pos
  state.lastAssertionIsQuantifiable = false
  if (state.eat(94) || state.eat(36)) {
    return true
  }
  if (state.eat(92)) {
    if (state.eat(66) || state.eat(98)) {
      return true
    }
    state.pos = start
  }
  if (state.eat(40) && state.eat(63)) {
    var lookbehind = false
    if (this.options.ecmaVersion >= 9) {
      lookbehind = state.eat(60)
    }
    if (state.eat(61) || state.eat(33)) {
      this.regexp_disjunction(state)
      if (!state.eat(41)) {
        state.raise('Unterminated group')
      }
      state.lastAssertionIsQuantifiable = !lookbehind
      return true
    }
  }
  state.pos = start
  return false
}
pp$1.regexp_eatQuantifier = function (state, noError) {
  if (noError === undefined) noError = false
  if (this.regexp_eatQuantifierPrefix(state, noError)) {
    state.eat(63)
    return true
  }
  return false
}
pp$1.regexp_eatQuantifierPrefix = function (state, noError) {
  return (
    state.eat(42) ||
    state.eat(43) ||
    state.eat(63) ||
    this.regexp_eatBracedQuantifier(state, noError)
  )
}
pp$1.regexp_eatBracedQuantifier = function (state, noError) {
  var start = state.pos
  if (state.eat(123)) {
    var min = 0,
      max = -1
    if (this.regexp_eatDecimalDigits(state)) {
      min = state.lastIntValue
      if (state.eat(44) && this.regexp_eatDecimalDigits(state)) {
        max = state.lastIntValue
      }
      if (state.eat(125)) {
        if (max !== -1 && max < min && !noError) {
          state.raise('numbers out of order in {} quantifier')
        }
        return true
      }
    }
    if (state.switchU && !noError) {
      state.raise('Incomplete quantifier')
    }
    state.pos = start
  }
  return false
}
pp$1.regexp_eatAtom = function (state) {
  return (
    this.regexp_eatPatternCharacters(state) ||
    state.eat(46) ||
    this.regexp_eatReverseSolidusAtomEscape(state) ||
    this.regexp_eatCharacterClass(state) ||
    this.regexp_eatUncapturingGroup(state) ||
    this.regexp_eatCapturingGroup(state)
  )
}
pp$1.regexp_eatReverseSolidusAtomEscape = function (state) {
  var start = state.pos
  if (state.eat(92)) {
    if (this.regexp_eatAtomEscape(state)) {
      return true
    }
    state.pos = start
  }
  return false
}
pp$1.regexp_eatUncapturingGroup = function (state) {
  var start = state.pos
  if (state.eat(40)) {
    if (state.eat(63)) {
      if (this.options.ecmaVersion >= 16) {
        var addModifiers = this.regexp_eatModifiers(state)
        var hasHyphen = state.eat(45)
        if (addModifiers || hasHyphen) {
          for (var i2 = 0; i2 < addModifiers.length; i2++) {
            var modifier = addModifiers.charAt(i2)
            if (addModifiers.indexOf(modifier, i2 + 1) > -1) {
              state.raise('Duplicate regular expression modifiers')
            }
          }
          if (hasHyphen) {
            var removeModifiers = this.regexp_eatModifiers(state)
            if (!addModifiers && !removeModifiers && state.current() === 58) {
              state.raise('Invalid regular expression modifiers')
            }
            for (var i$1 = 0; i$1 < removeModifiers.length; i$1++) {
              var modifier$1 = removeModifiers.charAt(i$1)
              if (
                removeModifiers.indexOf(modifier$1, i$1 + 1) > -1 ||
                addModifiers.indexOf(modifier$1) > -1
              ) {
                state.raise('Duplicate regular expression modifiers')
              }
            }
          }
        }
      }
      if (state.eat(58)) {
        this.regexp_disjunction(state)
        if (state.eat(41)) {
          return true
        }
        state.raise('Unterminated group')
      }
    }
    state.pos = start
  }
  return false
}
pp$1.regexp_eatCapturingGroup = function (state) {
  if (state.eat(40)) {
    if (this.options.ecmaVersion >= 9) {
      this.regexp_groupSpecifier(state)
    } else if (state.current() === 63) {
      state.raise('Invalid group')
    }
    this.regexp_disjunction(state)
    if (state.eat(41)) {
      state.numCapturingParens += 1
      return true
    }
    state.raise('Unterminated group')
  }
  return false
}
pp$1.regexp_eatModifiers = function (state) {
  var modifiers = ''
  var ch = 0
  while ((ch = state.current()) !== -1 && isRegularExpressionModifier(ch)) {
    modifiers += codePointToString(ch)
    state.advance()
  }
  return modifiers
}
function isRegularExpressionModifier(ch) {
  return ch === 105 || ch === 109 || ch === 115
}
pp$1.regexp_eatExtendedAtom = function (state) {
  return (
    state.eat(46) ||
    this.regexp_eatReverseSolidusAtomEscape(state) ||
    this.regexp_eatCharacterClass(state) ||
    this.regexp_eatUncapturingGroup(state) ||
    this.regexp_eatCapturingGroup(state) ||
    this.regexp_eatInvalidBracedQuantifier(state) ||
    this.regexp_eatExtendedPatternCharacter(state)
  )
}
pp$1.regexp_eatInvalidBracedQuantifier = function (state) {
  if (this.regexp_eatBracedQuantifier(state, true)) {
    state.raise('Nothing to repeat')
  }
  return false
}
pp$1.regexp_eatSyntaxCharacter = function (state) {
  var ch = state.current()
  if (isSyntaxCharacter(ch)) {
    state.lastIntValue = ch
    state.advance()
    return true
  }
  return false
}
function isSyntaxCharacter(ch) {
  return (
    ch === 36 ||
    (ch >= 40 && ch <= 43) ||
    ch === 46 ||
    ch === 63 ||
    (ch >= 91 && ch <= 94) ||
    (ch >= 123 && ch <= 125)
  )
}
pp$1.regexp_eatPatternCharacters = function (state) {
  var start = state.pos
  var ch = 0
  while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) {
    state.advance()
  }
  return state.pos !== start
}
pp$1.regexp_eatExtendedPatternCharacter = function (state) {
  var ch = state.current()
  if (
    ch !== -1 &&
    ch !== 36 &&
    !(ch >= 40 && ch <= 43) &&
    ch !== 46 &&
    ch !== 63 &&
    ch !== 91 &&
    ch !== 94 &&
    ch !== 124
  ) {
    state.advance()
    return true
  }
  return false
}
pp$1.regexp_groupSpecifier = function (state) {
  if (state.eat(63)) {
    if (!this.regexp_eatGroupName(state)) {
      state.raise('Invalid group')
    }
    var trackDisjunction = this.options.ecmaVersion >= 16
    var known = state.groupNames[state.lastStringValue]
    if (known) {
      if (trackDisjunction) {
        for (var i2 = 0, list2 = known; i2 < list2.length; i2 += 1) {
          var altID = list2[i2]
          if (!altID.separatedFrom(state.branchID)) {
            state.raise('Duplicate capture group name')
          }
        }
      } else {
        state.raise('Duplicate capture group name')
      }
    }
    if (trackDisjunction) {
      ;(known || (state.groupNames[state.lastStringValue] = [])).push(
        state.branchID
      )
    } else {
      state.groupNames[state.lastStringValue] = true
    }
  }
}
pp$1.regexp_eatGroupName = function (state) {
  state.lastStringValue = ''
  if (state.eat(60)) {
    if (this.regexp_eatRegExpIdentifierName(state) && state.eat(62)) {
      return true
    }
    state.raise('Invalid capture group name')
  }
  return false
}
pp$1.regexp_eatRegExpIdentifierName = function (state) {
  state.lastStringValue = ''
  if (this.regexp_eatRegExpIdentifierStart(state)) {
    state.lastStringValue += codePointToString(state.lastIntValue)
    while (this.regexp_eatRegExpIdentifierPart(state)) {
      state.lastStringValue += codePointToString(state.lastIntValue)
    }
    return true
  }
  return false
}
pp$1.regexp_eatRegExpIdentifierStart = function (state) {
  var start = state.pos
  var forceU = this.options.ecmaVersion >= 11
  var ch = state.current(forceU)
  state.advance(forceU)
  if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
    ch = state.lastIntValue
  }
  if (isRegExpIdentifierStart(ch)) {
    state.lastIntValue = ch
    return true
  }
  state.pos = start
  return false
}
function isRegExpIdentifierStart(ch) {
  return isIdentifierStart(ch, true) || ch === 36 || ch === 95
}
pp$1.regexp_eatRegExpIdentifierPart = function (state) {
  var start = state.pos
  var forceU = this.options.ecmaVersion >= 11
  var ch = state.current(forceU)
  state.advance(forceU)
  if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
    ch = state.lastIntValue
  }
  if (isRegExpIdentifierPart(ch)) {
    state.lastIntValue = ch
    return true
  }
  state.pos = start
  return false
}
function isRegExpIdentifierPart(ch) {
  return (
    isIdentifierChar(ch, true) ||
    ch === 36 ||
    ch === 95 ||
    ch === 8204 ||
    ch === 8205
  )
}
pp$1.regexp_eatAtomEscape = function (state) {
  if (
    this.regexp_eatBackReference(state) ||
    this.regexp_eatCharacterClassEscape(state) ||
    this.regexp_eatCharacterEscape(state) ||
    (state.switchN && this.regexp_eatKGroupName(state))
  ) {
    return true
  }
  if (state.switchU) {
    if (state.current() === 99) {
      state.raise('Invalid unicode escape')
    }
    state.raise('Invalid escape')
  }
  return false
}
pp$1.regexp_eatBackReference = function (state) {
  var start = state.pos
  if (this.regexp_eatDecimalEscape(state)) {
    var n = state.lastIntValue
    if (state.switchU) {
      if (n > state.maxBackReference) {
        state.maxBackReference = n
      }
      return true
    }
    if (n <= state.numCapturingParens) {
      return true
    }
    state.pos = start
  }
  return false
}
pp$1.regexp_eatKGroupName = function (state) {
  if (state.eat(107)) {
    if (this.regexp_eatGroupName(state)) {
      state.backReferenceNames.push(state.lastStringValue)
      return true
    }
    state.raise('Invalid named reference')
  }
  return false
}
pp$1.regexp_eatCharacterEscape = function (state) {
  return (
    this.regexp_eatControlEscape(state) ||
    this.regexp_eatCControlLetter(state) ||
    this.regexp_eatZero(state) ||
    this.regexp_eatHexEscapeSequence(state) ||
    this.regexp_eatRegExpUnicodeEscapeSequence(state, false) ||
    (!state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state)) ||
    this.regexp_eatIdentityEscape(state)
  )
}
pp$1.regexp_eatCControlLetter = function (state) {
  var start = state.pos
  if (state.eat(99)) {
    if (this.regexp_eatControlLetter(state)) {
      return true
    }
    state.pos = start
  }
  return false
}
pp$1.regexp_eatZero = function (state) {
  if (state.current() === 48 && !isDecimalDigit(state.lookahead())) {
    state.lastIntValue = 0
    state.advance()
    return true
  }
  return false
}
pp$1.regexp_eatControlEscape = function (state) {
  var ch = state.current()
  if (ch === 116) {
    state.lastIntValue = 9
    state.advance()
    return true
  }
  if (ch === 110) {
    state.lastIntValue = 10
    state.advance()
    return true
  }
  if (ch === 118) {
    state.lastIntValue = 11
    state.advance()
    return true
  }
  if (ch === 102) {
    state.lastIntValue = 12
    state.advance()
    return true
  }
  if (ch === 114) {
    state.lastIntValue = 13
    state.advance()
    return true
  }
  return false
}
pp$1.regexp_eatControlLetter = function (state) {
  var ch = state.current()
  if (isControlLetter(ch)) {
    state.lastIntValue = ch % 32
    state.advance()
    return true
  }
  return false
}
function isControlLetter(ch) {
  return (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122)
}
pp$1.regexp_eatRegExpUnicodeEscapeSequence = function (state, forceU) {
  if (forceU === undefined) forceU = false
  var start = state.pos
  var switchU = forceU || state.switchU
  if (state.eat(117)) {
    if (this.regexp_eatFixedHexDigits(state, 4)) {
      var lead = state.lastIntValue
      if (switchU && lead >= 55296 && lead <= 56319) {
        var leadSurrogateEnd = state.pos
        if (
          state.eat(92) &&
          state.eat(117) &&
          this.regexp_eatFixedHexDigits(state, 4)
        ) {
          var trail = state.lastIntValue
          if (trail >= 56320 && trail <= 57343) {
            state.lastIntValue = (lead - 55296) * 1024 + (trail - 56320) + 65536
            return true
          }
        }
        state.pos = leadSurrogateEnd
        state.lastIntValue = lead
      }
      return true
    }
    if (
      switchU &&
      state.eat(123) &&
      this.regexp_eatHexDigits(state) &&
      state.eat(125) &&
      isValidUnicode(state.lastIntValue)
    ) {
      return true
    }
    if (switchU) {
      state.raise('Invalid unicode escape')
    }
    state.pos = start
  }
  return false
}
function isValidUnicode(ch) {
  return ch >= 0 && ch <= 1114111
}
pp$1.regexp_eatIdentityEscape = function (state) {
  if (state.switchU) {
    if (this.regexp_eatSyntaxCharacter(state)) {
      return true
    }
    if (state.eat(47)) {
      state.lastIntValue = 47
      return true
    }
    return false
  }
  var ch = state.current()
  if (ch !== 99 && (!state.switchN || ch !== 107)) {
    state.lastIntValue = ch
    state.advance()
    return true
  }
  return false
}
pp$1.regexp_eatDecimalEscape = function (state) {
  state.lastIntValue = 0
  var ch = state.current()
  if (ch >= 49 && ch <= 57) {
    do {
      state.lastIntValue = 10 * state.lastIntValue + (ch - 48)
      state.advance()
    } while ((ch = state.current()) >= 48 && ch <= 57)
    return true
  }
  return false
}
var CharSetNone = 0
var CharSetOk = 1
var CharSetString = 2
pp$1.regexp_eatCharacterClassEscape = function (state) {
  var ch = state.current()
  if (isCharacterClassEscape(ch)) {
    state.lastIntValue = -1
    state.advance()
    return CharSetOk
  }
  var negate = false
  if (
    state.switchU &&
    this.options.ecmaVersion >= 9 &&
    ((negate = ch === 80) || ch === 112)
  ) {
    state.lastIntValue = -1
    state.advance()
    var result
    if (
      state.eat(123) &&
      (result = this.regexp_eatUnicodePropertyValueExpression(state)) &&
      state.eat(125)
    ) {
      if (negate && result === CharSetString) {
        state.raise('Invalid property name')
      }
      return result
    }
    state.raise('Invalid property name')
  }
  return CharSetNone
}
function isCharacterClassEscape(ch) {
  return (
    ch === 100 ||
    ch === 68 ||
    ch === 115 ||
    ch === 83 ||
    ch === 119 ||
    ch === 87
  )
}
pp$1.regexp_eatUnicodePropertyValueExpression = function (state) {
  var start = state.pos
  if (this.regexp_eatUnicodePropertyName(state) && state.eat(61)) {
    var name = state.lastStringValue
    if (this.regexp_eatUnicodePropertyValue(state)) {
      var value = state.lastStringValue
      this.regexp_validateUnicodePropertyNameAndValue(state, name, value)
      return CharSetOk
    }
  }
  state.pos = start
  if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
    var nameOrValue = state.lastStringValue
    return this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue)
  }
  return CharSetNone
}
pp$1.regexp_validateUnicodePropertyNameAndValue = function (
  state,
  name,
  value
) {
  if (!hasOwn(state.unicodeProperties.nonBinary, name)) {
    state.raise('Invalid property name')
  }
  if (!state.unicodeProperties.nonBinary[name].test(value)) {
    state.raise('Invalid property value')
  }
}
pp$1.regexp_validateUnicodePropertyNameOrValue = function (state, nameOrValue) {
  if (state.unicodeProperties.binary.test(nameOrValue)) {
    return CharSetOk
  }
  if (
    state.switchV &&
    state.unicodeProperties.binaryOfStrings.test(nameOrValue)
  ) {
    return CharSetString
  }
  state.raise('Invalid property name')
}
pp$1.regexp_eatUnicodePropertyName = function (state) {
  var ch = 0
  state.lastStringValue = ''
  while (isUnicodePropertyNameCharacter((ch = state.current()))) {
    state.lastStringValue += codePointToString(ch)
    state.advance()
  }
  return state.lastStringValue !== ''
}
function isUnicodePropertyNameCharacter(ch) {
  return isControlLetter(ch) || ch === 95
}
pp$1.regexp_eatUnicodePropertyValue = function (state) {
  var ch = 0
  state.lastStringValue = ''
  while (isUnicodePropertyValueCharacter((ch = state.current()))) {
    state.lastStringValue += codePointToString(ch)
    state.advance()
  }
  return state.lastStringValue !== ''
}
function isUnicodePropertyValueCharacter(ch) {
  return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch)
}
pp$1.regexp_eatLoneUnicodePropertyNameOrValue = function (state) {
  return this.regexp_eatUnicodePropertyValue(state)
}
pp$1.regexp_eatCharacterClass = function (state) {
  if (state.eat(91)) {
    var negate = state.eat(94)
    var result = this.regexp_classContents(state)
    if (!state.eat(93)) {
      state.raise('Unterminated character class')
    }
    if (negate && result === CharSetString) {
      state.raise('Negated character class may contain strings')
    }
    return true
  }
  return false
}
pp$1.regexp_classContents = function (state) {
  if (state.current() === 93) {
    return CharSetOk
  }
  if (state.switchV) {
    return this.regexp_classSetExpression(state)
  }
  this.regexp_nonEmptyClassRanges(state)
  return CharSetOk
}
pp$1.regexp_nonEmptyClassRanges = function (state) {
  while (this.regexp_eatClassAtom(state)) {
    var left = state.lastIntValue
    if (state.eat(45) && this.regexp_eatClassAtom(state)) {
      var right = state.lastIntValue
      if (state.switchU && (left === -1 || right === -1)) {
        state.raise('Invalid character class')
      }
      if (left !== -1 && right !== -1 && left > right) {
        state.raise('Range out of order in character class')
      }
    }
  }
}
pp$1.regexp_eatClassAtom = function (state) {
  var start = state.pos
  if (state.eat(92)) {
    if (this.regexp_eatClassEscape(state)) {
      return true
    }
    if (state.switchU) {
      var ch$1 = state.current()
      if (ch$1 === 99 || isOctalDigit(ch$1)) {
        state.raise('Invalid class escape')
      }
      state.raise('Invalid escape')
    }
    state.pos = start
  }
  var ch = state.current()
  if (ch !== 93) {
    state.lastIntValue = ch
    state.advance()
    return true
  }
  return false
}
pp$1.regexp_eatClassEscape = function (state) {
  var start = state.pos
  if (state.eat(98)) {
    state.lastIntValue = 8
    return true
  }
  if (state.switchU && state.eat(45)) {
    state.lastIntValue = 45
    return true
  }
  if (!state.switchU && state.eat(99)) {
    if (this.regexp_eatClassControlLetter(state)) {
      return true
    }
    state.pos = start
  }
  return (
    this.regexp_eatCharacterClassEscape(state) ||
    this.regexp_eatCharacterEscape(state)
  )
}
pp$1.regexp_classSetExpression = function (state) {
  var result = CharSetOk,
    subResult
  if (this.regexp_eatClassSetRange(state));
  else if ((subResult = this.regexp_eatClassSetOperand(state))) {
    if (subResult === CharSetString) {
      result = CharSetString
    }
    var start = state.pos
    while (state.eatChars([38, 38])) {
      if (
        state.current() !== 38 &&
        (subResult = this.regexp_eatClassSetOperand(state))
      ) {
        if (subResult !== CharSetString) {
          result = CharSetOk
        }
        continue
      }
      state.raise('Invalid character in character class')
    }
    if (start !== state.pos) {
      return result
    }
    while (state.eatChars([45, 45])) {
      if (this.regexp_eatClassSetOperand(state)) {
        continue
      }
      state.raise('Invalid character in character class')
    }
    if (start !== state.pos) {
      return result
    }
  } else {
    state.raise('Invalid character in character class')
  }
  for (;;) {
    if (this.regexp_eatClassSetRange(state)) {
      continue
    }
    subResult = this.regexp_eatClassSetOperand(state)
    if (!subResult) {
      return result
    }
    if (subResult === CharSetString) {
      result = CharSetString
    }
  }
}
pp$1.regexp_eatClassSetRange = function (state) {
  var start = state.pos
  if (this.regexp_eatClassSetCharacter(state)) {
    var left = state.lastIntValue
    if (state.eat(45) && this.regexp_eatClassSetCharacter(state)) {
      var right = state.lastIntValue
      if (left !== -1 && right !== -1 && left > right) {
        state.raise('Range out of order in character class')
      }
      return true
    }
    state.pos = start
  }
  return false
}
pp$1.regexp_eatClassSetOperand = function (state) {
  if (this.regexp_eatClassSetCharacter(state)) {
    return CharSetOk
  }
  return (
    this.regexp_eatClassStringDisjunction(state) ||
    this.regexp_eatNestedClass(state)
  )
}
pp$1.regexp_eatNestedClass = function (state) {
  var start = state.pos
  if (state.eat(91)) {
    var negate = state.eat(94)
    var result = this.regexp_classContents(state)
    if (state.eat(93)) {
      if (negate && result === CharSetString) {
        state.raise('Negated character class may contain strings')
      }
      return result
    }
    state.pos = start
  }
  if (state.eat(92)) {
    var result$1 = this.regexp_eatCharacterClassEscape(state)
    if (result$1) {
      return result$1
    }
    state.pos = start
  }
  return null
}
pp$1.regexp_eatClassStringDisjunction = function (state) {
  var start = state.pos
  if (state.eatChars([92, 113])) {
    if (state.eat(123)) {
      var result = this.regexp_classStringDisjunctionContents(state)
      if (state.eat(125)) {
        return result
      }
    } else {
      state.raise('Invalid escape')
    }
    state.pos = start
  }
  return null
}
pp$1.regexp_classStringDisjunctionContents = function (state) {
  var result = this.regexp_classString(state)
  while (state.eat(124)) {
    if (this.regexp_classString(state) === CharSetString) {
      result = CharSetString
    }
  }
  return result
}
pp$1.regexp_classString = function (state) {
  var count = 0
  while (this.regexp_eatClassSetCharacter(state)) {
    count++
  }
  return count === 1 ? CharSetOk : CharSetString
}
pp$1.regexp_eatClassSetCharacter = function (state) {
  var start = state.pos
  if (state.eat(92)) {
    if (
      this.regexp_eatCharacterEscape(state) ||
      this.regexp_eatClassSetReservedPunctuator(state)
    ) {
      return true
    }
    if (state.eat(98)) {
      state.lastIntValue = 8
      return true
    }
    state.pos = start
    return false
  }
  var ch = state.current()
  if (
    ch < 0 ||
    (ch === state.lookahead() &&
      isClassSetReservedDoublePunctuatorCharacter(ch))
  ) {
    return false
  }
  if (isClassSetSyntaxCharacter(ch)) {
    return false
  }
  state.advance()
  state.lastIntValue = ch
  return true
}
function isClassSetReservedDoublePunctuatorCharacter(ch) {
  return (
    ch === 33 ||
    (ch >= 35 && ch <= 38) ||
    (ch >= 42 && ch <= 44) ||
    ch === 46 ||
    (ch >= 58 && ch <= 64) ||
    ch === 94 ||
    ch === 96 ||
    ch === 126
  )
}
function isClassSetSyntaxCharacter(ch) {
  return (
    ch === 40 ||
    ch === 41 ||
    ch === 45 ||
    ch === 47 ||
    (ch >= 91 && ch <= 93) ||
    (ch >= 123 && ch <= 125)
  )
}
pp$1.regexp_eatClassSetReservedPunctuator = function (state) {
  var ch = state.current()
  if (isClassSetReservedPunctuator(ch)) {
    state.lastIntValue = ch
    state.advance()
    return true
  }
  return false
}
function isClassSetReservedPunctuator(ch) {
  return (
    ch === 33 ||
    ch === 35 ||
    ch === 37 ||
    ch === 38 ||
    ch === 44 ||
    ch === 45 ||
    (ch >= 58 && ch <= 62) ||
    ch === 64 ||
    ch === 96 ||
    ch === 126
  )
}
pp$1.regexp_eatClassControlLetter = function (state) {
  var ch = state.current()
  if (isDecimalDigit(ch) || ch === 95) {
    state.lastIntValue = ch % 32
    state.advance()
    return true
  }
  return false
}
pp$1.regexp_eatHexEscapeSequence = function (state) {
  var start = state.pos
  if (state.eat(120)) {
    if (this.regexp_eatFixedHexDigits(state, 2)) {
      return true
    }
    if (state.switchU) {
      state.raise('Invalid escape')
    }
    state.pos = start
  }
  return false
}
pp$1.regexp_eatDecimalDigits = function (state) {
  var start = state.pos
  var ch = 0
  state.lastIntValue = 0
  while (isDecimalDigit((ch = state.current()))) {
    state.lastIntValue = 10 * state.lastIntValue + (ch - 48)
    state.advance()
  }
  return state.pos !== start
}
function isDecimalDigit(ch) {
  return ch >= 48 && ch <= 57
}
pp$1.regexp_eatHexDigits = function (state) {
  var start = state.pos
  var ch = 0
  state.lastIntValue = 0
  while (isHexDigit((ch = state.current()))) {
    state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch)
    state.advance()
  }
  return state.pos !== start
}
function isHexDigit(ch) {
  return (
    (ch >= 48 && ch <= 57) || (ch >= 65 && ch <= 70) || (ch >= 97 && ch <= 102)
  )
}
function hexToInt(ch) {
  if (ch >= 65 && ch <= 70) {
    return 10 + (ch - 65)
  }
  if (ch >= 97 && ch <= 102) {
    return 10 + (ch - 97)
  }
  return ch - 48
}
pp$1.regexp_eatLegacyOctalEscapeSequence = function (state) {
  if (this.regexp_eatOctalDigit(state)) {
    var n1 = state.lastIntValue
    if (this.regexp_eatOctalDigit(state)) {
      var n2 = state.lastIntValue
      if (n1 <= 3 && this.regexp_eatOctalDigit(state)) {
        state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue
      } else {
        state.lastIntValue = n1 * 8 + n2
      }
    } else {
      state.lastIntValue = n1
    }
    return true
  }
  return false
}
pp$1.regexp_eatOctalDigit = function (state) {
  var ch = state.current()
  if (isOctalDigit(ch)) {
    state.lastIntValue = ch - 48
    state.advance()
    return true
  }
  state.lastIntValue = 0
  return false
}
function isOctalDigit(ch) {
  return ch >= 48 && ch <= 55
}
pp$1.regexp_eatFixedHexDigits = function (state, length) {
  var start = state.pos
  state.lastIntValue = 0
  for (var i2 = 0; i2 < length; ++i2) {
    var ch = state.current()
    if (!isHexDigit(ch)) {
      state.pos = start
      return false
    }
    state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch)
    state.advance()
  }
  return true
}
var Token = function Token2(p) {
  this.type = p.type
  this.value = p.value
  this.start = p.start
  this.end = p.end
  if (p.options.locations) {
    this.loc = new SourceLocation(p, p.startLoc, p.endLoc)
  }
  if (p.options.ranges) {
    this.range = [p.start, p.end]
  }
}
var pp = Parser.prototype
pp.next = function (ignoreEscapeSequenceInKeyword) {
  if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc) {
    this.raiseRecoverable(
      this.start,
      'Escape sequence in keyword ' + this.type.keyword
    )
  }
  if (this.options.onToken) {
    this.options.onToken(new Token(this))
  }
  this.lastTokEnd = this.end
  this.lastTokStart = this.start
  this.lastTokEndLoc = this.endLoc
  this.lastTokStartLoc = this.startLoc
  this.nextToken()
}
pp.getToken = function () {
  this.next()
  return new Token(this)
}
if (typeof Symbol !== 'undefined') {
  pp[Symbol.iterator] = function () {
    var this$1$1 = this
    return {
      next: function () {
        var token = this$1$1.getToken()
        return {
          done: token.type === types$1.eof,
          value: token,
        }
      },
    }
  }
}
pp.nextToken = function () {
  var curContext = this.curContext()
  if (!curContext || !curContext.preserveSpace) {
    this.skipSpace()
  }
  this.start = this.pos
  if (this.options.locations) {
    this.startLoc = this.curPosition()
  }
  if (this.pos >= this.input.length) {
    return this.finishToken(types$1.eof)
  }
  if (curContext.override) {
    return curContext.override(this)
  } else {
    this.readToken(this.fullCharCodeAtPos())
  }
}
pp.readToken = function (code) {
  if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92) {
    return this.readWord()
  }
  return this.getTokenFromCode(code)
}
pp.fullCharCodeAtPos = function () {
  var code = this.input.charCodeAt(this.pos)
  if (code <= 55295 || code >= 56320) {
    return code
  }
  var next = this.input.charCodeAt(this.pos + 1)
  return next <= 56319 || next >= 57344 ? code : (code << 10) + next - 56613888
}
pp.skipBlockComment = function () {
  var startLoc = this.options.onComment && this.curPosition()
  var start = this.pos,
    end = this.input.indexOf('*/', (this.pos += 2))
  if (end === -1) {
    this.raise(this.pos - 2, 'Unterminated comment')
  }
  this.pos = end + 2
  if (this.options.locations) {
    for (
      var nextBreak = undefined, pos = start;
      (nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1;

    ) {
      ++this.curLine
      pos = this.lineStart = nextBreak
    }
  }
  if (this.options.onComment) {
    this.options.onComment(
      true,
      this.input.slice(start + 2, end),
      start,
      this.pos,
      startLoc,
      this.curPosition()
    )
  }
}
pp.skipLineComment = function (startSkip) {
  var start = this.pos
  var startLoc = this.options.onComment && this.curPosition()
  var ch = this.input.charCodeAt((this.pos += startSkip))
  while (this.pos < this.input.length && !isNewLine(ch)) {
    ch = this.input.charCodeAt(++this.pos)
  }
  if (this.options.onComment) {
    this.options.onComment(
      false,
      this.input.slice(start + startSkip, this.pos),
      start,
      this.pos,
      startLoc,
      this.curPosition()
    )
  }
}
pp.skipSpace = function () {
  loop: while (this.pos < this.input.length) {
    var ch = this.input.charCodeAt(this.pos)
    switch (ch) {
      case 32:
      case 160:
        ++this.pos
        break
      case 13:
        if (this.input.charCodeAt(this.pos + 1) === 10) {
          ++this.pos
        }
      case 10:
      case 8232:
      case 8233:
        ++this.pos
        if (this.options.locations) {
          ++this.curLine
          this.lineStart = this.pos
        }
        break
      case 47:
        switch (this.input.charCodeAt(this.pos + 1)) {
          case 42:
            this.skipBlockComment()
            break
          case 47:
            this.skipLineComment(2)
            break
          default:
            break loop
        }
        break
      default:
        if (
          (ch > 8 && ch < 14) ||
          (ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch)))
        ) {
          ++this.pos
        } else {
          break loop
        }
    }
  }
}
pp.finishToken = function (type, val) {
  this.end = this.pos
  if (this.options.locations) {
    this.endLoc = this.curPosition()
  }
  var prevType = this.type
  this.type = type
  this.value = val
  this.updateContext(prevType)
}
pp.readToken_dot = function () {
  var next = this.input.charCodeAt(this.pos + 1)
  if (next >= 48 && next <= 57) {
    return this.readNumber(true)
  }
  var next2 = this.input.charCodeAt(this.pos + 2)
  if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) {
    this.pos += 3
    return this.finishToken(types$1.ellipsis)
  } else {
    ++this.pos
    return this.finishToken(types$1.dot)
  }
}
pp.readToken_slash = function () {
  var next = this.input.charCodeAt(this.pos + 1)
  if (this.exprAllowed) {
    ++this.pos
    return this.readRegexp()
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2)
  }
  return this.finishOp(types$1.slash, 1)
}
pp.readToken_mult_modulo_exp = function (code) {
  var next = this.input.charCodeAt(this.pos + 1)
  var size = 1
  var tokentype = code === 42 ? types$1.star : types$1.modulo
  if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
    ++size
    tokentype = types$1.starstar
    next = this.input.charCodeAt(this.pos + 2)
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, size + 1)
  }
  return this.finishOp(tokentype, size)
}
pp.readToken_pipe_amp = function (code) {
  var next = this.input.charCodeAt(this.pos + 1)
  if (next === code) {
    if (this.options.ecmaVersion >= 12) {
      var next2 = this.input.charCodeAt(this.pos + 2)
      if (next2 === 61) {
        return this.finishOp(types$1.assign, 3)
      }
    }
    return this.finishOp(
      code === 124 ? types$1.logicalOR : types$1.logicalAND,
      2
    )
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2)
  }
  return this.finishOp(code === 124 ? types$1.bitwiseOR : types$1.bitwiseAND, 1)
}
pp.readToken_caret = function () {
  var next = this.input.charCodeAt(this.pos + 1)
  if (next === 61) {
    return this.finishOp(types$1.assign, 2)
  }
  return this.finishOp(types$1.bitwiseXOR, 1)
}
pp.readToken_plus_min = function (code) {
  var next = this.input.charCodeAt(this.pos + 1)
  if (next === code) {
    if (
      next === 45 &&
      !this.inModule &&
      this.input.charCodeAt(this.pos + 2) === 62 &&
      (this.lastTokEnd === 0 ||
        lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))
    ) {
      this.skipLineComment(3)
      this.skipSpace()
      return this.nextToken()
    }
    return this.finishOp(types$1.incDec, 2)
  }
  if (next === 61) {
    return this.finishOp(types$1.assign, 2)
  }
  return this.finishOp(types$1.plusMin, 1)
}
pp.readToken_lt_gt = function (code) {
  var next = this.input.charCodeAt(this.pos + 1)
  var size = 1
  if (next === code) {
    size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2
    if (this.input.charCodeAt(this.pos + size) === 61) {
      return this.finishOp(types$1.assign, size + 1)
    }
    return this.finishOp(types$1.bitShift, size)
  }
  if (
    next === 33 &&
    code === 60 &&
    !this.inModule &&
    this.input.charCodeAt(this.pos + 2) === 45 &&
    this.input.charCodeAt(this.pos + 3) === 45
  ) {
    this.skipLineComment(4)
    this.skipSpace()
    return this.nextToken()
  }
  if (next === 61) {
    size = 2
  }
  return this.finishOp(types$1.relational, size)
}
pp.readToken_eq_excl = function (code) {
  var next = this.input.charCodeAt(this.pos + 1)
  if (next === 61) {
    return this.finishOp(
      types$1.equality,
      this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2
    )
  }
  if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) {
    this.pos += 2
    return this.finishToken(types$1.arrow)
  }
  return this.finishOp(code === 61 ? types$1.eq : types$1.prefix, 1)
}
pp.readToken_question = function () {
  var ecmaVersion2 = this.options.ecmaVersion
  if (ecmaVersion2 >= 11) {
    var next = this.input.charCodeAt(this.pos + 1)
    if (next === 46) {
      var next2 = this.input.charCodeAt(this.pos + 2)
      if (next2 < 48 || next2 > 57) {
        return this.finishOp(types$1.questionDot, 2)
      }
    }
    if (next === 63) {
      if (ecmaVersion2 >= 12) {
        var next2$1 = this.input.charCodeAt(this.pos + 2)
        if (next2$1 === 61) {
          return this.finishOp(types$1.assign, 3)
        }
      }
      return this.finishOp(types$1.coalesce, 2)
    }
  }
  return this.finishOp(types$1.question, 1)
}
pp.readToken_numberSign = function () {
  var ecmaVersion2 = this.options.ecmaVersion
  var code = 35
  if (ecmaVersion2 >= 13) {
    ++this.pos
    code = this.fullCharCodeAtPos()
    if (isIdentifierStart(code, true) || code === 92) {
      return this.finishToken(types$1.privateId, this.readWord1())
    }
  }
  this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'")
}
pp.getTokenFromCode = function (code) {
  switch (code) {
    case 46:
      return this.readToken_dot()
    case 40:
      ++this.pos
      return this.finishToken(types$1.parenL)
    case 41:
      ++this.pos
      return this.finishToken(types$1.parenR)
    case 59:
      ++this.pos
      return this.finishToken(types$1.semi)
    case 44:
      ++this.pos
      return this.finishToken(types$1.comma)
    case 91:
      ++this.pos
      return this.finishToken(types$1.bracketL)
    case 93:
      ++this.pos
      return this.finishToken(types$1.bracketR)
    case 123:
      ++this.pos
      return this.finishToken(types$1.braceL)
    case 125:
      ++this.pos
      return this.finishToken(types$1.braceR)
    case 58:
      ++this.pos
      return this.finishToken(types$1.colon)
    case 96:
      if (this.options.ecmaVersion < 6) {
        break
      }
      ++this.pos
      return this.finishToken(types$1.backQuote)
    case 48:
      var next = this.input.charCodeAt(this.pos + 1)
      if (next === 120 || next === 88) {
        return this.readRadixNumber(16)
      }
      if (this.options.ecmaVersion >= 6) {
        if (next === 111 || next === 79) {
          return this.readRadixNumber(8)
        }
        if (next === 98 || next === 66) {
          return this.readRadixNumber(2)
        }
      }
    case 49:
    case 50:
    case 51:
    case 52:
    case 53:
    case 54:
    case 55:
    case 56:
    case 57:
      return this.readNumber(false)
    case 34:
    case 39:
      return this.readString(code)
    case 47:
      return this.readToken_slash()
    case 37:
    case 42:
      return this.readToken_mult_modulo_exp(code)
    case 124:
    case 38:
      return this.readToken_pipe_amp(code)
    case 94:
      return this.readToken_caret()
    case 43:
    case 45:
      return this.readToken_plus_min(code)
    case 60:
    case 62:
      return this.readToken_lt_gt(code)
    case 61:
    case 33:
      return this.readToken_eq_excl(code)
    case 63:
      return this.readToken_question()
    case 126:
      return this.finishOp(types$1.prefix, 1)
    case 35:
      return this.readToken_numberSign()
  }
  this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'")
}
pp.finishOp = function (type, size) {
  var str = this.input.slice(this.pos, this.pos + size)
  this.pos += size
  return this.finishToken(type, str)
}
pp.readRegexp = function () {
  var escaped,
    inClass,
    start = this.pos
  for (;;) {
    if (this.pos >= this.input.length) {
      this.raise(start, 'Unterminated regular expression')
    }
    var ch = this.input.charAt(this.pos)
    if (lineBreak.test(ch)) {
      this.raise(start, 'Unterminated regular expression')
    }
    if (!escaped) {
      if (ch === '[') {
        inClass = true
      } else if (ch === ']' && inClass) {
        inClass = false
      } else if (ch === '/' && !inClass) {
        break
      }
      escaped = ch === '\\'
    } else {
      escaped = false
    }
    ++this.pos
  }
  var pattern = this.input.slice(start, this.pos)
  ++this.pos
  var flagsStart = this.pos
  var flags = this.readWord1()
  if (this.containsEsc) {
    this.unexpected(flagsStart)
  }
  var state =
    this.regexpState || (this.regexpState = new RegExpValidationState(this))
  state.reset(start, pattern, flags)
  this.validateRegExpFlags(state)
  this.validateRegExpPattern(state)
  var value = null
  try {
    value = new RegExp(pattern, flags)
  } catch (e) {}
  return this.finishToken(types$1.regexp, { pattern, flags, value })
}
pp.readInt = function (radix, len, maybeLegacyOctalNumericLiteral) {
  var allowSeparators = this.options.ecmaVersion >= 12 && len === undefined
  var isLegacyOctalNumericLiteral =
    maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48
  var start = this.pos,
    total = 0,
    lastCode = 0
  for (var i2 = 0, e = len == null ? Infinity : len; i2 < e; ++i2, ++this.pos) {
    var code = this.input.charCodeAt(this.pos),
      val = undefined
    if (allowSeparators && code === 95) {
      if (isLegacyOctalNumericLiteral) {
        this.raiseRecoverable(
          this.pos,
          'Numeric separator is not allowed in legacy octal numeric literals'
        )
      }
      if (lastCode === 95) {
        this.raiseRecoverable(
          this.pos,
          'Numeric separator must be exactly one underscore'
        )
      }
      if (i2 === 0) {
        this.raiseRecoverable(
          this.pos,
          'Numeric separator is not allowed at the first of digits'
        )
      }
      lastCode = code
      continue
    }
    if (code >= 97) {
      val = code - 97 + 10
    } else if (code >= 65) {
      val = code - 65 + 10
    } else if (code >= 48 && code <= 57) {
      val = code - 48
    } else {
      val = Infinity
    }
    if (val >= radix) {
      break
    }
    lastCode = code
    total = total * radix + val
  }
  if (allowSeparators && lastCode === 95) {
    this.raiseRecoverable(
      this.pos - 1,
      'Numeric separator is not allowed at the last of digits'
    )
  }
  if (this.pos === start || (len != null && this.pos - start !== len)) {
    return null
  }
  return total
}
function stringToNumber(str, isLegacyOctalNumericLiteral) {
  if (isLegacyOctalNumericLiteral) {
    return parseInt(str, 8)
  }
  return parseFloat(str.replace(/_/g, ''))
}
function stringToBigInt(str) {
  if (typeof BigInt !== 'function') {
    return null
  }
  return BigInt(str.replace(/_/g, ''))
}
pp.readRadixNumber = function (radix) {
  var start = this.pos
  this.pos += 2
  var val = this.readInt(radix)
  if (val == null) {
    this.raise(this.start + 2, 'Expected number in radix ' + radix)
  }
  if (
    this.options.ecmaVersion >= 11 &&
    this.input.charCodeAt(this.pos) === 110
  ) {
    val = stringToBigInt(this.input.slice(start, this.pos))
    ++this.pos
  } else if (isIdentifierStart(this.fullCharCodeAtPos())) {
    this.raise(this.pos, 'Identifier directly after number')
  }
  return this.finishToken(types$1.num, val)
}
pp.readNumber = function (startsWithDot) {
  var start = this.pos
  if (!startsWithDot && this.readInt(10, undefined, true) === null) {
    this.raise(start, 'Invalid number')
  }
  var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48
  if (octal && this.strict) {
    this.raise(start, 'Invalid number')
  }
  var next = this.input.charCodeAt(this.pos)
  if (
    !octal &&
    !startsWithDot &&
    this.options.ecmaVersion >= 11 &&
    next === 110
  ) {
    var val$1 = stringToBigInt(this.input.slice(start, this.pos))
    ++this.pos
    if (isIdentifierStart(this.fullCharCodeAtPos())) {
      this.raise(this.pos, 'Identifier directly after number')
    }
    return this.finishToken(types$1.num, val$1)
  }
  if (octal && /[89]/.test(this.input.slice(start, this.pos))) {
    octal = false
  }
  if (next === 46 && !octal) {
    ++this.pos
    this.readInt(10)
    next = this.input.charCodeAt(this.pos)
  }
  if ((next === 69 || next === 101) && !octal) {
    next = this.input.charCodeAt(++this.pos)
    if (next === 43 || next === 45) {
      ++this.pos
    }
    if (this.readInt(10) === null) {
      this.raise(start, 'Invalid number')
    }
  }
  if (isIdentifierStart(this.fullCharCodeAtPos())) {
    this.raise(this.pos, 'Identifier directly after number')
  }
  var val = stringToNumber(this.input.slice(start, this.pos), octal)
  return this.finishToken(types$1.num, val)
}
pp.readCodePoint = function () {
  var ch = this.input.charCodeAt(this.pos),
    code
  if (ch === 123) {
    if (this.options.ecmaVersion < 6) {
      this.unexpected()
    }
    var codePos = ++this.pos
    code = this.readHexChar(this.input.indexOf('}', this.pos) - this.pos)
    ++this.pos
    if (code > 1114111) {
      this.invalidStringToken(codePos, 'Code point out of bounds')
    }
  } else {
    code = this.readHexChar(4)
  }
  return code
}
pp.readString = function (quote) {
  var out = '',
    chunkStart = ++this.pos
  for (;;) {
    if (this.pos >= this.input.length) {
      this.raise(this.start, 'Unterminated string constant')
    }
    var ch = this.input.charCodeAt(this.pos)
    if (ch === quote) {
      break
    }
    if (ch === 92) {
      out += this.input.slice(chunkStart, this.pos)
      out += this.readEscapedChar(false)
      chunkStart = this.pos
    } else if (ch === 8232 || ch === 8233) {
      if (this.options.ecmaVersion < 10) {
        this.raise(this.start, 'Unterminated string constant')
      }
      ++this.pos
      if (this.options.locations) {
        this.curLine++
        this.lineStart = this.pos
      }
    } else {
      if (isNewLine(ch)) {
        this.raise(this.start, 'Unterminated string constant')
      }
      ++this.pos
    }
  }
  out += this.input.slice(chunkStart, this.pos++)
  return this.finishToken(types$1.string, out)
}
var INVALID_TEMPLATE_ESCAPE_ERROR = {}
pp.tryReadTemplateToken = function () {
  this.inTemplateElement = true
  try {
    this.readTmplToken()
  } catch (err) {
    if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
      this.readInvalidTemplateToken()
    } else {
      throw err
    }
  }
  this.inTemplateElement = false
}
pp.invalidStringToken = function (position, message) {
  if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
    throw INVALID_TEMPLATE_ESCAPE_ERROR
  } else {
    this.raise(position, message)
  }
}
pp.readTmplToken = function () {
  var out = '',
    chunkStart = this.pos
  for (;;) {
    if (this.pos >= this.input.length) {
      this.raise(this.start, 'Unterminated template')
    }
    var ch = this.input.charCodeAt(this.pos)
    if (
      ch === 96 ||
      (ch === 36 && this.input.charCodeAt(this.pos + 1) === 123)
    ) {
      if (
        this.pos === this.start &&
        (this.type === types$1.template ||
          this.type === types$1.invalidTemplate)
      ) {
        if (ch === 36) {
          this.pos += 2
          return this.finishToken(types$1.dollarBraceL)
        } else {
          ++this.pos
          return this.finishToken(types$1.backQuote)
        }
      }
      out += this.input.slice(chunkStart, this.pos)
      return this.finishToken(types$1.template, out)
    }
    if (ch === 92) {
      out += this.input.slice(chunkStart, this.pos)
      out += this.readEscapedChar(true)
      chunkStart = this.pos
    } else if (isNewLine(ch)) {
      out += this.input.slice(chunkStart, this.pos)
      ++this.pos
      switch (ch) {
        case 13:
          if (this.input.charCodeAt(this.pos) === 10) {
            ++this.pos
          }
        case 10:
          out += `
`
          break
        default:
          out += String.fromCharCode(ch)
          break
      }
      if (this.options.locations) {
        ++this.curLine
        this.lineStart = this.pos
      }
      chunkStart = this.pos
    } else {
      ++this.pos
    }
  }
}
pp.readInvalidTemplateToken = function () {
  for (; this.pos < this.input.length; this.pos++) {
    switch (this.input[this.pos]) {
      case '\\':
        ++this.pos
        break
      case '$':
        if (this.input[this.pos + 1] !== '{') {
          break
        }
      case '`':
        return this.finishToken(
          types$1.invalidTemplate,
          this.input.slice(this.start, this.pos)
        )
      case '\r':
        if (
          this.input[this.pos + 1] ===
          `
`
        ) {
          ++this.pos
        }
      case `
`:
      case '\u2028':
      case '\u2029':
        ++this.curLine
        this.lineStart = this.pos + 1
        break
    }
  }
  this.raise(this.start, 'Unterminated template')
}
pp.readEscapedChar = function (inTemplate) {
  var ch = this.input.charCodeAt(++this.pos)
  ++this.pos
  switch (ch) {
    case 110:
      return `
`
    case 114:
      return '\r'
    case 120:
      return String.fromCharCode(this.readHexChar(2))
    case 117:
      return codePointToString(this.readCodePoint())
    case 116:
      return '\t'
    case 98:
      return '\b'
    case 118:
      return '\v'
    case 102:
      return '\f'
    case 13:
      if (this.input.charCodeAt(this.pos) === 10) {
        ++this.pos
      }
    case 10:
      if (this.options.locations) {
        this.lineStart = this.pos
        ++this.curLine
      }
      return ''
    case 56:
    case 57:
      if (this.strict) {
        this.invalidStringToken(this.pos - 1, 'Invalid escape sequence')
      }
      if (inTemplate) {
        var codePos = this.pos - 1
        this.invalidStringToken(
          codePos,
          'Invalid escape sequence in template string'
        )
      }
    default:
      if (ch >= 48 && ch <= 55) {
        var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0]
        var octal = parseInt(octalStr, 8)
        if (octal > 255) {
          octalStr = octalStr.slice(0, -1)
          octal = parseInt(octalStr, 8)
        }
        this.pos += octalStr.length - 1
        ch = this.input.charCodeAt(this.pos)
        if (
          (octalStr !== '0' || ch === 56 || ch === 57) &&
          (this.strict || inTemplate)
        ) {
          this.invalidStringToken(
            this.pos - 1 - octalStr.length,
            inTemplate
              ? 'Octal literal in template string'
              : 'Octal literal in strict mode'
          )
        }
        return String.fromCharCode(octal)
      }
      if (isNewLine(ch)) {
        if (this.options.locations) {
          this.lineStart = this.pos
          ++this.curLine
        }
        return ''
      }
      return String.fromCharCode(ch)
  }
}
pp.readHexChar = function (len) {
  var codePos = this.pos
  var n = this.readInt(16, len)
  if (n === null) {
    this.invalidStringToken(codePos, 'Bad character escape sequence')
  }
  return n
}
pp.readWord1 = function () {
  this.containsEsc = false
  var word = '',
    first = true,
    chunkStart = this.pos
  var astral = this.options.ecmaVersion >= 6
  while (this.pos < this.input.length) {
    var ch = this.fullCharCodeAtPos()
    if (isIdentifierChar(ch, astral)) {
      this.pos += ch <= 65535 ? 1 : 2
    } else if (ch === 92) {
      this.containsEsc = true
      word += this.input.slice(chunkStart, this.pos)
      var escStart = this.pos
      if (this.input.charCodeAt(++this.pos) !== 117) {
        this.invalidStringToken(
          this.pos,
          'Expecting Unicode escape sequence \\uXXXX'
        )
      }
      ++this.pos
      var esc = this.readCodePoint()
      if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral)) {
        this.invalidStringToken(escStart, 'Invalid Unicode escape')
      }
      word += codePointToString(esc)
      chunkStart = this.pos
    } else {
      break
    }
    first = false
  }
  return word + this.input.slice(chunkStart, this.pos)
}
pp.readWord = function () {
  var word = this.readWord1()
  var type = types$1.name
  if (this.keywords.test(word)) {
    type = keywords[word]
  }
  return this.finishToken(type, word)
}
var version = '8.15.0'
Parser.acorn = {
  Parser,
  version,
  defaultOptions,
  Position,
  SourceLocation,
  getLineInfo,
  Node,
  TokenType,
  tokTypes: types$1,
  keywordTypes: keywords,
  TokContext,
  tokContexts: types,
  isIdentifierChar,
  isIdentifierStart,
  Token,
  isNewLine,
  lineBreak,
  lineBreakG,
  nonASCIIwhitespace,
}
function parse3(input, options) {
  return Parser.parse(input, options)
}
function parseExpressionAt2(input, pos, options) {
  return Parser.parseExpressionAt(input, pos, options)
}

// ../src/lang/types.ts
class TranspileError extends Error {
  line
  column
  source
  filename
  constructor(message, location, source, filename) {
    const loc = `${filename || '<source>'}:${location.line}:${location.column}`
    super(`${message} at ${loc}`)
    this.name = 'TranspileError'
    this.line = location.line
    this.column = location.column
    this.source = source
    this.filename = filename
  }
}

class SyntaxError2 extends TranspileError {
  constructor(message, location, source, filename) {
    super(message, location, source, filename)
    this.name = 'SyntaxError'
  }
  formatWithContext(contextLines = 2) {
    if (!this.source) return this.message
    const lines = this.source.split(`
`)
    const errorLine = this.line - 1
    const startLine = Math.max(0, errorLine - contextLines)
    const endLine = Math.min(lines.length - 1, errorLine + contextLines)
    const output = []
    const lineNumWidth = String(endLine + 1).length
    for (let i2 = startLine; i2 <= endLine; i2++) {
      const lineNum = String(i2 + 1).padStart(lineNumWidth)
      const marker = i2 === errorLine ? '>' : ' '
      output.push(`${marker} ${lineNum} | ${lines[i2]}`)
      if (i2 === errorLine) {
        const caretPadding = ' '.repeat(lineNumWidth + 4 + this.column)
        output.push(`${caretPadding}^ ${this.message.split(' at ')[0]}`)
      }
    }
    return output.join(`
`)
  }
}
function createChildContext(parent) {
  return {
    depth: parent.depth + 1,
    locals: new Map(),
    parent,
    parameters: parent.parameters,
    atoms: parent.atoms,
    warnings: parent.warnings,
    source: parent.source,
    filename: parent.filename,
    options: parent.options,
  }
}
function getLocation(node) {
  if (node.loc) {
    return { line: node.loc.start.line, column: node.loc.start.column }
  }
  return { line: 1, column: 0 }
}

// ../src/lang/parser.ts
function transformParenExpressions(source, ctx) {
  let result = ''
  let i2 = 0
  let firstReturnType
  let firstReturnSafety
  let state = 'normal'
  const templateStack = []
  const contextStack = [{ type: 'top-level', braceDepth: 0 }]
  let braceDepth = 0
  const _currentContext = () =>
    contextStack[contextStack.length - 1]?.type || 'top-level'
  const isInClassBody = () => {
    const frame = contextStack[contextStack.length - 1]
    return frame?.type === 'class-body' && braceDepth === frame.braceDepth + 1
  }
  while (i2 < source.length) {
    const char = source[i2]
    const nextChar = source[i2 + 1]
    switch (state) {
      case 'single-string':
        result += char
        if (char === '\\' && i2 + 1 < source.length) {
          result += nextChar
          i2 += 2
          continue
        }
        if (char === "'") {
          state = 'normal'
        }
        i2++
        continue
      case 'double-string':
        result += char
        if (char === '\\' && i2 + 1 < source.length) {
          result += nextChar
          i2 += 2
          continue
        }
        if (char === '"') {
          state = 'normal'
        }
        i2++
        continue
      case 'template-string':
        result += char
        if (char === '\\' && i2 + 1 < source.length) {
          result += nextChar
          i2 += 2
          continue
        }
        if (char === '$' && nextChar === '{') {
          result += nextChar
          i2 += 2
          templateStack.push(1)
          state = 'normal'
          continue
        }
        if (char === '`') {
          state = 'normal'
        }
        i2++
        continue
      case 'line-comment':
        result += char
        if (
          char ===
          `
`
        ) {
          state = 'normal'
        }
        i2++
        continue
      case 'block-comment':
        result += char
        if (char === '*' && nextChar === '/') {
          result += nextChar
          i2 += 2
          state = 'normal'
          continue
        }
        i2++
        continue
      case 'regex':
        result += char
        if (char === '\\' && i2 + 1 < source.length) {
          result += nextChar
          i2 += 2
          continue
        }
        if (char === '[') {
          i2++
          while (i2 < source.length && source[i2] !== ']') {
            result += source[i2]
            if (source[i2] === '\\' && i2 + 1 < source.length) {
              result += source[i2 + 1]
              i2 += 2
            } else {
              i2++
            }
          }
          if (i2 < source.length) {
            result += source[i2]
            i2++
          }
          continue
        }
        if (char === '/') {
          i2++
          while (i2 < source.length && /[gimsuy]/.test(source[i2])) {
            result += source[i2]
            i2++
          }
          state = 'normal'
          continue
        }
        i2++
        continue
      case 'normal':
        if (templateStack.length > 0) {
          if (char === '{') {
            templateStack[templateStack.length - 1]++
          } else if (char === '}') {
            templateStack[templateStack.length - 1]--
            if (templateStack[templateStack.length - 1] === 0) {
              templateStack.pop()
              result += char
              i2++
              state = 'template-string'
              continue
            }
          }
        }
        if (char === "'") {
          result += char
          i2++
          state = 'single-string'
          continue
        }
        if (char === '"') {
          result += char
          i2++
          state = 'double-string'
          continue
        }
        if (char === '`') {
          result += char
          i2++
          state = 'template-string'
          continue
        }
        if (char === '/' && nextChar === '/') {
          result += char + nextChar
          i2 += 2
          state = 'line-comment'
          continue
        }
        if (char === '/' && nextChar === '*') {
          result += char + nextChar
          i2 += 2
          state = 'block-comment'
          continue
        }
        if (char === '/') {
          const before = result.trimEnd()
          const lastChar = before[before.length - 1]
          const isRegexContext =
            !lastChar ||
            /[=(!,;:{[&|?+\-*%<>~^]$/.test(before) ||
            /\b(return|case|throw|in|of|typeof|instanceof|new|delete|void)\s*$/.test(
              before
            )
          if (isRegexContext) {
            result += char
            i2++
            state = 'regex'
            continue
          }
        }
        break
    }
    if (char === '{') {
      braceDepth++
      result += char
      i2++
      continue
    }
    if (char === '}') {
      braceDepth--
      const frame = contextStack[contextStack.length - 1]
      if (frame && braceDepth === frame.braceDepth) {
        contextStack.pop()
      }
      result += char
      i2++
      continue
    }
    const classMatch = source
      .slice(i2)
      .match(/^class\s+\w+(?:\s+extends\s+\w+)?\s*\{/)
    if (classMatch) {
      const classHeader = classMatch[0].slice(0, -1)
      result += classHeader
      i2 += classHeader.length
      contextStack.push({ type: 'class-body', braceDepth })
      continue
    }
    const funcMatch = source.slice(i2).match(/^function\s+(\w+)\s*\(/)
    if (funcMatch) {
      const funcName = funcMatch[1]
      const matchLen = funcMatch[0].length
      const afterParen = source[i2 + matchLen]
      let safetyMarker = null
      let paramStart = i2 + matchLen
      if (afterParen === '?' || afterParen === '!') {
        safetyMarker = afterParen
        paramStart++
        if (safetyMarker === '!') {
          ctx.unsafeFunctions.add(funcName)
        } else {
          ctx.safeFunctions.add(funcName)
        }
      }
      result += `function ${funcName}(`
      i2 = paramStart
      const paramsResult = extractBalancedContent(source, i2, '(', ')')
      if (!paramsResult) {
        result += source[i2]
        i2++
        continue
      }
      const { content: params, endPos } = paramsResult
      i2 = endPos
      const processedParams = processParamString(params, ctx, true)
      result += processedParams + ')'
      let j = i2
      while (j < source.length && /\s/.test(source[j])) j++
      const returnArrow = source.slice(j, j + 2)
      if (
        returnArrow === '->' ||
        returnArrow === '-?' ||
        returnArrow === '-!'
      ) {
        j += 2
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          const { type, endPos: typeEnd } = typeResult
          if (firstReturnType === undefined) {
            firstReturnType = type
            if (returnArrow === '-?') {
              firstReturnSafety = 'safe'
            } else if (returnArrow === '-!') {
              firstReturnSafety = 'unsafe'
            }
          }
          i2 = typeEnd
        }
      }
      continue
    }
    const methodMatch = source
      .slice(i2)
      .match(/^(constructor|(?:get|set)\s+\w+|async\s+\w+|\w+)\s*\(/)
    if (methodMatch && isInClassBody()) {
      const methodPart = methodMatch[1]
      const matchLen = methodMatch[0].length
      const paramStart = i2 + matchLen
      result += methodPart + '('
      i2 = paramStart
      const paramsResult = extractBalancedContent(source, i2, '(', ')')
      if (!paramsResult) {
        result += source[i2]
        i2++
        continue
      }
      const { content: params, endPos } = paramsResult
      i2 = endPos
      const processedParams = processParamString(params, ctx, true)
      result += processedParams + ')'
      let j = i2
      while (j < source.length && /\s/.test(source[j])) j++
      const returnArrow = source.slice(j, j + 2)
      if (returnArrow === '->') {
        j += 2
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          i2 = typeResult.endPos
        }
      } else if (source[j] === ':') {
        j++
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          i2 = typeResult.endPos
        }
      }
      continue
    }
    if (source[i2] === '(') {
      const fullParamsResult = extractBalancedContent(source, i2 + 1, '(', ')')
      if (!fullParamsResult) {
        result += source[i2]
        i2++
        continue
      }
      const fullContent = fullParamsResult.content
      const endPos = fullParamsResult.endPos
      let j = endPos
      while (j < source.length && /\s/.test(source[j])) j++
      let arrowReturnType
      const returnArrow = source.slice(j, j + 2)
      if (
        returnArrow === '->' ||
        returnArrow === '-?' ||
        returnArrow === '-!'
      ) {
        j += 2
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          arrowReturnType = typeResult.type
          j = typeResult.endPos
          while (j < source.length && /\s/.test(source[j])) j++
        }
      }
      if (source.slice(j, j + 2) === '=>') {
        let safetyMarker = null
        let params = fullContent
        const trimmedContent = fullContent.trimStart()
        if (
          trimmedContent.startsWith('?') &&
          (trimmedContent.length === 1 || /\s/.test(trimmedContent[1]))
        ) {
          safetyMarker = '?'
          params = trimmedContent.slice(1)
        } else if (
          trimmedContent.startsWith('!') &&
          (trimmedContent.length === 1 || /\s/.test(trimmedContent[1]))
        ) {
          safetyMarker = '!'
          params = trimmedContent.slice(1)
        }
        const processedParams = processParamString(params, ctx, false)
        const safetyComment =
          safetyMarker === '?'
            ? '/* safe */ '
            : safetyMarker === '!'
            ? '/* unsafe */ '
            : ''
        result += `(${safetyComment}${processedParams})`
        i2 = endPos
        while (i2 < j && /\s/.test(source[i2])) {
          result += source[i2]
          i2++
        }
        if (arrowReturnType) {
          i2 = j
        }
      } else {
        const transformed = transformParenExpressions(fullContent, ctx)
        result += `(${transformed.source})`
        i2 = endPos
      }
      continue
    }
    result += source[i2]
    i2++
  }
  return {
    source: result,
    returnType: firstReturnType,
    returnSafety: firstReturnSafety,
  }
}
function extractBalancedContent(source, start, open, close) {
  let depth = 1
  let i2 = start
  let inString = false
  let stringChar = ''
  while (i2 < source.length && depth > 0) {
    const char = source[i2]
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
    } else if (inString && char === stringChar && source[i2 - 1] !== '\\') {
      inString = false
    } else if (!inString) {
      if (char === open) depth++
      else if (char === close) depth--
    }
    i2++
  }
  if (depth !== 0) return null
  return {
    content: source.slice(start, i2 - 1),
    endPos: i2,
  }
}
function extractJSValue(source, start) {
  let i2 = start
  while (i2 < source.length && /\s/.test(source[i2])) i2++
  if (i2 >= source.length) return null
  const valueStart = i2
  const firstChar = source[i2]
  if (firstChar === '{' || firstChar === '[') {
    const close = firstChar === '{' ? '}' : ']'
    const result = extractBalancedContent(source, i2 + 1, firstChar, close)
    if (!result) return null
    return {
      value: source.slice(valueStart, result.endPos),
      endPos: result.endPos,
    }
  }
  if (firstChar === "'" || firstChar === '"' || firstChar === '`') {
    i2++
    while (i2 < source.length) {
      if (source[i2] === firstChar && source[i2 - 1] !== '\\') {
        i2++
        return { value: source.slice(valueStart, i2), endPos: i2 }
      }
      i2++
    }
    return null
  }
  if (/[-+\d]/.test(firstChar)) {
    while (i2 < source.length && /[\d.eE+-]/.test(source[i2])) i2++
    return { value: source.slice(valueStart, i2), endPos: i2 }
  }
  const keywordMatch = source.slice(i2).match(/^(true|false|null|undefined)\b/)
  if (keywordMatch) {
    return {
      value: keywordMatch[1],
      endPos: i2 + keywordMatch[1].length,
    }
  }
  return null
}
function normalizeUnionSyntax(type) {
  return type.replace(/(?<!\|)\|(?!\|)/g, ' || ')
}
function extractReturnTypeValue(source, start) {
  let i2 = start
  let depth = 0
  let inString = false
  let stringChar = ''
  let sawContent = false
  const makeResult = (endPos) => ({
    type: normalizeUnionSyntax(source.slice(start, endPos).trim()),
    endPos,
  })
  while (i2 < source.length) {
    const char = source[i2]
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      sawContent = true
      i2++
      continue
    }
    if (inString) {
      if (char === stringChar && source[i2 - 1] !== '\\') {
        inString = false
        i2++
        if (depth === 0) {
          let j = i2
          while (j < source.length && /\s/.test(source[j])) j++
          if (source[j] === '{') {
            const afterBrace = source.slice(j + 1).match(/^\s*(\w+)\s*:/)
            if (!afterBrace) {
              return makeResult(i2)
            }
          }
          if (source[j] !== '|' && source[j] !== '&') {
            return makeResult(i2)
          }
        }
        continue
      }
      i2++
      continue
    }
    if (char === '{' || char === '[' || char === '(') {
      depth++
      sawContent = true
      i2++
      continue
    }
    if (char === '}' || char === ']' || char === ')') {
      depth--
      if (depth === 0) {
        i2++
        let j = i2
        while (j < source.length && /\s/.test(source[j])) j++
        if (source[j] === '|' || source[j] === '&') {
          continue
        }
        return makeResult(i2)
      }
      i2++
      continue
    }
    if (depth === 0 && char === '{') {
      if (sawContent) {
        return makeResult(i2)
      }
      const afterBrace = source.slice(i2 + 1).match(/^\s*(\w+)\s*:/)
      if (afterBrace) {
        depth++
        sawContent = true
        i2++
        continue
      }
      return makeResult(i2)
    }
    if (depth === 0 && (char === '|' || char === '&')) {
      i2++
      if (i2 < source.length && source[i2] === '|') i2++
      while (i2 < source.length && /\s/.test(source[i2])) i2++
      continue
    }
    if (
      depth === 0 &&
      (/\d/.test(char) || (char === '-' && /\d/.test(source[i2 + 1])))
    ) {
      let j = i2
      if (source[j] === '-') j++
      while (j < source.length && /\d/.test(source[j])) j++
      if (j < source.length && source[j] === '.' && /\d/.test(source[j + 1])) {
        j++
        while (j < source.length && /\d/.test(source[j])) j++
      }
      if (j < source.length && (source[j] === 'e' || source[j] === 'E')) {
        j++
        if (j < source.length && (source[j] === '+' || source[j] === '-')) j++
        while (j < source.length && /\d/.test(source[j])) j++
      }
      sawContent = true
      i2 = j
      while (i2 < source.length && /\s/.test(source[i2])) i2++
      if (i2 < source.length && source[i2] === '{') {
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      if (source[i2] !== '|' && source[i2] !== '&') {
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      continue
    }
    if (depth === 0 && /[a-zA-Z_]/.test(char)) {
      let j = i2
      while (j < source.length && /\w/.test(source[j])) j++
      sawContent = true
      i2 = j
      while (i2 < source.length && /\s/.test(source[i2])) i2++
      if (i2 < source.length && source[i2] === '{') {
        const afterBrace = source.slice(i2 + 1).match(/^\s*(\w+)\s*:/)
        if (!afterBrace) {
          let typeEnd = j
          while (typeEnd > start && /\s/.test(source[typeEnd - 1])) typeEnd--
          return {
            type: normalizeUnionSyntax(source.slice(start, typeEnd).trim()),
            endPos: j,
          }
        }
      }
      if (source[i2] !== '|' && source[i2] !== '&') {
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      continue
    }
    i2++
  }
  if (sawContent) {
    return makeResult(i2)
  }
  return null
}
function processParamString(params, ctx, trackRequired) {
  const withArrows = transformParenExpressions(params, {
    originalSource: params,
    requiredParams: ctx.requiredParams,
    unsafeFunctions: ctx.unsafeFunctions,
    safeFunctions: ctx.safeFunctions,
  }).source
  const paramList = splitParameters(withArrows)
  let sawOptional = false
  const seenNames = new Set()
  const checkDuplicate = (name) => {
    if (trackRequired && /^\w+$/.test(name)) {
      if (seenNames.has(name)) {
        throw new Error(`Duplicate parameter name '${name}'`)
      }
      seenNames.add(name)
    }
  }
  const processed = paramList.map((param) => {
    const trimmed = param.trim()
    if (!trimmed) return param
    if (trackRequired && trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1)
      const processedInner = processDestructuredObjectParams(inner, ctx)
      return `{ ${processedInner} }`
    }
    if (trackRequired && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1)
      const processedInner = processDestructuredObjectParams(inner, ctx)
      return `[ ${processedInner} ]`
    }
    const optionalMatch = trimmed.match(/^(\w+)\s*\?\s*:\s*(.+)$/)
    if (optionalMatch) {
      const [, name, type] = optionalMatch
      checkDuplicate(name)
      sawOptional = true
      return `${name} = ${type}`
    }
    if (!hasColonNotEquals(trimmed)) {
      const eqMatch = trimmed.match(/^(\w+)\s*=/)
      if (eqMatch) {
        checkDuplicate(eqMatch[1])
      }
      sawOptional = true
      return param
    }
    const colonPos = findTopLevelColon(trimmed)
    if (colonPos !== -1) {
      const name = trimmed.slice(0, colonPos).trim()
      const type = trimmed.slice(colonPos + 1).trim()
      checkDuplicate(name)
      if (sawOptional && trackRequired && /^\w+$/.test(name)) {
        throw new Error(
          `Required parameter '${name}' cannot follow optional parameter`
        )
      }
      if (trackRequired && /^\w+$/.test(name)) {
        ctx.requiredParams.add(name)
      }
      return `${name} = ${type}`
    }
    return param
  })
  return processed.join(',')
}
function processDestructuredObjectParams(inner, ctx) {
  const parts = splitParameters(inner)
  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part
    const nestedObjectMatch = trimmed.match(/^(\w+)\s*:\s*(\{[\s\S]*\})$/)
    if (nestedObjectMatch) {
      const [, name, objectLiteral] = nestedObjectMatch
      ctx.requiredParams.add(name)
      const processedLiteral = processObjectLiteralValue(objectLiteral)
      return `${name} = ${processedLiteral}`
    }
    const nestedArrayMatch = trimmed.match(/^(\w+)\s*:\s*(\[[\s\S]*\])$/)
    if (nestedArrayMatch) {
      const [, name, arrayLiteral] = nestedArrayMatch
      ctx.requiredParams.add(name)
      const processedLiteral = processArrayLiteralValue(arrayLiteral)
      return `${name} = ${processedLiteral}`
    }
    const colonMatch = trimmed.match(/^(\w+)\s*:\s*([\s\S]+)$/)
    if (colonMatch) {
      const [, name, value] = colonMatch
      ctx.requiredParams.add(name)
      return `${name} = ${value}`
    }
    return part
  })
  return processed.join(', ')
}
function processObjectLiteralValue(literal2) {
  const inner = literal2.slice(1, -1).trim()
  const parts = splitParameters(inner)
  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part
    const nestedObjColonMatch = trimmed.match(/^(\w+)\s*:\s*(\{[\s\S]*\})$/)
    if (nestedObjColonMatch) {
      const [, key, nested] = nestedObjColonMatch
      return `${key}: ${processObjectLiteralValue(nested)}`
    }
    const nestedObjEqualsMatch = trimmed.match(/^(\w+)\s*=\s*(\{[\s\S]*\})$/)
    if (nestedObjEqualsMatch) {
      const [, key, nested] = nestedObjEqualsMatch
      return `${key}: ${processObjectLiteralValue(nested)}`
    }
    const nestedArrColonMatch = trimmed.match(/^(\w+)\s*:\s*(\[[\s\S]*\])$/)
    if (nestedArrColonMatch) {
      const [, key, nested] = nestedArrColonMatch
      return `${key}: ${processArrayLiteralValue(nested)}`
    }
    const nestedArrEqualsMatch = trimmed.match(/^(\w+)\s*=\s*(\[[\s\S]*\])$/)
    if (nestedArrEqualsMatch) {
      const [, key, nested] = nestedArrEqualsMatch
      return `${key}: ${processArrayLiteralValue(nested)}`
    }
    const equalsMatch = trimmed.match(/^(\w+)\s*=\s*([\s\S]+)$/)
    if (equalsMatch) {
      const [, key, value] = equalsMatch
      return `${key}: ${value}`
    }
    return part
  })
  return `{ ${processed.join(', ')} }`
}
function processArrayLiteralValue(literal2) {
  const inner = literal2.slice(1, -1).trim()
  const parts = splitParameters(inner)
  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return processObjectLiteralValue(trimmed)
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return processArrayLiteralValue(trimmed)
    }
    return part
  })
  return `[ ${processed.join(', ')} ]`
}
function hasColonNotEquals(param) {
  let depth = 0
  let hasColon = false
  let hasEquals = false
  let inString = false
  let stringChar = ''
  for (let i2 = 0; i2 < param.length; i2++) {
    const char = param[i2]
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      continue
    }
    if (inString) {
      if (char === stringChar && param[i2 - 1] !== '\\') inString = false
      continue
    }
    if (char === '(' || char === '{' || char === '[') {
      depth++
    } else if (char === ')' || char === '}' || char === ']') {
      depth--
    } else if (depth === 0) {
      if (char === ':') hasColon = true
      if (char === '=' && param[i2 + 1] !== '>') hasEquals = true
    }
  }
  return hasColon && !hasEquals
}
function findTopLevelColon(param) {
  let depth = 0
  let inString = false
  let stringChar = ''
  for (let i2 = 0; i2 < param.length; i2++) {
    const char = param[i2]
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      continue
    }
    if (inString) {
      if (char === stringChar && param[i2 - 1] !== '\\') inString = false
      continue
    }
    if (char === '(' || char === '{' || char === '[') {
      depth++
    } else if (char === ')' || char === '}' || char === ']') {
      depth--
    } else if (depth === 0 && char === ':') {
      return i2
    }
  }
  return -1
}
function preprocess(source, options = {}) {
  const originalSource = source
  let moduleSafety
  const requiredParams = new Set()
  const unsafeFunctions = new Set()
  const safeFunctions = new Set()
  const tjsModes = {
    tjsEquals: false,
    tjsClass: false,
    tjsDate: false,
    tjsNoeval: false,
    tjsStandard: false,
    tjsSafeEval: false,
  }
  const safetyMatch = source.match(
    /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*safety\s+(none|inputs|all)\b/
  )
  if (safetyMatch) {
    moduleSafety = safetyMatch[2]
    source = source.replace(
      /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*safety\s+(none|inputs|all)\s*/,
      '$1'
    )
  }
  const directivePattern =
    /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*(TjsStrict|TjsEquals|TjsClass|TjsDate|TjsNoeval|TjsStandard|TjsSafeEval)\b/
  let match
  while ((match = source.match(directivePattern))) {
    const directive = match[2]
    if (directive === 'TjsStrict') {
      tjsModes.tjsEquals = true
      tjsModes.tjsClass = true
      tjsModes.tjsDate = true
      tjsModes.tjsNoeval = true
      tjsModes.tjsStandard = true
    } else if (directive === 'TjsEquals') {
      tjsModes.tjsEquals = true
    } else if (directive === 'TjsClass') {
      tjsModes.tjsClass = true
    } else if (directive === 'TjsDate') {
      tjsModes.tjsDate = true
    } else if (directive === 'TjsNoeval') {
      tjsModes.tjsNoeval = true
    } else if (directive === 'TjsStandard') {
      tjsModes.tjsStandard = true
    } else if (directive === 'TjsSafeEval') {
      tjsModes.tjsSafeEval = true
    }
    source = source.replace(
      new RegExp(
        `^(\\s*(?:\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/\\s*)*)\\s*${directive}\\s*`
      ),
      '$1'
    )
  }
  if (tjsModes.tjsStandard) {
    source = insertAsiProtection(source)
  }
  source = transformIsOperators(source)
  if (tjsModes.tjsEquals && !options.vmTarget) {
    source = transformEqualityToStructural(source)
  }
  source = transformTypeDeclarations(source)
  source = transformGenericDeclarations(source)
  source = transformUnionDeclarations(source)
  source = transformEnumDeclarations(source)
  source = transformBareAssignments(source)
  const {
    source: transformedSource,
    returnType,
    returnSafety,
  } = transformParenExpressions(source, {
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
  })
  source = transformedSource
  const extResult = transformExtendDeclarations(source)
  source = extResult.source
  source = transformTryWithoutCatch(source)
  const polyResult = transformPolymorphicFunctions(source, requiredParams)
  source = polyResult.source
  const wasmBlocks = extractWasmBlocks(source)
  source = wasmBlocks.source
  const testResult = extractAndRunTests(source, options.dangerouslySkipTests)
  source = testResult.source
  const polyCtorResult = transformPolymorphicConstructors(
    source,
    requiredParams
  )
  source = polyCtorResult.source
  for (const cls of polyCtorResult.polyCtorClasses) {
    unsafeFunctions.add(`${cls}$dispatch`)
  }
  if (tjsModes.tjsClass) {
    source = wrapClassDeclarations(source, polyCtorResult.polyCtorClasses)
  }
  if (tjsModes.tjsDate) {
    source = validateNoDate(source)
  }
  if (tjsModes.tjsNoeval) {
    source = validateNoEval(source)
  }
  source = transformExtensionCalls(source, extResult.extensions)
  return {
    source,
    returnType,
    returnSafety,
    moduleSafety,
    tjsModes,
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
    wasmBlocks: wasmBlocks.blocks,
    tests: testResult.tests,
    testErrors: testResult.errors,
    polymorphicNames: polyResult.polymorphicNames,
    extensions: extResult.extensions,
  }
}
function transformTryWithoutCatch(source) {
  let result = ''
  let i2 = 0
  while (i2 < source.length) {
    const tryMatch = source.slice(i2).match(/^\btry\s*\{/)
    if (tryMatch) {
      const startBrace = i2 + tryMatch[0].length - 1
      const bodyStart = startBrace + 1
      let depth = 1
      let j = bodyStart
      while (j < source.length && depth > 0) {
        const char = source[j]
        if (char === '{') depth++
        else if (char === '}') depth--
        j++
      }
      if (depth !== 0) {
        result += source[i2]
        i2++
        continue
      }
      const afterTry = source.slice(j).match(/^\s*(catch|finally)\b/)
      if (afterTry) {
        result += source.slice(i2, j)
        i2 = j
      } else {
        const body = source.slice(bodyStart, j - 1)
        result += `try {${body}} catch (__try_err) { return { $error: true, message: __try_err?.message || String(__try_err), op: 'try', cause: __try_err, stack: globalThis.__tjs?.getStack?.() } }`
        i2 = j
      }
    } else {
      result += source[i2]
      i2++
    }
  }
  return result
}
function extractWasmBlocks(source) {
  const blocks = []
  let result = ''
  let i2 = 0
  let blockId = 0
  while (i2 < source.length) {
    const wasmMatch = source.slice(i2).match(/^\bwasm\s*\{/)
    if (wasmMatch) {
      const matchStart = i2
      const bodyStart = i2 + wasmMatch[0].length
      let braceDepth = 1
      let j = bodyStart
      while (j < source.length && braceDepth > 0) {
        const char = source[j]
        if (char === '{') braceDepth++
        else if (char === '}') braceDepth--
        j++
      }
      if (braceDepth !== 0) {
        result += source[i2]
        i2++
        continue
      }
      const body = source.slice(bodyStart, j - 1)
      let fallbackBody
      let matchEnd = j
      const fallbackMatch = source.slice(j).match(/^\s*fallback\s*\{/)
      if (fallbackMatch) {
        const fallbackStart = j + fallbackMatch[0].length
        braceDepth = 1
        let k = fallbackStart
        while (k < source.length && braceDepth > 0) {
          const char = source[k]
          if (char === '{') braceDepth++
          else if (char === '}') braceDepth--
          k++
        }
        if (braceDepth === 0) {
          fallbackBody = source.slice(fallbackStart, k - 1)
          matchEnd = k
        }
      }
      const captureNames = detectCaptures(body)
      const captures = captureNames.map((name) => {
        const typeAnnotation = findParameterType(source, matchStart, name)
        return typeAnnotation ? `${name}: ${typeAnnotation}` : name
      })
      const block = {
        id: `__tjs_wasm_${blockId}`,
        body,
        fallback: fallbackBody,
        captures,
        start: matchStart,
        end: matchEnd,
      }
      blocks.push(block)
      const fallbackCode = fallbackBody ?? body
      const captureArgNames = captures.map((c) => c.split(':')[0].trim())
      const captureArgs =
        captureArgNames.length > 0 ? captureArgNames.join(', ') : ''
      const wasmCall =
        captureArgNames.length > 0
          ? `globalThis.${block.id}(${captureArgs})`
          : `globalThis.${block.id}()`
      const dispatch = `(globalThis.${block.id} ? ${wasmCall} : (() => {${fallbackCode}})())`
      result += dispatch
      i2 = matchEnd
      blockId++
    } else {
      result += source[i2]
      i2++
    }
  }
  return { source: result, blocks }
}
function detectCaptures(body) {
  const bodyWithoutComments = body
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const identifierPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
  const allIdentifiers = new Set()
  let match
  while ((match = identifierPattern.exec(bodyWithoutComments)) !== null) {
    allIdentifiers.add(match[1])
  }
  const declared = new Set()
  const declPattern = /\b(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g
  while ((match = declPattern.exec(bodyWithoutComments)) !== null) {
    declared.add(match[1])
  }
  const forPattern =
    /\bfor\s*\(\s*(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g
  while ((match = forPattern.exec(bodyWithoutComments)) !== null) {
    declared.add(match[1])
  }
  const reserved = new Set([
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'return',
    'function',
    'let',
    'const',
    'var',
    'new',
    'this',
    'true',
    'false',
    'null',
    'undefined',
    'typeof',
    'instanceof',
    'in',
    'of',
    'try',
    'catch',
    'finally',
    'throw',
    'async',
    'await',
    'class',
    'extends',
    'super',
    'import',
    'export',
    'default',
    'from',
    'as',
    'static',
    'get',
    'set',
    'yield',
    'console',
    'Math',
    'Array',
    'Object',
    'String',
    'Number',
    'Boolean',
    'Date',
    'JSON',
    'Promise',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Float32Array',
    'Float64Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Uint8Array',
    'Uint16Array',
    'Uint32Array',
    'BigInt64Array',
    'BigUint64Array',
    'ArrayBuffer',
    'DataView',
    'Error',
    'TypeError',
    'RangeError',
    'length',
    'push',
    'pop',
    'shift',
    'unshift',
    'slice',
    'splice',
    'map',
    'filter',
    'reduce',
    'forEach',
    'find',
    'findIndex',
    'indexOf',
    'includes',
    'globalThis',
    'window',
    'document',
    'Infinity',
    'NaN',
    'isNaN',
    'isFinite',
    'parseInt',
    'parseFloat',
    'encodeURI',
    'decodeURI',
    'eval',
  ])
  const captures = []
  for (const id of allIdentifiers) {
    if (!declared.has(id) && !reserved.has(id)) {
      captures.push(id)
    }
  }
  return captures.sort()
}
function findParameterType(source, wasmBlockStart, paramName) {
  const beforeBlock = source.slice(0, wasmBlockStart)
  const funcPattern = /function\s+\w+\s*\(([^)]*)\)\s*(?:->.*?)?\s*\{[^}]*$/
  const match = beforeBlock.match(funcPattern)
  if (!match) {
    const arrowPattern =
      /(?:const|let|var)?\s*\w+\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?:=>|->)?\s*\{[^}]*$/
    const arrowMatch = beforeBlock.match(arrowPattern)
    if (!arrowMatch) return
    return extractTypeFromParams(arrowMatch[1], paramName)
  }
  return extractTypeFromParams(match[1], paramName)
}
function extractTypeFromParams(paramsStr, paramName) {
  const params = paramsStr.split(',').map((p) => p.trim())
  for (const param of params) {
    const colonMatch = param.match(
      new RegExp(`^${paramName}\\s*:\\s*([A-Za-z][A-Za-z0-9]*)`)
    )
    if (colonMatch) {
      return colonMatch[1]
    }
    const equalsMatch = param.match(
      new RegExp(
        `^${paramName}\\s*=\\s*(Float32Array|Float64Array|Int32Array|Uint8Array|Int8Array|Int16Array|Uint16Array|Uint32Array)`
      )
    )
    if (equalsMatch) {
      return equalsMatch[1]
    }
  }
  return
}
function splitParameters(params) {
  const result = []
  let current2 = ''
  let depth = 0
  let inLineComment = false
  let inBlockComment = false
  let i2 = 0
  while (i2 < params.length) {
    const char = params[i2]
    const nextChar = params[i2 + 1]
    if (!inBlockComment && char === '/' && nextChar === '/') {
      inLineComment = true
      current2 += '//'
      i2 += 2
      continue
    }
    if (!inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true
      current2 += '/*'
      i2 += 2
      continue
    }
    if (
      inLineComment &&
      char ===
        `
`
    ) {
      inLineComment = false
      current2 += char
      i2++
      continue
    }
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false
      current2 += '*/'
      i2 += 2
      continue
    }
    if (inLineComment || inBlockComment) {
      current2 += char
      i2++
      continue
    }
    if (char === '(' || char === '{' || char === '[') {
      depth++
      current2 += char
    } else if (char === ')' || char === '}' || char === ']') {
      depth--
      current2 += char
    } else if (char === ',' && depth === 0) {
      result.push(current2)
      current2 = ''
    } else {
      current2 += char
    }
    i2++
  }
  if (current2.trim()) {
    result.push(current2)
  }
  return result
}
function transformIsOperators(source) {
  const exprPat = `([\\w][\\w.\\[\\]()]*|null|undefined|true|false|\\d+(?:\\.\\d+)?|'[^']*'|"[^"]*")`
  const isNotRegex = new RegExp(exprPat + '\\s+IsNot\\s+' + exprPat, 'g')
  source = source.replace(isNotRegex, 'IsNot($1, $2)')
  const isRegex = new RegExp(exprPat + '\\s+Is\\s+' + exprPat, 'g')
  source = source.replace(isRegex, 'Is($1, $2)')
  return source
}
function insertAsiProtection(source) {
  const continuationStarts = /^[\s]*[([/+\-`]/
  const expectsContinuation = /[{([,;:+\-*/%=&|?<>!~^]\s*$|^\s*$/
  const continueKeywords =
    /\b(return|throw|yield|await|case|default|extends|new|typeof|void|delete|in|of|instanceof)\s*$/
  const lines = source.split(`
`)
  const result = []
  for (let i2 = 0; i2 < lines.length; i2++) {
    const line = lines[i2]
    const prevLine = i2 > 0 ? lines[i2 - 1] : ''
    if (i2 > 0 && continuationStarts.test(line)) {
      const prevNoComment = prevLine
        .replace(/\/\/.*$/, '')
        .replace(/\/\*.*\*\/\s*$/, '')
      if (
        !expectsContinuation.test(prevNoComment) &&
        !continueKeywords.test(prevNoComment)
      ) {
        const match = line.match(/^(\s*)/)
        const indent = match ? match[1] : ''
        const rest = line.slice(indent.length)
        result.push(indent + ';' + rest)
        continue
      }
    }
    result.push(line)
  }
  return result.join(`
`)
}
function transformEqualityToStructural(source) {
  const equalityOps = []
  let i2 = 0
  let state = 'normal'
  const templateStack = []
  while (i2 < source.length) {
    const char = source[i2]
    const nextChar = source[i2 + 1]
    switch (state) {
      case 'single-string':
        if (char === '\\' && i2 + 1 < source.length) {
          i2 += 2
          continue
        }
        if (char === "'") state = 'normal'
        i2++
        continue
      case 'double-string':
        if (char === '\\' && i2 + 1 < source.length) {
          i2 += 2
          continue
        }
        if (char === '"') state = 'normal'
        i2++
        continue
      case 'template-string':
        if (char === '\\' && i2 + 1 < source.length) {
          i2 += 2
          continue
        }
        if (char === '$' && nextChar === '{') {
          i2 += 2
          templateStack.push(1)
          state = 'normal'
          continue
        }
        if (char === '`') state = 'normal'
        i2++
        continue
      case 'line-comment':
        if (
          char ===
          `
`
        )
          state = 'normal'
        i2++
        continue
      case 'block-comment':
        if (char === '*' && nextChar === '/') {
          i2 += 2
          state = 'normal'
          continue
        }
        i2++
        continue
      case 'regex':
        if (char === '\\' && i2 + 1 < source.length) {
          i2 += 2
          continue
        }
        if (char === '[') {
          i2++
          while (i2 < source.length && source[i2] !== ']') {
            if (source[i2] === '\\' && i2 + 1 < source.length) {
              i2 += 2
            } else {
              i2++
            }
          }
          if (i2 < source.length) i2++
          continue
        }
        if (char === '/') {
          i2++
          while (i2 < source.length && /[gimsuy]/.test(source[i2])) i2++
          state = 'normal'
          continue
        }
        i2++
        continue
      case 'normal':
        if (templateStack.length > 0) {
          if (char === '{') {
            templateStack[templateStack.length - 1]++
          } else if (char === '}') {
            templateStack[templateStack.length - 1]--
            if (templateStack[templateStack.length - 1] === 0) {
              templateStack.pop()
              i2++
              state = 'template-string'
              continue
            }
          }
        }
        if (char === "'") {
          i2++
          state = 'single-string'
          continue
        }
        if (char === '"') {
          i2++
          state = 'double-string'
          continue
        }
        if (char === '`') {
          i2++
          state = 'template-string'
          continue
        }
        if (char === '/' && nextChar === '/') {
          i2 += 2
          state = 'line-comment'
          continue
        }
        if (char === '/' && nextChar === '*') {
          i2 += 2
          state = 'block-comment'
          continue
        }
        if (char === '/') {
          let j = i2 - 1
          while (j >= 0 && /\s/.test(source[j])) j--
          const beforeChar = j >= 0 ? source[j] : ''
          const isRegexContext =
            !beforeChar ||
            /[=(!,;:{[&|?+\-*%<>~^]/.test(beforeChar) ||
            (j >= 5 &&
              /\b(return|case|throw|in|of|typeof|instanceof|new|delete|void)$/.test(
                source.slice(Math.max(0, j - 10), j + 1)
              ))
          if (isRegexContext) {
            i2++
            state = 'regex'
            continue
          }
        }
        if (
          char === '=' &&
          nextChar === '=' &&
          source[i2 + 2] !== '=' &&
          source[i2 - 1] !== '!'
        ) {
          equalityOps.push({ pos: i2, op: '==' })
          i2 += 2
          continue
        }
        if (char === '!' && nextChar === '=' && source[i2 + 2] !== '=') {
          equalityOps.push({ pos: i2, op: '!=' })
          i2 += 2
          continue
        }
        break
    }
    i2++
  }
  if (equalityOps.length === 0) {
    return source
  }
  let result = source
  for (let k = equalityOps.length - 1; k >= 0; k--) {
    const { pos, op } = equalityOps[k]
    const funcName = op === '==' ? 'Is' : 'IsNot'
    const leftBoundary = findLeftOperandBoundary(result, pos)
    const rightBoundary = findRightOperandBoundary(result, pos + 2)
    const leftExpr = result.slice(leftBoundary, pos).trim()
    const rightExpr = result.slice(pos + 2, rightBoundary).trim()
    if (leftExpr && rightExpr) {
      const before = result.slice(0, leftBoundary)
      const after = result.slice(rightBoundary)
      const needsSpace = /[a-zA-Z0-9_$]$/.test(before)
      const spacer = needsSpace ? ' ' : ''
      result = `${before}${spacer}${funcName}(${leftExpr}, ${rightExpr})${after}`
    }
  }
  return result
}
function findLeftOperandBoundary(source, opPos) {
  let i2 = opPos - 1
  while (i2 >= 0 && /\s/.test(source[i2])) i2--
  if (i2 < 0) return 0
  let depth = 0
  let inString = false
  let stringChar = ''
  while (i2 >= 0) {
    const char = source[i2]
    const prevChar = i2 > 0 ? source[i2 - 1] : ''
    if (inString) {
      if (char === stringChar && prevChar !== '\\') {
        inString = false
      }
      i2--
      continue
    }
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      inString = true
      stringChar = char
      i2--
      continue
    }
    if (char === ')' || char === ']') {
      depth++
      i2--
      continue
    }
    if (char === '(' || char === '[') {
      if (depth > 0) {
        depth--
        i2--
        continue
      }
      return i2 + 1
    }
    if (depth > 0) {
      i2--
      continue
    }
    if (char === ';' || char === '{' || char === '}') {
      return i2 + 1
    }
    if (/[a-z]/.test(char)) {
      const wordEnd = i2 + 1
      let wordStart = i2
      while (wordStart > 0 && /[a-z]/i.test(source[wordStart - 1])) {
        wordStart--
      }
      const word = source.slice(wordStart, wordEnd)
      const beforeWord = wordStart > 0 ? source[wordStart - 1] : ''
      if (!/[a-zA-Z0-9_$]/.test(beforeWord)) {
        if (
          [
            'return',
            'throw',
            'case',
            'typeof',
            'void',
            'delete',
            'await',
            'yield',
            'new',
          ].includes(word)
        ) {
          return wordEnd
        }
      }
    }
    if (char === '>' && prevChar === '=') {
      return i2 + 1
    }
    if (
      char === '=' &&
      prevChar !== '=' &&
      prevChar !== '!' &&
      prevChar !== '<' &&
      prevChar !== '>'
    ) {
      return i2 + 1
    }
    if (char === '&' && prevChar === '&') {
      return i2 + 1
    }
    if (char === '|' && prevChar === '|') {
      return i2 + 1
    }
    if (char === '?' || char === ':') {
      return i2 + 1
    }
    if (char === ',') {
      return i2 + 1
    }
    i2--
  }
  return 0
}
function findRightOperandBoundary(source, startAfterOp) {
  let i2 = startAfterOp
  while (i2 < source.length && /\s/.test(source[i2])) i2++
  if (i2 >= source.length) return source.length
  let depth = 0
  let inString = false
  let stringChar = ''
  while (i2 < source.length) {
    const char = source[i2]
    const nextChar = i2 + 1 < source.length ? source[i2 + 1] : ''
    if (inString) {
      if (char === stringChar && source[i2 - 1] !== '\\') {
        inString = false
      }
      i2++
      continue
    }
    if (
      (char === '"' || char === "'" || char === '`') &&
      source[i2 - 1] !== '\\'
    ) {
      inString = true
      stringChar = char
      i2++
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      depth++
      i2++
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      if (depth > 0) {
        depth--
        i2++
        continue
      }
      return i2
    }
    if (depth > 0) {
      i2++
      continue
    }
    if (char === ';') {
      return i2
    }
    if (char === '&' && nextChar === '&') {
      return i2
    }
    if (char === '|' && nextChar === '|') {
      return i2
    }
    if (char === '?') {
      return i2
    }
    if (char === ':') {
      return i2
    }
    if (char === ',') {
      return i2
    }
    if (
      (char === '=' || char === '!') &&
      nextChar === '=' &&
      source[i2 + 2] !== '='
    ) {
      return i2
    }
    i2++
  }
  return source.length
}
function transformTypeDeclarations(source) {
  let result = ''
  let i2 = 0
  while (i2 < source.length) {
    const typeMatch = source
      .slice(i2)
      .match(/^\bType\s+([A-Z][a-zA-Z0-9_]*)\s*/)
    if (typeMatch) {
      const typeName = typeMatch[1]
      let j = i2 + typeMatch[0].length
      let description = typeName
      let descriptionWasExplicit = false
      const descStringMatch = source.slice(j).match(/^(['"`])([^]*?)\1\s*/)
      if (descStringMatch) {
        const afterString = j + descStringMatch[0].length
        const nextChar = source[afterString]
        const isEndOfStatement =
          nextChar === undefined ||
          afterString >= source.length ||
          (nextChar !== '=' && nextChar !== '{')
        if (nextChar === '=' || nextChar === '{') {
          description = descStringMatch[2]
          descriptionWasExplicit = true
          j = afterString
        } else if (isEndOfStatement) {
          const value = descStringMatch[0].trim()
          const trailingWs = descStringMatch[0].slice(value.length)
          result += `const ${typeName} = Type('${typeName}', ${value})${trailingWs}`
          i2 = afterString
          continue
        }
      }
      let defaultValue
      let posAfterDefault = j
      const equalsMatch = source.slice(j).match(/^=\s*/)
      if (equalsMatch) {
        j += equalsMatch[0].length
        const valueMatch = source
          .slice(j)
          .match(
            /^(\+?\d+(?:\.\d+)?|['"`][^'"`]*['"`]|\{[^}]*\}|\[[^\]]*\]|true|false|null)/
          )
        if (valueMatch) {
          defaultValue = valueMatch[0]
          j += valueMatch[0].length
          posAfterDefault = j
          const wsMatch = source.slice(j).match(/^\s*/)
          if (wsMatch) j += wsMatch[0].length
        }
      }
      if (source[j] === '{') {
        const bodyStart = j + 1
        let depth = 1
        let k = bodyStart
        while (k < source.length && depth > 0) {
          const char = source[k]
          if (char === '{') depth++
          else if (char === '}') depth--
          k++
        }
        if (depth !== 0) {
          result += source[i2]
          i2++
          continue
        }
        const blockBody = source.slice(bodyStart, k - 1).trim()
        const blockEnd = k
        const descInsideMatch = blockBody.match(
          /description\s*:\s*(['"`])([^]*?)\1/
        )
        if (descInsideMatch && !descriptionWasExplicit) {
          description = descInsideMatch[2]
        }
        let example
        const exampleKeyword = blockBody.match(/example\s*:\s*/)
        if (exampleKeyword) {
          const valueStart = exampleKeyword.index + exampleKeyword[0].length
          const extracted = extractJSValue(blockBody, valueStart)
          if (extracted) {
            example = extracted.value.trim()
          }
        }
        const predicateMatch = blockBody.match(
          /predicate\s*\(([^)]*)\)\s*\{([^]*)\}/
        )
        if (predicateMatch && example) {
          const params = predicateMatch[1].trim()
          const body = predicateMatch[2].trim()
          const defaultArg = defaultValue ? `, ${defaultValue}` : ''
          result += `const ${typeName} = Type('${description}', (${params}) => { if (!globalThis.__tjs?.validate(${params}, globalThis.__tjs?.infer(${example}))) return false; ${body} }, ${example}${defaultArg})`
        } else if (predicateMatch) {
          const params = predicateMatch[1].trim()
          const body = predicateMatch[2].trim()
          const defaultArg = defaultValue ? `, undefined, ${defaultValue}` : ''
          result += `const ${typeName} = Type('${description}', (${params}) => { ${body} }${defaultArg})`
        } else if (example) {
          const defaultArg = defaultValue ? `, ${defaultValue}` : ''
          result += `const ${typeName} = Type('${description}', undefined, ${example}${defaultArg})`
        } else if (defaultValue) {
          result += `const ${typeName} = Type('${description}', ${defaultValue})`
        } else {
          result += `const ${typeName} = Type('${description}')`
        }
        i2 = blockEnd
        continue
      } else if (defaultValue) {
        result += `const ${typeName} = Type('${description}', ${defaultValue})`
        i2 = posAfterDefault
        continue
      } else if (!descStringMatch) {
        const valueMatch = source
          .slice(j)
          .match(
            /^(['"`][^]*?['"`]|\+?\d+(?:\.\d+)?|true|false|null|\{[^]*?\}|\[[^]*?\])/
          )
        if (valueMatch) {
          const example = valueMatch[0]
          result += `const ${typeName} = Type('${typeName}', ${example})`
          i2 = j + valueMatch[0].length
          continue
        }
      }
    }
    result += source[i2]
    i2++
  }
  return result
}
function transformGenericDeclarations(source) {
  let result = ''
  let i2 = 0
  while (i2 < source.length) {
    const genericMatch = source
      .slice(i2)
      .match(/^\bGeneric\s+([A-Z][a-zA-Z0-9_]*)\s*<([^>]+)>\s*\{/)
    if (genericMatch) {
      const genericName = genericMatch[1]
      const typeParamsStr = genericMatch[2]
      const blockStart = i2 + genericMatch[0].length - 1
      const bodyStart = blockStart + 1
      let depth = 1
      let k = bodyStart
      while (k < source.length && depth > 0) {
        const char = source[k]
        if (char === '{') depth++
        else if (char === '}') depth--
        k++
      }
      if (depth !== 0) {
        result += source[i2]
        i2++
        continue
      }
      const blockBody = source.slice(bodyStart, k - 1).trim()
      const blockEnd = k
      const typeParams = typeParamsStr.split(',').map((p) => {
        const parts = p
          .trim()
          .split('=')
          .map((s) => s.trim())
        if (parts.length === 2) {
          return `['${parts[0]}', ${parts[1]}]`
        }
        return `'${parts[0]}'`
      })
      const descMatch = blockBody.match(/description\s*:\s*(['"`])([^]*?)\1/)
      const predicateMatch = blockBody.match(
        /predicate\s*\(([^)]*)\)\s*\{([^]*)\}/
      )
      const description = descMatch ? descMatch[2] : genericName
      if (predicateMatch) {
        const params = predicateMatch[1]
          .trim()
          .split(',')
          .map((s) => s.trim())
        let body = predicateMatch[2].trim()
        const valueParam = params[0] || 'x'
        const typeParamNames = params.slice(1)
        const typeCheckParams = typeParamNames.map((p) => `check${p}`)
        typeParamNames.forEach((name, idx) => {
          body = body.replace(
            new RegExp(`\\b${name}\\s*\\(`, 'g'),
            `${typeCheckParams[idx]}(`
          )
        })
        result += `const ${genericName} = Generic([${typeParams.join(
          ', '
        )}], (${valueParam}, ${typeCheckParams.join(
          ', '
        )}) => { ${body} }, '${description}')`
      } else {
        result += `const ${genericName} = Generic([${typeParams.join(
          ', '
        )}], () => true, '${description}')`
      }
      i2 = blockEnd
      continue
    }
    result += source[i2]
    i2++
  }
  return result
}
function transformUnionDeclarations(source) {
  let result = ''
  let i2 = 0
  while (i2 < source.length) {
    const unionMatch = source
      .slice(i2)
      .match(/^\bUnion\s+([A-Z][a-zA-Z0-9_]*)\s+(['"`])([^]*?)\2\s*/)
    if (unionMatch) {
      const unionName = unionMatch[1]
      const description = unionMatch[3]
      const j = i2 + unionMatch[0].length
      if (source[j] === '{') {
        const bodyStart = j + 1
        let depth = 1
        let k = bodyStart
        while (k < source.length && depth > 0) {
          const char = source[k]
          if (char === '{') depth++
          else if (char === '}') depth--
          k++
        }
        if (depth !== 0) {
          result += source[i2]
          i2++
          continue
        }
        const blockBody = source.slice(bodyStart, k - 1).trim()
        const blockEnd = k
        const values = parseUnionValues(blockBody)
        result += `const ${unionName} = Union('${description}', [${values.join(
          ', '
        )}])`
        i2 = blockEnd
        continue
      } else {
        let lineEnd = source.indexOf(
          `
`,
          j
        )
        if (lineEnd === -1) lineEnd = source.length
        const inlineValues = source.slice(j, lineEnd).trim()
        if (inlineValues) {
          const values = parseUnionValues(inlineValues)
          result += `const ${unionName} = Union('${description}', [${values.join(
            ', '
          )}])`
          i2 = lineEnd
          continue
        }
      }
    }
    result += source[i2]
    i2++
  }
  return result
}
function parseUnionValues(input) {
  const values = []
  const parts = input.split('|').map((p) => p.trim())
  for (const part of parts) {
    if (!part) continue
    values.push(part)
  }
  return values
}
function transformEnumDeclarations(source) {
  let result = ''
  let i2 = 0
  while (i2 < source.length) {
    const enumMatch = source
      .slice(i2)
      .match(/^\bEnum\s+([A-Z][a-zA-Z0-9_]*)\s+(['"`])([^]*?)\2\s*\{/)
    if (enumMatch) {
      const enumName = enumMatch[1]
      const description = enumMatch[3]
      const blockStart = i2 + enumMatch[0].length - 1
      const bodyStart = blockStart + 1
      let depth = 1
      let k = bodyStart
      while (k < source.length && depth > 0) {
        const char = source[k]
        if (char === '{') depth++
        else if (char === '}') depth--
        k++
      }
      if (depth !== 0) {
        result += source[i2]
        i2++
        continue
      }
      const blockBody = source.slice(bodyStart, k - 1).trim()
      const blockEnd = k
      const members = parseEnumMembers(blockBody)
      const membersStr = members
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
      result += `const ${enumName} = Enum('${description}', { ${membersStr} })`
      i2 = blockEnd
      continue
    }
    result += source[i2]
    i2++
  }
  return result
}
function parseEnumMembers(input) {
  const members = []
  let currentNumericValue = 0
  const lines = input
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*(.+))?$/)
    if (match) {
      const key = match[1]
      const explicitValue = match[2]?.trim()
      if (explicitValue !== undefined) {
        members.push([key, explicitValue])
        const numVal = Number(explicitValue)
        if (!isNaN(numVal)) {
          currentNumericValue = numVal + 1
        }
      } else {
        members.push([key, String(currentNumericValue)])
        currentNumericValue++
      }
    }
  }
  return members
}
function transformExtendDeclarations(source) {
  const extensions = new Map()
  let result = ''
  let i2 = 0
  while (i2 < source.length) {
    const remaining = source.slice(i2)
    const extendMatch = remaining.match(/^(\s*)extend\s+([A-Z]\w*)\s*\{/)
    if (!extendMatch) {
      const lineStart =
        i2 === 0 ||
        source[i2 - 1] ===
          `
` ||
        source[i2 - 1] === ';' ||
        source[i2 - 1] === '}'
      if (lineStart) {
        const afterWS = remaining.match(/^(\s*)extend\s+([A-Z]\w*)\s*\{/)
        if (afterWS) {
        }
      }
      result += source[i2]
      i2++
      continue
    }
    const indent = extendMatch[1]
    const typeName = extendMatch[2]
    const blockStart = i2 + extendMatch[0].length - 1
    const blockEnd = findFunctionBodyEnd(source, blockStart)
    const blockBody = source.slice(blockStart + 1, blockEnd - 1).trim()
    const methods = []
    let j = 0
    const bodySource = source.slice(blockStart + 1, blockEnd - 1)
    while (j < bodySource.length) {
      const methodRemaining = bodySource.slice(j)
      const methodMatch = methodRemaining.match(/^(\s*)(async\s+)?(\w+)\s*\(/)
      if (!methodMatch) {
        j++
        continue
      }
      const methodIndent = methodMatch[1]
      const isAsync = !!methodMatch[2]
      const methodName = methodMatch[3]
      const parenStart = j + methodMatch[0].length - 1
      let parenDepth = 1
      let k = parenStart + 1
      while (k < bodySource.length && parenDepth > 0) {
        if (bodySource[k] === '(') parenDepth++
        if (bodySource[k] === ')') parenDepth--
        k++
      }
      const paramsStr = bodySource.slice(parenStart + 1, k - 1)
      let afterParams = k
      while (
        afterParams < bodySource.length &&
        /\s/.test(bodySource[afterParams])
      ) {
        afterParams++
      }
      if (
        bodySource[afterParams] === '=' &&
        bodySource[afterParams + 1] === '>'
      ) {
        const loc = locAt(source, blockStart + 1 + j)
        throw new SyntaxError2(
          `Arrow functions are not allowed in extend blocks (method '${methodName}' in extend ${typeName}). ` +
            `Use regular function syntax instead, as extension methods need 'this' binding.`,
          loc
        )
      }
      if (bodySource[afterParams] !== '{') {
        j++
        continue
      }
      const methodBodyEnd = findFunctionBodyEnd(bodySource, afterParams)
      const fullMethodText = bodySource.slice(j, methodBodyEnd).trim()
      const transformedParams = paramsStr
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => {
          const colonMatch = p.match(/^(\w+)\s*:\s*(.+)$/)
          if (colonMatch) return `${colonMatch[1]} = ${colonMatch[2]}`
          return p
        })
        .join(', ')
      const asyncPrefix = isAsync ? 'async ' : ''
      const methodBody = bodySource.slice(afterParams + 1, methodBodyEnd - 1)
      methods.push({
        name: methodName,
        isAsync,
        fullText: `${methodName}: ${asyncPrefix}function(${transformedParams}) {${methodBody}}`,
      })
      j = methodBodyEnd
    }
    const isFirstForType = !extensions.has(typeName)
    if (isFirstForType) {
      extensions.set(typeName, new Set())
    }
    const extSet = extensions.get(typeName)
    for (const m of methods) {
      extSet.add(m.name)
    }
    const methodEntries = methods.map((m) => `  ${m.fullText}`).join(`,
`)
    let replacement
    if (isFirstForType) {
      replacement = `${indent}const __ext_${typeName} = {
${methodEntries}
${indent}}
`
    } else {
      replacement = `${indent}Object.assign(__ext_${typeName}, {
${methodEntries}
${indent}})
`
    }
    for (const m of methods) {
      replacement += `${indent}if (__tjs?.registerExtension) { __tjs.registerExtension('${typeName}', '${m.name}', __ext_${typeName}.${m.name}) }
`
    }
    result += replacement
    i2 = blockEnd
  }
  if (i2 <= source.length && result.length < source.length) {
  }
  return { source: result, extensions }
}
function transformExtensionCalls(source, extensions) {
  if (extensions.size === 0) return source
  const methodToTypes = new Map()
  for (const [typeName, methods] of extensions) {
    for (const method of methods) {
      if (!methodToTypes.has(method)) {
        methodToTypes.set(method, [])
      }
      methodToTypes.get(method).push(typeName)
    }
  }
  let result = source
  for (const [method, typeNames] of methodToTypes) {
    if (!typeNames.includes('String')) continue
    const singleQuotePattern = new RegExp(
      `('(?:[^'\\\\]|\\\\.)*')\\.(${method})\\((\\))?`,
      'g'
    )
    result = result.replace(singleQuotePattern, (_, str, meth, closeParen) => {
      return closeParen
        ? `__ext_String.${meth}.call(${str})`
        : `__ext_String.${meth}.call(${str}, `
    })
    const doubleQuotePattern = new RegExp(
      `("(?:[^"\\\\]|\\\\.)*")\\.(${method})\\((\\))?`,
      'g'
    )
    result = result.replace(doubleQuotePattern, (_, str, meth, closeParen) => {
      return closeParen
        ? `__ext_String.${meth}.call(${str})`
        : `__ext_String.${meth}.call(${str}, `
    })
    const templatePattern = new RegExp(
      '(`(?:[^`\\\\]|\\\\.)*`)\\.' + method + '\\((\\))?',
      'g'
    )
    result = result.replace(templatePattern, (_, str, closeParen) => {
      return closeParen
        ? `__ext_String.${method}.call(${str})`
        : `__ext_String.${method}.call(${str}, `
    })
  }
  for (const [method, typeNames] of methodToTypes) {
    if (!typeNames.includes('Array')) continue
    const methodDot = `].${method}(`
    let searchFrom = 0
    let idx
    while ((idx = result.indexOf(methodDot, searchFrom)) !== -1) {
      let bracketDepth = 1
      let k = idx - 1
      let inStr = false
      while (k >= 0 && bracketDepth > 0) {
        const ch = result[k]
        if (inStr) {
          if (ch === inStr && (k === 0 || result[k - 1] !== '\\')) {
            inStr = false
          }
        } else {
          if (ch === ']') bracketDepth++
          if (ch === '[') bracketDepth--
          if (ch === "'" || ch === '"' || ch === '`') inStr = ch
        }
        k--
      }
      if (bracketDepth === 0) {
        const arrayLiteral = result.slice(k + 1, idx + 1)
        const before = result.slice(0, k + 1)
        const after = result.slice(idx + methodDot.length)
        if (after[0] === ')') {
          result = `${before}__ext_Array.${method}.call(${arrayLiteral})${after.slice(
            1
          )}`
        } else {
          result = `${before}__ext_Array.${method}.call(${arrayLiteral}, ${after}`
        }
      }
      searchFrom = idx + 1
    }
  }
  for (const [method, typeNames] of methodToTypes) {
    if (!typeNames.includes('Number')) continue
    const numPattern = new RegExp(
      `(\\d+(?:\\.\\d+)?)\\.(${method})\\((\\))?`,
      'g'
    )
    result = result.replace(numPattern, (_, num, meth, closeParen) => {
      return closeParen
        ? `__ext_Number.${meth}.call(${num})`
        : `__ext_Number.${meth}.call(${num}, `
    })
  }
  return result
}
function locAt(source, pos) {
  let line = 1
  let column = 0
  for (let i2 = 0; i2 < pos && i2 < source.length; i2++) {
    if (
      source[i2] ===
      `
`
    ) {
      line++
      column = 0
    } else {
      column++
    }
  }
  return { line, column }
}
function typeCheckForDefault(argExpr, defaultValue) {
  const dv = defaultValue.trim()
  if (/^['"`]/.test(dv)) return `typeof ${argExpr} === 'string'`
  if (dv === 'true' || dv === 'false') return `typeof ${argExpr} === 'boolean'`
  if (dv === 'null') return `${argExpr} === null`
  if (dv === 'undefined') return `${argExpr} === undefined`
  if (dv.startsWith('[')) return `Array.isArray(${argExpr})`
  if (dv.startsWith('{'))
    return `(typeof ${argExpr} === 'object' && ${argExpr} !== null && !Array.isArray(${argExpr}))`
  if (/^\+\d+/.test(dv))
    return `(typeof ${argExpr} === 'number' && Number.isInteger(${argExpr}) && ${argExpr} >= 0)`
  if (/^-?\d+\.\d+/.test(dv)) return `typeof ${argExpr} === 'number'`
  if (/^-?\d+$/.test(dv))
    return `(typeof ${argExpr} === 'number' && Number.isInteger(${argExpr}))`
  return 'true'
}
function typeSignatureForDefault(defaultValue) {
  const dv = defaultValue.trim()
  if (/^['"`]/.test(dv)) return 'string'
  if (dv === 'true' || dv === 'false') return 'boolean'
  if (dv === 'null') return 'null'
  if (dv === 'undefined') return 'undefined'
  if (dv.startsWith('[')) return 'array'
  if (dv.startsWith('{')) return 'object'
  if (/^\+\d+/.test(dv)) return 'non-negative-integer'
  if (/^-?\d+\.\d+/.test(dv)) return 'number'
  if (/^-?\d+$/.test(dv)) return 'integer'
  return 'any'
}
function parseParamList(paramStr, requiredParams) {
  const params = []
  let depth = 0
  let current2 = ''
  let inString = false
  for (let i2 = 0; i2 < paramStr.length; i2++) {
    const ch = paramStr[i2]
    if (!inString && (ch === "'" || ch === '"' || ch === '`')) {
      inString = ch
      current2 += ch
      continue
    }
    if (inString) {
      current2 += ch
      if (ch === '\\') {
        i2++
        if (i2 < paramStr.length) current2 += paramStr[i2]
        continue
      }
      if (ch === inString) inString = false
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++
      current2 += ch
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      current2 += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      const param = parseOneParam(current2.trim(), requiredParams)
      if (param) params.push(param)
      current2 = ''
      continue
    }
    current2 += ch
  }
  const trimmed = current2.trim()
  if (trimmed) {
    const param = parseOneParam(trimmed, requiredParams)
    if (param) params.push(param)
  }
  return params
}
function parseOneParam(paramStr, requiredParams) {
  const str = paramStr.replace(/^\/\*\s*unsafe\s*\*\/\s*/, '')
  if (str.startsWith('...')) return null
  const eqIdx = str.indexOf('=')
  if (eqIdx === -1) {
    return { name: str.trim(), defaultValue: '', required: true }
  }
  const name = str.slice(0, eqIdx).trim()
  const defaultValue = str.slice(eqIdx + 1).trim()
  return { name, defaultValue, required: requiredParams.has(name) }
}
function findFunctionBodyEnd(source, openBracePos) {
  let depth = 1
  let i2 = openBracePos + 1
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  while (i2 < source.length && depth > 0) {
    const ch = source[i2]
    const next = i2 + 1 < source.length ? source[i2 + 1] : ''
    if (inLineComment) {
      if (
        ch ===
        `
`
      )
        inLineComment = false
      i2++
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i2 += 2
        continue
      }
      i2++
      continue
    }
    if (inString) {
      if (ch === '\\') {
        i2 += 2
        continue
      }
      if (ch === inString) inString = false
      i2++
      continue
    }
    if (ch === '/' && next === '/') {
      inLineComment = true
      i2 += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i2 += 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch
      i2++
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') depth--
    i2++
  }
  return i2
}
function transformPolymorphicFunctions(source, requiredParams) {
  const polymorphicNames = new Set()
  const funcPattern =
    /(?:^|(?<=[\n;{}]))\s*(export\s+)?(async\s+)?function\s+(\w+)\s*\(/gm
  const declarations = new Map()
  let match
  const allMatches = []
  while ((match = funcPattern.exec(source)) !== null) {
    const exported = !!match[1]
    const isAsync = !!match[2]
    const name = match[3]
    const fullMatchStart = match.index
    let funcKeywordStart = fullMatchStart
    const prefix = match[0]
    const funcIdx = prefix.indexOf('function')
    if (funcIdx >= 0) funcKeywordStart = fullMatchStart + funcIdx
    allMatches.push({
      name,
      fullMatchStart,
      funcKeywordStart,
      exported,
      isAsync,
    })
  }
  for (const m of allMatches) {
    if (!declarations.has(m.name)) {
      declarations.set(m.name, [])
    }
  }
  const nameCounts = new Map()
  for (const m of allMatches) {
    nameCounts.set(m.name, (nameCounts.get(m.name) || 0) + 1)
  }
  const polyNames = new Set()
  for (const [name, count] of nameCounts) {
    if (count > 1) polyNames.add(name)
  }
  if (polyNames.size === 0) {
    return { source, polymorphicNames }
  }
  for (const m of allMatches) {
    if (!polyNames.has(m.name)) continue
    const afterFunc = source.indexOf('(', m.funcKeywordStart)
    if (afterFunc === -1) continue
    let parenDepth = 1
    let j = afterFunc + 1
    while (j < source.length && parenDepth > 0) {
      if (source[j] === '(') parenDepth++
      if (source[j] === ')') parenDepth--
      j++
    }
    const closeParen = j - 1
    const paramStr = source.slice(afterFunc + 1, closeParen)
    let bodyStart = j
    while (bodyStart < source.length && source[bodyStart] !== '{') bodyStart++
    if (bodyStart >= source.length) continue
    const bodyEnd = findFunctionBodyEnd(source, bodyStart)
    let realStart = m.fullMatchStart
    while (realStart > 0 && source[realStart - 1] === ' ') realStart--
    const variants = declarations.get(m.name)
    const params = parseParamList(paramStr, requiredParams)
    const hasRestParam = paramStr.includes('...')
    if (hasRestParam) {
      const loc = locAt(source, m.funcKeywordStart)
      throw new SyntaxError2(
        `Rest parameters are not supported in polymorphic function '${m.name}'. ` +
          `Use separate function names instead.`,
        loc
      )
    }
    variants.push({
      index: variants.length + 1,
      start: realStart,
      end: bodyEnd,
      text: source.slice(realStart, bodyEnd),
      exported: m.exported,
      isAsync: m.isAsync,
      params,
    })
  }
  for (const [name, variants] of declarations) {
    if (variants.length < 2) continue
    const asyncCount = variants.filter((v) => v.isAsync).length
    if (asyncCount > 0 && asyncCount < variants.length) {
      const loc = locAt(source, variants[0].start)
      throw new SyntaxError2(
        `Polymorphic function '${name}': all variants must be either sync or async, not mixed.`,
        loc
      )
    }
    for (let i2 = 0; i2 < variants.length; i2++) {
      for (let j = i2 + 1; j < variants.length; j++) {
        const a = variants[i2]
        const b = variants[j]
        if (a.params.length !== b.params.length) continue
        let allSame = true
        for (let k = 0; k < a.params.length; k++) {
          const sigA = a.params[k].defaultValue
            ? typeSignatureForDefault(a.params[k].defaultValue)
            : 'any'
          const sigB = b.params[k].defaultValue
            ? typeSignatureForDefault(b.params[k].defaultValue)
            : 'any'
          if (sigA !== sigB) {
            allSame = false
            break
          }
        }
        if (allSame) {
          const loc = locAt(source, b.start)
          throw new SyntaxError2(
            `Polymorphic function '${name}': variants ${i2 + 1} and ${
              j + 1
            } have ambiguous signatures ` +
              `(same parameter types at every position). Overloads must differ by arity or parameter types.`,
            loc
          )
        }
      }
    }
  }
  const allVariants = []
  for (const [name, variants] of declarations) {
    if (variants.length < 2) continue
    for (const v of variants) {
      allVariants.push({ name, variant: v })
    }
  }
  allVariants.sort((a, b) => b.variant.start - a.variant.start)
  let result = source
  for (const { name, variant } of allVariants) {
    const asyncPrefix = variant.isAsync ? 'async ' : ''
    const renamed = variant.text.replace(
      new RegExp(
        `(?:export\\s+)?${
          asyncPrefix ? asyncPrefix.replace(/\s+$/, '\\s+') : ''
        }function\\s+${name}\\s*\\(`
      ),
      `${asyncPrefix}function ${name}$$${variant.index}(`
    )
    result =
      result.slice(0, variant.start) + renamed + result.slice(variant.end)
  }
  for (const [name, variants] of declarations) {
    if (variants.length < 2) continue
    polymorphicNames.add(name)
    const isAsync = variants[0].isAsync
    const isExported = variants.some((v) => v.exported)
    const asyncPrefix = isAsync ? 'async ' : ''
    const exportPrefix = isExported ? 'export ' : ''
    const sorted = [...variants].sort((a, b) => {
      if (a.params.length !== b.params.length) return 0
      let specA = 0
      let specB = 0
      for (const p of a.params) {
        const sig = p.defaultValue
          ? typeSignatureForDefault(p.defaultValue)
          : 'any'
        if (sig === 'non-negative-integer') specA += 3
        else if (sig === 'integer') specA += 2
        else if (sig !== 'any') specA += 1
      }
      for (const p of b.params) {
        const sig = p.defaultValue
          ? typeSignatureForDefault(p.defaultValue)
          : 'any'
        if (sig === 'non-negative-integer') specB += 3
        else if (sig === 'integer') specB += 2
        else if (sig !== 'any') specB += 1
      }
      return specB - specA
    })
    const branches = []
    for (const v of sorted) {
      const checks = [`__args.length === ${v.params.length}`]
      const args = []
      for (let k = 0; k < v.params.length; k++) {
        const p = v.params[k]
        args.push(`__args[${k}]`)
        if (p.defaultValue) {
          const check = typeCheckForDefault(`__args[${k}]`, p.defaultValue)
          if (check !== 'true') checks.push(check)
        }
      }
      branches.push(
        `  if (${checks.join(' && ')}) return ${name}$${v.index}(${args.join(
          ', '
        )})`
      )
    }
    const dispatcher = `
${exportPrefix}${asyncPrefix}function ${name}(...__args) {
${branches.join(`
`)}
  return __tjs.typeError('${name}', 'no matching overload', __args)
}
`
    result += dispatcher
  }
  return { source: result, polymorphicNames }
}
function transformBareAssignments(source) {
  return source.replace(
    /(?<=^|[;\n{])\s*([A-Z][a-zA-Z0-9_]*)\s*=(?!=)/gm,
    (match, name) => {
      return match.replace(name, `const ${name}`)
    }
  )
}
function parse4(source, options = {}) {
  const {
    filename = '<source>',
    colonShorthand = true,
    vmTarget = false,
  } = options
  const {
    source: processedSource,
    returnType,
    returnSafety,
    moduleSafety,
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
    wasmBlocks,
    tests,
    testErrors,
  } = colonShorthand
    ? preprocess(source, { vmTarget })
    : {
        source,
        returnType: undefined,
        returnSafety: undefined,
        moduleSafety: undefined,
        originalSource: source,
        requiredParams: new Set(),
        unsafeFunctions: new Set(),
        safeFunctions: new Set(),
        wasmBlocks: [],
        tests: [],
        testErrors: [],
      }
  try {
    const ast = parse3(processedSource, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      allowReturnOutsideFunction: false,
    })
    return {
      ast,
      returnType,
      returnSafety,
      moduleSafety,
      originalSource,
      requiredParams,
      unsafeFunctions,
      safeFunctions,
      wasmBlocks,
      tests,
      testErrors,
    }
  } catch (e) {
    const loc = e.loc || { line: 1, column: 0 }
    throw new SyntaxError2(
      e.message.replace(/\s*\(\d+:\d+\)$/, ''),
      loc,
      originalSource,
      filename
    )
  }
}
function validateSingleFunction(ast, filename) {
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      throw new SyntaxError2(
        'Imports are not supported. All atoms must be registered with the VM.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
    if (
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
    ) {
      throw new SyntaxError2(
        'Exports are not supported. The function is automatically exported.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
    if (node.type === 'ClassDeclaration') {
      throw new SyntaxError2(
        'Classes are not supported. Agent99 uses functional composition.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
  }
  const functions = ast.body.filter(
    (node) => node.type === 'FunctionDeclaration'
  )
  if (functions.length === 0) {
    throw new SyntaxError2(
      'Source must contain a function declaration',
      { line: 1, column: 0 },
      undefined,
      filename
    )
  }
  if (functions.length > 1) {
    const second = functions[1]
    throw new SyntaxError2(
      'Only a single function per agent is allowed',
      second.loc?.start || { line: 1, column: 0 },
      undefined,
      filename
    )
  }
  return functions[0]
}
function extractTDoc(source, func) {
  const result = {
    params: {},
  }
  if (!func.loc) return result
  const beforeFunc = source.substring(0, func.start)
  const allDocBlocks = [...beforeFunc.matchAll(/\/\*#([\s\S]*?)\*\//g)]
  if (allDocBlocks.length > 0) {
    const lastBlock = allDocBlocks[allDocBlocks.length - 1]
    const afterBlock = beforeFunc.substring(
      lastBlock.index + lastBlock[0].length
    )
    if (/^(?:\s|\/\/[^\n]*)*$/.test(afterBlock)) {
      let content = lastBlock[1]
      const lines = content.split(`
`)
      const minIndent = lines
        .filter((line) => line.trim().length > 0)
        .reduce((min, line) => {
          const indent = line.match(/^(\s*)/)?.[1].length || 0
          return Math.min(min, indent)
        }, Infinity)
      if (minIndent > 0 && minIndent < Infinity) {
        content = lines.map((line) => line.slice(minIndent)).join(`
`)
      }
      result.description = content.trim()
      return result
    }
  }
  const jsdocMatch = beforeFunc.match(/\/\*\*[\s\S]*?\*\/\s*$/)
  if (!jsdocMatch) return result
  const jsdoc = jsdocMatch[0]
  const descMatch = jsdoc.match(/\/\*\*\s*\n?\s*\*?\s*([^@\n][^\n]*)/m)
  if (descMatch) {
    result.description = descMatch[1].trim()
  }
  const paramRegex = /@param\s+(?:\{[^}]+\}\s+)?(\w+)\s*-?\s*(.*)/g
  let match
  while ((match = paramRegex.exec(jsdoc)) !== null) {
    result.params[match[1]] = match[2].trim()
  }
  return result
}
function extractAndRunTests(source, skipTests = false) {
  const tests = []
  const errors = []
  let result = ''
  let i2 = 0
  while (i2 < source.length) {
    const testMatch = source.slice(i2).match(/^\btest\s+/)
    if (testMatch) {
      const start = i2
      let j = i2 + testMatch[0].length
      let description
      const descMatch = source.slice(j).match(/^(['"`])([^]*?)\1\s*/)
      if (descMatch) {
        description = descMatch[2]
        j += descMatch[0].length
      }
      if (source[j] === '{') {
        const bodyStart = j + 1
        let depth = 1
        let k = bodyStart
        while (k < source.length && depth > 0) {
          const char = source[k]
          if (char === '{') depth++
          else if (char === '}') depth--
          k++
        }
        if (depth === 0) {
          const body = source.slice(bodyStart, k - 1).trim()
          const end = k
          tests.push({ description, body, start, end })
          if (!skipTests) {
            try {
              const testFn = new Function(body)
              testFn()
            } catch (err) {
              const desc = description || `test at position ${start}`
              errors.push(`Test failed: ${desc}
  ${err.message || err}`)
            }
          }
          const removed = source.slice(start, end)
          const newlines = (removed.match(/\n/g) || []).length
          result += `
`.repeat(newlines)
          i2 = end
          continue
        }
      }
    }
    result += source[i2]
    i2++
  }
  return { source: result, tests, errors }
}
function transformPolymorphicConstructors(source, requiredParams) {
  const polyCtorClasses = new Set()
  const classRegex = /\bclass\s+(\w+)(\s+extends\s+\w+)?\s*\{/g
  let classMatch
  const classInfos = []
  while ((classMatch = classRegex.exec(source)) !== null) {
    const className = classMatch[1]
    const extendsClause = classMatch[2]?.trim() || ''
    const bodyStart = classMatch.index + classMatch[0].length - 1
    const bodyEnd = findFunctionBodyEnd(source, bodyStart)
    const body = source.slice(bodyStart, bodyEnd)
    classInfos.push({ className, extendsClause, bodyStart, bodyEnd, body })
  }
  let result = source
  for (let ci = classInfos.length - 1; ci >= 0; ci--) {
    const { className, extendsClause, bodyStart, bodyEnd, body } =
      classInfos[ci]
    const ctorPattern = /\bconstructor\s*\(/g
    let ctorMatch
    const ctorPositions = []
    while ((ctorMatch = ctorPattern.exec(body)) !== null) {
      ctorPositions.push(ctorMatch.index)
    }
    if (ctorPositions.length < 2) continue
    polyCtorClasses.add(className)
    const ctors = []
    for (let i2 = 0; i2 < ctorPositions.length; i2++) {
      const pos = ctorPositions[i2]
      const parenStart = body.indexOf('(', pos)
      let parenDepth = 1
      let j = parenStart + 1
      while (j < body.length && parenDepth > 0) {
        if (body[j] === '(') parenDepth++
        if (body[j] === ')') parenDepth--
        j++
      }
      const paramStr = body.slice(parenStart + 1, j - 1)
      let braceStart = j
      while (braceStart < body.length && body[braceStart] !== '{') braceStart++
      const ctorBodyEnd = findFunctionBodyEnd(body, braceStart)
      const bodyText = body.slice(braceStart + 1, ctorBodyEnd - 1)
      ctors.push({
        index: i2 + 1,
        paramStr,
        bodyText,
        fullStart: pos,
        fullEnd: ctorBodyEnd,
      })
    }
    let newBody = body.slice(0, ctors[0].fullEnd)
    const afterLastCtor = ctors[ctors.length - 1].fullEnd
    newBody += body.slice(afterLastCtor)
    let cleanBody = body
    for (let i2 = ctors.length - 1; i2 >= 1; i2--) {
      const ctor = ctors[i2]
      let start = ctor.fullStart
      while (start > 0 && cleanBody[start - 1] === ' ') start--
      if (
        start > 0 &&
        cleanBody[start - 1] ===
          `
`
      )
        start--
      cleanBody = cleanBody.slice(0, start) + cleanBody.slice(ctor.fullEnd)
    }
    let factories = ''
    for (let i2 = 1; i2 < ctors.length; i2++) {
      const ctor = ctors[i2]
      const params = parseParamList(ctor.paramStr, requiredParams)
      const hasRest = ctor.paramStr.includes('...')
      if (hasRest) {
        const loc = locAt(source, bodyStart + ctor.fullStart)
        throw new SyntaxError2(
          `Rest parameters are not supported in polymorphic constructors for '${className}'.`,
          loc
        )
      }
      factories += `
function ${className}$ctor$${ctor.index}(${ctor.paramStr}) {`
      factories += `
  const __obj = Object.create(${className}.prototype)`
      if (extendsClause) {
      }
      factories += `
  ;(function() {${ctor.bodyText}}).call(__obj)`
      factories += `
  return __obj`
      factories += `
}
`
    }
    const dispatchBranches = []
    for (let i2 = 0; i2 < ctors.length; i2++) {
      const ctor = ctors[i2]
      const params = parseParamList(ctor.paramStr, requiredParams)
      const checks = [`a.length === ${params.length}`]
      for (let k = 0; k < params.length; k++) {
        const p = params[k]
        if (p.defaultValue) {
          const check = typeCheckForDefault(`a[${k}]`, p.defaultValue)
          if (check !== 'true') checks.push(check)
        }
      }
      if (i2 === 0) {
        dispatchBranches.push(
          `    if (${checks.join(' && ')}) return Reflect.construct(t, a)`
        )
      } else {
        const args = params.map((_, k) => `a[${k}]`).join(', ')
        dispatchBranches.push(
          `    if (${checks.join(' && ')}) return ${className}$ctor$${
            ctor.index
          }(${args})`
        )
      }
    }
    factories += `
function ${className}$dispatch(t, a) {
`
    factories +=
      dispatchBranches.join(`
`) +
      `
`
    factories += `    return __tjs.typeError('${className}', 'no matching constructor', a)
`
    factories += `}
`
    result = result.slice(0, bodyStart) + cleanBody + result.slice(bodyEnd)
    const insertPos = bodyStart + cleanBody.length
    result = result.slice(0, insertPos) + factories + result.slice(insertPos)
  }
  return { source: result, polyCtorClasses }
}
function wrapClassDeclarations(source, polyCtorClasses = new Set()) {
  const classRegex = /\bclass\s+(\w+)(\s+extends\s+\w+)?\s*\{/g
  let result = ''
  let lastIndex = 0
  let match
  while ((match = classRegex.exec(source)) !== null) {
    const className = match[1]
    const extendsClause = match[2] || ''
    const classStart = match.index
    const bodyStart = classStart + match[0].length - 1
    let depth = 1
    let i2 = bodyStart + 1
    while (i2 < source.length && depth > 0) {
      const char = source[i2]
      if (char === '{') depth++
      else if (char === '}') depth--
      i2++
    }
    if (depth === 0) {
      const classEnd = i2
      const classBody = source.slice(bodyStart, classEnd)
      result += source.slice(lastIndex, classStart)
      result += `let ${className} = class ${className}${extendsClause} ${classBody}; `
      if (polyCtorClasses.has(className)) {
        result += `${className} = new Proxy(${className}, { apply(t, _, a) { return ${className}$dispatch(t, a) }, construct(t, a) { return ${className}$dispatch(t, a) } });`
      } else {
        result += `${className} = new Proxy(${className}, { apply(t, _, a) { return Reflect.construct(t, a) } });`
      }
      lastIndex = classEnd
    }
  }
  result += source.slice(lastIndex)
  return result
}
function validateNoDate(source) {
  const datePatterns = [
    {
      pattern: /\bnew\s+Date\b/,
      message:
        'new Date() is not allowed in TjsDate mode. Use Timestamp.now() or Timestamp.from()',
    },
    {
      pattern: /\bDate\.now\b/,
      message: 'Date.now() is not allowed in TjsDate mode. Use Timestamp.now()',
    },
    {
      pattern: /\bDate\.parse\b/,
      message:
        'Date.parse() is not allowed in TjsDate mode. Use Timestamp.parse()',
    },
    {
      pattern: /\bDate\.UTC\b/,
      message:
        'Date.UTC() is not allowed in TjsDate mode. Use Timestamp.from()',
    },
  ]
  for (const { pattern, message } of datePatterns) {
    if (pattern.test(source)) {
      throw new Error(message)
    }
  }
  return source
}
function validateNoEval(source) {
  const evalPattern = /(?<![A-Za-z_$])\beval\s*\(/
  if (evalPattern.test(source)) {
    throw new Error(
      'eval() is not allowed in TjsNoeval mode. Use Eval() from TJS runtime for safe evaluation.'
    )
  }
  const functionPattern = /\bnew\s+Function\s*\(/
  if (functionPattern.test(source)) {
    throw new Error(
      'new Function() is not allowed in TjsNoeval mode. Use SafeFunction() from TJS runtime.'
    )
  }
  return source
}

// ../src/lang/inference.ts
function inferTypeFromValue(node) {
  switch (node.type) {
    case 'Literal': {
      const value = node.value
      if (value === null) {
        return { kind: 'null' }
      }
      if (typeof value === 'string') {
        return { kind: 'string' }
      }
      if (typeof value === 'number') {
        const raw = node.raw
        if (raw && raw.includes('.')) {
          return { kind: 'number' }
        }
        return { kind: 'integer' }
      }
      if (typeof value === 'boolean') {
        return { kind: 'boolean' }
      }
      return { kind: 'any' }
    }
    case 'ArrayExpression': {
      const elements = node.elements
      if (elements.length === 0) {
        return { kind: 'array', items: { kind: 'any' } }
      }
      const itemType = inferTypeFromValue(elements[0])
      return { kind: 'array', items: itemType }
    }
    case 'ObjectExpression': {
      const properties = node.properties
      const shape = {}
      for (const prop of properties) {
        if (prop.type === 'Property' && prop.key.type === 'Identifier') {
          const key = prop.key.name
          shape[key] = inferTypeFromValue(prop.value)
        }
      }
      return { kind: 'object', shape }
    }
    case 'LogicalExpression': {
      const { operator, left, right } = node
      if (operator === '||') {
        const leftType = inferTypeFromValue(left)
        const rightType = inferTypeFromValue(right)
        if (rightType.kind === 'null') {
          return { ...leftType, nullable: true }
        }
        if (leftType.kind === 'null') {
          return { ...rightType, nullable: true }
        }
        return {
          kind: 'union',
          members: [leftType, rightType],
        }
      }
      if (operator === '&&') {
        const rightType = inferTypeFromValue(right)
        return rightType
      }
      if (operator === '??') {
        const rightType = inferTypeFromValue(right)
        return rightType
      }
      return { kind: 'any' }
    }
    case 'Identifier': {
      if (node.name === 'undefined') {
        return { kind: 'undefined' }
      }
      return { kind: 'any' }
    }
    case 'UnaryExpression': {
      const op = node.operator
      const arg = node.argument
      if (op === '+' && arg.type === 'Literal') {
        const value = arg.value
        if (typeof value === 'number') {
          return { kind: 'non-negative-integer' }
        }
      }
      if (op === '-' && arg.type === 'Literal') {
        const value = arg.value
        if (typeof value === 'number') {
          const raw = arg.raw
          if (raw && raw.includes('.')) {
            return { kind: 'number' }
          }
          return { kind: 'integer' }
        }
      }
      return { kind: 'any' }
    }
    default:
      return { kind: 'any' }
  }
}
function parseParameter(param, requiredParams) {
  if (param.type === 'Identifier') {
    return {
      name: param.name,
      type: { kind: 'any' },
      required: true,
    }
  }
  if (param.type === 'AssignmentPattern') {
    const { left, right } = param
    if (left.type !== 'Identifier') {
      throw new TranspileError(
        'Only simple parameter names are supported',
        getLocation(param)
      )
    }
    const name = left.name
    const isRequired = requiredParams?.has(name) ?? false
    const type = inferTypeFromValue(right)
    const exampleValue = extractLiteralValue(right)
    return {
      name,
      type,
      required: isRequired,
      default: isRequired ? null : exampleValue,
      example: exampleValue,
      loc: { start: param.start, end: param.end },
    }
  }
  if (param.type === 'ObjectPattern') {
    const properties = param.properties
    const shape = {}
    const destructuredParams = {}
    for (const prop of properties) {
      if (prop.type === 'Property') {
        const key =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : String(prop.key.value)
        if (prop.value.type === 'Identifier') {
          shape[key] = { kind: 'any' }
          destructuredParams[key] = {
            name: key,
            type: { kind: 'any' },
            required: true,
          }
        } else if (prop.value.type === 'AssignmentPattern') {
          const innerParam = parseParameter(prop.value, requiredParams)
          const isRequired = requiredParams?.has(key) ?? false
          shape[key] = innerParam.type
          destructuredParams[key] = {
            name: key,
            type: innerParam.type,
            required: isRequired,
            default: isRequired ? null : innerParam.example,
            example: innerParam.example,
          }
        }
      }
    }
    return {
      name: '__destructured__',
      type: { kind: 'object', shape, destructuredParams },
      required: true,
    }
  }
  throw new TranspileError(
    `Unsupported parameter pattern: ${param.type}`,
    getLocation(param)
  )
}
function extractLiteralValue(node) {
  switch (node.type) {
    case 'Literal':
      return node.value
    case 'ArrayExpression':
      return node.elements.map((el) => (el ? extractLiteralValue(el) : null))
    case 'ObjectExpression': {
      const result = {}
      for (const prop of node.properties) {
        if (prop.type === 'Property' && prop.key.type === 'Identifier') {
          result[prop.key.name] = extractLiteralValue(prop.value)
        }
      }
      return result
    }
    case 'UnaryExpression':
      if (node.operator === '-') {
        const arg = extractLiteralValue(node.argument)
        return typeof arg === 'number' ? -arg : undefined
      }
      if (node.operator === '+') {
        const arg = extractLiteralValue(node.argument)
        return typeof arg === 'number' ? +arg : undefined
      }
      return
    case 'LogicalExpression': {
      const { operator, left, right } = node
      if (operator === '&&') {
        if (left.type === 'Literal' && left.value === null) {
          return null
        }
      }
      if (operator === '||') {
        const leftVal = extractLiteralValue(left)
        return leftVal ?? extractLiteralValue(right)
      }
      if (operator === '??') {
        const leftVal = extractLiteralValue(left)
        return leftVal ?? extractLiteralValue(right)
      }
      return
    }
    default:
      return
  }
}
function parseReturnType(typeExpr) {
  try {
    const ast = parseExpressionAt2(typeExpr, 0, {
      ecmaVersion: 2022,
    })
    return inferTypeFromValue(ast)
  } catch {
    return { kind: 'any' }
  }
}

// ../src/lang/emitters/ast.ts
function typeToJsonSchema(type) {
  switch (type.kind) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'null':
      return {}
    case 'undefined':
      return {}
    case 'any':
      return {}
    case 'array':
      return {
        type: 'array',
        items: type.items ? typeToJsonSchema(type.items) : {},
      }
    case 'object':
      if (type.shape) {
        const properties = {}
        for (const [key, propType] of Object.entries(type.shape)) {
          properties[key] = typeToJsonSchema(propType)
        }
        return {
          type: 'object',
          properties,
          additionalProperties: false,
        }
      }
      return { type: 'object' }
    case 'union':
      if (type.members) {
        return { oneOf: type.members.map(typeToJsonSchema) }
      }
      return {}
    default:
      return {}
  }
}
function parametersToJsonSchema(parameters) {
  const properties = {}
  const required = []
  for (const [name, param] of Object.entries(parameters)) {
    properties[name] = typeToJsonSchema(param.type)
    if (param.required) {
      required.push(name)
    }
  }
  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  }
}
function transformFunction(
  func,
  source,
  returnTypeAnnotation,
  options = {},
  requiredParamsFromPreprocess
) {
  const tdoc = extractTDoc(source, func)
  const parameters = new Map()
  for (const param of func.params) {
    const parsed = parseParameter(param, requiredParamsFromPreprocess)
    if (
      parsed.name === '__destructured__' &&
      parsed.type.kind === 'object' &&
      parsed.type.destructuredParams
    ) {
      for (const [key, paramDesc] of Object.entries(
        parsed.type.destructuredParams
      )) {
        parameters.set(key, {
          ...paramDesc,
          description: tdoc.params[key],
        })
      }
    } else {
      parsed.description = tdoc.params[parsed.name]
      parameters.set(parsed.name, parsed)
    }
  }
  let returnType
  if (returnTypeAnnotation) {
    returnType = parseReturnType(returnTypeAnnotation)
  }
  const ctx = {
    depth: 0,
    locals: new Map(),
    parameters,
    atoms: new Set(Object.keys(options.atoms || {})),
    warnings: [],
    source,
    filename: options.filename || '<source>',
    options,
  }
  const bodySteps = transformBlock(func.body, ctx)
  const steps = []
  const requiredParams = []
  const optionalParams = []
  for (const [name, param] of parameters.entries()) {
    if (param.required) {
      requiredParams.push(name)
    } else if (param.default !== undefined) {
      optionalParams.push({ name, defaultValue: param.default })
    } else {
      requiredParams.push(name)
    }
  }
  if (requiredParams.length > 0) {
    steps.push({
      op: 'varsImport',
      keys: requiredParams,
    })
  }
  for (const { name, defaultValue } of optionalParams) {
    steps.push({
      op: 'varsImport',
      keys: [name],
    })
    steps.push({
      op: 'if',
      condition: {
        $expr: 'binary',
        op: '==',
        left: { $expr: 'ident', name },
        right: { $expr: 'literal', value: null },
      },
      then: [
        {
          op: 'varSet',
          key: name,
          value: defaultValue,
        },
      ],
    })
  }
  steps.push(...bodySteps)
  const signatureParams = Object.fromEntries(parameters)
  const signature = {
    name: func.id?.name || 'anonymous',
    description: tdoc.description,
    parameters: signatureParams,
    returns: returnType,
  }
  const inputSchema = parametersToJsonSchema(signatureParams)
  return {
    ast: { op: 'seq', steps, inputSchema },
    signature,
    warnings: ctx.warnings,
  }
}
function transformBlock(block, ctx) {
  const steps = []
  for (const stmt of block.body) {
    const transformed = transformStatement(stmt, ctx)
    if (transformed) {
      if (Array.isArray(transformed)) {
        steps.push(...transformed)
      } else {
        steps.push(transformed)
      }
    }
  }
  return steps
}
function transformStatement(stmt, ctx) {
  switch (stmt.type) {
    case 'VariableDeclaration':
      return transformVariableDeclaration(stmt, ctx)
    case 'ExpressionStatement':
      return transformExpressionStatement(stmt, ctx)
    case 'IfStatement':
      return transformIfStatement(stmt, ctx)
    case 'WhileStatement':
      return transformWhileStatement(stmt, ctx)
    case 'ForOfStatement':
      return transformForOfStatement(stmt, ctx)
    case 'TryStatement':
      return transformTryStatement(stmt, ctx)
    case 'ReturnStatement':
      return transformReturnStatement(stmt, ctx)
    case 'ThrowStatement':
      throw new TranspileError(
        `'throw' is not supported in AsyncJS. Use Error('message') to trigger error flow`,
        getLocation(stmt),
        ctx.source,
        ctx.filename
      )
    case 'BlockStatement':
      return {
        op: 'scope',
        steps: transformBlock(stmt, createChildContext(ctx)),
      }
    case 'EmptyStatement':
      return null
    default:
      throw new TranspileError(
        `Unsupported statement type: ${stmt.type}`,
        getLocation(stmt),
        ctx.source,
        ctx.filename
      )
  }
}
function transformVariableDeclaration(decl, ctx) {
  const steps = []
  const isConst = decl.kind === 'const'
  const opName = isConst ? 'constSet' : 'varSet'
  for (const declarator of decl.declarations) {
    if (declarator.id.type !== 'Identifier') {
      throw new TranspileError(
        'Only simple variable names are supported',
        getLocation(declarator),
        ctx.source,
        ctx.filename
      )
    }
    const name = declarator.id.name
    if (declarator.init) {
      const { step, resultVar } = transformExpressionToStep(
        declarator.init,
        ctx,
        name,
        isConst
      )
      if (step) {
        steps.push(step)
      } else if (resultVar !== name) {
        steps.push({
          op: opName,
          key: name,
          value: resultVar,
        })
      }
      const type = inferTypeFromValue(declarator.init)
      ctx.locals.set(name, type)
    } else {
      if (isConst) {
        throw new TranspileError(
          'const declarations must be initialized',
          getLocation(declarator),
          ctx.source,
          ctx.filename
        )
      }
      steps.push({
        op: 'varSet',
        key: name,
        value: null,
      })
      ctx.locals.set(name, { kind: 'any', nullable: true })
    }
  }
  return steps
}
function transformExpressionStatement(stmt, ctx) {
  const expr = stmt.expression
  if (expr.type === 'AssignmentExpression') {
    return transformAssignment(expr, ctx)
  }
  if (expr.type === 'CallExpression') {
    const { step, resultVar } = transformExpressionToStep(expr, ctx)
    if (step) {
      return step
    }
    if (resultVar) {
      return {
        op: 'varSet',
        key: '_',
        value: resultVar,
      }
    }
    return null
  }
  ctx.warnings.push({
    message: 'Expression statement has no effect',
    line: getLocation(stmt).line,
    column: getLocation(stmt).column,
  })
  return null
}
function transformAssignment(expr, ctx) {
  if (expr.left.type !== 'Identifier') {
    throw new TranspileError(
      'Only simple variable assignment is supported',
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }
  const name = expr.left.name
  const { step, resultVar } = transformExpressionToStep(expr.right, ctx, name)
  if (step) {
    return step
  }
  return {
    op: 'varSet',
    key: name,
    value: resultVar,
  }
}
function transformIfStatement(stmt, ctx) {
  const condition = expressionToExprNode(stmt.test, ctx)
  const thenSteps =
    stmt.consequent.type === 'BlockStatement'
      ? transformBlock(stmt.consequent, createChildContext(ctx))
      : [transformStatement(stmt.consequent, ctx)].filter(Boolean)
  let elseSteps
  if (stmt.alternate) {
    elseSteps =
      stmt.alternate.type === 'BlockStatement'
        ? transformBlock(stmt.alternate, createChildContext(ctx))
        : [transformStatement(stmt.alternate, ctx)].filter(Boolean)
  }
  return {
    op: 'if',
    condition,
    then: thenSteps,
    ...(elseSteps && { else: elseSteps }),
  }
}
function transformWhileStatement(stmt, ctx) {
  const condition = expressionToExprNode(stmt.test, ctx)
  const body =
    stmt.body.type === 'BlockStatement'
      ? transformBlock(stmt.body, createChildContext(ctx))
      : [transformStatement(stmt.body, ctx)].filter(Boolean)
  return {
    op: 'while',
    condition,
    body,
  }
}
function transformForOfStatement(stmt, ctx) {
  let varName
  if (stmt.left.type === 'VariableDeclaration') {
    const decl = stmt.left.declarations[0]
    if (decl.id.type !== 'Identifier') {
      throw new TranspileError(
        'Only simple variable names are supported in for...of',
        getLocation(stmt.left),
        ctx.source,
        ctx.filename
      )
    }
    varName = decl.id.name
  } else if (stmt.left.type === 'Identifier') {
    varName = stmt.left.name
  } else {
    throw new TranspileError(
      'Unsupported for...of left-hand side',
      getLocation(stmt.left),
      ctx.source,
      ctx.filename
    )
  }
  const items = expressionToValue(stmt.right, ctx)
  const childCtx = createChildContext(ctx)
  childCtx.locals.set(varName, { kind: 'any' })
  const steps =
    stmt.body.type === 'BlockStatement'
      ? transformBlock(stmt.body, childCtx)
      : [transformStatement(stmt.body, childCtx)].filter(Boolean)
  return {
    op: 'map',
    items,
    as: varName,
    steps,
  }
}
function transformTryStatement(stmt, ctx) {
  const trySteps = transformBlock(stmt.block, createChildContext(ctx))
  let catchSteps
  let catchParam
  if (stmt.handler) {
    const catchCtx = createChildContext(ctx)
    if (stmt.handler.param?.type === 'Identifier') {
      catchParam = stmt.handler.param.name
      catchCtx.locals.set(catchParam, {
        kind: 'any',
      })
    }
    catchSteps = transformBlock(stmt.handler.body, catchCtx)
  }
  return {
    op: 'try',
    try: trySteps,
    ...(catchSteps && { catch: catchSteps }),
    ...(catchParam && { catchParam }),
  }
}
function transformReturnStatement(stmt, ctx) {
  if (!stmt.argument) {
    return { op: 'return', value: {} }
  }
  const { step, resultVar } = transformExpressionToStep(
    stmt.argument,
    ctx,
    '__returnVal__'
  )
  if (step) {
    return [step, { op: 'return', value: resultVar }]
  }
  const value = expressionToValue(stmt.argument, ctx)
  return { op: 'return', value }
}
var BUILTIN_OBJECTS = new Set([
  'Math',
  'JSON',
  'Array',
  'Object',
  'String',
  'Number',
  'console',
  'Date',
  'Schema',
])
var BUILTIN_GLOBALS = new Set([
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'decodeURI',
  'encodeURIComponent',
  'decodeURIComponent',
  'Set',
  'Date',
  'filter',
])
var UNSUPPORTED_BUILTINS = new Set([
  'RegExp',
  'Promise',
  'Map',
  'WeakSet',
  'WeakMap',
  'Symbol',
  'Proxy',
  'Reflect',
  'Function',
  'eval',
  'setTimeout',
  'setInterval',
  'fetch',
  'require',
  'import',
  'process',
  'window',
  'document',
  'global',
  'globalThis',
])
var INSTANCE_METHODS = new Set([
  'toUpperCase',
  'toLowerCase',
  'trim',
  'trimStart',
  'trimEnd',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'concat',
  'includes',
  'indexOf',
  'lastIndexOf',
  'startsWith',
  'endsWith',
  'slice',
  'substring',
  'substr',
  'replace',
  'replaceAll',
  'match',
  'search',
  'padStart',
  'padEnd',
  'repeat',
  'normalize',
  'localeCompare',
  'toString',
  'valueOf',
  'at',
  'reverse',
  'sort',
  'fill',
  'copyWithin',
  'flat',
  'flatMap',
  'every',
  'some',
  'forEach',
  'add',
  'remove',
  'has',
  'clear',
  'toArray',
  'union',
  'intersection',
  'diff',
  'format',
  'isBefore',
  'isAfter',
])
function isBuiltinCall(expr) {
  if (expr.callee.type === 'Identifier') {
    const name = expr.callee.name
    return BUILTIN_GLOBALS.has(name) || UNSUPPORTED_BUILTINS.has(name)
  }
  if (expr.callee.type === 'MemberExpression') {
    const member = expr.callee
    if (member.object.type === 'Identifier') {
      const objName = member.object.name
      if (BUILTIN_OBJECTS.has(objName) || UNSUPPORTED_BUILTINS.has(objName)) {
        return true
      }
    }
    if (member.property.type === 'Identifier') {
      const methodName = member.property.name
      if (INSTANCE_METHODS.has(methodName)) {
        return true
      }
    }
  }
  return false
}
function isBuiltinMemberAccess(expr) {
  if (expr.object.type === 'Identifier') {
    const objName = expr.object.name
    return BUILTIN_OBJECTS.has(objName) || UNSUPPORTED_BUILTINS.has(objName)
  }
  return false
}
var UNSUPPORTED_BUILTIN_MESSAGES = {
  RegExp: 'RegExp is not available. Use string methods or the regexMatch atom.',
  Promise: 'Promise is not needed. All operations are implicitly async.',
  Map: 'Map is not available. Use plain objects instead.',
  WeakSet: 'WeakSet is not available.',
  WeakMap: 'WeakMap is not available.',
  Symbol: 'Symbol is not available.',
  Proxy: 'Proxy is not available.',
  Reflect: 'Reflect is not available.',
  Function: 'Function constructor is not available. Define functions normally.',
  eval: 'eval is not available. Code is compiled, not evaluated.',
  setTimeout: 'setTimeout is not available. Use the delay atom.',
  setInterval: 'setInterval is not available. Use while loops with delay.',
  fetch: 'fetch is not available. Use the httpFetch atom.',
  require: 'require is not available. Atoms must be registered with the VM.',
  import: 'import is not available. Atoms must be registered with the VM.',
  process: 'process is not available. AsyncJS runs in a sandboxed environment.',
  window: 'window is not available. AsyncJS runs in a sandboxed environment.',
  document:
    'document is not available. AsyncJS runs in a sandboxed environment.',
  global: 'global is not available. AsyncJS runs in a sandboxed environment.',
  globalThis: 'globalThis is not available. Use builtins directly.',
}
function getUnsupportedBuiltinError(expr) {
  if (expr.callee.type === 'Identifier') {
    const name = expr.callee.name
    if (UNSUPPORTED_BUILTINS.has(name)) {
      return (
        UNSUPPORTED_BUILTIN_MESSAGES[name] ||
        `${name} is not available in AsyncJS.`
      )
    }
  }
  if (expr.callee.type === 'MemberExpression') {
    const member = expr.callee
    if (member.object.type === 'Identifier') {
      const objName = member.object.name
      if (UNSUPPORTED_BUILTINS.has(objName)) {
        return (
          UNSUPPORTED_BUILTIN_MESSAGES[objName] ||
          `${objName} is not available in AsyncJS.`
        )
      }
    }
  }
  return null
}
function getNewExpressionSuggestion(constructorName) {
  const suggestions = {
    Date: " Use Date() or Date('2024-01-15') instead - no 'new' needed.",
    Set: " Use Set([items]) instead - no 'new' needed.",
    Map: ' Use plain objects instead of Map.',
    Array: ' Use array literals like [1, 2, 3] instead.',
    Object: ' Use object literals like { key: value } instead.',
    Error: " Return an error object like { error: 'message' } instead.",
    RegExp: ' Use string methods or the regexMatch atom.',
    Promise: ' Not needed - all operations are implicitly async.',
    WeakSet: ' WeakSet is not available.',
    WeakMap: ' WeakMap is not available.',
  }
  return (
    suggestions[constructorName] ||
    ' Use factory functions or object literals instead.'
  )
}
function transformExpressionToStep(expr, ctx, resultVar, isConst) {
  const varOp = isConst ? 'constSet' : 'varSet'
  if (expr.type === 'ChainExpression') {
    const chain = expr
    return transformExpressionToStep(chain.expression, ctx, resultVar, isConst)
  }
  if (expr.type === 'NewExpression') {
    const newExpr = expr
    let constructorName = 'constructor'
    if (newExpr.callee.type === 'Identifier') {
      constructorName = newExpr.callee.name
    }
    const suggestion = getNewExpressionSuggestion(constructorName)
    throw new TranspileError(
      `The 'new' keyword is not supported in AsyncJS.${suggestion}`,
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }
  if (expr.type === 'CallExpression') {
    const unsupportedError = getUnsupportedBuiltinError(expr)
    if (unsupportedError) {
      throw new TranspileError(
        unsupportedError,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }
  }
  if (expr.type === 'CallExpression' && isBuiltinCall(expr)) {
    const exprNode = expressionToExprNode(expr, ctx)
    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode,
        },
        resultVar,
      }
    }
    return { step: null, resultVar: exprNode }
  }
  if (expr.type === 'MemberExpression' && isBuiltinMemberAccess(expr)) {
    const exprNode = expressionToExprNode(expr, ctx)
    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode,
        },
        resultVar,
      }
    }
    return { step: null, resultVar: exprNode }
  }
  if (expr.type === 'CallExpression') {
    return transformCallExpression(expr, ctx, resultVar, isConst)
  }
  if (expr.type === 'TemplateLiteral') {
    return transformTemplateLiteral(expr, ctx, resultVar, isConst)
  }
  if (
    expr.type === 'BinaryExpression' ||
    expr.type === 'LogicalExpression' ||
    expr.type === 'UnaryExpression'
  ) {
    const exprNode = expressionToExprNode(expr, ctx)
    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode,
        },
        resultVar,
      }
    }
    return { step: null, resultVar: exprNode }
  }
  const value = expressionToValue(expr, ctx)
  return { step: null, resultVar: value }
}
function transformCallExpression(expr, ctx, resultVar, isConst) {
  let funcName
  let isMethodCall = false
  let receiver
  if (expr.callee.type === 'Identifier') {
    funcName = expr.callee.name
  } else if (expr.callee.type === 'MemberExpression') {
    const member = expr.callee
    if (member.property.type === 'Identifier') {
      funcName = member.property.name
      isMethodCall = true
      receiver = expressionToValue(member.object, ctx)
    } else {
      throw new TranspileError(
        'Computed method names are not supported',
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }
  } else {
    throw new TranspileError(
      'Only named function calls are supported',
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }
  if (isMethodCall) {
    return transformMethodCall(
      funcName,
      receiver,
      expr.arguments,
      ctx,
      resultVar,
      isConst
    )
  }
  if (funcName === 'console' && expr.callee.type === 'MemberExpression') {
  }
  const args = extractCallArguments(expr, ctx)
  return {
    step: {
      op: funcName,
      ...args,
      ...(resultVar && { result: resultVar }),
      ...(resultVar && isConst && { resultConst: true }),
    },
    resultVar,
  }
}
function transformMethodCall(method, receiver, args, ctx, resultVar, isConst) {
  switch (method) {
    case 'map':
      if (
        args.length > 0 &&
        (args[0].type === 'ArrowFunctionExpression' ||
          args[0].type === 'FunctionExpression')
      ) {
        const callback = args[0]
        const param = callback.params[0]
        const paramName = param?.type === 'Identifier' ? param.name : 'item'
        const childCtx = createChildContext(ctx)
        childCtx.locals.set(paramName, { kind: 'any' })
        let steps
        if (callback.body.type === 'BlockStatement') {
          steps = transformBlock(callback.body, childCtx)
        } else {
          const { step, resultVar: exprResult } = transformExpressionToStep(
            callback.body,
            childCtx,
            'result'
          )
          steps = step
            ? [step]
            : [{ op: 'varSet', key: 'result', value: exprResult }]
        }
        return {
          step: {
            op: 'map',
            items: receiver,
            as: paramName,
            steps,
            ...(resultVar && { result: resultVar }),
            ...(resultVar && isConst && { resultConst: true }),
          },
          resultVar,
        }
      }
      break
    case 'filter':
      if (
        args.length > 0 &&
        (args[0].type === 'ArrowFunctionExpression' ||
          args[0].type === 'FunctionExpression')
      ) {
        const callback = args[0]
        const param = callback.params[0]
        const paramName = param?.type === 'Identifier' ? param.name : 'item'
        const childCtx = createChildContext(ctx)
        childCtx.locals.set(paramName, { kind: 'any' })
        let condition
        if (callback.body.type === 'BlockStatement') {
          throw new TranspileError(
            'filter callback must be an expression, not a block',
            getLocation(args[0]),
            ctx.source,
            ctx.filename
          )
        } else {
          condition = expressionToExprNode(callback.body, childCtx)
        }
        return {
          step: {
            op: 'filter',
            items: receiver,
            as: paramName,
            condition,
            ...(resultVar && { result: resultVar }),
            ...(resultVar && isConst && { resultConst: true }),
          },
          resultVar,
        }
      }
      break
    case 'find':
      if (
        args.length > 0 &&
        (args[0].type === 'ArrowFunctionExpression' ||
          args[0].type === 'FunctionExpression')
      ) {
        const callback = args[0]
        const param = callback.params[0]
        const paramName = param?.type === 'Identifier' ? param.name : 'item'
        const childCtx = createChildContext(ctx)
        childCtx.locals.set(paramName, { kind: 'any' })
        let condition
        if (callback.body.type === 'BlockStatement') {
          throw new TranspileError(
            'find callback must be an expression, not a block',
            getLocation(args[0]),
            ctx.source,
            ctx.filename
          )
        } else {
          condition = expressionToExprNode(callback.body, childCtx)
        }
        return {
          step: {
            op: 'find',
            items: receiver,
            as: paramName,
            condition,
            ...(resultVar && { result: resultVar }),
            ...(resultVar && isConst && { resultConst: true }),
          },
          resultVar,
        }
      }
      break
    case 'reduce':
      if (
        args.length >= 2 &&
        (args[0].type === 'ArrowFunctionExpression' ||
          args[0].type === 'FunctionExpression')
      ) {
        const callback = args[0]
        const accParam = callback.params[0]
        const itemParam = callback.params[1]
        const accName = accParam?.type === 'Identifier' ? accParam.name : 'acc'
        const itemName =
          itemParam?.type === 'Identifier' ? itemParam.name : 'item'
        const childCtx = createChildContext(ctx)
        childCtx.locals.set(accName, { kind: 'any' })
        childCtx.locals.set(itemName, { kind: 'any' })
        let steps
        if (callback.body.type === 'BlockStatement') {
          steps = transformBlock(callback.body, childCtx)
        } else {
          const { step, resultVar: exprResult } = transformExpressionToStep(
            callback.body,
            childCtx,
            'result'
          )
          steps = step
            ? [step]
            : [{ op: 'varSet', key: 'result', value: exprResult }]
        }
        const initial = expressionToValue(args[1], ctx)
        return {
          step: {
            op: 'reduce',
            items: receiver,
            as: itemName,
            accumulator: accName,
            initial,
            steps,
            ...(resultVar && { result: resultVar }),
            ...(resultVar && isConst && { resultConst: true }),
          },
          resultVar,
        }
      }
      break
    case 'slice':
      break
    case 'push':
      return {
        step: {
          op: 'push',
          list: receiver,
          item: expressionToValue(args[0], ctx),
          ...(resultVar && { result: resultVar }),
          ...(resultVar && isConst && { resultConst: true }),
        },
        resultVar,
      }
    case 'join':
      return {
        step: {
          op: 'join',
          list: receiver,
          sep: args.length > 0 ? expressionToValue(args[0], ctx) : '',
          ...(resultVar && { result: resultVar }),
          ...(resultVar && isConst && { resultConst: true }),
        },
        resultVar,
      }
    case 'split':
      return {
        step: {
          op: 'split',
          str: receiver,
          sep: args.length > 0 ? expressionToValue(args[0], ctx) : '',
          ...(resultVar && { result: resultVar }),
          ...(resultVar && isConst && { resultConst: true }),
        },
        resultVar,
      }
  }
  ctx.warnings.push({
    message: `Unknown method '${method}' - treating as atom call`,
    line: 0,
    column: 0,
  })
  return {
    step: {
      op: method,
      receiver,
      args: args.map((a) => expressionToValue(a, ctx)),
      ...(resultVar && { result: resultVar }),
      ...(resultVar && isConst && { resultConst: true }),
    },
    resultVar,
  }
}
function transformTemplateLiteral(expr, ctx, resultVar, isConst) {
  let tmpl = ''
  const vars = {}
  for (let i2 = 0; i2 < expr.quasis.length; i2++) {
    tmpl += expr.quasis[i2].value.cooked || expr.quasis[i2].value.raw
    if (i2 < expr.expressions.length) {
      const exprNode = expr.expressions[i2]
      const varName = `_${i2}`
      vars[varName] = expressionToValue(exprNode, ctx)
      tmpl += `{{${varName}}}`
    }
  }
  return {
    step: {
      op: 'template',
      tmpl,
      vars,
      ...(resultVar && { result: resultVar }),
      ...(resultVar && isConst && { resultConst: true }),
    },
    resultVar,
  }
}
function expressionToExprNode(expr, ctx) {
  switch (expr.type) {
    case 'Literal': {
      const lit = expr
      return { $expr: 'literal', value: lit.value }
    }
    case 'Identifier': {
      const id = expr
      return { $expr: 'ident', name: id.name }
    }
    case 'MemberExpression': {
      const mem = expr
      const obj = expressionToExprNode(mem.object, ctx)
      const isOptional = mem.optional === true
      if (mem.computed) {
        const prop = mem.property
        if (prop.type === 'Literal') {
          return {
            $expr: 'member',
            object: obj,
            property: String(prop.value),
            computed: true,
            ...(isOptional && { optional: true }),
          }
        }
        throw new TranspileError(
          'Computed member access with variables not yet supported',
          getLocation(expr),
          ctx.source,
          ctx.filename
        )
      }
      const propName = mem.property.name
      return {
        $expr: 'member',
        object: obj,
        property: propName,
        ...(isOptional && { optional: true }),
      }
    }
    case 'ChainExpression': {
      const chain = expr
      return expressionToExprNode(chain.expression, ctx)
    }
    case 'BinaryExpression': {
      const bin = expr
      return {
        $expr: 'binary',
        op: bin.operator,
        left: expressionToExprNode(bin.left, ctx),
        right: expressionToExprNode(bin.right, ctx),
      }
    }
    case 'LogicalExpression': {
      const log = expr
      return {
        $expr: 'logical',
        op: log.operator,
        left: expressionToExprNode(log.left, ctx),
        right: expressionToExprNode(log.right, ctx),
      }
    }
    case 'UnaryExpression': {
      const un = expr
      return {
        $expr: 'unary',
        op: un.operator,
        argument: expressionToExprNode(un.argument, ctx),
      }
    }
    case 'ConditionalExpression': {
      const cond = expr
      return {
        $expr: 'conditional',
        test: expressionToExprNode(cond.test, ctx),
        consequent: expressionToExprNode(cond.consequent, ctx),
        alternate: expressionToExprNode(cond.alternate, ctx),
      }
    }
    case 'ArrayExpression': {
      const arr = expr
      return {
        $expr: 'array',
        elements: arr.elements
          .filter((el) => el !== null)
          .map((el) => expressionToExprNode(el, ctx)),
      }
    }
    case 'ObjectExpression': {
      const obj = expr
      const properties = []
      for (const prop of obj.properties) {
        if (prop.type === 'Property') {
          const key =
            prop.key.type === 'Identifier'
              ? prop.key.name
              : String(prop.key.value)
          properties.push({
            key,
            value: expressionToExprNode(prop.value, ctx),
          })
        }
      }
      return { $expr: 'object', properties }
    }
    case 'CallExpression': {
      const call = expr
      if (call.callee.type === 'MemberExpression') {
        const member = call.callee
        const method =
          member.property.type === 'Identifier'
            ? member.property.name
            : String(member.property.value)
        const isOptional = member.optional === true || call.optional === true
        return {
          $expr: 'methodCall',
          object: expressionToExprNode(member.object, ctx),
          method,
          arguments: call.arguments.map((arg) =>
            expressionToExprNode(arg, ctx)
          ),
          ...(isOptional && { optional: true }),
        }
      }
      if (call.callee.type === 'Identifier') {
        const funcName = call.callee.name
        return {
          $expr: 'call',
          callee: funcName,
          arguments: call.arguments.map((arg) =>
            expressionToExprNode(arg, ctx)
          ),
        }
      }
      throw new TranspileError(
        'Complex function calls in expressions should be lifted to statements',
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }
    case 'NewExpression': {
      const newExpr = expr
      let constructorName = 'constructor'
      if (newExpr.callee.type === 'Identifier') {
        constructorName = newExpr.callee.name
      }
      const suggestion = getNewExpressionSuggestion(constructorName)
      throw new TranspileError(
        `The 'new' keyword is not supported in AsyncJS.${suggestion}`,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }
    case 'TemplateLiteral':
      throw new TranspileError(
        'Template literals inside expressions are not supported. ' +
          'Assign to a variable first: const msg = `hello ${name}`; then use msg',
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    default:
      throw new TranspileError(
        `Unsupported expression type in condition: ${expr.type}`,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
  }
}
function expressionToValue(expr, ctx) {
  switch (expr.type) {
    case 'Literal':
      return expr.value
    case 'Identifier': {
      const name = expr.name
      return name
    }
    case 'MemberExpression': {
      const mem = expr
      const isOptional = mem.optional === true
      if (isOptional) {
        return expressionToExprNode(expr, ctx)
      }
      const objValue = expressionToValue(mem.object, ctx)
      if (objValue && typeof objValue === 'object' && objValue.$expr) {
        const prop2 = mem.computed
          ? String(mem.property.value)
          : mem.property.name
        return {
          $expr: 'member',
          object: objValue,
          property: prop2,
          ...(mem.computed && { computed: true }),
        }
      }
      if (mem.computed) {
        return `${objValue}[${expressionToValue(mem.property, ctx)}]`
      }
      const prop = mem.property.name
      if (typeof objValue === 'string') {
        return `${objValue}.${prop}`
      }
      if (objValue && objValue.$kind === 'arg') {
        return { $kind: 'arg', path: `${objValue.path}.${prop}` }
      }
      return `${objValue}.${prop}`
    }
    case 'ChainExpression': {
      const chain = expr
      return expressionToValue(chain.expression, ctx)
    }
    case 'ArrayExpression':
      return expr.elements.map((el) => (el ? expressionToValue(el, ctx) : null))
    case 'ObjectExpression': {
      const result = {}
      for (const prop of expr.properties) {
        if (prop.type === 'Property') {
          const key =
            prop.key.type === 'Identifier'
              ? prop.key.name
              : String(prop.key.value)
          result[key] = expressionToValue(prop.value, ctx)
        }
      }
      return result
    }
    case 'TemplateLiteral':
      return expressionToExprNode(expr, ctx)
    case 'CallExpression':
      return expressionToExprNode(expr, ctx)
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'UnaryExpression':
    case 'ConditionalExpression':
      return expressionToExprNode(expr, ctx)
    default:
      return null
  }
}
function extractCallArguments(expr, ctx) {
  if (
    expr.arguments.length === 1 &&
    expr.arguments[0].type === 'ObjectExpression'
  ) {
    const obj = expr.arguments[0]
    const result = {}
    for (const prop of obj.properties) {
      if (prop.type === 'Property') {
        const key =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : String(prop.key.value)
        result[key] = expressionToValue(prop.value, ctx)
      }
    }
    return result
  }
  return {
    args: expr.arguments.map((arg) => expressionToValue(arg, ctx)),
  }
}
// ../node_modules/tosijs-schema/dist/index.js
var R = (n) => ({
  schema: n,
  _type: null,
  validate: (i2, f) => K(i2, n, f),
  get optional() {
    return R({
      ...n,
      type: Array.isArray(n.type) ? [...n.type, 'null'] : [n.type, 'null'],
    })
  },
  title: (i2) => R({ ...n, title: i2 }),
  describe: (i2) => R({ ...n, description: i2 }),
  default: (i2) => R({ ...n, default: i2 }),
  meta: (i2) => R({ ...i2, ...n, ...i2 }),
  min: (i2) => {
    let f =
      n.type === 'string'
        ? 'minLength'
        : n.type === 'array'
        ? 'minItems'
        : n.type === 'object'
        ? 'minProperties'
        : 'minimum'
    return R({ ...n, [f]: i2 })
  },
  max: (i2) => {
    let f =
      n.type === 'string'
        ? 'maxLength'
        : n.type === 'array'
        ? 'maxItems'
        : n.type === 'object'
        ? 'maxProperties'
        : 'maximum'
    return R({ ...n, [f]: i2 })
  },
  pattern: (i2) =>
    R({ ...n, pattern: typeof i2 === 'string' ? i2 : i2.source }),
  get email() {
    return R({ ...n, format: 'email' })
  },
  get uuid() {
    return R({ ...n, format: 'uuid' })
  },
  get ipv4() {
    return R({ ...n, format: 'ipv4' })
  },
  get url() {
    return R({ ...n, format: 'uri' })
  },
  get datetime() {
    return R({ ...n, format: 'date-time' })
  },
  get emoji() {
    return R({
      ...n,
      pattern: '^\\p{Extended_Pictographic}+$',
      format: 'emoji',
    })
  },
  get int() {
    return R({ ...n, type: 'integer' })
  },
  step: (i2) => R({ ...n, multipleOf: i2 }),
})
var H = {
  get email() {
    return R({ type: 'string', format: 'email' })
  },
  get uuid() {
    return R({ type: 'string', format: 'uuid' })
  },
  get ipv4() {
    return R({ type: 'string', format: 'ipv4' })
  },
  get url() {
    return R({ type: 'string', format: 'uri' })
  },
  get datetime() {
    return R({ type: 'string', format: 'date-time' })
  },
  get emoji() {
    return R({
      type: 'string',
      pattern: '^\\p{Extended_Pictographic}+$',
      format: 'emoji',
    })
  },
  get null() {
    return R({ type: 'null' })
  },
  get undefined() {
    return R({ type: 'null', 'x-tjs-undefined': true })
  },
  get any() {
    return R({})
  },
  pattern: (n) =>
    R({ type: 'string', pattern: typeof n === 'string' ? n : n.source }),
  union: (n) => R({ anyOf: n.map((i2) => i2.schema) }),
  enum: (n) => R({ type: typeof n[0], enum: n }),
  const: (n) => R({ const: n }),
  array: (n) => R({ type: 'array', items: n.schema }),
  tuple: (n) =>
    R({
      type: 'array',
      items: n.map((i2) => i2.schema),
      minItems: n.length,
      maxItems: n.length,
    }),
  object: (n) => {
    let i2 = {},
      f = []
    for (let O in n)
      if (
        ((i2[O] = n[O].schema),
        !Array.isArray(i2[O].type) || !i2[O].type.includes('null'))
      )
        f.push(O)
    return R({
      type: 'object',
      properties: i2,
      required: f,
      additionalProperties: false,
    })
  },
  record: (n) => R({ type: 'object', additionalProperties: n.schema }),
  infer: (n) => {
    if (n === null) return R({ type: 'null' })
    if (n === undefined) return R({ type: 'null', 'x-tjs-undefined': true })
    let i2 = typeof n
    if (i2 === 'string') return R({ type: 'string' })
    if (i2 === 'number')
      return R({ type: Number.isInteger(n) ? 'integer' : 'number' })
    if (i2 === 'boolean') return R({ type: 'boolean' })
    if (Array.isArray(n)) {
      if (n.length === 0) return R({ type: 'array' })
      return R({ type: 'array', items: H.infer(n[0]).schema })
    }
    if (i2 === 'object') {
      let f = {},
        O = []
      for (let y in n) (f[y] = H.infer(n[y]).schema), O.push(y)
      return R({
        type: 'object',
        properties: f,
        required: O,
        additionalProperties: false,
      })
    }
    return R({})
  },
}
var X = new Proxy(H, {
  get(n, i2) {
    if (i2 in n) return n[i2]
    if (
      i2 === 'string' ||
      i2 === 'number' ||
      i2 === 'boolean' ||
      i2 === 'integer'
    ) {
      let f = R({ type: i2 })
      return (n[i2] = f), f
    }
    return
  },
})
var Q = {
  email: (n) => /^\S+@\S+\.\S+$/.test(n),
  uuid: (n) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n),
  uri: (n) => {
    try {
      return new URL(n), true
    } catch {
      return false
    }
  },
  ipv4: (n) =>
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      n
    ),
  'date-time': (n) => !isNaN(Date.parse(n)),
  emoji: (n) => new RegExp('\\p{Extended_Pictographic}', 'u').test(n),
}
function K(n, i2, f) {
  let O = i2?.schema || i2,
    y = typeof f === 'function' ? f : f?.onError,
    G = typeof f === 'object' ? f?.strict ?? f?.fullScan ?? false : false,
    g = [],
    I = (w) => {
      if (y) y(g.join('.') || 'root', w)
      return false
    },
    $ = (w, u) => {
      if (u.anyOf) {
        for (let x of u.anyOf) if (K(w, x)) return true
        return I('Union mismatch')
      }
      if (u.const !== undefined) return w === u.const || I('Const mismatch')
      if (w === null) {
        let x = u.type === 'null' && !u['x-tjs-undefined'],
          F = Array.isArray(u.type) && u.type.includes('null')
        return x || F || !u.type || I('Expected value, got null')
      }
      if (w === undefined) {
        let x = u.type === 'null' && u['x-tjs-undefined'],
          F = Array.isArray(u.type) && u.type.includes('null')
        return x || F || !u.type || I('Expected value, got undefined')
      }
      let C = Array.isArray(u.type) ? u.type[0] : u.type
      if (u.enum && !u.enum.includes(w)) return I('Enum mismatch')
      if (C === 'integer') {
        if (typeof w !== 'number' || !Number.isInteger(w))
          return I('Expected integer')
      } else if (C === 'array') {
        if (!Array.isArray(w)) return I('Expected array')
      } else if (C === 'object') {
        if (typeof w !== 'object' || Array.isArray(w))
          return I('Expected object')
      } else if (C && typeof w !== C) return I(`Expected ${C}`)
      if (typeof w === 'number') {
        if (!Number.isFinite(w)) return I('Expected finite number')
        if (u.minimum !== undefined && w < u.minimum) return I('Value < min')
        if (u.maximum !== undefined && w > u.maximum) return I('Value > max')
        if (u.multipleOf !== undefined) {
          let x = Math.abs(w % u.multipleOf),
            F = 0.0000000001
          if (
            x > 0.0000000001 &&
            Math.abs(x - Math.abs(u.multipleOf)) > 0.0000000001
          )
            return I('Value not step')
        }
      }
      if (typeof w === 'string') {
        if (u.minLength !== undefined && w.length < u.minLength)
          return I('Len < min')
        if (u.maxLength !== undefined && w.length > u.maxLength)
          return I('Len > max')
        if (
          u.pattern &&
          !new RegExp(u.pattern, u.format === 'emoji' ? 'u' : '').test(w)
        )
          return I('Pattern mismatch')
        if (u.format && Q[u.format] && !Q[u.format](w))
          return I('Format invalid')
      }
      if (C === 'object') {
        let x = u.minProperties !== undefined,
          F = G && u.maxProperties !== undefined
        if (x || F) {
          let o = 0
          for (let P in w) if (Object.prototype.hasOwnProperty.call(w, P)) o++
          if (x && o < u.minProperties) return I('Too few props')
          if (F && o > u.maxProperties) return I('Too many props')
        }
        if (u.required) {
          for (let o of u.required) if (!(o in w)) return I(`Missing ${o}`)
        }
        if (u.properties) {
          for (let o in u.properties)
            if (o in w) {
              g.push(o)
              let P = $(w[o], u.properties[o])
              if ((g.pop(), !P)) return false
            }
        }
        if (u.additionalProperties) {
          let o = []
          for (let B in w) {
            if (u.properties && B in u.properties) continue
            o.push(B)
          }
          let P = o.length,
            _ = G || P <= 97 ? 1 : Math.floor(P / 97)
          for (let B = 0; B < P; B += _) {
            let J = _ > 1 && B > P - 1 - _ ? P - 1 : B,
              L = o[J]
            g.push(L)
            let W = $(w[L], u.additionalProperties)
            if ((g.pop(), !W)) return false
            if (J === P - 1) break
          }
        }
        return true
      }
      if (C === 'array' && u.items) {
        let x = w.length
        if (u.minItems !== undefined && x < u.minItems)
          return I('Array too short')
        if (u.maxItems !== undefined && x > u.maxItems)
          return I('Array too long')
        if (Array.isArray(u.items)) {
          for (let o = 0; o < u.items.length; o++) {
            if ((g.push(String(o)), !$(w[o], u.items[o]))) return g.pop(), false
            g.pop()
          }
          return true
        }
        let F = G || x <= 97 ? 1 : Math.floor(x / 97)
        for (let o = 0; o < x; o += F) {
          let P = F > 1 && o > x - 1 - F ? x - 1 : o
          g.push(String(P))
          let _ = $(w[P], u.items)
          if ((g.pop(), !_)) return false
          if (P === x - 1) break
        }
        return true
      }
      return true
    }
  return $(n, O)
}
function Y(n, i2, f) {
  let O = i2?.schema || i2,
    y = typeof f === 'function' ? f : f?.onError,
    G = typeof f === 'object' ? f?.strict ?? f?.fullScan ?? false : false
  if (!(typeof f === 'object' ? f?.skipValidation : false)) {
    let I = '',
      $ = ''
    if (
      !K(n, O, {
        onError: (C, x) => {
          if (!I) (I = C), ($ = x)
          if (y) y(C, x)
        },
        fullScan: G,
      })
    )
      return Error(`${I}: ${$}`)
  }
  return A(n, O)
}
function A(n, i2) {
  if (n === null || n === undefined) return n
  let f = i2.type
  if (
    f === 'object' &&
    i2.properties &&
    typeof n === 'object' &&
    !Array.isArray(n)
  ) {
    let O = {}
    for (let y of Object.keys(i2.properties))
      if (y in n) O[y] = A(n[y], i2.properties[y])
    return O
  }
  if (f === 'array' && Array.isArray(n)) {
    if (i2.items)
      if (Array.isArray(i2.items))
        return n.slice(0, i2.items.length).map((O, y) => A(O, i2.items[y]))
      else return n.map((O) => A(O, i2.items))
    return n
  }
  return n
}
// ../src/vm/runtime.ts
var tjsEquals = Symbol.for('tjs.equals')
function isStructurallyEqual(a, b) {
  if (
    a !== null &&
    typeof a === 'object' &&
    typeof a[tjsEquals] === 'function'
  ) {
    return a[tjsEquals](b)
  }
  if (
    b !== null &&
    typeof b === 'object' &&
    typeof b[tjsEquals] === 'function'
  ) {
    return b[tjsEquals](a)
  }
  if (a !== null && typeof a === 'object' && typeof a.Equals === 'function') {
    return a.Equals(b)
  }
  if (b !== null && typeof b === 'object' && typeof b.Equals === 'function') {
    return b.Equals(a)
  }
  if (a === b) return true
  if ((a === null || a === undefined) && (b === null || b === undefined))
    return true
  if (a === null || a === undefined || b === null || b === undefined)
    return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i2) => isStructurallyEqual(v, b[i2]))
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => isStructurallyEqual(a[k], b[k]))
}

class AgentError {
  $error = true
  message
  op
  cause
  constructor(message, op, cause) {
    this.message = message
    this.op = op
    this.cause = cause
  }
  toString() {
    return `AgentError[${this.op}]: ${this.message}`
  }
  toJSON() {
    return { $error: true, message: this.message, op: this.op }
  }
}
var procedureStore = new Map()
var DEFAULT_PROCEDURE_TTL = 60 * 60 * 1000
var DEFAULT_MAX_AST_SIZE = 100 * 1024
var PROCEDURE_TOKEN_PREFIX = 'proc_'
function isProcedureToken(value) {
  return typeof value === 'string' && value.startsWith(PROCEDURE_TOKEN_PREFIX)
}
function resolveProcedureToken(token) {
  const entry = procedureStore.get(token)
  if (!entry) {
    throw new Error(`Procedure not found: ${token}`)
  }
  if (Date.now() > entry.expiresAt) {
    procedureStore.delete(token)
    throw new Error(`Procedure expired: ${token}`)
  }
  return entry.ast
}
function generateProcedureToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return PROCEDURE_TOKEN_PREFIX + crypto.randomUUID()
  }
  return (
    PROCEDURE_TOKEN_PREFIX +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  )
}
var FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype'])
function assertSafeProperty(prop) {
  if (FORBIDDEN_PROPERTIES.has(prop)) {
    throw new Error(`Security Error: Access to '${prop}' is forbidden`)
  }
}
var BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
])
function isBlockedUrl(urlString) {
  try {
    const url = new URL(urlString)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return true
    }
    const host = url.hostname.toLowerCase()
    if (BLOCKED_HOSTS.has(host)) return true
    if (host.endsWith('.internal') || host.endsWith('.local')) return true
    if (host === '169.254.169.254') return true
    if (
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return true
    }
    return false
  } catch {
    return true
  }
}
function isSuspiciousRegex(pattern) {
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) return true
  if (/\(([^|)]+)\|\1\)[+*]/.test(pattern)) return true
  if (/\(\.\*\)\+/.test(pattern)) return true
  if (/\(\.\+\)\+/.test(pattern)) return true
  if (/\(\[.*\]\+\)\+/.test(pattern)) return true
  return false
}
function createChildScope(ctx) {
  return {
    ...ctx,
    state: Object.create(ctx.state),
  }
}
function diffObjects(before, after) {
  const diff = {}
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of allKeys) {
    const beforeVal = before[key]
    const afterVal = after[key]
    if (afterVal !== beforeVal) {
      diff[key] = afterVal
    }
  }
  return diff
}
function resolveValue(val, ctx) {
  if (val && typeof val === 'object' && val.$kind === 'arg') {
    return ctx.args[val.path]
  }
  if (val && typeof val === 'object' && val.$expr) {
    return evaluateExpr(val, ctx)
  }
  if (typeof val === 'string') {
    if (val.startsWith('args.') && !('args' in ctx.state)) {
      return ctx.args[val.replace('args.', '')]
    }
    if (val.includes('.')) {
      const parts = val.split('.')
      for (const part of parts) {
        if (FORBIDDEN_PROPERTIES.has(part)) {
          throw new Error(`Security Error: Access to '${part}' is forbidden`)
        }
      }
      let current2 = ctx.state[parts[0]]
      if (current2 !== undefined) {
        for (let i2 = 1; i2 < parts.length; i2++) {
          current2 = current2?.[parts[i2]]
        }
        return current2
      }
    }
    if (val in ctx.state) {
      return ctx.state[val]
    }
    return val
  }
  if (
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    val.constructor === Object
  ) {
    const result = {}
    for (const key of Object.keys(val)) {
      result[key] = resolveValue(val[key], ctx)
    }
    return result
  }
  if (Array.isArray(val)) {
    return val.map((item) => resolveValue(item, ctx))
  }
  return val
}
function createBuiltinProxy(name, supported, alternatives) {
  return new Proxy(supported, {
    get(target, prop) {
      if (prop in target) {
        return target[prop]
      }
      const alt = alternatives?.[prop]
      if (alt) {
        throw new Error(`${name}.${prop} is not available. ${alt}`)
      }
      throw new Error(
        `${name}.${prop} is not supported in AsyncJS. Check docs for available ${name} methods.`
      )
    },
  })
}
function convertExampleToSchema(example) {
  if (example === null) {
    return { type: 'null' }
  }
  if (example === undefined) {
    return {}
  }
  if (
    typeof example === 'object' &&
    example !== null &&
    'type' in example &&
    typeof example.type === 'string'
  ) {
    return example
  }
  if (
    typeof example === 'object' &&
    example !== null &&
    'schema' in example &&
    typeof example.schema === 'object'
  ) {
    return example.schema
  }
  const type = typeof example
  if (type === 'string') {
    return { type: 'string' }
  }
  if (type === 'number') {
    return Number.isInteger(example) ? { type: 'integer' } : { type: 'number' }
  }
  if (type === 'boolean') {
    return { type: 'boolean' }
  }
  if (Array.isArray(example)) {
    if (example.length === 0) {
      return { type: 'array' }
    }
    return {
      type: 'array',
      items: convertExampleToSchema(example[0]),
    }
  }
  if (type === 'object') {
    const properties = {}
    const required = []
    for (const [key, value] of Object.entries(example)) {
      properties[key] = convertExampleToSchema(value)
      required.push(key)
    }
    return {
      type: 'object',
      properties,
      required,
    }
  }
  return {}
}
var builtins = {
  Math: createBuiltinProxy('Math', {
    PI: Math.PI,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,
    SQRT2: Math.SQRT2,
    SQRT1_2: Math.SQRT1_2,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    trunc: Math.trunc,
    sign: Math.sign,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    pow: Math.pow,
    exp: Math.exp,
    expm1: Math.expm1,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    log1p: Math.log1p,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    hypot: Math.hypot,
    min: Math.min,
    max: Math.max,
    clz32: Math.clz32,
    imul: Math.imul,
    fround: Math.fround,
    random: () => {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const arr = new Uint32Array(1)
        crypto.getRandomValues(arr)
        return arr[0] / (4294967295 + 1)
      }
      return Math.random()
    },
  }),
  JSON: createBuiltinProxy('JSON', {
    parse: (text) => JSON.parse(text),
    stringify: (value, replacer, space) =>
      JSON.stringify(value, replacer, space),
  }),
  console: createBuiltinProxy(
    'console',
    {
      log: (..._args) => {
        return
      },
      warn: (..._args) => {
        return
      },
      error: (..._args) => {
        return
      },
      info: (..._args) => {
        return
      },
    },
    {
      table: 'Use console.log with JSON.stringify for structured data.',
      dir: 'Use console.log instead.',
      trace: 'Stack traces are not available in AsyncJS.',
    }
  ),
  Array: createBuiltinProxy(
    'Array',
    {
      isArray: (value) => Array.isArray(value),
      from: (iterable, mapFn, thisArg) => Array.from(iterable, mapFn, thisArg),
      of: (...items) => Array.of(...items),
    },
    {
      prototype: 'Prototype access is not allowed.',
    }
  ),
  Object: createBuiltinProxy(
    'Object',
    {
      keys: (obj) => Object.keys(obj),
      values: (obj) => Object.values(obj),
      entries: (obj) => Object.entries(obj),
      fromEntries: (entries) => Object.fromEntries(entries),
      assign: (target, ...sources) => Object.assign({}, target, ...sources),
      hasOwn: (obj, prop) => Object.hasOwn(obj, prop),
    },
    {
      prototype: 'Prototype access is not allowed.',
      create: 'Use object literals instead.',
      defineProperty: 'Property descriptors are not supported.',
      getPrototypeOf: 'Prototype access is not allowed.',
      setPrototypeOf: 'Prototype modification is not allowed.',
    }
  ),
  String: createBuiltinProxy('String', {
    fromCharCode: (...codes) => String.fromCharCode(...codes),
    fromCodePoint: (...codePoints) => String.fromCodePoint(...codePoints),
  }),
  Number: createBuiltinProxy('Number', {
    isNaN: Number.isNaN,
    isFinite: Number.isFinite,
    isInteger: Number.isInteger,
    isSafeInteger: Number.isSafeInteger,
    parseFloat,
    parseInt,
    MAX_VALUE: Number.MAX_VALUE,
    MIN_VALUE: Number.MIN_VALUE,
    MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
    MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
    POSITIVE_INFINITY: Number.POSITIVE_INFINITY,
    NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY,
    NaN: Number.NaN,
    EPSILON: Number.EPSILON,
  }),
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURI,
  decodeURI,
  encodeURIComponent,
  decodeURIComponent,
  undefined: undefined,
  null: null,
  NaN: NaN,
  Infinity: Infinity,
  filter: (data2, schema) => {
    const jsonSchema = convertExampleToSchema(schema)
    const result = Y(data2, jsonSchema)
    if (result instanceof Error) {
      throw result
    }
    return result
  },
  Schema: {
    ...X,
    response: (name, schemaOrExample) => {
      const jsonSchema =
        schemaOrExample?.schema != null
          ? schemaOrExample.schema
          : convertExampleToSchema(schemaOrExample)
      return {
        type: 'json_schema',
        json_schema: {
          name,
          strict: true,
          schema: jsonSchema,
        },
      }
    },
    fromExample: (example) => convertExampleToSchema(example),
    isValid: (data2, schemaOrExample) => {
      if (schemaOrExample?.schema != null) {
        return K(data2, schemaOrExample)
      }
      return K(data2, convertExampleToSchema(schemaOrExample))
    },
  },
  Set: (items = []) => {
    const data2 = [...new globalThis.Set(items)]
    return {
      add(item) {
        if (!data2.includes(item)) {
          data2.push(item)
        }
        return this
      },
      remove(item) {
        const idx = data2.indexOf(item)
        if (idx !== -1) {
          data2.splice(idx, 1)
        }
        return this
      },
      clear() {
        data2.length = 0
        return this
      },
      has(item) {
        return data2.includes(item)
      },
      get size() {
        return data2.length
      },
      toArray() {
        return [...data2]
      },
      union(other) {
        const otherItems = other?.toArray?.() ?? other ?? []
        return builtins.Set([...data2, ...otherItems])
      },
      intersection(other) {
        const otherItems = other?.toArray?.() ?? other ?? []
        return builtins.Set(data2.filter((x) => otherItems.includes(x)))
      },
      diff(other) {
        const otherItems = other?.toArray?.() ?? other ?? []
        return builtins.Set(data2.filter((x) => !otherItems.includes(x)))
      },
      forEach(fn) {
        data2.forEach(fn)
      },
      map(fn) {
        return builtins.Set(data2.map(fn))
      },
      filter(fn) {
        return builtins.Set(data2.filter(fn))
      },
      toJSON() {
        return [...data2]
      },
    }
  },
  Date: (() => {
    const createDate = (d) => ({
      get value() {
        return d.toISOString()
      },
      get timestamp() {
        return d.getTime()
      },
      get year() {
        return d.getFullYear()
      },
      get month() {
        return d.getMonth() + 1
      },
      get day() {
        return d.getDate()
      },
      get hours() {
        return d.getHours()
      },
      get minutes() {
        return d.getMinutes()
      },
      get seconds() {
        return d.getSeconds()
      },
      get dayOfWeek() {
        return d.getDay()
      },
      add({
        years = 0,
        months = 0,
        days = 0,
        hours = 0,
        minutes = 0,
        seconds = 0,
        ms = 0,
      } = {}) {
        const newDate = new globalThis.Date(d.getTime())
        if (years) newDate.setFullYear(newDate.getFullYear() + years)
        if (months) newDate.setMonth(newDate.getMonth() + months)
        if (days) newDate.setDate(newDate.getDate() + days)
        if (hours) newDate.setHours(newDate.getHours() + hours)
        if (minutes) newDate.setMinutes(newDate.getMinutes() + minutes)
        if (seconds) newDate.setSeconds(newDate.getSeconds() + seconds)
        if (ms) newDate.setMilliseconds(newDate.getMilliseconds() + ms)
        return createDate(newDate)
      },
      diff(other, unit = 'ms') {
        const otherTime =
          typeof other === 'object' && other.timestamp
            ? other.timestamp
            : new globalThis.Date(other).getTime()
        const diffMs = d.getTime() - otherTime
        switch (unit) {
          case 'seconds':
            return diffMs / 1000
          case 'minutes':
            return diffMs / (1000 * 60)
          case 'hours':
            return diffMs / (1000 * 60 * 60)
          case 'days':
            return diffMs / (1000 * 60 * 60 * 24)
          default:
            return diffMs
        }
      },
      format(fmt = 'ISO') {
        if (fmt === 'ISO') return d.toISOString()
        if (fmt === 'date') return d.toISOString().split('T')[0]
        if (fmt === 'time') return d.toISOString().split('T')[1].split('.')[0]
        return fmt
          .replace('YYYY', String(d.getFullYear()))
          .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
          .replace('DD', String(d.getDate()).padStart(2, '0'))
          .replace('HH', String(d.getHours()).padStart(2, '0'))
          .replace('mm', String(d.getMinutes()).padStart(2, '0'))
          .replace('ss', String(d.getSeconds()).padStart(2, '0'))
      },
      isBefore(other) {
        const otherTime =
          typeof other === 'object' && other.timestamp
            ? other.timestamp
            : new globalThis.Date(other).getTime()
        return d.getTime() < otherTime
      },
      isAfter(other) {
        const otherTime =
          typeof other === 'object' && other.timestamp
            ? other.timestamp
            : new globalThis.Date(other).getTime()
        return d.getTime() > otherTime
      },
      toString() {
        return d.toISOString()
      },
      toJSON() {
        return d.toISOString()
      },
    })
    const DateFactory = (init) => {
      const date =
        init !== undefined ? new globalThis.Date(init) : new globalThis.Date()
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${init}`)
      }
      return createDate(date)
    }
    DateFactory.now = () => globalThis.Date.now()
    DateFactory.parse = (str) => createDate(new globalThis.Date(str))
    return DateFactory
  })(),
}
var unsupportedBuiltins = {
  RegExp: 'RegExp is not available. Use string methods or the regexMatch atom.',
  Promise: 'Promise is not needed. All operations are implicitly async.',
  Map: 'Map is not available. Use plain objects instead.',
  WeakSet: 'WeakSet is not available.',
  WeakMap: 'WeakMap is not available.',
  Symbol: 'Symbol is not available.',
  Proxy: 'Proxy is not available.',
  Reflect: 'Reflect is not available.',
  Function: 'Function constructor is not available. Define functions normally.',
  eval: 'eval is not available. Code is compiled, not evaluated.',
  setTimeout: 'setTimeout is not available. Use the delay atom.',
  setInterval: 'setInterval is not available. Use while loops with delay.',
  fetch: 'fetch is not available. Use the httpFetch atom.',
  require: 'require is not available. Atoms must be registered with the VM.',
  import: 'import is not available. Atoms must be registered with the VM.',
  process: 'process is not available. AsyncJS runs in a sandboxed environment.',
  window: 'window is not available. AsyncJS runs in a sandboxed environment.',
  document:
    'document is not available. AsyncJS runs in a sandboxed environment.',
  global: 'global is not available. AsyncJS runs in a sandboxed environment.',
  globalThis: 'globalThis is not available. Use builtins directly.',
}
var EXPR_FUEL_COST = 0.01
var STRING_FUEL_PER_CHAR = 0.0001
var ARRAY_FUEL_PER_ELEMENT = 0.001
var ALLOCATING_METHODS = new Set([
  'concat',
  'slice',
  'map',
  'filter',
  'flatMap',
  'flat',
  'toReversed',
  'toSorted',
  'toSpliced',
  'repeat',
  'padStart',
  'padEnd',
  'split',
  'join',
  'replace',
  'replaceAll',
  'substring',
  'substr',
  'trim',
  'trimStart',
  'trimEnd',
  'toLowerCase',
  'toUpperCase',
  'match',
  'matchAll',
  'parse',
  'stringify',
])
function evaluateExpr(node, ctx) {
  if (node === null || node === undefined) {
    return node
  }
  if (typeof node !== 'object' || !('$expr' in node)) {
    return node
  }
  if (ctx.fuel) {
    ctx.fuel.current -= EXPR_FUEL_COST
    if (ctx.fuel.current <= 0) {
      throw new Error('Out of Fuel')
    }
  }
  switch (node.$expr) {
    case 'literal':
      return node.value
    case 'ident': {
      if (node.name in ctx.state) {
        return ctx.state[node.name]
      }
      if (node.name in ctx.args) {
        return ctx.args[node.name]
      }
      if (node.name in builtins) {
        return builtins[node.name]
      }
      if (node.name in unsupportedBuiltins) {
        throw new Error(unsupportedBuiltins[node.name])
      }
      return
    }
    case 'member': {
      const obj = evaluateExpr(node.object, ctx)
      if (node.optional && (obj === null || obj === undefined)) {
        return
      }
      const prop = node.property
      assertSafeProperty(prop)
      return obj?.[prop]
    }
    case 'binary': {
      const left = evaluateExpr(node.left, ctx)
      const right = evaluateExpr(node.right, ctx)
      switch (node.op) {
        case '+': {
          const result = left + right
          if (typeof result === 'string' && ctx.fuel) {
            ctx.fuel.current -= result.length * STRING_FUEL_PER_CHAR
            if (ctx.fuel.current <= 0) {
              ctx.error = new AgentError('Out of Fuel', 'expr.concat')
              return
            }
          }
          return result
        }
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return left / right
        case '%':
          return left % right
        case '**':
          return left ** right
        case '>':
          return left > right
        case '<':
          return left < right
        case '>=':
          return left >= right
        case '<=':
          return left <= right
        case '==':
          return isStructurallyEqual(left, right)
        case '!=':
          return !isStructurallyEqual(left, right)
        case '===':
          return left === right
        case '!==':
          return left !== right
        default:
          throw new Error(`Unknown binary operator: ${node.op}`)
      }
    }
    case 'unary': {
      const arg = evaluateExpr(node.argument, ctx)
      switch (node.op) {
        case '!':
          return !arg
        case '-':
          return -arg
        case '+':
          return +arg
        case 'typeof':
          return typeof arg
        default:
          throw new Error(`Unknown unary operator: ${node.op}`)
      }
    }
    case 'logical': {
      const left = evaluateExpr(node.left, ctx)
      if (node.op === '&&') {
        return left ? evaluateExpr(node.right, ctx) : left
      } else if (node.op === '??') {
        return left ?? evaluateExpr(node.right, ctx)
      } else {
        return left ? left : evaluateExpr(node.right, ctx)
      }
    }
    case 'conditional': {
      const test = evaluateExpr(node.test, ctx)
      return test
        ? evaluateExpr(node.consequent, ctx)
        : evaluateExpr(node.alternate, ctx)
    }
    case 'array':
      return node.elements.map((el) => evaluateExpr(el, ctx))
    case 'object': {
      const result = {}
      for (const prop of node.properties) {
        result[prop.key] = evaluateExpr(prop.value, ctx)
      }
      return result
    }
    case 'call': {
      if (node.callee === 'Error') {
        const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
        const message = typeof args[0] === 'string' ? args[0] : 'Error'
        ctx.error = new AgentError(message, 'Error')
        return
      }
      if (node.callee in builtins) {
        const fn = builtins[node.callee]
        if (typeof fn === 'function') {
          const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
          return fn(...args)
        }
      }
      const atom = ctx.resolver(node.callee)
      if (!atom) {
        if (node.callee in unsupportedBuiltins) {
          throw new Error(unsupportedBuiltins[node.callee])
        }
        throw new Error(`Unknown function: ${node.callee}`)
      }
      throw new Error(
        `Atom calls in expressions not yet supported: ${node.callee}`
      )
    }
    case 'methodCall': {
      const obj = evaluateExpr(node.object, ctx)
      if (node.optional && (obj === null || obj === undefined)) {
        return
      }
      const method = node.method
      assertSafeProperty(method)
      if (obj === null || obj === undefined) {
        throw new Error(`Cannot call method '${method}' on ${obj}`)
      }
      const fn = obj[method]
      if (typeof fn !== 'function') {
        throw new Error(`'${method}' is not a function`)
      }
      const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
      const result = fn.apply(obj, args)
      if (ctx.fuel && ALLOCATING_METHODS.has(method)) {
        let fuelCost = 0
        if (typeof result === 'string') {
          fuelCost = result.length * STRING_FUEL_PER_CHAR
        } else if (Array.isArray(result)) {
          fuelCost = result.length * ARRAY_FUEL_PER_ELEMENT
        } else if (typeof result === 'object' && result !== null) {
          const keys = Object.keys(result)
          fuelCost = keys.length * ARRAY_FUEL_PER_ELEMENT
        }
        ctx.fuel.current -= fuelCost
        if (ctx.fuel.current <= 0) {
          ctx.error = new AgentError('Out of Fuel', `expr.${method}`)
          return
        }
      }
      return result
    }
    default:
      throw new Error(`Unknown expression type: ${node.$expr}`)
  }
}
function defineAtom(op, inputSchema, outputSchema, fn, options = {}) {
  const {
    docs = '',
    timeoutMs = 1000,
    cost = 1,
  } = typeof options === 'string' ? { docs: options } : options
  const exec = async (step, ctx) => {
    const { op: _op, result: _res, ...inputData } = step
    if (ctx.error) return
    const stateBefore = ctx.trace ? { ...ctx.state } : null
    const fuelBefore = ctx.fuel.current
    let result
    let error
    try {
      const overrideCost = ctx.costOverrides?.[op]
      const baseCost = overrideCost !== undefined ? overrideCost : cost
      const currentCost =
        typeof baseCost === 'function' ? baseCost(inputData, ctx) : baseCost
      if ((ctx.fuel.current -= currentCost) <= 0) {
        ctx.error = new AgentError('Out of Fuel', op)
        return
      }
      let timer
      const execute = async () => fn(step, ctx)
      result =
        timeoutMs > 0
          ? await Promise.race([
              execute(),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error(`Atom '${op}' timed out`)),
                  timeoutMs
                )
              }),
            ]).finally(() => clearTimeout(timer))
          : await execute()
      if (step.result) {
        if (ctx.consts.has(step.result)) {
          throw new Error(`Cannot reassign const variable '${step.result}'`)
        }
        if (result !== undefined && outputSchema && !K(result, outputSchema)) {
          ctx.error = new AgentError(`Output validation failed for '${op}'`, op)
          return
        }
        ctx.state[step.result] = result
        if (step.resultConst) {
          ctx.consts.add(step.result)
        }
      }
    } catch (e) {
      error = e.message || String(e)
      ctx.error = new AgentError(error, op, e)
    } finally {
      if (ctx.trace && stateBefore) {
        const stateDiff = diffObjects(stateBefore, ctx.state)
        ctx.trace.push({
          op,
          input: inputData,
          stateDiff,
          result,
          error,
          fuelBefore,
          fuelAfter: ctx.fuel.current,
          timestamp: new Date().toISOString(),
        })
      }
    }
  }
  return {
    op,
    inputSchema,
    outputSchema,
    exec,
    docs,
    timeoutMs,
    cost,
    create: (input) => ({ op, ...input }),
  }
}
var seq = defineAtom(
  'seq',
  X.object({ steps: X.array(X.any) }),
  undefined,
  async ({ steps }, ctx) => {
    for (const step of steps) {
      if (ctx.output !== undefined) return
      if (ctx.error) return
      const atom = ctx.resolver(step.op)
      if (!atom) throw new Error(`Unknown Atom: ${step.op}`)
      await atom.exec(step, ctx)
    }
  },
  { docs: 'Sequence', timeoutMs: 0, cost: 0.1 }
)
var iff = defineAtom(
  'if',
  X.object({
    condition: X.any,
    then: X.array(X.any),
    else: X.array(X.any).optional,
  }),
  undefined,
  async (step, ctx) => {
    if (evaluateExpr(step.condition, ctx)) {
      await seq.exec({ op: 'seq', steps: step.then }, ctx)
    } else if (step.else) {
      await seq.exec({ op: 'seq', steps: step.else }, ctx)
    }
  },
  { docs: 'If/Else', timeoutMs: 0, cost: 0.1 }
)
var whileLoop = defineAtom(
  'while',
  X.object({
    condition: X.any,
    body: X.array(X.any),
  }),
  undefined,
  async (step, ctx) => {
    while (evaluateExpr(step.condition, ctx)) {
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      if ((ctx.fuel.current -= 0.1) <= 0) throw new Error('Out of Fuel')
      await seq.exec({ op: 'seq', steps: step.body }, ctx)
      if (ctx.output !== undefined) return
    }
  },
  { docs: 'While Loop', timeoutMs: 0, cost: 0.1 }
)
var ret = defineAtom(
  'return',
  undefined,
  X.any,
  async (step, ctx) => {
    if (ctx.error) {
      ctx.output = ctx.error
      return ctx.error
    }
    if ('value' in step) {
      const res2 = resolveValue(step.value, ctx)
      ctx.output = res2
      return res2
    }
    let res = {}
    if (step.schema?.properties) {
      for (const key of Object.keys(step.schema.properties)) {
        res[key] = ctx.state[key]
      }
      if (step.filter !== false) {
        const filterResult = Y(res, step.schema)
        if (!(filterResult instanceof Error)) {
          res = filterResult
        }
      }
    }
    ctx.output = res
    return res
  },
  { docs: 'Return', cost: 0.1 }
)
var tryCatch = defineAtom(
  'try',
  X.object({
    try: X.array(X.any),
    catch: X.array(X.any).optional,
    catchParam: X.string.optional,
  }),
  undefined,
  async (step, ctx) => {
    await seq.exec({ op: 'seq', steps: step.try }, ctx)
    if (ctx.error && step.catch) {
      const paramName = step.catchParam || 'error'
      ctx.state[paramName] = ctx.error.message
      ctx.state['errorOp'] = ctx.error.op
      ctx.error = undefined
      await seq.exec({ op: 'seq', steps: step.catch }, ctx)
    }
  },
  { docs: 'Try/Catch', timeoutMs: 0, cost: 0.1 }
)
var errorAtom = defineAtom(
  'Error',
  X.object({ args: X.array(X.any).optional }),
  undefined,
  async (step, ctx) => {
    const message = step.args?.[0] ?? 'Error'
    ctx.error = new AgentError(String(message), 'Error')
  },
  { docs: 'Trigger error flow', cost: 0.1 }
)
var varSet = defineAtom(
  'varSet',
  X.object({ key: X.string, value: X.any }),
  undefined,
  async ({ key, value }, ctx) => {
    if (ctx.consts.has(key)) {
      throw new Error(`Cannot reassign const variable '${key}'`)
    }
    ctx.state[key] = resolveValue(value, ctx)
  },
  { docs: 'Set Variable', cost: 0.1 }
)
var constSet = defineAtom(
  'constSet',
  X.object({ key: X.string, value: X.any }),
  undefined,
  async ({ key, value }, ctx) => {
    if (ctx.consts.has(key)) {
      throw new Error(`Cannot reassign const variable '${key}'`)
    }
    if (key in ctx.state) {
      throw new Error(`Cannot redeclare variable '${key}' as const`)
    }
    ctx.state[key] = resolveValue(value, ctx)
    ctx.consts.add(key)
  },
  { docs: 'Set Const Variable (immutable)', cost: 0.1 }
)
var varGet = defineAtom(
  'varGet',
  X.object({ key: X.string }),
  X.any,
  async ({ key }, ctx) => {
    return resolveValue(key, ctx)
  },
  { docs: 'Get Variable', cost: 0.1 }
)
var varsImport = defineAtom(
  'varsImport',
  X.object({
    keys: X.union([X.array(X.string), X.record(X.string)]),
  }),
  undefined,
  async ({ keys }, ctx) => {
    if (Array.isArray(keys)) {
      for (const key of keys) {
        ctx.state[key] = resolveValue({ $kind: 'arg', path: key }, ctx)
      }
    } else {
      for (const [alias, path] of Object.entries(keys)) {
        ctx.state[alias] = resolveValue({ $kind: 'arg', path }, ctx)
      }
    }
  },
  {
    docs: 'Import variables from args into the current scope, with optional renaming.',
    cost: 0.2,
  }
)
var varsLet = defineAtom(
  'varsLet',
  X.record(X.any),
  undefined,
  async (step, ctx) => {
    for (const key of Object.keys(step)) {
      if (key === 'op' || key === 'result') continue
      ctx.state[key] = resolveValue(step[key], ctx)
    }
  },
  {
    docs: 'Initialize a set of variables in the current scope from the step object properties.',
    cost: 0.1,
  }
)
var varsExport = defineAtom(
  'varsExport',
  X.object({
    keys: X.union([X.array(X.string), X.record(X.string)]),
  }),
  X.record(X.any),
  async ({ keys }, ctx) => {
    const result = {}
    if (Array.isArray(keys)) {
      for (const key of keys) {
        result[key] = resolveValue(key, ctx)
      }
    } else {
      for (const [alias, path] of Object.entries(keys)) {
        result[alias] = resolveValue(path, ctx)
      }
    }
    return result
  },
  {
    docs: 'Export variables from the current scope, with optional renaming.',
    cost: 0.2,
  }
)
var scope = defineAtom(
  'scope',
  X.object({ steps: X.array(X.any) }),
  undefined,
  async ({ steps }, ctx) => {
    const scopedCtx = createChildScope(ctx)
    await seq.exec({ op: 'seq', steps }, scopedCtx)
    if (scopedCtx.output !== undefined) ctx.output = scopedCtx.output
  },
  { docs: 'Create new scope', timeoutMs: 0, cost: 0.1 }
)
var map = defineAtom(
  'map',
  X.object({ items: X.array(X.any), as: X.string, steps: X.array(X.any) }),
  X.array(X.any),
  async ({ items, as, steps }, ctx) => {
    const results = []
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('map: items is not an array')
    for (const item of resolvedItems) {
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      await seq.exec({ op: 'seq', steps }, scopedCtx)
      results.push(scopedCtx.state['result'] ?? null)
    }
    return results
  },
  { docs: 'Map Array', timeoutMs: 0, cost: 1 }
)
var filter = defineAtom(
  'filter',
  X.object({
    items: X.array(X.any),
    as: X.string,
    condition: X.any,
  }),
  X.array(X.any),
  async ({ items, as, condition }, ctx) => {
    const results = []
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('filter: items is not an array')
    for (const item of resolvedItems) {
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      const passes = evaluateExpr(condition, scopedCtx)
      if (passes) {
        results.push(item)
      }
    }
    return results
  },
  { docs: 'Filter Array', timeoutMs: 0, cost: 1 }
)
var reduce = defineAtom(
  'reduce',
  X.object({
    items: X.array(X.any),
    as: X.string,
    accumulator: X.string,
    initial: X.any,
    steps: X.array(X.any),
  }),
  X.any,
  async ({ items, as, accumulator, initial, steps }, ctx) => {
    const resolvedItems = resolveValue(items, ctx)
    const resolvedInitial = resolveValue(initial, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('reduce: items is not an array')
    let acc = resolvedInitial
    for (const item of resolvedItems) {
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      scopedCtx.state[accumulator] = acc
      await seq.exec({ op: 'seq', steps }, scopedCtx)
      acc = scopedCtx.state['result'] ?? acc
    }
    return acc
  },
  { docs: 'Reduce Array', timeoutMs: 0, cost: 1 }
)
var find = defineAtom(
  'find',
  X.object({
    items: X.array(X.any),
    as: X.string,
    condition: X.any,
  }),
  X.any,
  async ({ items, as, condition }, ctx) => {
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('find: items is not an array')
    for (const item of resolvedItems) {
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      const matches = evaluateExpr(condition, scopedCtx)
      if (matches) {
        return item
      }
    }
    return null
  },
  { docs: 'Find in Array', timeoutMs: 0, cost: 1 }
)
var push = defineAtom(
  'push',
  X.object({ list: X.array(X.any), item: X.any }),
  X.array(X.any),
  async ({ list: list2, item }, ctx) => {
    const resolvedList = resolveValue(list2, ctx)
    const resolvedItem = resolveValue(item, ctx)
    if (Array.isArray(resolvedList)) resolvedList.push(resolvedItem)
    return resolvedList
  },
  { docs: 'Push to Array', cost: 1 }
)
var len = defineAtom(
  'len',
  X.object({ list: X.any }),
  X.number,
  async ({ list: list2 }, ctx) => {
    const val = resolveValue(list2, ctx)
    return Array.isArray(val) || typeof val === 'string' ? val.length : 0
  },
  { docs: 'Length', cost: 1 }
)
var split = defineAtom(
  'split',
  X.object({ str: X.string, sep: X.string }),
  X.array(X.string),
  async ({ str, sep }, ctx) =>
    resolveValue(str, ctx).split(resolveValue(sep, ctx)),
  { docs: 'Split String', cost: 1 }
)
var join = defineAtom(
  'join',
  X.object({ list: X.array(X.string), sep: X.string }),
  X.string,
  async ({ list: list2, sep }, ctx) =>
    resolveValue(list2, ctx).join(resolveValue(sep, ctx)),
  { docs: 'Join String', cost: 1 }
)
var template = defineAtom(
  'template',
  X.object({ tmpl: X.string, vars: X.record(X.any) }),
  X.string,
  async ({ tmpl, vars }, ctx) => {
    const resolvedTmpl = resolveValue(tmpl, ctx)
    return resolvedTmpl.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      String(resolveValue(vars[key], ctx) ?? '')
    )
  },
  { docs: 'String Template', cost: 1 }
)
var regexMatch = defineAtom(
  'regexMatch',
  X.object({
    pattern: X.string,
    value: X.any,
  }),
  X.boolean,
  async ({ pattern, value }, ctx) => {
    if (isSuspiciousRegex(pattern)) {
      throw new Error(
        `Suspicious regex pattern rejected (potential ReDoS): ${pattern}`
      )
    }
    const resolvedValue = resolveValue(value, ctx)
    const p = new RegExp(pattern)
    return p.test(resolvedValue)
  },
  {
    docs: 'Returns true if the value matches the regex pattern.',
    cost: 2,
  }
)
var pick = defineAtom(
  'pick',
  X.object({ obj: X.record(X.any), keys: X.array(X.string) }),
  X.record(X.any),
  async ({ obj, keys }, ctx) => {
    const resolvedObj = resolveValue(obj, ctx)
    const resolvedKeys = resolveValue(keys, ctx)
    const res = {}
    if (resolvedObj && Array.isArray(resolvedKeys)) {
      resolvedKeys.forEach((k) => (res[k] = resolvedObj[k]))
    }
    return res
  },
  { docs: 'Pick Keys', cost: 1 }
)
var omit = defineAtom(
  'omit',
  X.object({ obj: X.record(X.any), keys: X.array(X.string) }),
  X.record(X.any),
  async ({ obj, keys }, ctx) => {
    const resolvedObj = resolveValue(obj, ctx)
    const resolvedKeys = new Set(resolveValue(keys, ctx))
    const res = {}
    if (resolvedObj) {
      Object.keys(resolvedObj).forEach((k) => {
        if (!resolvedKeys.has(k)) res[k] = resolvedObj[k]
      })
    }
    return res
  },
  { docs: 'Omit Keys', cost: 1 }
)
var merge = defineAtom(
  'merge',
  X.object({ a: X.record(X.any), b: X.record(X.any) }),
  X.record(X.any),
  async ({ a, b }, ctx) => ({
    ...resolveValue(a, ctx),
    ...resolveValue(b, ctx),
  }),
  { docs: 'Merge Objects', cost: 1 }
)
var keys = defineAtom(
  'keys',
  X.object({ obj: X.record(X.any) }),
  X.array(X.string),
  async ({ obj }, ctx) => Object.keys(resolveValue(obj, ctx) ?? {}),
  { docs: 'Object Keys', cost: 1 }
)
var MAX_AGENT_DEPTH = 10
var AGENT_DEPTH_HEADER = 'X-Agent-Depth'
function isDomainAllowed(urlString, allowedDomains) {
  try {
    const url = new URL(urlString)
    const host = url.hostname.toLowerCase()
    for (const pattern of allowedDomains) {
      const p = pattern.toLowerCase()
      if (p.startsWith('*.')) {
        const suffix = p.slice(1)
        if (host.endsWith(suffix) || host === p.slice(2)) {
          return true
        }
      } else if (host === p) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}
var fetch2 = defineAtom(
  'httpFetch',
  X.object({
    url: X.string,
    method: X.string.optional,
    headers: X.record(X.string).optional,
    body: X.any.optional,
    responseType: X.string.optional,
  }),
  X.any,
  async (step, ctx) => {
    const url = resolveValue(step.url, ctx)
    const method = resolveValue(step.method, ctx)
    const headers = resolveValue(step.headers, ctx) || {}
    const body = resolveValue(step.body, ctx)
    const responseType = resolveValue(step.responseType, ctx)
    const currentDepth = ctx.context?.requestDepth ?? 0
    if (currentDepth >= MAX_AGENT_DEPTH) {
      throw new Error(
        `Agent request depth exceeded (max ${MAX_AGENT_DEPTH}). This prevents recursive agent loops.`
      )
    }
    if (ctx.capabilities.fetch) {
      return ctx.capabilities.fetch(url, {
        method,
        headers: {
          ...headers,
          [AGENT_DEPTH_HEADER]: String(currentDepth + 1),
        },
        body,
        signal: ctx.signal,
        responseType,
      })
    }
    const allowedDomains = ctx.context?.allowedFetchDomains
    if (allowedDomains) {
      if (!isDomainAllowed(url, allowedDomains)) {
        throw new Error(
          `Fetch blocked: domain not in allowlist. Allowed: ${allowedDomains.join(
            ', '
          )}`
        )
      }
    } else {
      if (isBlockedUrl(url)) {
        throw new Error(
          `Blocked URL: private/internal addresses not allowed in default fetch`
        )
      }
      try {
        const parsed = new URL(url)
        const host = parsed.hostname.toLowerCase()
        if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
          throw new Error(
            `Fetch blocked: no allowedFetchDomains configured. ` +
              `Set ctx.context.allowedFetchDomains or provide a custom fetch capability.`
          )
        }
      } catch (e) {
        if (e.message.includes('allowedFetchDomains')) throw e
        throw new Error(`Invalid URL: ${url}`)
      }
    }
    if (typeof globalThis.fetch === 'function') {
      const res = await globalThis.fetch(url, {
        method,
        headers: {
          ...headers,
          [AGENT_DEPTH_HEADER]: String(currentDepth + 1),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctx.signal,
      })
      if (responseType === 'dataUrl') {
        const buffer = await res.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i2 = 0; i2 < bytes.length; i2++) {
          binary += String.fromCharCode(bytes[i2])
        }
        const base64 = btoa(binary)
        const contentType2 =
          res.headers.get('content-type') || 'application/octet-stream'
        return `data:${contentType2};base64,${base64}`
      }
      const contentType = res.headers.get('content-type')
      if (
        responseType === 'json' ||
        (contentType && contentType.includes('application/json'))
      ) {
        return res.json()
      }
      return res.text()
    }
    throw new Error("Capability 'fetch' missing and no global fetch available")
  },
  { docs: 'HTTP Fetch', timeoutMs: 30000, cost: 5 }
)
var storeGet = defineAtom(
  'storeGet',
  X.object({ key: X.string }),
  X.any,
  async ({ key }, ctx) => {
    const k = resolveValue(key, ctx)
    return ctx.capabilities.store?.get(k)
  },
  { docs: 'Store Get', cost: 5 }
)
var storeSet = defineAtom(
  'storeSet',
  X.object({ key: X.string, value: X.any }),
  undefined,
  async ({ key, value }, ctx) => {
    const k = resolveValue(key, ctx)
    const v = resolveValue(value, ctx)
    return ctx.capabilities.store?.set(k, v)
  },
  { docs: 'Store Set', cost: 5 }
)
var storeQuery = defineAtom(
  'storeQuery',
  X.object({ query: X.any }),
  X.array(X.any),
  async ({ query }, ctx) =>
    ctx.capabilities.store?.query?.(resolveValue(query, ctx)) ?? [],
  { docs: 'Store Query', cost: 5 }
)
var vectorSearch = defineAtom(
  'storeVectorSearch',
  X.object({
    collection: X.string.optional,
    vector: X.array(X.number),
    k: X.number.optional,
  }),
  X.array(X.any),
  async ({ collection, vector, k }, ctx) =>
    ctx.capabilities.store?.vectorSearch?.(
      resolveValue(collection, ctx),
      resolveValue(vector, ctx),
      resolveValue(k, ctx)
    ) ?? [],
  {
    docs: 'Vector Search',
    cost: (input, ctx) => 5 + (resolveValue(input.k, ctx) ?? 5),
  }
)
var llmPredict = defineAtom(
  'llmPredict',
  X.object({ prompt: X.string, options: X.any.optional }),
  X.string,
  async ({ prompt, options }, ctx) => {
    if (!ctx.capabilities.llm?.predict)
      throw new Error("Capability 'llm.predict' missing")
    return ctx.capabilities.llm.predict(
      resolveValue(prompt, ctx),
      resolveValue(options, ctx)
    )
  },
  { docs: 'LLM Predict', timeoutMs: 120000, cost: 100 }
)
var agentRun = defineAtom(
  'agentRun',
  X.object({ agentId: X.any, input: X.any }),
  X.any,
  async ({ agentId, input }, ctx) => {
    const resolvedId = resolveValue(agentId, ctx)
    const rawInput = resolveValue(input, ctx)
    let resolvedInput = rawInput
    if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
      resolvedInput = {}
      for (const k in rawInput) {
        resolvedInput[k] = resolveValue(rawInput[k], ctx)
      }
    }
    if (isProcedureToken(resolvedId)) {
      const ast = resolveProcedureToken(resolvedId)
      const childCtx = {
        ...ctx,
        args: resolvedInput,
        state: {},
        consts: new Set(),
        output: undefined,
        error: undefined,
      }
      const seqAtom = ctx.resolver('seq')
      if (!seqAtom) throw new Error('seq atom not found')
      await seqAtom.exec(ast, childCtx)
      if (childCtx.error) {
        throw new Error(childCtx.error.message || 'Sub-agent failed')
      }
      return childCtx.output
    }
    if (resolvedId && typeof resolvedId === 'object' && 'op' in resolvedId) {
      const childCtx = {
        ...ctx,
        args: resolvedInput,
        state: {},
        consts: new Set(),
        output: undefined,
        error: undefined,
      }
      const seqAtom = ctx.resolver('seq')
      if (!seqAtom) throw new Error('seq atom not found')
      await seqAtom.exec(resolvedId, childCtx)
      if (childCtx.error) {
        throw new Error(childCtx.error.message || 'Sub-agent failed')
      }
      return childCtx.output
    }
    if (!ctx.capabilities.agent?.run)
      throw new Error("Capability 'agent.run' missing")
    const result = await ctx.capabilities.agent.run(resolvedId, resolvedInput)
    if (
      result &&
      typeof result === 'object' &&
      'fuelUsed' in result &&
      typeof result.fuelUsed === 'number'
    ) {
      if (result.error) {
        throw new Error(result.error.message || 'Sub-agent failed')
      }
      return result.result
    }
    return result
  },
  { docs: 'Run Sub-Agent (accepts procedure token, AST, or agent ID)', cost: 1 }
)
var transpileCode = defineAtom(
  'transpileCode',
  X.object({
    code: X.string,
  }),
  X.any,
  async ({ code }, ctx) => {
    if (!ctx.capabilities.code?.transpile) {
      throw new Error(
        "Capability 'code.transpile' missing. Enable code transpilation by providing the code capability."
      )
    }
    const resolvedCode = resolveValue(code, ctx)
    try {
      return ctx.capabilities.code.transpile(resolvedCode)
    } catch (e) {
      throw new Error(`Code transpilation failed: ${e.message}`)
    }
  },
  { docs: 'Transpile AsyncJS code to AST', cost: 1 }
)
var MAX_RUNCODE_DEPTH = 10
var runCode = defineAtom(
  'runCode',
  X.object({
    code: X.string,
    args: X.record(X.any).optional,
  }),
  X.any,
  async ({ code, args }, ctx) => {
    const currentDepth = ctx.runCodeDepth ?? 0
    if (currentDepth >= MAX_RUNCODE_DEPTH) {
      throw new Error(
        `runCode recursion limit exceeded (max ${MAX_RUNCODE_DEPTH}). ` +
          'This prevents infinite loops from dynamically generated code calling runCode.'
      )
    }
    if (!ctx.capabilities.code?.transpile) {
      throw new Error(
        "Capability 'code.transpile' missing. Enable dynamic code execution by providing the code capability."
      )
    }
    const resolvedCode = resolveValue(code, ctx)
    const resolvedArgs = args ? resolveValue(args, ctx) : {}
    let ast
    try {
      ast = ctx.capabilities.code.transpile(resolvedCode)
    } catch (e) {
      throw new Error(`Code transpilation failed: ${e.message}`)
    }
    if (ast.op !== 'seq') {
      throw new Error('Transpiled code must be a seq node')
    }
    const childCtx = createChildScope(ctx)
    childCtx.args = resolvedArgs
    childCtx.output = undefined
    childCtx.runCodeDepth = currentDepth + 1
    await seq.exec(ast, childCtx)
    if (childCtx.error) {
      ctx.error = childCtx.error
      return
    }
    return childCtx.output
  },
  { docs: 'Run dynamically generated AsyncJS code', cost: 1 }
)
var jsonParse = defineAtom(
  'jsonParse',
  X.object({ str: X.string }),
  X.any,
  async ({ str }, ctx) => JSON.parse(resolveValue(str, ctx)),
  { docs: 'Parse JSON', cost: 1 }
)
var jsonStringify = defineAtom(
  'jsonStringify',
  X.object({ value: X.any }),
  X.string,
  async ({ value }, ctx) => JSON.stringify(resolveValue(value, ctx)),
  { docs: 'Stringify JSON', cost: 1 }
)
var xmlParse = defineAtom(
  'xmlParse',
  X.object({ str: X.string }),
  X.any,
  async ({ str }, ctx) => {
    if (!ctx.capabilities.xml?.parse)
      throw new Error("Capability 'xml.parse' missing")
    return ctx.capabilities.xml.parse(resolveValue(str, ctx))
  },
  { docs: 'Parse XML', cost: 1 }
)
var memoize = defineAtom(
  'memoize',
  X.object({ key: X.string.optional, steps: X.array(X.any) }),
  X.any,
  async ({ key, steps }, ctx) => {
    if (!ctx.memo) ctx.memo = new Map()
    const k =
      resolveValue(key, ctx) ??
      (await hash.exec({ value: steps, algorithm: 'SHA-256' }, ctx))
    if (ctx.memo.has(k)) {
      return ctx.memo.get(k)
    }
    const scopedCtx = createChildScope(ctx)
    await seq.exec({ op: 'seq', steps }, scopedCtx)
    const result = scopedCtx.output ?? scopedCtx.state['result']
    ctx.memo.set(k, result)
    return result
  },
  { docs: 'Memoize steps result in memory', cost: 1 }
)
var cache = defineAtom(
  'cache',
  X.object({
    key: X.string.optional,
    steps: X.array(X.any),
    ttlMs: X.number.optional,
  }),
  X.any,
  async ({ key, steps, ttlMs }, ctx) => {
    if (!ctx.capabilities.store)
      throw new Error("Capability 'store' missing for caching")
    const k =
      resolveValue(key, ctx) ??
      (await hash.exec({ value: steps, algorithm: 'SHA-256' }, ctx))
    const cacheKey = `cache:${k}`
    const cached = await ctx.capabilities.store.get(cacheKey)
    if (cached) {
      if (typeof cached === 'object' && cached._exp) {
        if (Date.now() < cached._exp) return cached.val
      } else {
        return cached
      }
    }
    const scopedCtx = createChildScope(ctx)
    await seq.exec({ op: 'seq', steps }, scopedCtx)
    const result = scopedCtx.output ?? scopedCtx.state['result']
    const expiry = Date.now() + (ttlMs ?? 24 * 3600 * 1000)
    if ((ctx.fuel.current -= 5) <= 0) throw new Error('Out of Fuel')
    await ctx.capabilities.store.set(cacheKey, { val: result, _exp: expiry })
    return result
  },
  { docs: 'Cache steps result in store with TTL', cost: 5 }
)
var random = defineAtom(
  'random',
  X.object({
    min: X.number.optional,
    max: X.number.optional,
    format: X.string.optional,
    length: X.number.optional,
  }),
  X.any,
  async ({ min, max, format, length }, ctx) => {
    const f = resolveValue(format, ctx) ?? 'float'
    const len2 = resolveValue(length, ctx) ?? 10
    const mn = resolveValue(min, ctx) ?? 0
    const mx = resolveValue(max, ctx) ?? 1
    if (f === 'base36') {
      const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
      let result2 = ''
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const values = new Uint8Array(len2)
        crypto.getRandomValues(values)
        for (let i2 = 0; i2 < len2; i2++) {
          result2 += chars[values[i2] % 36]
        }
      } else {
        for (let i2 = 0; i2 < len2; i2++) {
          result2 += chars.charAt(Math.floor(Math.random() * 36))
        }
      }
      return result2
    }
    let val
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1)
      crypto.getRandomValues(arr)
      val = arr[0] / (4294967295 + 1)
    } else {
      val = Math.random()
    }
    const range = mx - mn
    const result = val * range + mn
    if (f === 'integer') {
      return Math.floor(result)
    }
    return result
  },
  { docs: 'Generate Random', cost: 1 }
)
var uuid = defineAtom(
  'uuid',
  undefined,
  X.string,
  async () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 15) | 64
      bytes[8] = (bytes[8] & 63) | 128
      const hex = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, '0')
      ).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
        12,
        16
      )}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 3) | 8
      return v.toString(16)
    })
  },
  { docs: 'Generate UUID', cost: 1 }
)
var hash = defineAtom(
  'hash',
  X.object({
    value: X.any,
    algorithm: X.string.optional,
  }),
  X.string,
  async ({ value, algorithm }, ctx) => {
    const str =
      typeof value === 'string'
        ? value
        : JSON.stringify(resolveValue(value, ctx))
    const algo = resolveValue(algorithm, ctx) || 'SHA-256'
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder()
      const data2 = encoder.encode(str)
      const hashBuffer = await crypto.subtle.digest(algo, data2)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    }
    let hash2 = 0
    for (let i2 = 0; i2 < str.length; i2++) {
      const char = str.charCodeAt(i2)
      hash2 = (hash2 << 5) - hash2 + char
      hash2 |= 0
    }
    return String(hash2)
  },
  { docs: 'Hash a value', cost: 1 }
)
var consoleLog = defineAtom(
  'consoleLog',
  X.object({ message: X.any }),
  undefined,
  async ({ message }, ctx) => {
    const msg = resolveValue(message, ctx)
    if (ctx.trace) {
      ctx.trace.push({
        op: 'console.log',
        input: { message: msg },
        stateDiff: {},
        result: msg,
        fuelBefore: ctx.fuel.current,
        fuelAfter: ctx.fuel.current,
        timestamp: new Date().toISOString(),
      })
    }
  },
  { docs: 'Log to trace', cost: 0.1 }
)
var consoleWarn = defineAtom(
  'consoleWarn',
  X.object({ message: X.any }),
  undefined,
  async ({ message }, ctx) => {
    const msg = resolveValue(message, ctx)
    const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg)
    if (!ctx.warnings) ctx.warnings = []
    ctx.warnings.push(msgStr)
    if (ctx.trace) {
      ctx.trace.push({
        op: 'console.warn',
        input: { message: msg },
        stateDiff: {},
        result: msg,
        fuelBefore: ctx.fuel.current,
        fuelAfter: ctx.fuel.current,
        timestamp: new Date().toISOString(),
      })
    }
  },
  { docs: 'Add warning', cost: 0.1 }
)
var consoleError = defineAtom(
  'consoleError',
  X.object({ message: X.any }),
  undefined,
  async ({ message }, ctx) => {
    const msg = resolveValue(message, ctx)
    const msgStr = typeof msg === 'string' ? msg : JSON.stringify(msg)
    ctx.error = new AgentError(msgStr, 'console.error')
  },
  { docs: 'Emit error and stop', cost: 0.1 }
)
var storeProcedure = defineAtom(
  'storeProcedure',
  X.object({
    ast: X.any,
    ttl: X.number.optional,
    maxSize: X.number.optional,
  }),
  X.string,
  async ({ ast, ttl, maxSize }, ctx) => {
    const resolvedAst = resolveValue(ast, ctx)
    const resolvedTtl = ttl ? resolveValue(ttl, ctx) : DEFAULT_PROCEDURE_TTL
    const resolvedMaxSize = maxSize
      ? resolveValue(maxSize, ctx)
      : DEFAULT_MAX_AST_SIZE
    if (!resolvedAst || typeof resolvedAst !== 'object' || !resolvedAst.op) {
      throw new Error('Invalid AST: must be an object with an "op" property')
    }
    const astJson = JSON.stringify(resolvedAst)
    if (astJson.length > resolvedMaxSize) {
      throw new Error(
        `AST too large: ${astJson.length} bytes exceeds limit of ${resolvedMaxSize} bytes. ` +
          `Consider reducing AST size or using a shorter TTL.`
      )
    }
    const token = generateProcedureToken()
    const now = Date.now()
    procedureStore.set(token, {
      ast: resolvedAst,
      createdAt: now,
      expiresAt: now + resolvedTtl,
    })
    return token
  },
  { docs: 'Store an AST and return a token for later execution', cost: 1 }
)
var releaseProcedure = defineAtom(
  'releaseProcedure',
  X.object({ token: X.string }),
  X.boolean,
  async ({ token }, ctx) => {
    const resolvedToken = resolveValue(token, ctx)
    return procedureStore.delete(resolvedToken)
  },
  { docs: 'Release a stored procedure by token', cost: 0.1 }
)
var clearExpiredProcedures = defineAtom(
  'clearExpiredProcedures',
  undefined,
  X.number,
  async () => {
    const now = Date.now()
    let cleared = 0
    for (const [token, entry] of procedureStore) {
      if (now > entry.expiresAt) {
        procedureStore.delete(token)
        cleared++
      }
    }
    return cleared
  },
  { docs: 'Clear all expired procedures and return count', cost: 0.5 }
)
var coreAtoms = {
  seq,
  if: iff,
  while: whileLoop,
  return: ret,
  try: tryCatch,
  Error: errorAtom,
  varSet,
  constSet,
  varGet,
  varsImport,
  varsLet,
  varsExport,
  scope,
  map,
  filter,
  reduce,
  find,
  push,
  len,
  split,
  join,
  template,
  regexMatch,
  pick,
  omit,
  merge,
  keys,
  httpFetch: fetch2,
  storeGet,
  storeSet,
  storeQuery,
  storeVectorSearch: vectorSearch,
  llmPredict,
  agentRun,
  transpileCode,
  runCode,
  jsonParse,
  jsonStringify,
  xmlParse,
  memoize,
  cache,
  random,
  uuid,
  hash,
  consoleLog,
  consoleWarn,
  consoleError,
  storeProcedure,
  releaseProcedure,
  clearExpiredProcedures,
}

// ../src/builder.ts
var RESERVED_WORDS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'and',
  'or',
  'not',
])
function warnMissingVars(condition, vars) {
  const withoutStrings = condition
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
  const identifiers = []
  const regex = /(?<![.])\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g
  let match
  while ((match = regex.exec(withoutStrings)) !== null) {
    identifiers.push(match[1])
  }
  const uniqueIds = [...new Set(identifiers)]
  const missing = uniqueIds.filter(
    (id) =>
      !RESERVED_WORDS.has(id) &&
      !(id in vars) &&
      !new RegExp(`\\b${id}\\s*\\(`).test(withoutStrings)
  )
  if (missing.length > 0) {
    console.warn(
      `[Agent99 Builder] Condition "${condition}" references variables not in vars mapping: ${missing.join(
        ', '
      )}. ` +
        `Add them to vars or use AsyncJS syntax (ajs\`...\`) which handles this automatically.`
    )
  }
}
function parseCondition(condition, vars) {
  warnMissingVars(condition, vars)
  const tokens = tokenize(condition)
  const result = parseExpression(tokens, 0, vars)
  if (result.pos < tokens.length) {
    const remaining = tokens.slice(result.pos).join(' ')
    throw new Error(
      `Unsupported condition syntax near '${remaining}' in: ${condition}
` +
        `Supported: comparisons, &&, ||, !, arithmetic, member access (a.b), literals`
    )
  }
  return result.node
}
function tokenize(expr) {
  const tokens = []
  let i2 = 0
  while (i2 < expr.length) {
    while (i2 < expr.length && /\s/.test(expr[i2])) i2++
    if (i2 >= expr.length) break
    if (expr[i2] === '"' || expr[i2] === "'") {
      const quote = expr[i2++]
      let str = ''
      while (i2 < expr.length && expr[i2] !== quote) {
        if (expr[i2] === '\\' && i2 + 1 < expr.length) {
          i2++
          str += expr[i2++]
        } else {
          str += expr[i2++]
        }
      }
      i2++
      tokens.push(JSON.stringify(str))
      continue
    }
    if (expr.slice(i2, i2 + 2).match(/^(&&|\|\||==|!=|>=|<=)$/)) {
      tokens.push(expr.slice(i2, i2 + 2))
      i2 += 2
      continue
    }
    if ('+-*/%><!().?:[]'.includes(expr[i2])) {
      tokens.push(expr[i2])
      i2++
      continue
    }
    if (/\d/.test(expr[i2])) {
      let num = ''
      while (i2 < expr.length && /[\d.]/.test(expr[i2])) {
        num += expr[i2++]
      }
      tokens.push(num)
      continue
    }
    if (/[a-zA-Z_]/.test(expr[i2])) {
      let id = ''
      while (i2 < expr.length && /[a-zA-Z0-9_]/.test(expr[i2])) {
        id += expr[i2++]
      }
      tokens.push(id)
      continue
    }
    i2++
  }
  return tokens
}
function parseExpression(tokens, pos, vars) {
  return parseLogicalOr(tokens, pos, vars)
}
function parseLogicalOr(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseLogicalAnd(tokens, pos, vars)
  while (tokens[newPos] === '||') {
    newPos++
    const { node: right, pos: rightPos } = parseLogicalAnd(tokens, newPos, vars)
    left = { $expr: 'logical', op: '||', left, right }
    newPos = rightPos
  }
  return { node: left, pos: newPos }
}
function parseLogicalAnd(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseComparison(tokens, pos, vars)
  while (tokens[newPos] === '&&') {
    newPos++
    const { node: right, pos: rightPos } = parseComparison(tokens, newPos, vars)
    left = { $expr: 'logical', op: '&&', left, right }
    newPos = rightPos
  }
  return { node: left, pos: newPos }
}
function parseComparison(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseAdditive(tokens, pos, vars)
  const compOps = ['==', '!=', '>', '<', '>=', '<=']
  while (compOps.includes(tokens[newPos])) {
    const op = tokens[newPos++]
    const { node: right, pos: rightPos } = parseAdditive(tokens, newPos, vars)
    left = { $expr: 'binary', op, left, right }
    newPos = rightPos
  }
  return { node: left, pos: newPos }
}
function parseAdditive(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseMultiplicative(tokens, pos, vars)
  while (tokens[newPos] === '+' || tokens[newPos] === '-') {
    const op = tokens[newPos++]
    const { node: right, pos: rightPos } = parseMultiplicative(
      tokens,
      newPos,
      vars
    )
    left = { $expr: 'binary', op, left, right }
    newPos = rightPos
  }
  return { node: left, pos: newPos }
}
function parseMultiplicative(tokens, pos, vars) {
  let { node: left, pos: newPos } = parseUnary(tokens, pos, vars)
  while (
    tokens[newPos] === '*' ||
    tokens[newPos] === '/' ||
    tokens[newPos] === '%'
  ) {
    const op = tokens[newPos++]
    const { node: right, pos: rightPos } = parseUnary(tokens, newPos, vars)
    left = { $expr: 'binary', op, left, right }
    newPos = rightPos
  }
  return { node: left, pos: newPos }
}
function parseUnary(tokens, pos, vars) {
  if (tokens[pos] === '!' || tokens[pos] === '-') {
    const op = tokens[pos++]
    const { node: argument, pos: newPos } = parseUnary(tokens, pos, vars)
    return { node: { $expr: 'unary', op, argument }, pos: newPos }
  }
  return parsePrimary(tokens, pos, vars)
}
function parsePrimary(tokens, pos, vars) {
  const token = tokens[pos]
  if (token === '(') {
    const { node, pos: newPos } = parseExpression(tokens, pos + 1, vars)
    return { node, pos: newPos + 1 }
  }
  if (token && token.startsWith('"')) {
    return {
      node: { $expr: 'literal', value: JSON.parse(token) },
      pos: pos + 1,
    }
  }
  if (token && /^\d/.test(token)) {
    return {
      node: { $expr: 'literal', value: parseFloat(token) },
      pos: pos + 1,
    }
  }
  if (token === 'true')
    return { node: { $expr: 'literal', value: true }, pos: pos + 1 }
  if (token === 'false')
    return { node: { $expr: 'literal', value: false }, pos: pos + 1 }
  if (token === 'null')
    return { node: { $expr: 'literal', value: null }, pos: pos + 1 }
  if (token && /^[a-zA-Z_]/.test(token)) {
    let node = { $expr: 'ident', name: token }
    let newPos = pos + 1
    while (tokens[newPos] === '.') {
      newPos++
      const prop = tokens[newPos++]
      node = { $expr: 'member', object: node, property: prop }
    }
    return { node, pos: newPos }
  }
  return { node: { $expr: 'literal', value: null }, pos: pos + 1 }
}

class TypedBuilder {
  steps = []
  atoms
  proxy
  constructor(atoms) {
    this.atoms = atoms
    this.proxy = new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target) return target[prop]
        if (typeof prop === 'string' && prop in target.atoms) {
          return (input) => {
            const atom = target.atoms[prop]
            target.add(atom.create(input))
            return receiver
          }
        }
        return
      },
    })
    return this.proxy
  }
  add(step) {
    this.steps.push(step)
    return this.proxy
  }
  as(variableName) {
    if (this.steps.length === 0) throw new Error('No step to capture')
    const last = this.steps[this.steps.length - 1]
    last.result = variableName
    return this.proxy
  }
  step(node) {
    return this.add(node)
  }
  return(schema) {
    const atom = this.atoms['return']
    if (!atom) throw new Error("Atom 'return' not found")
    const _schema = schema.schema ?? schema
    return this.add(atom.create({ schema: _schema }))
  }
  toJSON() {
    return {
      op: 'seq',
      steps: [...this.steps],
    }
  }
  varsImport(keys2) {
    return this.add(this.atoms['varsImport'].create({ keys: keys2 }))
  }
  varsExport(keys2) {
    return this.add(this.atoms['varsExport'].create({ keys: keys2 }))
  }
  if(condition, vars, thenBranch, elseBranch) {
    const thenB = new TypedBuilder(this.atoms)
    thenBranch(thenB)
    let elseSteps
    if (elseBranch) {
      const elseB = new TypedBuilder(this.atoms)
      elseBranch(elseB)
      elseSteps = elseB.steps
    }
    const conditionExpr = parseCondition(condition, vars)
    const ifAtom = this.atoms['if']
    return this.add(
      ifAtom.create({
        condition: conditionExpr,
        then: thenB.steps,
        else: elseSteps,
      })
    )
  }
  while(condition, vars, body) {
    const bodyB = new TypedBuilder(this.atoms)
    body(bodyB)
    const conditionExpr = parseCondition(condition, vars)
    const whileAtom = this.atoms['while']
    return this.add(
      whileAtom.create({
        condition: conditionExpr,
        body: bodyB.steps,
      })
    )
  }
  scope(steps) {
    const scopeB = new TypedBuilder(this.atoms)
    steps(scopeB)
    const scopeAtom = this.atoms['scope']
    return this.add(
      scopeAtom.create({
        steps: scopeB.steps,
      })
    )
  }
  map(items, as, steps) {
    const stepsB = new TypedBuilder(this.atoms)
    steps(stepsB)
    const mapAtom = this.atoms['map']
    return this.add(
      mapAtom.create({
        items,
        as,
        steps: stepsB.steps,
      })
    )
  }
  filter(items, as, condition, vars = {}) {
    const conditionExpr = parseCondition(condition, vars)
    const filterAtom = this.atoms['filter']
    return this.add(
      filterAtom.create({
        items,
        as,
        condition: conditionExpr,
      })
    )
  }
  find(items, as, condition, vars = {}) {
    const conditionExpr = parseCondition(condition, vars)
    const findAtom = this.atoms['find']
    return this.add(
      findAtom.create({
        items,
        as,
        condition: conditionExpr,
      })
    )
  }
  reduce(items, as, accumulator, initial, steps) {
    const stepsB = new TypedBuilder(this.atoms)
    steps(stepsB)
    const reduceAtom = this.atoms['reduce']
    return this.add(
      reduceAtom.create({
        items,
        as,
        accumulator,
        initial,
        steps: stepsB.steps,
      })
    )
  }
  memoize(steps, key) {
    const stepsB = new TypedBuilder(this.atoms)
    steps(stepsB)
    const memoAtom = this.atoms['memoize']
    return this.add(
      memoAtom.create({
        key,
        steps: stepsB.steps,
      })
    )
  }
  cache(steps, key, ttlMs) {
    const stepsB = new TypedBuilder(this.atoms)
    steps(stepsB)
    const cacheAtom = this.atoms['cache']
    return this.add(
      cacheAtom.create({
        key,
        steps: stepsB.steps,
        ttlMs,
      })
    )
  }
  try(branches) {
    const tryB = new TypedBuilder(this.atoms)
    branches.try(tryB)
    let catchSteps
    if (branches.catch) {
      const catchB = new TypedBuilder(this.atoms)
      branches.catch(catchB)
      catchSteps = catchB.steps
    }
    const tryAtom = this.atoms['try']
    return this.add(
      tryAtom.create({
        try: tryB.steps,
        catch: catchSteps,
      })
    )
  }
}
// ../src/lang/core.ts
function transpile(source, options = {}) {
  const {
    ast: program,
    returnType,
    originalSource,
    requiredParams,
  } = parse4(source, {
    filename: options.filename,
    colonShorthand: true,
    vmTarget: true,
  })
  const func = validateSingleFunction(program, options.filename)
  const { ast, signature, warnings } = transformFunction(
    func,
    originalSource,
    returnType,
    options,
    requiredParams
  )
  return {
    ast,
    signature,
    warnings,
  }
}

// ../src/vm/vm.ts
var FUEL_TO_MS = 10

class AgentVM {
  atoms
  constructor(customAtoms = {}) {
    this.atoms = { ...coreAtoms, ...customAtoms }
  }
  get builder() {
    return new TypedBuilder(this.atoms)
  }
  get Agent() {
    return new TypedBuilder(this.atoms)
  }
  get A99() {
    return this.Agent
  }
  resolve(op) {
    return this.atoms[op]
  }
  getTools(filter2 = 'all') {
    let targetAtoms = Object.values(this.atoms)
    if (Array.isArray(filter2)) {
      targetAtoms = targetAtoms.filter((a) => filter2.includes(a.op))
    } else if (filter2 === 'flow') {
      const flowOps = [
        'seq',
        'if',
        'while',
        'return',
        'try',
        'varSet',
        'varGet',
        'scope',
      ]
      targetAtoms = targetAtoms.filter((a) => flowOps.includes(a.op))
    }
    return targetAtoms.map((atom) => ({
      type: 'function',
      function: {
        name: atom.op,
        description: atom.docs,
        parameters: atom.inputSchema?.schema ?? {},
      },
    }))
  }
  async run(astOrToken, args = {}, options = {}) {
    let ast
    if (typeof astOrToken === 'string') {
      if (isProcedureToken(astOrToken)) {
        ast = resolveProcedureToken(astOrToken)
      } else {
        try {
          ast = transpile(astOrToken).ast
        } catch (e) {
          throw new Error(`AJS transpilation failed: ${e.message}`)
        }
      }
    } else {
      ast = astOrToken
    }
    const startFuel = options.fuel ?? 1000
    const timeoutMs = options.timeoutMs ?? startFuel * FUEL_TO_MS
    const capabilities = options.capabilities ?? {}
    const warnings = []
    if (!capabilities.store) {
      const memoryStore = new Map()
      let warned = false
      capabilities.store = {
        get: async (key) => {
          if (!warned) {
            warned = true
            warnings.push(
              'Using default in-memory store (not suitable for production)'
            )
          }
          return memoryStore.get(key)
        },
        set: async (key, value) => {
          if (!warned) {
            warned = true
            warnings.push(
              'Using default in-memory store (not suitable for production)'
            )
          }
          memoryStore.set(key, value)
        },
      }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort())
    }
    const ctx = {
      fuel: { current: startFuel },
      args,
      state: {},
      consts: new Set(),
      capabilities,
      resolver: (op) => this.resolve(op),
      output: undefined,
      signal: controller.signal,
      costOverrides: options.costOverrides,
      context: options.context,
      warnings,
    }
    if (options.trace) {
      ctx.trace = []
    }
    if (ast.op !== 'seq')
      throw new Error(
        "Root AST must be 'seq'. Ensure you're passing a transpiled agent (use ajs`...` or transpile())."
      )
    const inputSchema = ast.inputSchema
    if (inputSchema && !K(args, inputSchema)) {
      const error = new AgentError(
        `Input validation failed: args do not match expected schema`,
        'vm.run'
      )
      return {
        result: error,
        error,
        fuelUsed: 0,
        trace: ctx.trace,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    }
    try {
      await Promise.race([
        this.resolve('seq')?.exec(ast, ctx),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(
              new Error(
                `Execution timeout after ${timeoutMs}ms (fuel: ${startFuel}). Consider increasing fuel or optimizing your agent.`
              )
            )
          })
          if (controller.signal.aborted) {
            reject(
              new Error(
                `Execution timeout after ${timeoutMs}ms (fuel: ${startFuel}). Consider increasing fuel or optimizing your agent.`
              )
            )
          }
        }),
      ])
    } catch (e) {
      if (
        e.message?.includes('timeout') ||
        e.message?.includes('aborted') ||
        controller.signal.aborted
      ) {
        ctx.error = new AgentError(
          `Execution timeout after ${timeoutMs}ms (fuel: ${startFuel}). Consider increasing fuel or optimizing your agent.`,
          'vm.run'
        )
      } else {
        throw e
      }
    } finally {
      clearTimeout(timeout)
    }
    if (ctx.error && ctx.output === undefined) {
      ctx.output = ctx.error
    }
    const allWarnings = [...warnings, ...(ctx.warnings ?? [])]
    return {
      result: ctx.output,
      error: ctx.error,
      fuelUsed: startFuel - ctx.fuel.current,
      trace: ctx.trace,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    }
  }
}

// ../src/lang/eval.ts
var _vm = null
var getVM = () => (_vm ??= new AgentVM())
async function Eval(options) {
  const {
    code,
    context = {},
    fuel = 1000,
    timeoutMs,
    capabilities = {},
  } = options
  const vm = getVM()
  const hasReturn = /\breturn\b/.test(code)
  const wrappedCode = hasReturn
    ? `function __eval() { ${code} }`
    : `function __eval() { return (${code}) }`
  try {
    const { ast } = transpile(wrappedCode)
    const vmResult = await vm.run(ast, context, {
      fuel,
      timeoutMs,
      capabilities,
    })
    return {
      result: vmResult.result,
      fuelUsed: vmResult.fuelUsed,
      error: vmResult.error
        ? { message: vmResult.error.message || String(vmResult.error) }
        : undefined,
    }
  } catch (err) {
    return {
      result: undefined,
      fuelUsed: fuel,
      error: { message: err.message || String(err) },
    }
  }
}
// src/index.js
import { onRequest } from 'firebase-functions/v2/https'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import {
  getFirestore as getFirestore5,
  FieldValue,
} from 'firebase-admin/firestore'

// src/crypto.js
import * as crypto2 from 'crypto'
function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64')
}
base64ToBuffer.__tjs = {
  params: {
    base64: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'crypto.tjs:10',
}
async function decrypt(encryptedBase64, keyBase64) {
  const keyBuffer = base64ToBuffer(keyBase64)
  const combined = base64ToBuffer(encryptedBase64)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const authTag = ciphertext.slice(-16)
  const encryptedData = ciphertext.slice(0, -16)
  const decipher = crypto2.createDecipheriv('aes-256-gcm', keyBuffer, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encryptedData)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}
decrypt.__tjs = {
  params: {
    encryptedBase64: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    keyBase64: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'crypto.tjs:14',
}

// src/llm.js
function createLlmCapability(apiKeys) {
  return {
    async predict(prompt, options = {}) {
      const apiKey =
        apiKeys.openai ||
        apiKeys.anthropic ||
        apiKeys.gemini ||
        apiKeys.deepseek
      if (!apiKey) {
        return { error: 'No LLM API key configured' }
      }
      let endpoint, headers, body
      if (apiKeys.openai) {
        endpoint = 'https://api.openai.com/v1/chat/completions'
        headers = {
          Authorization: `Bearer ${apiKeys.openai}`,
          'Content-Type': 'application/json',
        }
        body = {
          model: options.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens || 1000,
        }
      } else if (apiKeys.anthropic) {
        endpoint = 'https://api.anthropic.com/v1/messages'
        headers = {
          'x-api-key': apiKeys.anthropic,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        }
        body = {
          model: options.model || 'claude-3-haiku-20240307',
          max_tokens: options.maxTokens || 1000,
          messages: [{ role: 'user', content: prompt }],
        }
      } else if (apiKeys.gemini) {
        const model = options.model || 'gemini-2.0-flash'
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys.gemini}`
        headers = { 'Content-Type': 'application/json' }
        body = {
          contents: [{ parts: [{ text: prompt }] }],
        }
      } else if (apiKeys.deepseek) {
        endpoint = 'https://api.deepseek.com/v1/chat/completions'
        headers = {
          Authorization: `Bearer ${apiKeys.deepseek}`,
          'Content-Type': 'application/json',
        }
        body = {
          model: options.model || 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens || 1000,
        }
      }
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
        const data2 = await response.json()
        let text
        if (apiKeys.gemini) {
          text = data2.candidates?.[0]?.content?.parts?.[0]?.text
        } else if (apiKeys.anthropic) {
          text = data2.content?.[0]?.text
        } else {
          text = data2.choices?.[0]?.message?.content
        }
        if (typeof text !== 'string') {
          throw new Error(
            'LLM returned unexpected format: ' + JSON.stringify(data2)
          )
        }
        return text
      } catch (error) {
        throw new Error('LLM error: ' + error.message)
      }
    },
  }
}
createLlmCapability.__tjs = {
  params: {
    apiKeys: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'llm.tjs:8',
}

// src/store.js
import { getFirestore as getFirestore3 } from 'firebase-admin/firestore'

// src/rbac.js
import { getFirestore } from 'firebase-admin/firestore'

// src/schema.js
function validateSchema(schema, data2) {
  if (!schema || !data2) return { valid: true }
  const errors = []
  if (schema.type) {
    const actualType = Array.isArray(data2) ? 'array' : typeof data2
    if (schema.type !== actualType) {
      errors.push(`Expected type ${schema.type}, got ${actualType}`)
    }
  }
  if (schema.type === 'object' && typeof data2 === 'object' && data2 !== null) {
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data2)) {
          errors.push(`Missing required field: ${field}`)
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data2) {
          const propResult = validateSchema(propSchema, data2[key])
          if (!propResult.valid) {
            errors.push(...propResult.errors.map((e) => `${key}: ${e}`))
          }
        }
      }
    }
  }
  if (schema.type === 'string' && typeof data2 === 'string') {
    if (schema.minLength && data2.length < schema.minLength) {
      errors.push(`String too short (min ${schema.minLength})`)
    }
    if (schema.maxLength && data2.length > schema.maxLength) {
      errors.push(`String too long (max ${schema.maxLength})`)
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data2)) {
      errors.push(`String does not match pattern`)
    }
  }
  if (schema.type === 'number' && typeof data2 === 'number') {
    if (schema.minimum !== undefined && data2 < schema.minimum) {
      errors.push(`Number below minimum (${schema.minimum})`)
    }
    if (schema.maximum !== undefined && data2 > schema.maximum) {
      errors.push(`Number above maximum (${schema.maximum})`)
    }
  }
  if (schema.type === 'array' && Array.isArray(data2)) {
    if (schema.minItems && data2.length < schema.minItems) {
      errors.push(`Array too short (min ${schema.minItems} items)`)
    }
    if (schema.maxItems && data2.length > schema.maxItems) {
      errors.push(`Array too long (max ${schema.maxItems} items)`)
    }
    if (schema.items) {
      data2.forEach((item, i2) => {
        const itemResult = validateSchema(schema.items, item)
        if (!itemResult.valid) {
          errors.push(...itemResult.errors.map((e) => `[${i2}]: ${e}`))
        }
      })
    }
  }
  if (schema.enum && !schema.enum.includes(data2)) {
    errors.push(`Value must be one of: ${schema.enum.join(', ')}`)
  }
  return { valid: errors.length === 0, errors }
}
validateSchema.__tjs = {
  params: {
    schema: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    data: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'schema.tjs:8',
}

// src/rbac.js
var __tjs = globalThis.__tjs?.createRuntime?.() ?? globalThis.__tjs
var _db = null
function db() {
  if (!_db) _db = getFirestore()
  return _db
}
db.__tjs = {
  params: {},
  unsafe: true,
  source: 'rbac.tjs:26',
}
var securityRulesCache = {
  data: new Map(),
  timestamp: 0,
  ttl: 60000,
}
async function getSecurityRule(collection) {
  const now = Date.now()
  if (now - securityRulesCache.timestamp >= securityRulesCache.ttl) {
    securityRulesCache.data.clear()
    securityRulesCache.timestamp = now
  }
  if (securityRulesCache.data.has(collection)) {
    return securityRulesCache.data.get(collection)
  }
  const doc = await db().collection('securityRules').doc(collection).get()
  const rule = doc.exists ? doc.data() : null
  securityRulesCache.data.set(collection, rule)
  return rule
}
getSecurityRule.__tjs = {
  params: {
    collection: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'rbac.tjs:38',
}
function evaluateAccessShortcut(accessRule, context) {
  if (typeof accessRule !== 'string') return null
  const { _uid, _roles, doc, newData } = context
  switch (accessRule) {
    case 'none':
      return { allowed: false, reason: 'Access denied' }
    case 'all':
      return { allowed: true }
    case 'authenticated':
      return _uid
        ? { allowed: true }
        : { allowed: false, reason: 'Authentication required' }
    case 'admin':
      return _roles?.includes('admin')
        ? { allowed: true }
        : { allowed: false, reason: 'Admin role required' }
    case 'author':
      return _roles?.includes('author')
        ? { allowed: true }
        : { allowed: false, reason: 'Author role required' }
    default:
      if (accessRule.startsWith('owner:')) {
        const field = accessRule.slice(6)
        const checkDoc = doc || newData
        if (!_uid) {
          return { allowed: false, reason: 'Authentication required' }
        }
        if (checkDoc && checkDoc[field] === _uid) {
          return { allowed: true }
        }
        if (!doc && newData && newData[field] === _uid) {
          return { allowed: true }
        }
        return { allowed: false, reason: `Must be owner (${field})` }
      }
      if (accessRule.startsWith('role:')) {
        const role = accessRule.slice(5)
        return _roles?.includes(role)
          ? { allowed: true }
          : { allowed: false, reason: `Role '${role}' required` }
      }
      return null
  }
}
evaluateAccessShortcut.__tjs = {
  params: {
    accessRule: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    context: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'rbac.tjs:75',
}
async function evaluateSecurityRule(rule, context) {
  const startTime = performance.now()
  const { _method, newData } = context
  try {
    let accessRule = rule.code
    if (_method === 'read' && rule.read !== undefined) {
      accessRule = rule.read
    } else if (_method === 'write') {
      if (!context.doc && rule.create !== undefined) {
        accessRule = rule.create
      } else if (context.doc && rule.update !== undefined) {
        accessRule = rule.update
      } else if (rule.write !== undefined) {
        accessRule = rule.write
      }
    } else if (_method === 'delete' && rule.delete !== undefined) {
      accessRule = rule.delete
    }
    if (typeof accessRule === 'string') {
      const shortcutResult = evaluateAccessShortcut(accessRule, context)
      if (shortcutResult) {
        const evalTimeMs2 = performance.now() - startTime
        return {
          ...shortcutResult,
          evalTimeMs: evalTimeMs2,
          fuelUsed: 0,
          type: 'shortcut',
        }
      }
    }
    if (_method === 'write' && rule.schema && newData) {
      const schemaResult = validateSchema(rule.schema, newData)
      if (!schemaResult.valid) {
        const evalTimeMs2 = performance.now() - startTime
        return {
          allowed: false,
          reason: 'Schema validation failed: ' + schemaResult.errors.join('; '),
          evalTimeMs: evalTimeMs2,
          fuelUsed: 0,
          type: 'schema',
        }
      }
    }
    const codeToRun =
      typeof accessRule === 'object' && accessRule?.code
        ? accessRule.code
        : rule.code
    if (codeToRun) {
      const fuel =
        (typeof accessRule === 'object' && accessRule?.fuel) || rule.fuel || 100
      const timeoutMs =
        (typeof accessRule === 'object' && accessRule?.timeoutMs) ||
        rule.timeoutMs ||
        1000
      const result = await Eval({
        code: codeToRun,
        context,
        fuel,
        timeoutMs,
        capabilities: {},
      })
      const evalTimeMs2 = performance.now() - startTime
      let allowed = false
      let reason = null
      if (typeof result.result === 'boolean') {
        allowed = result.result
      } else if (typeof result.result === 'object' && result.result !== null) {
        allowed = !!result.result.allow
        reason = result.result.reason
      }
      return {
        allowed,
        reason,
        evalTimeMs: evalTimeMs2,
        fuelUsed: result.fuelUsed,
        type: 'code',
      }
    }
    if (rule.schema && !rule.code) {
      const evalTimeMs2 = performance.now() - startTime
      return {
        allowed: true,
        evalTimeMs: evalTimeMs2,
        fuelUsed: 0,
        type: 'schema-only',
      }
    }
    const evalTimeMs = performance.now() - startTime
    return {
      allowed: false,
      reason: 'No access rule defined',
      evalTimeMs,
      fuelUsed: 0,
      type: 'default',
    }
  } catch (err) {
    const evalTimeMs = performance.now() - startTime
    console.error('Security rule evaluation error:', err.message)
    return {
      allowed: false,
      reason: 'Rule evaluation failed: ' + err.message,
      evalTimeMs,
      error: true,
      type: 'error',
    }
  }
}
evaluateSecurityRule.__tjs = {
  params: {
    rule: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    context: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'rbac.tjs:142',
}
async function loadUserRoles(uid) {
  if (!uid) return []
  try {
    const userDoc = await db().collection('users').doc(uid).get()
    if (!userDoc.exists) return []
    const userData = userDoc.data()
    return userData?.roles || []
  } catch (err) {
    console.error('Failed to load user roles:', err.message)
    return []
  }
}
loadUserRoles.__tjs = {
  params: {
    uid: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'rbac.tjs:244',
}

// src/indexes.js
import { getFirestore as getFirestore2 } from 'firebase-admin/firestore'
var _db2 = null
function db2() {
  if (!_db2) _db2 = getFirestore2()
  return _db2
}
db2.__tjs = {
  params: {},
  unsafe: true,
  source: 'indexes.tjs:35',
}
function matchesFilter(doc, filter2) {
  if (!filter2) return true
  for (const [key, value] of Object.entries(filter2)) {
    if (doc[key] !== value) return false
  }
  return true
}
matchesFilter.__tjs = {
  params: {
    doc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    filter: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:41',
}
function extractFields(doc, fields, docId) {
  const entry = { _id: docId, _updated: Date.now() }
  if (!fields || fields.length === 0) {
    return { ...doc, ...entry }
  }
  for (const field of fields) {
    if (field in doc) {
      entry[field] = doc[field]
    }
  }
  return entry
}
extractFields.__tjs = {
  params: {
    doc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    fields: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    docId: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:50',
}
function getIndexPath(collection, indexName, partitionKey = null) {
  const base = `${collection}_indexes`
  if (partitionKey) {
    return `${base}/${indexName}_${partitionKey}`
  }
  return `${base}/${indexName}`
}
getIndexPath.__tjs = {
  params: {
    collection: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    indexName: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    partitionKey: {
      type: {
        kind: 'null',
      },
      required: false,
      default: null,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:64',
}
async function updateIndexes(collection, docId, oldDoc, newDoc, indexes) {
  const startTime = performance.now()
  let updated = 0
  for (const index of indexes) {
    const {
      name,
      filter: filter2,
      fields,
      partitionBy,
      partitionByArray,
    } = index
    const oldMatches = oldDoc ? matchesFilter(oldDoc, filter2) : false
    const newMatches = matchesFilter(newDoc, filter2)
    if (partitionByArray) {
      const oldPartitions =
        oldDoc && oldMatches ? oldDoc[partitionByArray] || [] : []
      const newPartitions = newMatches ? newDoc[partitionByArray] || [] : []
      for (const partition of oldPartitions) {
        if (!newPartitions.includes(partition)) {
          const indexPath = getIndexPath(collection, name, partition)
          await db2().collection(indexPath).doc(docId).delete()
          updated++
        }
      }
      for (const partition of newPartitions) {
        const indexPath = getIndexPath(collection, name, partition)
        const entry = extractFields(newDoc, fields, docId)
        await db2().collection(indexPath).doc(docId).set(entry)
        updated++
      }
    } else if (partitionBy) {
      const oldPartition = oldDoc && oldMatches ? oldDoc[partitionBy] : null
      const newPartition = newMatches ? newDoc[partitionBy] : null
      if (oldPartition && oldPartition !== newPartition) {
        const indexPath = getIndexPath(collection, name, oldPartition)
        await db2().collection(indexPath).doc(docId).delete()
        updated++
      }
      if (newPartition) {
        const indexPath = getIndexPath(collection, name, newPartition)
        const entry = extractFields(newDoc, fields, docId)
        await db2().collection(indexPath).doc(docId).set(entry)
        updated++
      }
    } else {
      const indexPath = getIndexPath(collection, name)
      if (oldMatches && !newMatches) {
        await db2().collection(indexPath).doc(docId).delete()
        updated++
      } else if (newMatches) {
        const entry = extractFields(newDoc, fields, docId)
        await db2().collection(indexPath).doc(docId).set(entry)
        updated++
      }
    }
  }
  const elapsed = performance.now() - startTime
  if (updated > 0) {
    console.log(
      `INDEX [${collection}] Updated ${updated} index entries in ${elapsed.toFixed(
        2
      )}ms`
    )
  }
}
updateIndexes.__tjs = {
  params: {
    collection: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    docId: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    oldDoc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    newDoc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    indexes: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:73',
}
async function removeFromIndexes(collection, docId, doc, indexes) {
  const startTime = performance.now()
  let removed = 0
  for (const index of indexes) {
    const { name, filter: filter2, partitionBy, partitionByArray } = index
    if (!matchesFilter(doc, filter2)) continue
    if (partitionByArray) {
      const partitions = doc[partitionByArray] || []
      for (const partition of partitions) {
        const indexPath = getIndexPath(collection, name, partition)
        await db2().collection(indexPath).doc(docId).delete()
        removed++
      }
    } else if (partitionBy) {
      const partition = doc[partitionBy]
      if (partition) {
        const indexPath = getIndexPath(collection, name, partition)
        await db2().collection(indexPath).doc(docId).delete()
        removed++
      }
    } else {
      const indexPath = getIndexPath(collection, name)
      await db2().collection(indexPath).doc(docId).delete()
      removed++
    }
  }
  const elapsed = performance.now() - startTime
  if (removed > 0) {
    console.log(
      `INDEX [${collection}] Removed ${removed} index entries in ${elapsed.toFixed(
        2
      )}ms`
    )
  }
}
removeFromIndexes.__tjs = {
  params: {
    collection: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    docId: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    doc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    indexes: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:147',
}

// src/store.js
var _db3 = null
function db3() {
  if (!_db3) _db3 = getFirestore3()
  return _db3
}
db3.__tjs = {
  params: {},
  unsafe: true,
  source: 'store.tjs:15',
}
function createStoreCapability(uid) {
  let cachedRoles = null
  async function getRoles() {
    if (cachedRoles === null) {
      cachedRoles = await loadUserRoles(uid)
    }
    return cachedRoles
  }
  return {
    async get(collection, docId) {
      const rule = await getSecurityRule(collection)
      if (!rule) {
        return { error: `No security rule for collection: ${collection}` }
      }
      const docRef = db3().collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = docSnap.exists ? docSnap.data() : null
      const roles = await getRoles()
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes('admin'),
        _isAuthor: roles.includes('author'),
        _method: 'read',
        _collection: collection,
        _docId: docId,
        doc,
      })
      console.log(
        `RBAC [${collection}:read] ${ruleResult.evalTimeMs.toFixed(
          2
        )}ms, type: ${ruleResult.type}, fuel: ${
          ruleResult.fuelUsed
        }, allowed: ${ruleResult.allowed}`
      )
      if (!ruleResult.allowed) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }
      return doc
    },
    async set(collection, docId, data2) {
      const rule = await getSecurityRule(collection)
      if (!rule) {
        return { error: `No security rule for collection: ${collection}` }
      }
      const docRef = db3().collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = docSnap.exists ? docSnap.data() : null
      const roles = await getRoles()
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes('admin'),
        _isAuthor: roles.includes('author'),
        _method: 'write',
        _collection: collection,
        _docId: docId,
        doc,
        newData: data2,
      })
      console.log(
        `RBAC [${collection}:write] ${ruleResult.evalTimeMs.toFixed(
          2
        )}ms, type: ${ruleResult.type}, fuel: ${
          ruleResult.fuelUsed
        }, allowed: ${ruleResult.allowed}`
      )
      if (!ruleResult.allowed) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }
      await docRef.set(data2, { merge: true })
      if (rule.indexes) {
        await updateIndexes(collection, docId, doc, data2, rule.indexes)
      }
      return { success: true }
    },
    async delete(collection, docId) {
      const rule = await getSecurityRule(collection)
      if (!rule) {
        return { error: `No security rule for collection: ${collection}` }
      }
      const docRef = db3().collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = docSnap.exists ? docSnap.data() : null
      if (!doc) {
        return { error: 'Document not found' }
      }
      const roles = await getRoles()
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes('admin'),
        _isAuthor: roles.includes('author'),
        _method: 'delete',
        _collection: collection,
        _docId: docId,
        doc,
      })
      console.log(
        `RBAC [${collection}:delete] ${ruleResult.evalTimeMs.toFixed(
          2
        )}ms, type: ${ruleResult.type}, fuel: ${
          ruleResult.fuelUsed
        }, allowed: ${ruleResult.allowed}`
      )
      if (!ruleResult.allowed) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }
      if (rule.indexes) {
        await removeFromIndexes(collection, docId, doc, rule.indexes)
      }
      await docRef.delete()
      return { success: true }
    },
    async query(collection, constraints = {}) {
      const rule = await getSecurityRule(collection)
      if (!rule) {
        return { error: `No security rule for collection: ${collection}` }
      }
      const roles = await getRoles()
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes('admin'),
        _isAuthor: roles.includes('author'),
        _method: 'read',
        _collection: collection,
        _docId: null,
        doc: null,
        _isQuery: true,
        _constraints: constraints,
      })
      console.log(
        `RBAC [${collection}:query] ${ruleResult.evalTimeMs.toFixed(
          2
        )}ms, type: ${ruleResult.type}, fuel: ${
          ruleResult.fuelUsed
        }, allowed: ${ruleResult.allowed}`
      )
      if (!ruleResult.allowed) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }
      let query = db3().collection(collection)
      if (constraints.where) {
        for (const [field, op, value] of constraints.where) {
          query = query.where(field, op, value)
        }
      }
      if (constraints.orderBy) {
        query = query.orderBy(
          constraints.orderBy,
          constraints.orderDirection || 'asc'
        )
      }
      if (constraints.limit) {
        query = query.limit(constraints.limit)
      }
      const snapshot = await query.get()
      const docs = []
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() })
      })
      return docs
    },
  }
}
createStoreCapability.__tjs = {
  params: {
    uid: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'store.tjs:20',
}

// src/routing.js
import { getFirestore as getFirestore4 } from 'firebase-admin/firestore'
var _db4 = null
function db4() {
  if (!_db4) _db4 = getFirestore4()
  return _db4
}
db4.__tjs = {
  params: {},
  unsafe: true,
  source: 'routing.tjs:11',
}
function matchUrlPattern(pattern, path) {
  const normalizedPattern = pattern.replace(/\/+$/, '') || '/'
  const normalizedPath = path.replace(/\/+$/, '') || '/'
  const patternParts = normalizedPattern.split('/')
  const pathParts = normalizedPath.split('/')
  if (patternParts.length !== pathParts.length) {
    return null
  }
  const params = {}
  for (let i2 = 0; i2 < patternParts.length; i2++) {
    const patternPart = patternParts[i2]
    const pathPart = pathParts[i2]
    if (patternPart.startsWith(':')) {
      const paramName = patternPart.slice(1)
      params[paramName] = decodeURIComponent(pathPart)
    } else if (patternPart !== pathPart) {
      return null
    }
  }
  return params
}
matchUrlPattern.__tjs = {
  params: {
    pattern: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    path: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'routing.tjs:22',
}
var storedFunctionsCache = {
  data: null,
  timestamp: 0,
  ttl: 60000,
}
async function getStoredFunctions() {
  const now = Date.now()
  if (
    storedFunctionsCache.data &&
    now - storedFunctionsCache.timestamp < storedFunctionsCache.ttl
  ) {
    return storedFunctionsCache.data
  }
  const snapshot = await db4().collection('storedFunctions').get()
  const functions = []
  snapshot.forEach((doc) => {
    functions.push({ id: doc.id, ...doc.data() })
  })
  storedFunctionsCache.data = functions
  storedFunctionsCache.timestamp = now
  return functions
}
getStoredFunctions.__tjs = {
  params: {},
  unsafe: true,
  source: 'routing.tjs:65',
}

// src/index.js
var __tjs2 = globalThis.__tjs?.createRuntime?.() ?? globalThis.__tjs
initializeApp()
var db5 = getFirestore5()
async function getUserApiKeys(uid) {
  const userDoc = await db5.collection('users').doc(uid).get()
  if (!userDoc.exists) {
    return {}
  }
  const userData = userDoc.data()
  const { encryptionKey, apiKeys } = userData
  if (!encryptionKey || !apiKeys) {
    return {}
  }
  const decrypted = {}
  for (const [provider, encryptedKey] of Object.entries(apiKeys)) {
    if (encryptedKey) {
      try {
        decrypted[provider] = await decrypt(encryptedKey, encryptionKey)
      } catch (e) {
        console.error(`Failed to decrypt ${provider} key:`, e.message)
      }
    }
  }
  return decrypted
}
getUserApiKeys.__tjs = {
  params: {
    uid: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'index.tjs:39',
}
var health = onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '0.4.0',
  })
})
function hashPayload(payload) {
  const str = JSON.stringify(payload)
  let hash2 = 0
  for (let i2 = 0; i2 < str.length; i2++) {
    const char = str.charCodeAt(i2)
    hash2 = (hash2 << 5) - hash2 + char
    hash2 = hash2 & hash2
  }
  return hash2.toString(16)
}
hashPayload.__tjs = {
  params: {
    payload: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  description: `## Agent Run Endpoint

Universal AJS endpoint - accepts code, args, and fuel limit.
Executes the code in a sandboxed VM with user's API keys as capabilities.`,
  unsafe: true,
  source: 'index.tjs:89',
}
var agentRun2 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Must be authenticated to run agents'
    )
  }
  const uid = request.auth.uid
  const { code, args = {}, fuel = 1000 } = request.data
  if (!code || typeof code !== 'string') {
    throw new HttpsError('invalid-argument', 'code must be a non-empty string')
  }
  if (fuel > 1e4) {
    throw new HttpsError('invalid-argument', 'fuel limit cannot exceed 10000')
  }
  const startTime = Date.now()
  let result = null
  let error = null
  try {
    const apiKeys = await getUserApiKeys(uid)
    const llm = createLlmCapability(apiKeys)
    const store = createStoreCapability(uid)
    result = await Eval({
      code,
      context: args,
      fuel,
      timeoutMs: 30000,
      capabilities: { llm, store },
    })
  } catch (err) {
    console.error('Agent execution error:', err)
    error = { message: err.message || 'Execution failed' }
  }
  const fuelUsed = result?.fuelUsed || 0
  const duration = Date.now() - startTime
  const usageLog = {
    timestamp: Date.now(),
    duration,
    payloadHash: hashPayload({ code, args }),
    fuelRequested: fuel,
    fuelUsed,
    hasError: !!(error || result?.error),
    resultHash: result?.result ? hashPayload(result.result) : null,
  }
  const usageRef = db5.collection('users').doc(uid).collection('usage')
  usageRef
    .add(usageLog)
    .catch((err) => console.error('Failed to log usage:', err))
  usageRef
    .doc('total')
    .set(
      {
        totalCalls: FieldValue.increment(1),
        totalFuelUsed: FieldValue.increment(fuelUsed),
        totalDuration: FieldValue.increment(duration),
        totalErrors: FieldValue.increment(error || result?.error ? 1 : 0),
        lastUpdated: Date.now(),
      },
      { merge: true }
    )
    .catch((err) => console.error('Failed to update totals:', err))
  if (error) {
    return { result: null, fuelUsed: 0, error }
  }
  return {
    result: result.result,
    fuelUsed: result.fuelUsed || 0,
    error: result.error || null,
  }
})
var run = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.set('Access-Control-Max-Age', '3600')
    return res.status(204).send('')
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: 'Missing or invalid Authorization header' })
  }
  const idToken = authHeader.slice(7)
  let uid
  try {
    const { getAuth } = await import('firebase-admin/auth')
    const decoded = await getAuth().verifyIdToken(idToken)
    uid = decoded.uid
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
  const { code, args = {}, fuel = 1000 } = req.body
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code must be a non-empty string' })
  }
  if (fuel > 1e4) {
    return res.status(400).json({ error: 'fuel limit cannot exceed 10000' })
  }
  const startTime = Date.now()
  let result = null
  let error = null
  try {
    const apiKeys = await getUserApiKeys(uid)
    const llm = createLlmCapability(apiKeys)
    const store = createStoreCapability(uid)
    result = await Eval({
      code,
      context: args,
      fuel,
      timeoutMs: 30000,
      capabilities: { llm, store },
    })
  } catch (err) {
    console.error('Agent execution error:', err)
    error = { message: err.message || 'Execution failed' }
  }
  const fuelUsed = result?.fuelUsed || 0
  const duration = Date.now() - startTime
  const usageLog = {
    timestamp: Date.now(),
    duration,
    payloadHash: hashPayload({ code, args }),
    fuelRequested: fuel,
    fuelUsed,
    hasError: !!(error || result?.error),
    resultHash: result?.result ? hashPayload(result.result) : null,
  }
  const usageRef = db5.collection('users').doc(uid).collection('usage')
  usageRef
    .add(usageLog)
    .catch((err) => console.error('Failed to log usage:', err))
  usageRef
    .doc('total')
    .set(
      {
        totalCalls: FieldValue.increment(1),
        totalFuelUsed: FieldValue.increment(fuelUsed),
        totalDuration: FieldValue.increment(duration),
        totalErrors: FieldValue.increment(error || result?.error ? 1 : 0),
        lastUpdated: Date.now(),
      },
      { merge: true }
    )
    .catch((err) => console.error('Failed to update totals:', err))
  if (error) {
    return res.status(200).json({ result: null, fuelUsed: 0, error })
  }
  res.json({
    result: result.result,
    fuelUsed: result.fuelUsed || 0,
    error: result.error || null,
  })
})
var page = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.set('Access-Control-Max-Age', '3600')
    return res.status(204).send('')
  }
  const path = req.path || '/'
  try {
    const storedFunctions = await getStoredFunctions()
    let matchedFunction = null
    let params = null
    for (const fn of storedFunctions) {
      if (!fn.urlPattern || !fn.code) continue
      const match = matchUrlPattern(fn.urlPattern, path)
      if (match !== null) {
        matchedFunction = fn
        params = match
        break
      }
    }
    if (!matchedFunction) {
      return res.status(404).json({ error: 'Not found', path })
    }
    let uid = null
    if (!matchedFunction.public) {
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const idToken = authHeader.slice(7)
      try {
        const { getAuth } = await import('firebase-admin/auth')
        const decoded = await getAuth().verifyIdToken(idToken)
        uid = decoded.uid
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' })
      }
    }
    const args = {
      ...params,
      ...req.query,
      ...(req.body || {}),
      _path: path,
      _method: req.method,
      _uid: uid,
    }
    let result = null
    let error = null
    try {
      let llm = null
      if (uid) {
        const apiKeys = await getUserApiKeys(uid)
        llm = createLlmCapability(apiKeys)
      }
      result = await Eval({
        code: matchedFunction.code,
        context: args,
        fuel: matchedFunction.fuel || 1000,
        timeoutMs: matchedFunction.timeoutMs || 1e4,
        capabilities: llm ? { llm } : {},
      })
    } catch (err) {
      console.error('Stored function execution error:', err)
      error = { message: err.message || 'Execution failed' }
    }
    if (error || result?.error) {
      const errorMessage =
        error?.message || result?.error?.message || 'Unknown error'
      return res.status(500).json({ error: errorMessage })
    }
    const contentType = matchedFunction.contentType || 'application/json'
    res.set('Content-Type', contentType)
    if (contentType.includes('text/') || contentType.includes('html')) {
      return res.send(result.result)
    } else {
      return res.json(result.result)
    }
  } catch (err) {
    console.error('Page endpoint error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})
export { run, page, health, agentRun2 as agentRun }
