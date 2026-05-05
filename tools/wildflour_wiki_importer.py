#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wildflour Wiki Table Importer

用途：
  把 wildfloursateliergoods.wiki.gg 上复制出来的英文表格文本，转换成前端可导入的 JSON。
  适合 Advanced 固定售价表。Simple / Varies by Ingredients 会被跳过或标记。

推荐流程：
  1. 从 wiki 复制某个机器的英文表格。
  2. 保存成 pasted.txt。
  3. 运行本脚本生成 JSON。
  4. 在前端用“合并导入 JSON”，或用 --merge-into 直接合并进 src/data/wildflour-db.json。

示例：
  python wildflour_wiki_importer.py \
    --input pasted.txt \
    --output imports/confectioner_frozen_treat_machine.json \
    --module confectioner \
    --module-zh 糖果师 \
    --mode advanced \
    --mode-zh 高级 \
    --machine-id frozen_treat_machine \
    --machine-name "Frozen Treat Machine" \
    --machine-zh 冰品机 \
    --subcategory "Advanced Ice Cream" \
    --subcategory-zh 高级冰淇淋 \
    --output-kind ice_cream

直接合并进项目默认数据库：
  python wildflour_wiki_importer.py \
    --input pasted.txt \
    --output imports/confectioner_frozen_treat_machine.json \
    --merge-into src/data/wildflour-db.json \
    --module confectioner \
    --module-zh 糖果师 \
    --mode advanced \
    --mode-zh 高级 \
    --machine-id frozen_treat_machine \
    --machine-name "Frozen Treat Machine" \
    --machine-zh 冰品机 \
    --subcategory "Advanced Ice Cream" \
    --subcategory-zh 高级冰淇淋 \
    --output-kind ice_cream
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


HEADER_WORDS = {
    "image",
    "name",
    "description",
    "ingredients",
    "processing time",
    "sell price",
    "energy / health",
    "energy",
    "health",
}

GENERIC_INPUT_TAGS = {
    "any egg": ["generic_input", "egg"],
    "any fruit": ["generic_input", "fruit"],
    "any edible flower": ["generic_input", "flower"],
    "any flower": ["generic_input", "flower"],
    "any vegetable": ["generic_input", "vegetable"],
    "any fish": ["generic_input", "fish"],
    "any milk": ["generic_input", "milk", "dairy"],
    "any ice cream made in the frozen treat machine": [
        "generic_input",
        "ice_cream",
        "frozen_treat",
        "crafted_output",
    ],
}

FRUIT_WORDS = {
    "apple", "banana", "blackberry", "blueberry", "cherry", "lime", "lemon",
    "mango", "orange", "peach", "pomegranate", "raspberry", "strawberry",
    "starfruit", "ancient fruit", "pumpkin", "coconut", "cranberry", "grape",
}
NUT_WORDS = {"walnut", "almond", "pistachio", "hazelnut", "pecan", "nut"}
DAIRY_WORDS = {"cream", "butter", "buttermilk", "milk", "cheese", "yogurt"}
SWEETENER_WORDS = {"sugar", "honey", "syrup", "molasses"}
SPICE_HERB_WORDS = {
    "cinnamon", "vanilla", "mint", "lavender", "ginger", "basil", "sage",
    "rosemary", "thyme", "clove", "nutmeg",
}


def to_id(name: str) -> str:
    """Convert display name to stable snake_case id."""
    name = name.strip()
    name = name.replace("’", "'")
    name = re.sub(r"'s\b", "_s", name, flags=re.IGNORECASE)
    name = re.sub(r"[^A-Za-z0-9]+", "_", name.lower())
    name = re.sub(r"_+", "_", name).strip("_")
    return name


def normalize_tag(tag: str) -> str:
    return to_id(tag)


def unique_keep_order(values: List[str]) -> List[str]:
    seen = set()
    result = []
    for value in values:
        value = normalize_tag(value)
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def parse_int(text: str) -> Optional[int]:
    match = re.search(r"([\d,]+)", text)
    if not match:
        return None
    return int(match.group(1).replace(",", ""))


def parse_minutes(text: str) -> Optional[int]:
    match = re.search(r"(\d+)\s*m\b", text, flags=re.IGNORECASE)
    if not match:
        # 中文复制有时是 480米
        match = re.search(r"(\d+)\s*米\b", text)
    return int(match.group(1)) if match else None


def parse_price(text: str) -> Optional[int]:
    # Fixed-price Advanced tables usually contain "Gold.png\n1,360g" or similar.
    match = re.search(r"([\d,]+)\s*g\b", text, flags=re.IGNORECASE)
    if not match:
        # 中文复制有时是 1,360克
        match = re.search(r"([\d,]+)\s*克\b", text)
    return int(match.group(1).replace(",", "")) if match else None


def parse_energy_health(text: str) -> Tuple[Optional[int], Optional[int]]:
    energy = None
    health = None

    energy_match = re.search(r"Energy\.png\s*(\d+)", text, flags=re.IGNORECASE)
    health_match = re.search(r"Health\.png\s*(\d+)", text, flags=re.IGNORECASE)

    if energy_match:
        energy = int(energy_match.group(1))
    if health_match:
        health = int(health_match.group(1))

    # Fallback: after price, many pasted rows end with Energy.png 50 Health.png 22.
    if energy is None or health is None:
        numbers = [int(n) for n in re.findall(r"(?<![\d,])(\d{1,4})(?![\d,])", text)]
        # Avoid using minutes and price by taking final two small numbers if present.
        if len(numbers) >= 2:
            if energy is None:
                energy = numbers[-2]
            if health is None:
                health = numbers[-1]

    return energy, health


def clean_image_filenames(text: str) -> str:
    # Remove wiki image filename noise while preserving item names after the filename.
    # Example: "Banana.png Banana (1)" -> "Banana (1)"
    text = re.sub(r"[\w\s'’&.,:;!()\-]+?\.png\s*", "", text)
    return text


def parse_ingredients(raw_ingredient_text: str) -> List[Dict[str, Any]]:
    """
    Parse ingredients into:
      [{ "itemId": "banana", "qty": 1 }]
    or generic:
      [{ "tag": "fruit", "qty": 1, "name": "Any Fruit" }]

    The frontend currently understands itemId best. Generic tag inputs are included for future support.
    """
    text = clean_image_filenames(raw_ingredient_text)
    text = text.replace("✶", " ")
    text = re.sub(r"\bor\b", "\n", text, flags=re.IGNORECASE)

    ingredients: List[Dict[str, Any]] = []

    for match in re.finditer(r"([^()\n\t]+?)\s*\((\d+)\)", text):
        name = re.sub(r"\s+", " ", match.group(1)).strip(" -–—:")
        qty = int(match.group(2))

        if not name:
            continue

        lower = name.lower()
        generic_tags = GENERIC_INPUT_TAGS.get(lower)
        if generic_tags:
            ingredients.append({
                "tag": generic_tags[-1] if generic_tags else to_id(name),
                "name": name,
                "itemId": to_id(name),  # fallback for current frontend
                "qty": qty,
                "isGeneric": True,
                "acceptedTags": unique_keep_order(generic_tags),
            })
        else:
            ingredients.append({
                "itemId": to_id(name),
                "name": name,
                "qty": qty,
            })

    return ingredients


@dataclass
class ParsedRow:
    name: str
    description: str
    ingredients_raw: str
    minutes: Optional[int]
    price: Optional[int]
    energy: Optional[int]
    health: Optional[int]
    raw: str


def looks_like_row_start(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False

    parts = stripped.split("\t")

    # Most wiki copied rows start like:
    #   Output Image.png<TAB>Output Name<TAB>Description<TAB>Ingredients...
    # Ingredient continuation lines can also contain ".png" and tabs:
    #   Cream.png Cream (1)<TAB>Time Icon.png 480m...
    # So we only treat it as a new row if the first cell is an image filename,
    # not an ingredient cell containing "(1)".
    if len(parts) >= 3 and ".png" in parts[0]:
        first = parts[0].strip()
        second = parts[1].strip().lower()
        if "(" not in first and not second.startswith(("time icon", "时间icon", "gold", "energy", "health")):
            return True

    # Fallback for poorly copied rows with spaces instead of tabs.
    # Keep this conservative to avoid splitting ingredient lines.
    if "\t" not in stripped:
        return False

    if re.match(r"^.+?\.png\s+.+", stripped) and not stripped.lower().startswith(("time icon", "时间icon", "gold", "energy", "health")):
        before_tab = stripped.split("\t", 1)[0]
        return "(" not in before_tab

    return False


def is_section_or_header(line: str) -> bool:
    stripped = line.strip()
    lower = stripped.lower()
    if not stripped:
        return True
    if lower in HEADER_WORDS:
        return True
    if "\t".join(["image", "name", "description"]) in lower:
        return True
    if lower.startswith("these items can only be made"):
        return True
    if lower in {"barista", "confectioner", "smoothies", "milkshakes", "simple products", "advanced products"}:
        return True
    return False


def split_rows(raw_text: str) -> List[str]:
    lines = [line.rstrip() for line in raw_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    rows: List[List[str]] = []
    current: List[str] = []

    for line in lines:
        if not line.strip():
            continue

        if looks_like_row_start(line):
            if current:
                rows.append(current)
            current = [line]
        else:
            if current:
                current.append(line)
            # If no current row yet, ignore headings/explanatory lines.

    if current:
        rows.append(current)

    return ["\n".join(row) for row in rows]


def parse_row(row_text: str) -> Optional[ParsedRow]:
    row_text = row_text.strip()
    if not row_text:
        return None

    # Strategy 1: tab-based row.
    first_line = row_text.split("\n", 1)[0]
    parts = first_line.split("\t")

    name = ""
    description = ""
    after_description = ""

    if len(parts) >= 4:
        # parts[0] is image filename, parts[1] name, parts[2] description, parts[3...] starts ingredients
        name = parts[1].strip()
        description = parts[2].strip()
        rest_first = "\t".join(parts[3:])
        rest_other = row_text.split("\n", 1)[1] if "\n" in row_text else ""
        after_description = rest_first + "\n" + rest_other
    else:
        # Strategy 2: fallback regex.
        # Try to remove the first image filename and split around the first repeated item name.
        no_first_img = re.sub(r"^.+?\.png\s*", "", row_text, count=1)
        # Hard fallback: take text before first double-space / tab / description markers.
        chunks = re.split(r"\t+", no_first_img, maxsplit=3)
        if len(chunks) >= 3:
            name = chunks[0].strip()
            description = chunks[1].strip()
            after_description = chunks[2] if len(chunks) == 3 else chunks[2] + "\n" + chunks[3]
        else:
            return None

    if not name or name.lower() in HEADER_WORDS:
        return None

    minutes = parse_minutes(row_text)
    price = parse_price(row_text)
    energy, health = parse_energy_health(row_text)

    # Ingredient text is between description and processing time marker.
    ingredient_text = after_description
    time_marker = re.search(r"(Time Icon|时间Icon|Processing Time|时间)", ingredient_text, flags=re.IGNORECASE)
    if time_marker:
        ingredient_text = ingredient_text[:time_marker.start()]

    # If row has variable price, price will be None. Advanced fixed-price importer will skip it unless requested.
    return ParsedRow(
        name=name,
        description=description,
        ingredients_raw=ingredient_text,
        minutes=minutes,
        price=price,
        energy=energy,
        health=health,
        raw=row_text,
    )


def infer_input_tags(name: str, is_generic: bool = False, accepted_tags: Optional[List[str]] = None) -> List[str]:
    lower = name.lower()
    tags = ["ingredient", "basic_material", "used_as_input"]

    if is_generic:
        tags.append("generic_input")
    if accepted_tags:
        tags.extend(accepted_tags)

    if any(word in lower for word in FRUIT_WORDS):
        tags.append("fruit")
    if any(word in lower for word in NUT_WORDS):
        tags.append("nut")
    if any(word in lower for word in DAIRY_WORDS):
        tags.append("dairy")
    if any(word in lower for word in SWEETENER_WORDS):
        tags.append("sweetener")
    if any(word in lower for word in SPICE_HERB_WORDS):
        tags.append("spice_or_herb")
    if "egg" in lower:
        tags.append("egg")
    if "coffee" in lower:
        tags.append("coffee")
    if "cacao" in lower or "cocoa" in lower or "chocolate" in lower:
        tags.append("cacao")
    if "ice cream" in lower:
        tags.extend(["ice_cream", "crafted_output", "product"])

    return unique_keep_order(tags)


def output_tags_from_args(args: argparse.Namespace) -> List[str]:
    tags = [
        args.module,
        args.mode,
        args.machine_id,
        args.subcategory,
        args.output_kind,
        "crafted_output",
        "product",
    ]

    kind = normalize_tag(args.output_kind)
    subcategory = normalize_tag(args.subcategory)

    # Normalize plural wiki terms into singular tags for frontend filtering.
    if kind in {"smoothies", "smoothie"} or subcategory in {"smoothies", "smoothie"}:
        tags.extend(["smoothie", "drink"])
    if kind in {"milkshakes", "milkshake"} or subcategory in {"milkshakes", "milkshake"}:
        tags.extend(["milkshake", "drink"])
    if kind in {"ice_cream", "ice_creams"} or "ice_cream" in subcategory:
        tags.extend(["ice_cream", "frozen_treat"])

    return unique_keep_order(tags)


def build_db(parsed_rows: List[ParsedRow], args: argparse.Namespace) -> Dict[str, Any]:
    items: Dict[str, Dict[str, Any]] = {}
    recipes: Dict[str, Dict[str, Any]] = {}

    output_tags = output_tags_from_args(args)
    default_minutes = 0

    for row in parsed_rows:
        if row.price is None and args.skip_variable:
            continue

        output_id = to_id(row.name)
        price = row.price or 0
        if row.minutes and not default_minutes:
            default_minutes = row.minutes

        item = {
            "id": output_id,
            "name": row.name,
            "zh": args.zh_map.get(row.name, "") if args.zh_map else "",
            "category": args.output_category,
            "categoryZh": args.output_category_zh,
            "subcategory": args.subcategory,
            "subcategoryZh": args.subcategory_zh,
            "basePrice": price,
            "tags": output_tags,
            "description": row.description,
            "descriptionZh": args.desc_zh_map.get(row.name, "") if args.desc_zh_map else "",
        }

        if row.energy is not None:
            item["energy"] = row.energy
        if row.health is not None:
            item["health"] = row.health
        if row.price is None:
            item["priceType"] = "variable"

        items[output_id] = item

        parsed_ingredients = parse_ingredients(row.ingredients_raw)
        inputs = []
        for ing in parsed_ingredients:
            input_id = ing.get("itemId") or to_id(ing.get("name", ""))
            input_name = ing.get("name") or input_id.replace("_", " ").title()

            inputs.append({
                key: value for key, value in ing.items()
                if key in {"itemId", "tag", "qty", "isGeneric", "acceptedTags"}
            })

            if input_id not in items:
                input_tags = infer_input_tags(
                    input_name,
                    is_generic=bool(ing.get("isGeneric")),
                    accepted_tags=ing.get("acceptedTags") or None,
                )

                input_item = {
                    "id": input_id,
                    "name": input_name,
                    "zh": args.zh_map.get(input_name, "") if args.zh_map else "",
                    "category": "Ingredient",
                    "categoryZh": "原料",
                    "basePrice": 0,
                    "tags": input_tags,
                }

                if ing.get("isGeneric"):
                    input_item["isGeneric"] = True
                    input_item["acceptedTags"] = ing.get("acceptedTags", [])

                items[input_id] = input_item

        recipe_id = f"{normalize_tag(args.module)}_{normalize_tag(args.mode)}_{normalize_tag(args.machine_id)}_{output_id}"
        recipe = {
            "id": recipe_id,
            "name": item["zh"] or row.name,
            "nameEn": row.name,
            "machineId": args.machine_id,
            "inputs": inputs,
            "output": {
                "itemId": output_id,
                "qty": 1,
            },
            "minutes": row.minutes or args.default_minutes or default_minutes or 0,
            "module": args.module,
            "moduleZh": args.module_zh,
            "mode": args.mode,
            "modeZh": args.mode_zh,
            "subcategory": args.subcategory,
            "subcategoryZh": args.subcategory_zh,
            "source": args.source,
            "description": row.description,
            "descriptionZh": item.get("descriptionZh", ""),
        }

        if row.energy is not None:
            recipe["energy"] = row.energy
        if row.health is not None:
            recipe["health"] = row.health
        if row.price is None:
            recipe["priceType"] = "variable"

        recipes[recipe_id] = recipe

    machine_tags = unique_keep_order([
        args.module,
        args.machine_id,
        args.output_kind,
        args.subcategory,
    ])
    machine = {
        "id": args.machine_id,
        "name": args.machine_name,
        "zh": args.machine_zh,
        "defaultMinutes": args.default_minutes or default_minutes or 0,
        "module": args.module,
        "moduleZh": args.module_zh,
        "tags": machine_tags,
    }

    return {
        "items": list(items.values()),
        "machines": [machine],
        "recipes": list(recipes.values()),
    }


def merge_by_id(old_list: List[Dict[str, Any]], new_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}
    for item in old_list:
        if isinstance(item, dict) and item.get("id"):
            merged[item["id"]] = item

    for item in new_list:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        item_id = item["id"]
        previous = merged.get(item_id, {})
        combined = {**previous, **item}

        # Merge tags instead of replacing them.
        if isinstance(previous.get("tags"), list) or isinstance(item.get("tags"), list):
            combined["tags"] = unique_keep_order(
                list(previous.get("tags") or []) + list(item.get("tags") or [])
            )

        merged[item_id] = combined

    return list(merged.values())


def merge_db(old_db: Dict[str, Any], new_db: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "items": merge_by_id(old_db.get("items", []), new_db.get("items", [])),
        "machines": merge_by_id(old_db.get("machines", []), new_db.get("machines", [])),
        "recipes": merge_by_id(old_db.get("recipes", []), new_db.get("recipes", [])),
    }


def load_json_map(path: Optional[str]) -> Dict[str, str]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"找不到翻译表：{p}")
    data = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("翻译表必须是 JSON object，例如 {\"Cream\": \"奶油\"}")
    return {str(k): str(v) for k, v in data.items()}


def validate_db(db: Dict[str, Any]) -> None:
    for key in ["items", "machines", "recipes"]:
        if key not in db or not isinstance(db[key], list):
            raise ValueError(f"数据库 JSON 需要包含数组字段：{key}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert pasted Wildflour wiki English table text into tagged JSON."
    )

    parser.add_argument("--input", required=True, help="从 wiki 复制并保存的 .txt 文件")
    parser.add_argument("--output", required=True, help="生成的导入 JSON 文件")
    parser.add_argument("--merge-into", default="", help="可选：直接合并进现有数据库，例如 src/data/wildflour-db.json")

    parser.add_argument("--module", required=True, help="模块英文，例如 barista / confectioner")
    parser.add_argument("--module-zh", default="", help="模块中文，例如 咖啡师 / 糖果师")
    parser.add_argument("--mode", default="advanced", help="难度英文，默认 advanced")
    parser.add_argument("--mode-zh", default="高级", help="难度中文，默认 高级")

    parser.add_argument("--machine-id", required=True, help="机器 ID，例如 frozen_treat_machine")
    parser.add_argument("--machine-name", required=True, help="机器英文名，例如 Frozen Treat Machine")
    parser.add_argument("--machine-zh", default="", help="机器中文名，例如 冰品机")
    parser.add_argument("--default-minutes", type=int, default=0, help="默认加工时间；留空则从表格第一条提取")

    parser.add_argument("--subcategory", default="", help="子分类英文，例如 Advanced Ice Cream / Smoothies")
    parser.add_argument("--subcategory-zh", default="", help="子分类中文，例如 高级冰淇淋 / 冰沙")
    parser.add_argument("--output-kind", default="", help="输出类型标签，例如 smoothie / milkshake / ice_cream")
    parser.add_argument("--output-category", default="Wildflour Product", help="成品 category")
    parser.add_argument("--output-category-zh", default="成品", help="成品 categoryZh")

    parser.add_argument("--source", default="Wildflour wiki pasted English table", help="source 字段")
    parser.add_argument("--translations", default="", help="可选：英文物品名到中文名的 JSON 映射")
    parser.add_argument("--description-translations", default="", help="可选：英文物品名到中文描述的 JSON 映射")
    parser.add_argument("--include-variable", action="store_true", help="包含 Varies by Ingredients 这类可变售价行；默认跳过")
    parser.add_argument("--dry-run", action="store_true", help="只打印摘要，不写文件")

    args = parser.parse_args()
    args.skip_variable = not args.include_variable
    args.zh_map = load_json_map(args.translations)
    args.desc_zh_map = load_json_map(args.description_translations)
    return args


def main() -> None:
    args = parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise FileNotFoundError(f"找不到输入文件：{input_path}")

    raw_text = input_path.read_text(encoding="utf-8-sig")
    row_texts = split_rows(raw_text)
    parsed_rows = []

    skipped_unparsed = 0
    skipped_variable = 0

    for row_text in row_texts:
        row = parse_row(row_text)
        if not row:
            skipped_unparsed += 1
            continue
        if row.price is None and args.skip_variable:
            skipped_variable += 1
            continue
        parsed_rows.append(row)

    db = build_db(parsed_rows, args)

    if args.dry_run:
        print("Dry run 完成：")
        print(f"  识别原始行：{len(row_texts)}")
        print(f"  解析配方：{len(parsed_rows)}")
        print(f"  跳过无法解析：{skipped_unparsed}")
        print(f"  跳过可变售价：{skipped_variable}")
        print(f"  输出物品：{len(db['items'])}")
        print(f"  输出机器：{len(db['machines'])}")
        print(f"  输出配方：{len(db['recipes'])}")
        if parsed_rows[:3]:
            print("  示例：")
            for row in parsed_rows[:3]:
                print(f"    - {row.name}: {row.minutes}m, {row.price}g")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"已生成导入 JSON：{output_path}")
    print(f"  识别原始行：{len(row_texts)}")
    print(f"  解析配方：{len(parsed_rows)}")
    print(f"  跳过无法解析：{skipped_unparsed}")
    print(f"  跳过可变售价：{skipped_variable}")
    print(f"  输出物品：{len(db['items'])}")
    print(f"  输出机器：{len(db['machines'])}")
    print(f"  输出配方：{len(db['recipes'])}")

    if args.merge_into:
        merge_path = Path(args.merge_into)
        if merge_path.exists():
            old_db = json.loads(merge_path.read_text(encoding="utf-8-sig"))
            validate_db(old_db)
        else:
            old_db = {"items": [], "machines": [], "recipes": []}
            merge_path.parent.mkdir(parents=True, exist_ok=True)

        merged = merge_db(old_db, db)

        if merge_path.exists():
            backup_path = merge_path.with_suffix(merge_path.suffix + ".bak")
            shutil.copy2(merge_path, backup_path)
            print(f"已生成备份：{backup_path}")

        merge_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"已合并进数据库：{merge_path}")
        print(f"  合并后物品：{len(merged['items'])}")
        print(f"  合并后机器：{len(merged['machines'])}")
        print(f"  合并后配方：{len(merged['recipes'])}")


if __name__ == "__main__":
    main()
