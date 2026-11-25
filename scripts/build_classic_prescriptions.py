"""Build the Qingnang classic prescription catalogue from the official lists and corpus."""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from xml.etree import ElementTree
from zipfile import ZipFile

import pdfplumber
from pypinyin import Style, lazy_pinyin


ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "txt" / "classic-books" / "chapters"
DESTINATION = ROOT / "database" / "classic-prescriptions.json"
COUNT = 2000

FIRST_URL = (
    "https://mpa.yn.gov.cn/zfxxgk/zcwj/qtwj/gjwj/201804/P020251013420546629413.docx"
)
SECOND_URL = "https://www.nmpa.gov.cn/directory/web/nmpa/images/1693558753843040322.pdf"
WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

# Earlier and dedicated formularies take precedence over later reprints.
# Caps prevent the longest compilations from dominating the supplementary selection.
BOOKS = {
    "shanghanlun": (150, 110),
    "jinguiyaolue": (148, 125),
    "wenbingtiaobian": (135, 65),
    "piweilun": (131, 55),
    "xiaoeryaozhengzhijue": (130, 100),
    "fuqingzhunvke": (128, 45),
    "yilingaicuo": (127, 35),
    "yifangjijie": (126, 280),
    "yifangkao": (123, 345),
    "hejijufang": (120, 380),
    "jingyuequanshu": (117, 230),
    "yixuexinwu": (116, 130),
    "waikezhengzong": (114, 70),
    "qianjinyaofang": (112, 290),
    "furendaquanliangfang": (110, 205),
    "waitaimiyao": (109, 100),
    "qianjinyifang": (107, 80),
    "zhouhoubeijifang": (106, 50),
    "danxixinfa": (105, 65),
    "waikezhengzhiquanshengji": (104, 50),
    "yizongjinjian": (100, 50),
}
EMBEDDED = {
    "shanghanlun", "jinguiyaolue", "wenbingtiaobian", "fuqingzhunvke",
    "jingyuequanshu", "waikezhengzong", "waitaimiyao", "zhouhoubeijifang",
    "danxixinfa", "yizongjinjian",
}
# Normalize variant name spellings only where they unambiguously refer to one formula.
ALIASES = {
    "旋覆代赭石汤": "旋覆代赭汤",
    "麻黄杏仁甘草石膏汤": "麻杏石甘汤",
    "麻黄杏子甘草石膏汤": "麻杏石甘汤",
    "麻黄杏仁薏苡甘草汤": "麻杏薏甘汤",
    "麻黄杏仁薏苡仁甘草汤": "麻杏薏甘汤",
    "栝蒌桂枝汤": "瓜蒌桂枝汤",
    "栝楼桂枝汤": "瓜蒌桂枝汤",
    "栝蒌薤白白酒汤": "瓜蒌薤白白酒汤",
    "栝蒌薤白半夏汤": "瓜蒌薤白半夏汤",
    "桂枝加厚朴杏仁汤": "桂枝加厚朴杏子汤",
    "麻黄附子细辛汤": "麻黄细辛附子汤",
    "厚朴生姜甘草半夏人参汤": "厚朴生姜半夏甘草人参汤",
    "桂枝去芍药加蜀漆龙骨牡蛎救逆汤": "桂枝去芍药加蜀漆牡蛎龙骨救逆汤",
    "桂枝去芍药加麻黄附子细辛汤": "桂枝去芍药加麻黄细辛附子汤",
    "贝母栝蒌散": "贝母瓜蒌散",
    "活络丹": "小活络丹",
    "桂枝龙骨牡蛎汤": "桂枝加龙骨牡蛎汤",
    "八味肾气丸": "肾气丸",
    "八味地黄丸": "肾气丸",
    "黄耆桂枝五物汤": "黄芪桂枝五物汤",
    "甘草干姜茯苓白术汤": "甘姜苓术汤",
    "肾着汤": "甘姜苓术汤",
    "肾著汤": "甘姜苓术汤",
}
PREFERRED = set("""
桂枝汤 麻黄汤 小青龙汤 大青龙汤 葛根汤 小柴胡汤 大柴胡汤 四逆散 逍遥散 加味逍遥散
柴胡疏肝散 四逆汤 理中丸 吴茱萸汤 当归四逆汤 真武汤 白通汤 附子理中丸 橘皮竹茹汤
五苓散 猪苓汤 茵陈蒿汤 苓桂术甘汤 甘草干姜汤 小建中汤 黄芪建中汤 大建中汤 炙甘草汤
白虎汤 竹叶石膏汤 白虎加人参汤 麻杏石甘汤 桂枝茯苓丸 肾气丸 大黄牡丹汤 大黄䗪虫丸
大承气汤 小承气汤 调胃承气汤 桃核承气汤 大陷胸汤 小陷胸汤 半夏泻心汤 生姜泻心汤
甘草泻心汤 旋覆代赭汤 厚朴温中汤 平胃散 藿香正气散 三仁汤 银翘散 桑菊饮 麻杏薏甘汤
清营汤 犀角地黄汤 青蒿鳖甲汤 增液汤 清燥救肺汤 沙参麦冬汤 麦门冬汤 益胃汤 百合固金汤
左归丸 右归丸 左归饮 右归饮 六味地黄丸 八味地黄丸 一贯煎 归脾汤 补中益气汤 当归补血汤
四君子汤 参苓白术散 香砂六君子汤 六君子汤 四物汤 八珍汤 十全大补汤 人参养荣汤
生脉散 玉屏风散 当归六黄汤 牡蛎散 朱砂安神丸 天王补心丹 酸枣仁汤 甘麦大枣汤
桂枝龙骨牡蛎汤 桂枝加龙骨牡蛎汤 黄连阿胶汤 交泰丸 安宫牛黄丸 紫雪丹 至宝丹 苏合香丸
藿朴夏苓汤 羌活胜湿汤 九味羌活汤 独活寄生汤 蠲痹汤 乌头汤 防己黄芪汤 桂枝芍药知母汤
血府逐瘀汤 通窍活血汤 补阳还五汤 少腹逐瘀汤 膈下逐瘀汤 身痛逐瘀汤 失笑散 温经汤
生化汤 胶艾汤 当归芍药散 完带汤 易黄汤 养精种玉汤 定经汤 固本止崩汤 两地汤 泰山磐石散
半夏厚朴汤 厚朴生姜半夏甘草人参汤 越鞠丸 枳实薤白桂枝汤 金铃子散 良附丸
二陈汤 温胆汤 清气化痰丸 半夏白术天麻汤 苓甘五味姜辛汤 止嗽散 贝母瓜蒌散 小蓟饮子
龙胆泻肝汤 泻白散 泻黄散 清胃散 玉女煎 芍药汤 白头翁汤 普济消毒饮 黄连解毒汤
黄连汤 葛根黄芩黄连汤 导赤散 清骨散 新加香薷饮 香薷散 升麻葛根汤 加味香苏散
防风通圣散 荆防败毒散 人参败毒散 川芎茶调散 牵正散 小活络丹 大秦艽汤 镇肝熄风汤
羚角钩藤汤 天麻钩藤饮 大定风珠 地黄饮子 消风散 黄土汤 槐花散 十灰散 四神丸 真人养脏汤
金锁固精丸 桑螵蛸散 缩泉丸 固冲汤 乌梅丸 乌梅擦牙关方 理中汤 麻子仁丸 润肠丸 济川煎
保和丸 枳实导滞丸 木香槟榔丸 肥儿丸 感应丸 温脾汤 十枣汤 舟车丸 大黄附子汤
阳和汤 仙方活命饮 透脓散 托里消毒散 五味消毒饮 四妙勇安汤 海藻玉壶汤
小儿异功散 异功散 益黄散 泻青丸 小青膏 七味白术散 白术散 消导宽中汤 度瘴散
""".split())

FORMS = "汤散丸丹饮膏煎酒露饼锭饧粥羹粉霜油浆糊汁酥膳糯糕曲面饭珠"
NAME = re.compile(rf"^[\u3400-\u9fff𬜯𧷏䗪·〇一二三四五六七八九十]{{2,21}}[{FORMS}](?:方)?$")
BAD_TITLE = re.compile(
    r"^(?:又|一方|方见|方附|方用|论|附[录方]|治|疗|主治|诸方|按|集方|类方|辨|用|"
    r"属|宜|欲[服饮]|即|名曰|更用|药用|"
    r"杂方|方歌|前方|后方|凡|本方|上[方篇]|下[方篇])"
    r"|(?:列方|备用方|主治方|应用方|诸方|用药方|方法|随病制方|一方|二方|三方|四方)$"
)
UNREADABLE = re.compile(r"[□�]|缺文|图版占位|原书缺")
UNIT = r"(?:(?:[一二三四五六七八九十百千万两廿卅半数零〇\d]+)(?:斤|两|铢|钱|分|升|合|斗|枚|个|片|握|盏|粒|撮|茎|具|把|束|条|寸|块|枝|匙)|等分|各半|各等)"
DOSE = re.compile(UNIT)
INDICATION = re.compile(r"^(?:（[^）]{1,75}）\s*)?(?:主治|治|疗|主[诸伤风])(?!(?:下筛|为散|作末|筛))")
METHOD = re.compile(
    r"^(?:(?:右|上)(?:件|药|方|诸味|诸药|[一二三四五六七八九十百廿卅两余数\d]+(?:余)?味)?"
    r"[，。、；：\s]*(?:各|为|作|用|以|水|同|研|咀|㕮|捣|煎|去|治|先|切|细|合|别|炼|焙|搅|蜜|锉|共|和|二味|三味|将|丸)"
    r"|(?:共|俱|同|各|并|悉|都|合)为(?:细|粗)?末|制法|用法|煎服法|每服|水煎|水[一二三四五六七八九十半数\d]+[碗盏升斗钟杯合]"
    r"|为(?:细|粗|散|末|丸)|炼蜜|蜜丸|以水|用水|右[一二三四五六七八九十百\d]+味|以上[一二三四五六七八九十百\d]+味"
    r"|上药同|右药同|捣(?:筛|为)|锉[如为]|㕮咀|空心|酒煎|温酒调|酒调|米饮调|研为末|用黄酒)"
)
INLINE_METHOD = re.compile(
    r"(?<=[）。；])(?:[，,、]?\s*)(?=(?:蜜丸|炼蜜|水煎|共为末|上[为将]|每服|以水|锉为|"
    r"加生姜[^。；]{1,8}煎|莲子粉糊为丸|蒸饼为丸))"
)
NUMBERED = re.compile(r"^[一二三四五六七八九十百\d]+[、．.]")
CLASSICAL_EXPLANATION = re.compile(r"^(?:此[非即为方治乃亦足手药]|经曰|盖[此夫]|[方配]中|【方解】|方解)")
INLINE_LABELS = {"jingyuequanshu", "danxixinfa"}
NARRATIVE_HEADS = {"waitaimiyao", "zhouhoubeijifang", "fuqingzhunvke"}
# Distinguish the standard version from an expanded or homonymous recipe in the corpus.
PREFERRED_LOCATIONS = {
    "越鞠丸": ("danxixinfa", 72),
    "贝母瓜蒌散": ("yixuexinwu", 365),
    "白术散": ("xiaoeryaozhengzhijue", 95),
    "异功散": ("xiaoeryaozhengzhijue", 157),
    "桂枝加龙骨牡蛎汤": ("jinguiyaolue", 9),
}
SOURCE_ALIASES = {
    ("xiaoeryaozhengzhijue", 95): ["七味白术散", "钱氏白术散"],
    ("xiaoeryaozhengzhijue", 157): ["小儿异功散", "五味异功散"],
}


def formula_key(name):
    name = re.sub(r"\s+", "", unicodedata.normalize("NFKC", name))
    if len(name) > 2 and name.endswith("方") and name[-2] in FORMS:
        name = name[:-1]
    name = name.replace("黃", "黄").replace("耆", "芪").replace("䗪", "蟅")
    return ALIASES.get(name, name)


def formula_name(text):
    text = re.sub(r"^(?:辛凉[平轻重]剂|辛温[平轻重]剂|辛温复辛凉法)", "", text.strip())
    text = re.sub(r"【古注：[^】]*】$", "", text)
    text = re.sub(r"(?:[（(][^）)]{1,80}[）)])?[：:。]?$", "", text)
    text = text.strip()
    if not NAME.fullmatch(text) or BAD_TITLE.search(text) or text.endswith(("煎汤", "药丸")):
        return None
    if re.search(r"方一名|亦名|[汤散丸丹膏]治", text):
        return None
    return text[:-1] if text.endswith("方") else text


def first_batch(path):
    with ZipFile(path) as package:
        root = ElementTree.fromstring(package.read("word/document.xml"))
    for row in root.findall(".//w:tbl/w:tr", WORD_NS):
        cells = [
            "\n".join(
                "".join(t.text or "" for t in line.findall(".//w:t", WORD_NS))
                for line in cell.findall("./w:p", WORD_NS)
            ).strip()
            for cell in row.findall("./w:tc", WORD_NS)
        ]
        if cells[0].isdigit():
            yield (None, cells)


def second_batch(path):
    with pdfplumber.open(path) as document:
        for page in document.pages:
            for table in page.extract_tables():
                for row in table:
                    if (row[0] or "").strip().isdigit():
                        yield (page.page_number, [re.sub(r"\s+", "", value or "") for value in row])


def official_rows(table, batch, count, url):
    rows = []
    for page, row in table:
        number, name, attribution, composition, preparation, form = row
        if int(number) != len(rows) + 1 or not all(row):
            raise ValueError(f"Official list {batch} contains a missing or incomplete row at {number}")
        book = re.search(r"《([^》]+)》", attribution)
        if not book:
            raise ValueError(f"Official list {batch} contains an unidentified source at {number}")
        quotations = re.findall(r"“([^”]+)”|「([^」]+)」", attribution)
        indication = "\n".join(a or b for a, b in quotations) if quotations else attribution
        source = {"type": "official", "batch": batch, "number": int(number), "url": url}
        if page:
            source["page"] = page
        rows.append({
            "name": name, "book": book[1], "composition": composition,
            "preparation": preparation, "indication": indication, "commentary": None,
            "source": source, "form": form, "location": f"官方目录第{batch}批第{number}首",
        })
    if len(rows) != count:
        raise ValueError(f"Official list {batch} has {len(rows)} entries, expected {count}")
    return rows


def composition_parts(line):
    if not line or INDICATION.match(line) or METHOD.match(line) or NUMBERED.match(line):
        return None
    if UNREADABLE.search(line) or re.match(r"^(?:治|疗|论|按|其|今|若|凡|此|方用|一方|又方|一名|出《)", line):
        return None
    # Some books run the ingredient list and preparation together in one paragraph.
    split = INLINE_METHOD.split(line, maxsplit=1)
    head = split[0].strip()
    if not 4 <= len(head) <= 650:
        return None
    outside_brackets = re.sub(r"（[^（）]*）|\([^()]*\)|〔[^〔〕]*〕|【[^【】]*】", "", head)
    if re.search(r"[。；]|(?:此方|主之|治之|不可|各家|方见|前方|本方|一方|为末|水煎|每服|上[一二三四五六七八九十]+味)", outside_brackets.rstrip("。；")):
        return None
    if not DOSE.search(head):
        return None
    if not re.match(r"^[\u3400-\u9fff]{2,}", outside_brackets):
        return None
    return (head, split[1].strip() if len(split) > 1 else None)


def explicit_indication(line, name):
    if INDICATION.match(line) or re.match(r"^[\u3400-\u9fff]{2,8}[，。]治", line):
        return True
    return bool(re.search(re.escape(name) + r"(?:方)?(?:主之|与之|宜之)|(?:宜|用|主以|方用)" + re.escape(name), line))


def make_candidate(book, chapter, name, lines, numbers, previous, title_based):
    for index, line in enumerate(lines[:7]):
        if index and formula_name(line):
            return None
        if index and METHOD.match(line):
            return None
        composition = composition_parts(line)
        if composition is None:
            continue
        before = lines[:index]
        after = lines[index + 1:]
        prep = composition[1]
        prep_offset = 0
        if not prep and after and METHOD.match(after[0]) and not UNREADABLE.search(after[0]):
            prep, prep_offset = after[0], 1
        if title_based and len(after) > prep_offset and composition_parts(after[prep_offset]):
            # A single extracted line would omit a later ingredient group.
            return None
        indication = next((value for value in before if explicit_indication(value, name)), None)
        if not indication and title_based and prep_offset and len(after) > 1:
            if explicit_indication(after[1], name) and not formula_name(after[1]):
                indication = after[1]
        if not indication:
            indication = next((value for value in reversed(previous) if explicit_indication(value, name)
                               and name in value), None)
        commentary = None
        if book["key"] in {"yifangjijie", "yifangkao"}:
            commentary = next((value for value in after[prep_offset:]
                               if CLASSICAL_EXPLANATION.match(value) and not UNREADABLE.search(value)), None)
        if indication and (len(indication) > 950 or UNREADABLE.search(indication)):
            indication = None
        if not prep and not indication:
            return None
        source = {
            "type": "corpus", "book_key": book["key"], "chapter_key": chapter["chapter_key"],
            "line": numbers[index], "url": chapter["source_url"],
        }
        location = " · ".join(dict.fromkeys(value for value in (chapter["volume"], chapter["title"]) if value))
        return {
            "name": name, "book": book["name"], "composition": composition[0],
            "preparation": prep, "indication": indication, "commentary": commentary,
            "source": source, "form": None, "location": location,
            "chapter_order": chapter["order"],
        }
    return None


def catalogue_candidates(book, chapter):
    entries = [(index, line.strip()) for index, line in
               enumerate(chapter["content"].splitlines(), 1) if line.strip()]
    numbers = [number for number, _ in entries]
    lines = [line for _, line in entries]
    title = formula_name(chapter["title"])
    if title:
        candidate = make_candidate(book, chapter, title, lines, numbers, [], True)
        if candidate:
            yield candidate
    if book["key"] not in EMBEDDED:
        return
    for index, line in enumerate(lines[:-1]):
        name = formula_name(line)
        previous = lines[max(0, index - 8):index]
        if not name and book["key"] in NARRATIVE_HEADS:
            match = re.search(
                r"(?:方用|，(?=[^，。]*方[：:。]$))([\u3400-\u9fff]{2,12}[" + FORMS + r"])(?:方)?[：:。]?$",
                line,
            )
            if match:
                name = formula_name(match[1])
                if name:
                    previous = [*previous, line]
        heading_indication = None
        if not name and book["key"] in INLINE_LABELS:
            label, separator, content = line.partition(" ")
            if separator and formula_name(label) and re.match(r"^(?:治|主|解诸|此[壮益]|凡|补)", content):
                name = formula_name(label)
                heading_indication = content
        if not name:
            continue
        if len(name) > 9 and book["key"] not in {"shanghanlun", "jinguiyaolue", "yizongjinjian"}:
            continue
        candidate = make_candidate(book, chapter, name, lines[index + 1:index + 7],
                                   numbers[index + 1:index + 7], previous, False)
        if candidate:
            if heading_indication:
                candidate["indication"] = heading_indication
            yield candidate


def corpus_rows():
    candidates = defaultdict(list)
    for key in BOOKS:
        data = json.loads((CORPUS / f"{key}.json").read_bytes())
        for chapter in data["chapters"]:
            for candidate in catalogue_candidates(data["book"], chapter):
                candidates[formula_key(candidate["name"])].append(candidate)
    song = json.loads((CORPUS / "tangtougejue.json").read_bytes())
    indexed_names = {formula_key(chapter["title"]) for chapter in song["chapters"]}
    preferred_names = {formula_key(name) for name in PREFERRED}
    for key, variants in candidates.items():
        independent_sources = len({row["book"] for row in variants})
        frequency = min(5, independent_sources - 1)
        for row in variants:
            row["priority"] = (
                BOOKS[row["source"]["book_key"]][0] + 24 * frequency
                + 36 * (key in indexed_names) + 60 * (key in preferred_names)
                + 12 * bool(row["indication"]) + 8 * bool(row["preparation"])
                + 110 * (PREFERRED_LOCATIONS.get(key) == (row["source"]["book_key"], row["chapter_order"]))
            )
    return sorted(
        (row for variants in candidates.values() for row in variants),
        key=lambda row: (-row["priority"], row["chapter_order"], row["source"]["line"], row["name"]),
    )


def unique_selection(official, candidates):
    selected = list(official)
    names = {formula_key(row["name"]) for row in official}
    if len(names) != len(official):
        raise ValueError("An official entry was unexpectedly merged by the name normalization")
    compositions = {re.sub(r"[\s。；、，,]", "", row["composition"]) for row in official}
    books = Counter()
    for row in candidates:
        key = formula_key(row["name"])
        composition_key = re.sub(r"[\s。；、，,]", "", row["composition"])
        book_key = row["source"]["book_key"]
        if key in names or (len(composition_key) >= 12 and composition_key in compositions):
            continue
        if books[book_key] >= BOOKS[book_key][1]:
            continue
        selected.append(row)
        names.add(key)
        compositions.add(composition_key)
        books[book_key] += 1
        if len(selected) == COUNT:
            break
    if len(selected) != COUNT:
        raise ValueError(f"Only {len(selected)} unique entries could be substantiated")
    return selected


def catalogue_record(row, position):
    tags = ["古籍方剂"]
    if row["form"]:
        tags.append(row["form"])
    if row["source"]["type"] == "official":
        tags.append(f"经典名方第{row['source']['batch']}批")
    name_key = formula_key(row["name"])
    if re.sub(r"[\s·]", "", row["name"]) != name_key:
        tags.append(name_key)
    tags.extend(alias for alias, canonical in ALIASES.items()
                if alias != row["name"] and canonical == name_key)
    tags.extend(SOURCE_ALIASES.get((row["source"].get("book_key"), row.get("chapter_order")), []))
    explanation = "原方组成（古籍原单位）\n" + row["composition"]
    if row["commentary"]:
        explanation += "\n\n古籍方解\n" + row["commentary"]
    explanation += "\n\n文献位置\n《" + row["book"] + "》"
    if row["location"]:
        explanation += " · " + row["location"]
    initials = "".join(lazy_pinyin(row["name"], style=Style.FIRST_LETTER, errors="ignore"))
    return {
        "id": position, "name": row["name"], "modern_dose": None,
        "decoction": row["preparation"], "indications": row["indication"],
        "explanation": explanation, "cited": row["book"], "tags": "、".join(tags),
        "abbreviation": initials, "item_order": f"{position:04d}", "source": row["source"],
    }


def verify_corpus_references(entries):
    chapters = {}
    for entry in entries:
        source = entry["source"]
        if source["type"] != "corpus":
            continue
        key = source["book_key"]
        if key not in chapters:
            data = json.loads((CORPUS / f"{key}.json").read_bytes())
            chapters[key] = {row["chapter_key"]: row for row in data["chapters"]}
        chapter = chapters[key][source["chapter_key"]]
        line = chapter["content"].splitlines()[source["line"] - 1]
        if entry["composition"] not in line or any(
            value and value not in chapter["content"]
            for value in (entry["preparation"], entry["indication"], entry["commentary"])
        ):
            raise ValueError(f"Excerpt does not match source for {entry['name']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("first_batch_docx", type=Path)
    parser.add_argument("second_batch_pdf", type=Path)
    parser.add_argument("--output", type=Path, default=DESTINATION)
    args = parser.parse_args()
    official = official_rows(first_batch(args.first_batch_docx), 1, 100, FIRST_URL)
    official += official_rows(second_batch(args.second_batch_pdf), 2, 93, SECOND_URL)
    candidates = corpus_rows()
    print(f"Eligible corpus excerpts: {len(candidates)}", flush=True)
    rows = unique_selection(official, candidates)
    verify_corpus_references(rows)
    records = [catalogue_record(row, position) for position, row in enumerate(rows, 1)]
    data = {
        "official_source_sha256": {
            "1": hashlib.sha256(args.first_batch_docx.read_bytes()).hexdigest(),
            "2": hashlib.sha256(args.second_batch_pdf.read_bytes()).hexdigest(),
        },
        "records": records,
    }
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Sources:", Counter(row["book"] for row in rows))
    print("Indications:", sum(bool(row["indication"]) for row in rows))
    print("Preparation:", sum(bool(row["preparation"]) for row in rows))


if __name__ == "__main__":
    main()
