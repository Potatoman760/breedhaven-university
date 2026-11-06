# Simplified Chinese translation

Select **简体中文** in Settings → Language. The translation covers all 26 Codex entries and all keys in the `core`, `shell`, `screens`, `panels`, `editor`, `comfy` and `game` catalogs, plus the user-facing messages in `scene` and `llm`. This includes menus, settings, help, tutorials, courses, conversations, the phone, inventory, housing, expeditions, achievements, saves and editor controls. Selecting the language also asks the LLM to write in Simplified Chinese, with the terminology below.

Relationship and pregnancy stages, calendar months and periods, weather labels, housing labels and party action names have content overlays as well, as do activities, jobs, market stalls, traits, the minigames' pieces, the card table, the loading tips, the new player's bio and room, and orientation (its scenes and step names; the LLM's directions for each step stay English). Speaker tags in scene lines ("Tamsin: ") stay in English, since the game reads them. Voice recordings are English: a translated line plays silent, and catch phrases are not played outside English, while wordless reactions still are. Weekday display labels are translated separately from their stored scheduling values. Places (names, descriptions, drills), items, societies (names, syllabi, adult event scenes, the Societies Fair), getaways, calendar events and their scenes, weather descriptions, the Undercroft (depths, rooms, relics, enemies, its intro) and the house (rooms, tiers, messages, the viewing, the nanny's lines) are translated too. Character files (bio, role, outfit and room names, ultimates), every story beat (invitations and scenes) and the whole curriculum (subjects, courses, lectures, exam questions and skills) are translated. `REVIEW.md` lists what a native reader should check. Character names stay in English in running text while their files are untranslated; place, society and event names are translated. Existing save text stays in the language in which it was written. LLM instructions not shared with the interface, machine-readable tags, and image-generation prompts and their examples retain English.

The interface pass uses 感知 for Wisdom, 好感 / 信任 / 欲望 for the relationship meters, 精力 for energy, 战力 for footing (battle health), 护盾 for battle wards, and 涌潮 / 疏导 for surge / ground. These are editorial terminology choices; 育嗣者 / 真育嗣者 remains the user-approved pair. Humor in achievement names is adapted where English wordplay does not transfer.

The JSON files are partial language overlays, not a separate content pack. Keep the English source in `content/default/`. Preserve IDs, references, numbers and `{player}`. English keyword aliases remain alongside Chinese ones because names and much of the surrounding content are still English. The language loader replaces keyword arrays whole.

## Terminology

| English | Simplified Chinese | Translation rationale |
|---|---|---|
| Sire | 育嗣者 | User-approved coined setting term for a fertile man. It describes a reproductive status, not a royal title, an existing father, or a claim to authority. |
| True Sire | 真育嗣者 | A separate, exceptionally rare fertility category: internal ejaculation causes conception whenever the woman is not using contraception. It does not mean an ordinary Sire is fraudulent. |
| Sire Registry | 育嗣者登记册 | A confidential national register, not a public matchmaking list. |
| Primordial Bloom / the Bloom | 原初繁花 / 繁花 | A living magical force. The floral imagery connects its magic, fertility and everyday brands; the translation does not turn it into a personified goddess. |
| Bloomist / Freewill advocates | 繁花信徒 / 自由意志派 | A religious position and an opposing philosophical position, rather than invented political parties. |
| Bloom suppressants / dampers | 繁花抑制剂 / 缓抑剂 | Distinguish suppression of the Bloom's pull from contraception where the source does. Avoid suggesting that all desire suppressants are necessarily contraceptives. |
| household | 共同家庭 | A shared domestic and child-rearing unit. It does not imply a patriarch, a harem, or that every adult is romantically involved with every other adult. |
| throuple / polyamory | 三人伴侣 / 多边恋 | Preserve consensual relationship structures without importing polygamous marriage law. |
| ward / ward-line | 防护结界 / 结界脉络 | Protective magic and its interconnected structure; not hospital wards. |
| Bloom Chamber | 繁花产室 | A warded delivery room, rather than a religious chamber. |
| breeding | 交合受孕 / 生育, according to context | Preserve the reproductive meaning and explicitness of the source. Animal-husbandry terms are not used as neutral descriptions of people. |
| lock in | 结定 | Coined expression for the immediately felt magical confirmation of conception. Not a permanent relationship bond or a separate game rule. |
| beastkin / orc / halfling / slime | 兽裔 / 兽人 / 半身人 / 史莱姆 | Keep beastkin distinct from orcs. Sentient slimes retain personhood; mindless Undercroft creatures are explicitly distinguished. |
| War-Mother / hold | 战母 / 氏堡 | Leadership title and extended household; does not imply that the household is a prison or military garrison. |

### Cultural and lexical checks

[Cambridge's English–Chinese entry for “sire”](https://dictionary.cambridge.org/dictionary/english-chinese-simplified/sire) distinguishes the royal address from the male-parent and reproductive senses. None alone expresses this game's legal and social category. **育嗣者** and **真育嗣者** are therefore localization choices, not established dictionary equivalents. The user selected this pair over retaining English or using a stronger breeding register.

[汉典: 嗣续](https://www.zdic.net/hans/%E5%97%A3%E7%BA%8C) supports the descendants/continuation association, but “嗣” can also evoke inheritance and family lineage. The Codex explicitly defines the term as fertility so it does not imply aristocracy or male-line succession. [汉典: 配种](https://zdic.net/hans/%E9%85%8D%E7%A7%8D) and [种畜](https://zdic.net/hans/%E7%A7%8D%E7%95%9C) document the animal-husbandry register that makes livestock terminology a poor neutral label for the people described here.

These checks inform the register; they do not constitute a native-speaker localization review.

## Names chosen for this first pass

Proper-name translations below are editorial choices made for this pass. English names appear alongside Chinese names at introductions where useful, and remain keyword aliases. Brand names with no useful direct rendering, such as Bloomr, retain their spelling. Untranslated character and location files still display their English names.

| English | Simplified Chinese |
|---|---|
| Breedhaven / Breedhaven University | 蕃荫王国 / 蕃荫大学 |
| The Sown Expanse | 沃种大陆 |
| Seedblossom / House Dawnbloom / Dawnbloom House | 籽花城 / 曦花王朝 / 曦花宫 |
| Seraphine IV / Seraphine V | 瑟拉芬四世 / 瑟拉芬五世 |
| Iscara / Kharad-Tor / Veyra | 伊斯卡拉 / 卡拉德托尔 / 维拉 |
| The Vesperan League / Goldport | 维斯佩拉同盟 / 金港 |
| The Starkelands / Hearthspire / hearthmark | 斯塔克兰 / 炉心尖塔城 / 炉马克 |
| Joven Stormbreaker | 约文·破风者 |
| The Undercroft / the Foundry / the Tiltyard | 地下遗构 / 铸坊 / 比武场 |
| Lantern Row / Riverside Park | 灯笼街 / 河滨公园 |
| The Honeyed Bee / Spell & Sip / Boba Blossom | 蜜蜂酒馆 / 咒语与啜饮 / 啵啵花语 |
| Cauldron / Pixel and Rune / Mana Bar | 坩埚餐厅 / 像素与符文 / 魔力酒吧 |
| Ironroot / Undergrowth / Lumen | 铁根 / 林下 / 流明影院 |
| Byte & Bloom / Arcana | 字节与繁花 / 秘法 |
| Book Nook / Forbidden Shelf | 书窝 / 禁忌书架 |
| Petal & Thorn / Cradle / Velvet / Glamour | 花瓣与荆棘 / 摇篮 / 丝绒 / 幻彩 |
| Seven Petals / Petal & Pill / Bloom & Co. | 七瓣花 / 花瓣与药丸 / 繁花百货 |
| Second Bloom / Matchleaf / Trellis | 再度花开 / 合缘叶 / 缘藤 |

## Source ambiguities retained

The pregnancy entry describes carrying a Sire's child as stronger, although the broader lore says only Sires can father children. The Expanse overview calls Veyra a democracy while its own entry calls it a federation; those descriptions can coexist. The pregnancy entry uses both seven weeks and the exact clinical count of 48 days. This translation preserves those statements rather than changing the lore or mechanics.
