# Simplified Chinese: what a reviewer should look at

This translation was made with an LLM (Gemini via nano-gpt), checked by script for structure, tags and placeholders,
and read through, but not reviewed by a native speaker. This file lists the choices that most need a native
reader's judgment: coined terms, adapted wordplay, voices, and doubts about meaning. The terminology it builds on is
in `README.md`. Everything not listed here was translated directly.

Conventions that hold throughout:

- Character names stay in English in running text (the interface shows them in English, and the game reads speaker
  tags such as `Tamsin: ` at the start of a line). Place, society and event names are translated.
- A Latin name runs straight into the Chinese with no space ("Edda Lorne教授").
- Lines recorded in English play silent once translated; catch phrases do not play outside English.

## Places, societies, events, items, the Undercroft and the house

- Names chosen for places: 安栖居 (Haven House, his home), 锁链图书馆 (the Chained Library), 健康中心 (the Health Center),
  草药园 (the Physic Garden), 回廊T台社 (the Cloister Runway Society), 繁花信徒联谊会 (the Bloomist Fellowship).
- 冰霜市集 for the Frost Fair: 霜降 was avoided, as it is a solar term.
- 初始繁花 for the First Bloom, the relic Faye buys (`societies`) and the Seed of the First Bloom (`expedition`): kept
  apart from 原初繁花, the Primordial Bloom.
- Coined: 罚注辩论 (the Forfeit Debate), 反锁之夜 (the Lock-In), 繁育市集 (the Broodmarket), 初垄修会 (the Order of the
  First Furrow), 播种仪典 (the Sowing Rite), 结界符印 (ward-signs), 以天为衣 (skyclad), 育嗣者检定 (the Sire assay),
  奥术委员会 (the Arcane Board, as the codex has it),
  托婴所 (the creche), 养育费 (a child's keep), 回响 (Echoes).
- Relic names localized rather than glossed: 巧言银舌 (Silver Tongue), 露出癖提灯, 纷争金苹果 (Apple of Discord),
  解衣之缕 (The Unraveling), 百合护符 (Sapphic Charm).
- Item names that were hard: 罐装星火根饮 (Can of Sparkroot), 止水 (Stillwater), 定神盐 (Grounding salt), 共鸣信物,
  悦心饮剂 (Heartsease draught), 繁花甜露 (Bloom cordial), 用途可疑的古物 (Questionable artefact).
- Saffron Lake's havelis and ghats are 哈维利宅邸 and 河坛: accurate, but uncommon.
- Wordplay adapted in the societies: Tamsin's "mornings it's balls, afternoons it's beans" is 早上玩球，下午种豆; the
  love potion's label is the rhyme 一抿生暖意，两抿起春心，三抿度良宵.
- Syllabus lines' lesson labels ("Motion:", "Setting:") are translated (动议：…).
- "I want you to breed me" is 我要你让我受孕: direct; could be coarser.
- Zélie keeps "monsieur", "non ?" and "Bonjour" in French, as the source has them.

## Characters


General choices:
- No space between a Latin name and Chinese ("Edda Lorne教授", "Una在"), matching the shipped zh-CN text (housing.json) rather than the glossary's "Lorne 教授" example. Easy to flip in `li_join.py` (`tidy`) if spaces are wanted.
- Year of study is "一年级/二年级/三年级/四年级" throughout, not 大一/大三. "Final-year", "senior" became 毕业班 / 四年级学姐.
- "X, pregnant" outfit names are always the base name + "，孕期", built by script, so every pregnant variant matches its base.
- Off-duty labels shared across characters render the same way: Day off = 休假便服 (lola-hopworth, zelie), Daytime = 日间便服 (baixue, yulia).

Items to look at:
- anwen, ultimate.name: "Velvet Rope" -> 闲人免进. The velvet rope is a club's door barrier, so I went for its meaning (gatekeeping, "no entry") over the literal 天鹅绒索. Check it fits what the move does.
- tamsin, ultimate.name: "Pile On" -> 一拥而上. Keeps the roughhousing and gang-up sense; if the move is a solo tackle, 飞扑压制 would fit better.
- tamsin, outfits lingerie: "First lace" -> 初次蕾丝. The pun (her first lace, and a first time) only partly survives.
- tink, outfits underwear: "Underwear" -> 贴身衣物. 内衣 is reserved for Lingerie by the glossary, and Tink has both sets, so this one needed a different word.
- tink, ultimate.name: "Sticky Fingers" -> 妙手空空. An idiom for a light-fingered thief, so the joke survives. Still confirm it fits what the move does.
- faye, bio: "a Broodmarket intern" -> 繁育市场的实习生. Broodmarket is a coined proper name (not in the glossary). If it is a company, it may want quotes or a fixed term elsewhere.
- dinah, bio: "the Order of the First Furrow" -> 初垄修会. A coined term. It should agree with whatever the Furrow Chapel (垄沟小教堂) and the codex use for the Order.
- ottilie, bio: "Reader in Sire Genetics" -> 育嗣者遗传学准教授. The British academic rank "Reader" has no exact Chinese equivalent, so 准教授 (associate-professor level) is an approximation.
- halla, bio: "the evacuation counter honest" -> 让撤离计数器如实记录. I am unsure what the counter is (maybe days since the last evacuation), so the line is literal. Check it against the Foundry's lore.
- kessa, bio: "the window onto Aether next door" -> 那扇通往隔壁以太的窗口. Aether is the venue next door, and the line reads oddly unless the player knows that.
- zelie, outfits lingerie: "Parisian" -> 巴黎风情. Paris is a real-world reference in a world whose Vesperan cities are Port-Lumière and the like, but the source uses it, so I kept it.
- zelie, bio: Port-Lumière is kept in Latin script, as there is no glossary term for it. A Chinese name such as 卢米埃尔港 would read better if the place recurs.
- vespera, ultimate.name: "The Last Word" -> 盖棺定论. Strong and idiomatic, but it carries a "death verdict" tone. morwenna's "Already Decided" -> 早有定论 is close in sense and also ends in 定论; the two may want more difference.
- yelena, ultimate.name: "Noblesse Oblige" -> 贵族义务. The standard rendering, but it is flat as a skill name. 位高责重 is an alternative.
- yulia, ultimate.name: "No Shame" -> 厚颜无耻. Correct register for her, but harsh. 百无禁忌 is softer and more fun.
- baixue, ultimate.name: "White Crane Elixir Breath" -> 白鹤仙息. Compressed from a long English name into a xianxia-style four-character name.
- yann, bio: "flame he calls and frost he holds ... by craft, not magic" -> 他唤来烈焰、手握寒霜……靠的全然是技艺而非魔法. Faithful, but the paradox (calling flame without magic) reads as strange in Chinese just as in English. Check the intent.
- caelwen, bio: restructured as "一位精灵，女性研究学教授，今年一百三十二岁。" so that "精灵族女性研究学" cannot be misread as "elf women's studies".
- lira, outfits default: "Herself" -> 本体 (her true/base form, a common game term). The English joke (she wears nothing but herself) is softened.

## Story beats


Line numbers are file lines in `zh2/story/<id>.src.json`; the `.zh.json` has the same layout, so the same line number holds the translation.

All seven files: "nursery" is 育婴室 throughout, the room name `content/zh-CN/housing.json` uses (the model wrote 育儿室 in four files; replaced).

- **Anwen, all beats (e.g. friend, l.10)**: "pretty boy" = 小白脸, used every time. 小白脸 can also mean a kept man, which suits her teasing but is sharper than "pretty boy". The alternative is 漂亮男孩 / 帅小子.
- **Anwen, lover ifUnprotected, l.86**: "She's a temperamental bitch in second gear" = 挂二挡时她就是个喜怒无常的婊子. Literal and crude, as in the source (she means her bike).
- **Anwen, lover, l.51**: "bring her back with a full charge" = 只要回来时把能量充满就好. Literal; whether the bike runs on a charged core or on fuel isn't clear.
- **Caelwen, thriving, l.115**: "in the twenty-nineties" = 二〇九〇年代. The source looks inconsistent: her friend beat (l.12) puts the girls' childhood in "the sixties" and the garden in "the thirties". Check what the author meant before trusting the date.
- **Caelwen, dating l.34 / lover l.56 / ifIntimate l.76 / ifUnprotected**: her recurring essay question, "a will the Bloom leans on" = 被繁花倾压的意志; "free in whose hand it takes when it falls" = 在倾跌之时选择握住谁的手. 倾压 is a coined choice. It is kept the same in all four beats, so change it in all four or none.
- **Daphne, lover l.54 (and ifIntimate)**: "the unaugmented division" = 无增幅组. Grushka's dating beat now uses the same word (不靠任何增幅). Neither term is in the glossary.
- **Daphne, thriving l.101 / l.107 / l.113**: her sports metaphors, adapted. "check the board" = 对一下数据板; "four weeks in the books... the keep" = 四周战绩记入册了…养家开销; "take the handoff" = 接这一棒 (a relay image in place of the American-football handoff).
- **Dinah, all beats**: "covenant" = 盟约. The Order of the Furrow = 修会, the Sower = 播种者, the Furrow = 垄沟, House Silverith = Silverith家族. 修会 and 播种者 are not in the glossary yet, and other characters' and events' texts should use the same words.
- **Dinah, lover l.54**: "a woman's purpose is an answered womb" = 女子的天命便是拥有一个得蒙应允、受孕结果的子宫. Spelled out, because "answered" alone doesn't carry over; it may read heavy.
- **Dinah, ifIntimate l.73**: "each time I have welcomed you into me, I have hoped the Furrow would take the seed" = 在我敞开身体迎你进入的每一次里…垄沟能够受纳那颗种子. As explicit as the source, in her liturgical register.
- **Elowen, all beats**: her slang is localized to Chinese streamer speech. Chat = 弹幕/家人们, goblins = 小哥布林们, W = 血赚, skill issue = 菜就多练, lowkey = 有一说一, hard-carry = 带飞. gg stays as gg, and "take an L" stays as 领个L (l.25) and 这个L我一个人认. A native reader should check that the mix reads naturally.
- **Elowen, ifIntimate l.73**: "Didn't even raid out" = 连下播导流都没做. This is a Twitch-specific idea, and the Chinese is a paraphrase.
- **Elowen, thriving l.116**: "gg go next, I'm never leaving" = gg下一把，我这辈子都不退队了.
- **Faye, dating l.32**: "Broodmarket" (in-world firm) = 育市. This is a coined name. Crowns = 克朗. She calls him 甜心 throughout, and the dating beat's point (she stopped saying "sweetheart") depends on it.
- **Faye, lover l.54**: "a fourth-year analyst with her own license" = 持有独立执照的四年级分析师. Read as a fourth-year student; it could also mean four years in the job.
- **Faye, ifIntimate l.73**: "no claims past sunrise" = 日出之后互不索求名分, and "claims included" = 包括名分在内. 名分 (standing as a partner) is an interpretation of "claims".
- **Faye, friend l.13**: "house interviews" = 入户面试. This assumes they are interviews to join a household; please confirm.
- **Grushka, dating l.32**: "the War-Mother's third daughter does not ask twice" = 战母的三女儿从不让人开口求第二次. Read as Grushka speaking of herself (she needed no second asking). It is ambiguous in the English.
- **Grushka, dating l.31**: "the Bloom division" = 繁花组, the magic-allowed bracket, against the unaugmented one.
- **Grushka, l.36 / 56 / 73 / 91**: her refrain "Those are my terms; what are yours?" = 这是我的条件；你的呢？, the same every time. "house-name" (l.16) = 家名.
- **Grushka, thriving l.110**: "a university house" = 一所大学的宅子. khal-va and *Kharad-vor* are kept untranslated.


Line numbers count from 1 within that scene's `lines`.

- **Seraphine, all beats (royal "we").** The royal "we" that she corrects to "I" is rendered 朕 → 我 (e.g. friend line 3 "We are pleased you—" = "朕很高兴你——"; thriving invitation "We—I mean I—" = "朕——我是说我——"). Where "we/us/our" means two or more people it is 我们 (thriving "sit with us", "our child"). Check that 朕 suits this Queen's tone in the game; the other choice is 本宫, which sounds softer and less imperial.
- **Seraphine, lover invitation.** "Please come to our bedchamber" = "今晚请来曦花宫朕的寝宫". I read it as a royal "our" that she does not correct. If it was meant as "the bedchamber we share", it should be 我们的寝宫.
- **Seraphine, ifUnprotected line 4.** "if we had let them—if I had let them" = "如果朕由着他们——如果我由着他们的话". I took this as the same royal-we slip, not "we" meaning her and the player.
- **Isolde, friend lines 5 and 7; dating lines 4 and 7; lover ifIntimate line 8.** The ledger double meanings are carried in finance terms: "held down by a heavy commitment" = "被沉重的承诺死死压在身下", "demands constant liquidity… service her at all hours" = "索求充沛的流动性……不分昼夜地为她提供服务", "regular deposits in an unprotected account" = "往一个毫无保护的账户里定期存入". Check that the innuendo comes through as dry as it does in English.
- **Isolde, friend line 3 and line 7.** "the second wife" = 第二位妻子 (I avoided 二房, which suggests a concubine); "The junior wife" = 资历最浅的妻子.
- **Ottilie, friend line 4.** "not your 'potency'. Potency is for tonic peddlers" = "不是你的“雄风”。“雄风”是卖补药的贩子才用的词". I picked 雄风 because it is the word of aphrodisiac sellers, so her correction still lands. It is a little coarser than "potency".
- **Ottilie, recurring "That will be X."** Rendered "那是靠近你的缘故" / "那是你的缘故" / "那是因为……" to keep her clinical formula. Thriving line 6 drops the closing 缘故 so the line does not get too long.
- **Maren, friend line 2; dating line 4.** Coined language and office names: Kaelish = 凯尔语, Imperial = 帝国语, Veyran Quiet Office = 维拉静默局. They are not in the glossary; check them against any existing translations.
- **Maren, Japanese and Veyran words.** honto ni, Mou, Kimi dake, danna-sama, mamoru, kizuna-himo, vaelis-kor, Vaelis-na-kor and soren-vael are left in Latin letters as in the source. The glosses she gives are translated (dating line 6 "我一直为他留着座位的那个人"; ifUnprotected line 6 "永不解开的系绊").
- **Lira, slang and voice.** 1920s slang is given an old-fashioned colloquial flavor: "bees-knees" = 顶呱呱 (dating line 4), "sweethearts" = 做相好 (dating line 6), "go steady" = 处对象 (ifIntimate line 5), "my main squeeze—no, my steady" = "我的头号相好——不，是我处定的对象" (ifUnprotected line 6). Her flat, literal phrasing ("我今天大部分都是肚子", "我大部分都是想要") is kept on purpose and reads oddly, as the English does.
- **Lira, lover line 6 vs ifIntimate line 6.** The source says "three seasons" in one place and "Nine months" in another. Both are kept as written.
- **Lola, friend line 6.** "Butterford" (her home town) has no glossary entry; it is coined as 黄油渡.
- **Lola, dating line 5.** "The dampers on the bottom oven" means the oven's flue dampers (烟道挡板), not the Bloom drug 缓抑剂. I am confident of this reading, but it is the one place where the glossary term was deliberately not used.
- **Lola, register.** "love/dear" is mostly 亲爱的, sometimes 宝贝. "bloody" = 该死的; "I'm bloody proud" = "我骄傲得要命"; "Any bastard" = 随便哪个王八蛋. Check that her swearing level fits.
- **Morwenna, recurring vocabulary.** exquisite = 精妙, intolerable = 不可容忍, tedious = 乏味, common = 庸俗; each is kept the same wherever it appears. In ifUnprotected line 4, "to keep from naming my own" is read as "my own feelings": "好让自己不必为自己的心意命名".


Line numbers are 1-based indexes into the scene's `lines` list.

## Terms coined for this batch (not in the glossary)

- **All, terms used across characters**: Vespera's "pet" = 乖乖, "puppy" = 小狗; Yulia's "babe" = 宝贝; ward-circle = 结界法阵; ward core = 结界核心; the quad = 方庭; nursery = 育婴室. Other batches may have picked different words (one of them uses 育儿室 for nursery), so these should be made consistent.
- **Baixue, dating 6 / friend 6 / lover 4**: "Imperial Assay" = 皇家验嗣, "Bureau of Lineages" = 宗谱司, "Empress" = 女皇, "great-clan allotment" = 大族配额, "permanent charter" = 永久特许状, "inner alchemy / steady-breath cultivation / aura" = 内丹 / 稳息修炼 / 气息, "Fang Clan" = 方家. These are Yuelan's own terms and should be checked against her character file and the codex.
- **Zélie, lover 1, ifIntimate 1**: "brass listening-charm" (a magical baby monitor) = 黄铜听哨护符. "hearth room" = 壁炉厅.
- **Yulia, friend invitation**: "glow-rot" = 荧光烂酒.

## Voice and register

- **Yulia, catchphrase**: "That's so Breedhaven" = 这太蕃荫了, used the same way in friend 3, ifUnprotected 2 and thriving 3. In Chinese it reads as a coined local joke. Check that it works, and that other places where she says it match.
- **Yelena, every beat**: her stiff court phrasing is written in formal, literary Chinese (拨冗赏光, 不胜欣喜, 家父, 修书), and the slang breaks into it with 就是 / 超级 / 那些有头衔的男的. The contrast is on purpose. ifIntimate 5: "I told him I have already taken you to my bed" = 我不仅召你入了帷帐. That is formal and less direct than the English. Make it blunter if wanted.
- **Yelena, ifUnprotected 2**: "which is, like, super intense when you actually do it" = 但就是，真这么做起来压力超级大. I read "intense" as stressful. The model's first draft had 超级刺激 (thrilling).
- **Tamsin, all beats**: written in rough northern country speech (咱们, 礼拜二, 寻思, 咋样, 有种你就…). "horsefeathers" = 纯属胡扯; "the scrap from next door playing dress-up" = 隔壁那个偷穿大人衣裳的野丫头.
- **Tink, all beats**: "Only joking" is always 开玩笑的. friend 9: "double or nothing" = 要么翻倍要么两清 (I fixed this by hand; the model's version was wrong).
- **Vespera, ifIntimate 2**: "It's time I made an honest witch of myself" plays on "make an honest woman of". Rendered 我也该做回坦诚的女巫了, which keeps "honest" but loses the hint of marriage.

## Meaning doubts

- **Vespera, ifIntimate 7**: the source says "lays the apartment of the steel under the knotted threads", which looks like a typo for "the flat of the steel". Translated as 宽平的刀面. The English should be fixed in `content/default`.
- **Vespera, thriving 6**: "want to be worshipped for their seed" = 巴望着别人冲着他们那点种把他们供起来. The model wrote 体种, which is not a real word; I replaced it.
- **Zélie, dating 4**: "His wife found it in his blotter" = 在他的吸墨纸夹里发现了底稿. The letter was left on her dressing table, so I read "it" as his draft or copy.
- **Zélie, ifIntimate 6**: "I want a household that is mine" = 一个属于我自己的家. I did not use the glossary's 共同家庭 here: it is the game's term for the player's household, and it sounds wrong in her personal wish. Use it if the game-term reading was meant.
- **Zélie, friend 4**: "Colette and little Luc, the twins … their mother" = 他们的母亲 (a mixed-sex pair, so 他们). "cream satin" = 奶油色缎面.
- **Baixue, thriving invitation**: "when you finish in the hall" = 忙完了 (left vague). It is unclear whether "the hall" is the dining hall, a lecture hall or the house.
- **Tink, friend invitation**: "Rosk's tab is open" = Rosk 今晚给挂账. I read it as Rosk letting them drink on credit tonight.
- **Yulia, friend 5 / ifIntimate 5**: "buy me a bump" = 请我吸一口; "I've been flying on something" = 我都是嗑嗨了的. Both say the drug use outright, as the source implies.

## Process

- Yulia's file and Baixue's lover/thriving variants were blocked by the provider's safety filter on the first try. I retried with a shorter system message that did not describe the drug use, and split them into smaller parts. No text was dropped.


## Curriculum

- **Across files:** the codex (first pass) uses 法术 for a spell's working and 魔力激增 for a pregnant woman's surge; the interface and everything translated since use 术式 and 涌潮. One of the two should give way; the interface's battle text already says 涌潮.
- **Skill rules** are the text most worth checking against what each skill does in the game: they state numbers and conditions. The notes below flag those whose wording was a judgment.


- **Titles with a label (CUL 101, BLM 101).** "Fermentation: ", "Blood: " and "Channeling: " are translated (发酵： / 血液： / 引导：), not kept as speaker tags.
- **Glossary update applied (BLM, CUL).** "working" (a spell) is now 术式 throughout BLM and in CUL 111 ("Tier I work" = 一阶术式). The noun "charge" (magic a cordial or an ingredient carries) is now 充能 in CUL: 带有微弱的充能, 带有充能的香草, 当季的充能, and the exam question 流失多少充能. Where the English says "magic", 魔力 stays. Check that 充能 reads naturally as a noun in the cooking text.
- **CUL 101 mead-and-honey-ferments, content + exam.** "melomel / metheglin / cyser". The usual Chinese terms (果味/香料/苹果蜂蜜酒) spell out the answer to "What is mead made with spice called?", so I transliterated: 梅洛梅尔 / 梅瑟格林 / 赛泽 (answer 梅瑟格林). Check that the transliterations read acceptably, or accept the easier question and use the descriptive names.
- **BLM 101/147, coined unit.** "thaum / thaumometer" = 索姆 / 索姆计 (Bloom field = 繁花场). New coined terms; the units recur throughout BLM and may appear in other subjects (PSF, MEN?), so they should be kept the same everywhere.
- **POL 153 state-capacity-at-seven-to-one, content.** "surge rosters" = 涌潮排班表, following the glossary's 涌潮 for surge. Reads a little odd outside the battle UI; 魔力高涨期排班表 is the plain alternative.
- **LAW 128 parentage, content.** "lineage reading" (a clinical charm) = 血统溯验. Coined term.
- **LAW 128 legal-household, exam.** "steward" = 主事人 (signs for the household in law). Coined; 管家 would suggest a servant.
- **LAW (both courses), case names.** "Harrow v Pell" etc. = Harrow 诉 Pell 案, with the names left in English as for characters. Courts: Court of the Charter = 宪章法院, Courts of Lineage = 血统事务法院, High Court = 高等法院, magistrates' courts = 治安法院.
- **POL 101, institutions.** the Crown = 王权, the Assembly = 议会, First Minister = 首席大臣, royal assent = 王室御准, the Charter of Seedblossom = 《籽花城宪章》, Registry Act = 《登记法》. These terms are new to the translation; other subjects (HIS, LAW) should use the same ones.
- **LAW 101 skill claiming-what-is-due.** "a child's keep costs 25% less" = 孩子的抚养费降低 25%. Check that 抚养费 matches the term the house/children UI uses for the weekly cost of a child.
- **BUS 101 skill service-manner.** "shifts pay 15% more" = 班次工资提高 15%. 班次 and 工资 follow shell.json.
- **BUS 184 skill knowing-the-margins.** "shops charge 20% less" = 商店收费降低 20%. The meaning is clear, but 商店价格降低 20% may read more naturally.
- **BLM 147 skill kitchen-garden.** "its comfort is 2 higher" = 房子的舒适度提高 2. 舒适度 follows housing.json and tips.json.
- **CUL 101 skill bloom-cordial.** "whatever she takes against the Bloom does not work" = 她为抵御繁花而服用的任何药物都将失效. This rule matters (it disables her birth control/suppressant for a day). The wording stays as vague as the English and does not name 避孕 explicitly.
- **CUL 111 skill charmed-confection.** "Charmed confection" = 附咒甜点; the description says 甜点.
- **BUS 184 scarcity-rent exam.** "One in 80" = 每 80 人中有 1 人 (the wrong choices follow the same pattern). Digits kept as in the source.
- **BUS 184 sires-in-trade-policy, content.** "record assay" = 创纪录的测定结果. Long, but no shorter rendering is clear.


## Checker false positives

- WTC 101 topic `undoing-unpick-break-return` title; MEN 101 topic `anchors-materials-that-hold-a-working` title. "Undoing: Unpick, Break, Return" -> 解除恶咒：拆解、破坏、返还; "Anchors: Materials That Hold a Working" -> 锚定物：承载术式的材料. zh2-check.py reports "lost 'Undoing: '" / "lost 'Anchors: '" because a capitalised word plus colon at the start of a string matches its speaker-tag pattern. These are lecture titles, not scene lines; left translated rather than keep English in a title.

## Terms coined here (not in the glossary)

- MEN, all courses. Tier I/II/III/IV -> 一阶/二阶/三阶/四阶; thaum -> 索姆, thaumometer -> 索姆计; anchor -> 锚定物; pattern -> 纹式; charge -> 充能; working -> 术式; enchantment -> 附魔; coupler -> 耦合器; circle -> 施术环; charm-core -> 咒核; charm-drive -> 咒驱; magitech -> 魔导科技; retention -> 保持率; warded bench -> 结界工作台; spotter -> 保护员. Also used in WTC and KIN. Worth fixing game-wide if other files (codex, Undercroft, character files) already render any of these differently.
- MEN 101 / KIN 101 / KIN 143. "pregnancy surge" -> 孕涌, "the surge rule" -> 孕涌规则. A coinage; check against how the codex and story files render the surge.
- WTC 101. hex -> 恶咒; the four hexes: The Tangle 缠结咒, The Souring 酸败咒, The Misplace 错置咒, The Stumble 绊足咒; counters Unpicking 拆解, Breaking 破坏, Returning 返还 (wrong choice "Binding" 束缚). Hand charms 暖热咒 / 修补咒 / 亮光咒.
- WTC 101/128. threshold -> 界限 (101) and 界口 (128). Two renderings by two calls; 界口 reads better for doors/windows/hearths. Consider unifying on 界口.
- SGN 101. "the Sown Expanse" -> 播种大地. Not in the glossary; check whether it appears elsewhere already translated.
- SGN 101/146. bound seed / bound fraction -> 结合精子 / 结合比例; assay -> 化验; "the Cost / Maternal Field / Balance hypothesis" -> 代价假说 / 母体场假说 / 平衡假说.
- KIN 101 / 143. Divisions: Unaugmented / Mage / Bloom -> 无增幅组 / 法师组 / 繁花组; Open / Limited / Plain -> 公开组 / 限制组 / 纯体组. The English itself uses two different sets of three divisions in the two courses; translated as written.
- KIN subject. "Kinesiology and Sport" -> 运动机能学与体育 (the model offered 运动科学与体育). Either works; check against any course list or codex already in zh-CN.
- KIN 143 / 176. "the Arena Finals" -> 竞技场总决赛. Existing zh-CN items use both 竞技场总决赛 and 大竞技场总决赛; pick one.

## The household question

- WTC 128, throughout. The glossary says household = 共同家庭, but this course means a home and the people living in it, not the player's household of partners. I used 家宅 (家宅术式, 家宅女巫, 家宅防护结界), "这家人" for "keyed to the household", and "下一户人家" for "the next household". Skill name "Household wards" -> 家宅防护结界. Confirm this exception is wanted.
- MEN 162. "household and city systems" -> 家宅与城市系统; "household ward plate" (MEN 101) -> 家用结界板. Same reasoning.

## Skill rules

- SGN 101 `own-assay`. "the chance of a child with a woman on birth control is 50% higher" -> 让正在避孕的女性怀上你孩子的概率提高50% (upgrade 100%). Reads as the chance she conceives by you; I think that matches the rule.
- WTC 101 `heartsease`. "drunk, it makes the affection you win 100% higher for a day" -> 饮用后，你在一天内获得的好感提高100%. Button "Brew" -> 酿造.
- MEN 101 `stamina-band`. "charge a wristband you built: triggered, it gives you 40 energy" -> 为自己制作的手环充能：触发后可为你提供40点精力. Skill name 体力手环. Button "Charge" -> 充能.
- MEN 135 `running-repairs`. "rooms and upgrades cost 15% less" -> 房间与改造的费用降低15% (30%). Check that 改造 matches what the house screen calls upgrades in the translated UI.
- KIN 143 `conditioned`. "classes and shifts cost 25% less energy" -> 上课和打工班次消耗的精力减少25% (40%). 班次 matches jobs.shifts in strings/game.json.

## Wording to check

- KIN 143 `pregnant-athletes-and-the-surge-rule`. "she is not asked to play through a term's last two weeks" -> 不得要求她在妊娠期的最后两周出赛. I read "term" as her pregnancy, not the academic term. Ambiguous in the English.
- SGN 146 `error-and-the-second-sample`. "the line at five" -> 百分之五这条分界线 (I made the percent explicit; the scores are bound-fraction percentages).
- MEN 162 `enchanted-circuits-series-and-parallel`. "a kiln that will not fire while its door ward is down" -> 窑炉在炉门结界未生效时就绝不能点火.

## Exams

- MEN 135 `safety-and-the-road`. Answer 开裂的咒核可能会瞬间释放全部充能; the model padded the three wrong choices to the same length (让咒核在运转时始终保持冷却状态 ...). They read wordy, but the answer no longer stands out by length.
- SGN 146 `tracing-a-family`. Answer 成百上千份汇总 vs 仅仅单独的一份 / 只需要两到三份 / 每一代人各一份. The answer ends differently from the wrongs; still guessable from the lecture only.
- KIN 101 `pressing-rowing-and-balance`. "None in the first month" -> 首月先不练; fine, but the four choices are short phrases with different structures.


- COM 101 skill.description / upgrade: "every woman needs 5 less desire" -> "所有女性所需的欲望降低 5 点" (10 in the upgrade). The rule is a lowered desire threshold; the Chinese reads as the threshold, not her desire meter, but check it is unambiguous next to the meter label 欲望.
- EDU 101 skill.description / upgrade: "children in your house can reach one level better" -> "你房子里的孩子可达到的最高等级提高 1 级" (2 in the upgrade). Written as raising the cap on a child's level; confirm that is what the game does.
- WOM 101 / BPS 101 skill, "trust grows 25% faster" -> "获得的信任增加 25%"; PSF 101 "trust from dates and outings grows 50% faster" -> "约会与外出时获得的信任增加 50%"; BPS 101 "ties between them grow 25% faster" -> "她们彼此之间的关系增长速度提高25%". "Faster" is rendered as more gained per event (WOM, PSF) but as growth rate (BPS); harmonise if the game means one thing.
- WOM 193 skill: "lost affection and trust are 50% smaller" -> "好感与信任的损失减少 50%" (75% in the upgrade). Clear, but check against the in-game wording of meter losses.
- COM 119 / PSF 117 skills: "training in charisma is 50% more effective" -> "魅力训练的效果提升 50%"; "training in strength and dexterity" -> "力量与灵巧训练的效果提升 50%". Fine if the training screen calls it 训练.
- BPS 101 / PSF 101 / PSF 117 / WOM 193, "the Second Bloom" (post-menopause years) -> 再度花开, the same word as the shop "Second Bloom" in the glossary. BPS 101 exam: answer 再度花开 vs wrong 迟暮花开 (for "The Late Bloom"); they share 花开, but the parallel is the same in English.
- PSF 117 topic panic-and-the-bloom: "a frightened woman's field" -> 繁花场 (coined; no term in content/zh-CN). Should agree with the codex if it speaks of a woman's field anywhere.
- BPS 101 topic generative-drive / WOM 193: "generative drive", "generativity" -> 生发驱力 / 生发. Coined academic term; 生育驱力 would read as only childbearing, which the lecture says it is not.
- BPS 101 topic proximity-to-a-sire, PSF 101: "the pull" -> 牵引 throughout (Gemini first wrote 感召力 in PSF; changed to match BPS/WOM). Not in the glossary yet.
- BPS 101 topic pregnant-mind exam: "Overreach" -> 越界 (wrongs 冷漠 / 绝望 / 健忘). 越界 also suggests crossing social lines; the lecture means overestimating new power. 逞强 is the alternative.
- WOM 193 topic classical-bloomism: "the Order teaches accord" -> 修会教导协和 (修会 from content/zh-CN REVIEW.md). Exam answer 协和 vs 克制 / 超脱 / 苦修. 协和 is a slightly unusual word, which may make it stand out as the answer.
- WOM 193 topic freewill-tradition: book "The Leaning Will" -> 《倾斜的意志》; author Maud Hollin and the wrong authors kept in English. Coined title; 倾压 is used for the Bloom "leaning on" a woman.
- WOM 193 topics: "compatibilist" -> 相容论, "the regress" -> 无穷倒退问题, "the two selves problem" -> 双重自我问题. Standard philosophy terms; check they read as intended.
- WOM 101 / BPS 101: a pregnant woman's "surge" -> 涌潮 (per the glossary update; WOM 孕期涌潮, BPS "the surge in power" -> 魔力涌潮的到来). BPS "strength arrives in weeks" stays 力量的暴涨, which is not the surge term.
- WOM 101: "fertility assays" -> 生育力检定; "a working" -> 术式; "a glamour" -> 魅惑术. Coined terms that should agree with other subjects (BLM, MEN, KIN) if they use them.
- COM 119 topic signals-before-speech: "wolfkin" -> 狼族, taken from codex.json (which also uses 狐族); the glossary only has beastkin = 兽裔.
- PSF 101: "the principal" -> 受保护人, "detail" -> 护卫小组, "advance officer" -> 前站先遣官, "a Sire wing" -> 育嗣者楼区. Protection jargon chosen by me; 育嗣者楼区 should agree with housing/locations if a Sire wing is named there.
- EDU 101: "the Office" (the Sire Relations Office, as nanny employer) -> 办公室; "creche" -> 托儿所. 办公室 alone may be too bare; 育嗣者关系办公室 in full is an option.
- COM 101 topic how-a-feed-decides exam: "Profile visits" -> 主页访问量 against two-item wrongs (浏览与收藏, 关注与标记); same shape as the English, which is also uneven.
- HHS 101 topic garden-magic exam: wrongs reworded to 速度约为两倍 / 速度约为五倍 so that "twice as fast" is not misread (加快两倍 is often taken as 3x); the answer 加快约三分之一 and 加快约十分之一 keep the other form, so the forms are not fully parallel.


- **colleges, all names**: "Government and Law" ... → 政法学院 / 商学院 / 繁花研究与神学院 / 工程学院 / 生命科学与农业学院 / 公共安全与体育学院 / 艺术与人文学院. I took these from the names already in codex.json ("university" entry), so each one carries 学院. Check how the interface shows a college: if it puts "College" around the name, the result reads 学院学院.
- **CSC 142, skill description and upgrade**: "you are walked in on 50% less often" / "75%" → 你被人撞见的频率降低 50% / 75%. 撞见 matches `drama.headline.confrontation` ({actor}撞见了你们). Please confirm it is clear that this means another woman walking in on you with someone else.
- **RBI 101, skill upgrade**: "every woman who has had your child wants you as much as a woman can" → 每一位为你生过孩子的女人，对你的欲望都会达到一个女人所能有的极致. I read the rule as her desire meter going to its maximum and used 欲望 on purpose. If the rule means something else, reword it.
- **RHE 101, skill upgrade**: "none falls below uneasy" → 没有人的舒适度会低于“不安”. 不安 is the label in `skills.comfort.uneasy`. 舒适度 for "how comfortable" is my own word, since the strings have no label for the meter itself.
- **MTH 101, skill**: "study and Focus earn 25% more marks" → 学习和专注获得的分数提高 25%. "study" is taken as the study action. If the interface has a set name for that action, use it here.
- **GEO 101, skill**: "a gift she likes is worth 50% more" → 送出她喜欢的礼物时，礼物价值提升 50%. Using 价值 could make a player think of the gift's price. A clearer choice might be 效果提升.
- **PTH subject/title**: "Prenatal Thaumaturgy" → 孕期魔法学. This follows codex.json (disciplines), and the name has no 索姆/奇术 in it. In the same course, "spotter" → 安全监护员 and "practicals" → 实操课 also follow the codex. "thaumometer" → 索姆计 is coined.
- **PTH 101, birth-discharge question**: the wrong choices for "A Bloom Chamber" are 接地大厅 / 分娩拱室 / 涌潮病房. These are coined and parallel. 繁花产室 is the only one with 繁花 in it, but the English also has Bloom only in the answer.
- **RBI 101, seed terms**: "bound / unbound seed" → 缚合精子 / 未缚合精子. Coined; it may need adding to the glossary.
- **ART subject**: "Studio Art" → 美术 / course "Studio Art Foundations" → 美术基础. A literal 工作室艺术 reads badly in Chinese.
- **ENG subject**: "English" → 英语. It is the in-world native-language writing course, and the lectures contain no English examples, so everything is translated, including the thesis examples. You might prefer 写作 or 语文 as the subject name.
- **ENG 101, household-novel question**: the answer (追踪同一家庭的多位女性，不设唯一女主角) is long, as it is in the English. To keep the choices parallel, the model padded the three wrong choices to the same length (e.g. 全书的故事时间跨度仅仅局限于一天之内). They read rather wordy.
- **MUS 101, pitch lecture**: the source has "no sharps or apartments", which looks like a find-and-replace slip for "flats". I translated it as 升降号. The English source probably needs fixing too.
- **MUS 101, harmony question**: "The ground / root / floor / anchor" → 基音 / 根音 / 底音 / 锚音. 基音 is a real acoustics term (fundamental), and 根音 is the real chord-root term. The in-world term "the ground" could also be 地音 or 底声 if 基音 seems too technical.
- **HIS 101, Dawnbloom lecture**: "remembered today in the word courier" cannot be carried over as etymology. I rendered it as the runners surviving in the word 信使 and the running-messenger icon, which matches the codex's Bloomr entry.
- **HIS 101, coined wrong choices**: House Riverhold / Orchardmere → 河堡王朝 / 果园泽王朝. The "seven petals rhyme" → 《七瓣童谣》 is also coined.
- **GEO 101, Kharad-Tor question**: the wrong choices Hold-Queen / Iron Matron / Hearth-Keeper → 氏堡女王 / 铁之主母 / 守炉人 are coined. Frostholm / Emberdeep → 霜堡 / 余烬深城 are also coined.
- **RHE 101, terms**: Claim / Grounds / Warrant → 主张 / 论据 / 保证 (Toulmin; 保证 is the standard Chinese rendering but reads oddly to non-specialists). Ethos / Pathos / Logos / Kairos → 伦理诉求 / 情感诉求 / 逻辑诉求 / 时机诉求.
- **Glossary update applied**: working → 术式, surge → 涌潮, ground (the verb) → 疏导, anchor → 锚定物 across these files. The codex still says 法术 and 魔力激增 for the same ideas (e.g. 三阶法术 in the disciplines entry), so the codex and the curriculum now differ.


## Characters' names in Chinese script (parser only)

Each character file has `aliases`: her name as a Chinese writer would transliterate it. The interface never shows
these; the LLM is told to write names in Latin letters, and the parser accepts these as well in case it does not.
They should be the forms a model is likely to produce: check the transliterations, above all the meaning-based
surnames (Tink 廷克·轻足, Una 乌娜·晴天, Yelena 叶莲娜·金藤, Vespera 维斯佩拉·午夜, Morwenna 莫温娜·三生, Caelwen 凯尔文·灰林),
where both the sound and the meaning are listed. Mimi's 咪咪 was left out, being a word of its own; Baixue's 白雪 is
kept though it also means "snow". A single-character name (Yann's 扬) is accepted only written alone.

## Words the game reads sex by (`strings/scene.json`, `detect.sexWritten`)

When a woman will not have sex with him and a reply writes it anyway, the game has it written again. It notices by
these words in her lines, or in a line that names her. They name acts, as the English list does, and leave out talk
about sex (做爱, 交合, 阴道), which a conversation, a lecture or the clinic uses. A native reader should check two
things: that each word is what an explicit Chinese scene would use, and that none turns up in ordinary scenes
(高潮 and 插入 are the likeliest to). Missing words let a scene through; overly common ones have a harmless reply
written again.
