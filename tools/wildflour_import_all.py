#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wildflour 批量导入包装脚本

放置位置：
  wildflour-profit-planner/tools/wildflour_import_all.py

用途：
  自动扫描 imports/*.txt，根据文件名套用导入参数，然后依次调用：
  tools/wildflour_wiki_importer.py

默认行为：
  - 只导入 SAFE_PROFILES 里已登记的文件
  - 自动合并进 src/data/wildflour-db.json
  - 每次合并时原导入器会生成 src/data/wildflour-db.json.bak
  - 跳过 pick1 / variable / byproduct-heavy / produce_packer 等暂不精准支持的文件

运行：
  python tools/wildflour_import_all.py

预览，不写入：
  python tools/wildflour_import_all.py --dry-run

查看会处理哪些文件：
  python tools/wildflour_import_all.py --list

导入某个文件：
  python tools/wildflour_import_all.py --only confectioner_advanced_blast_chiller_popsicles.txt
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IMPORTER = ROOT / "tools" / "wildflour_wiki_importer.py"
IMPORTS_DIR = ROOT / "imports"
DB_PATH = ROOT / "src" / "data" / "wildflour-db.json"


# 只放“当前脚本可较安全处理”的固定售价文件。
# key 必须等于 imports 里的 txt 文件名。
SAFE_PROFILES = {
    # Brewer
    "brewer_advanced_ale_keg.txt": {
        "module": "brewer",
        "module_zh": "酿酒师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "ale_keg",
        "machine_name": "Ale Keg",
        "machine_zh": "艾尔酒桶",
        "subcategory": "Ale Keg",
        "subcategory_zh": "艾尔啤酒",
        "output_kind": "ale",
        "output_category": "Brewer Product",
        "output_category_zh": "酿酒师成品",
    },
    "brewer_advanced_artisan_mead_keg.txt": {
        "module": "brewer",
        "module_zh": "酿酒师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "artisan_mead_keg",
        "machine_name": "Artisan Mead Keg",
        "machine_zh": "手工蜂蜜酒桶",
        "subcategory": "Artisan Mead Keg",
        "subcategory_zh": "蜂蜜酒",
        "output_kind": "mead",
        "output_category": "Brewer Product",
        "output_category_zh": "酿酒师成品",
    },

    # Confectioner / Blast Chiller
    "confectioner_advanced_blast_chiller_ice_cream_sandwiches.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "blast_chiller",
        "machine_name": "Blast Chiller",
        "machine_zh": "急速冷冻机",
        "subcategory": "Ice Cream Sandwiches",
        "subcategory_zh": "冰淇淋三明治",
        "output_kind": "ice_cream_sandwich",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },
    "confectioner_advanced_blast_chiller_popsicles.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "blast_chiller",
        "machine_name": "Blast Chiller",
        "machine_zh": "急速冷冻机",
        "subcategory": "Popsicles",
        "subcategory_zh": "冰棒",
        "output_kind": "popsicle",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },

    # Confectioner / Candy Jar
    "confectioner_advanced_candy_jar_gumballs.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "candy_jar",
        "machine_name": "Candy Jar",
        "machine_zh": "糖果罐",
        "subcategory": "Gumballs",
        "subcategory_zh": "口香糖球",
        "output_kind": "gumball",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },

    # Confectioner / Chocolatier Barrel
    "confectioner_advanced_chocolatier_barrel_chocolate_bars.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "chocolatier_barrel",
        "machine_name": "Chocolatier Barrel",
        "machine_zh": "巧克力师桶",
        "subcategory": "Chocolate Bars",
        "subcategory_zh": "巧克力棒",
        "output_kind": "chocolate_bar",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },
    "confectioner_advanced_chocolatier_barrel_chocolate_dipped_treats.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "chocolatier_barrel",
        "machine_name": "Chocolatier Barrel",
        "machine_zh": "巧克力师桶",
        "subcategory": "Chocolate Dipped Treats",
        "subcategory_zh": "巧克力蘸点心",
        "output_kind": "chocolate_dipped_treat",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },
    "confectioner_advanced_chocolatier_barrel_chocolate_truffles.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "chocolatier_barrel",
        "machine_name": "Chocolatier Barrel",
        "machine_zh": "巧克力师桶",
        "subcategory": "Chocolate Truffles",
        "subcategory_zh": "巧克力松露",
        "output_kind": "chocolate_truffle",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },

    # Confectioner / Loom, Marshmallow, Sugar Boiler
    "confectioner_advanced_loom_fairy_floss.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "loom",
        "machine_name": "Loom",
        "machine_zh": "织布机",
        "subcategory": "Fairy Floss",
        "subcategory_zh": "棉花糖",
        "output_kind": "fairy_floss",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },
    "confectioner_advanced_marshmallow_mixer_marshmallows.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "marshmallow_mixer",
        "machine_name": "Marshmallow Mixer",
        "machine_zh": "棉花糖搅拌机",
        "subcategory": "Marshmallows",
        "subcategory_zh": "棉花糖",
        "output_kind": "marshmallow",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },
    "confectioner_advanced_sugar_boiler_crystal_candy.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "sugar_boiler",
        "machine_name": "Sugar Boiler",
        "machine_zh": "煮糖锅",
        "subcategory": "Crystal Candy",
        "subcategory_zh": "水晶糖",
        "output_kind": "crystal_candy",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },
    "confectioner_advanced_sugar_boiler_lollipops_candy_apples.txt": {
        "module": "confectioner",
        "module_zh": "糖果师",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "sugar_boiler",
        "machine_name": "Sugar Boiler",
        "machine_zh": "煮糖锅",
        "subcategory": "Lollipops and Candy Apples",
        "subcategory_zh": "棒棒糖与糖苹果",
        "output_kind": "lollipop",
        "output_category": "Confectioner Product",
        "output_category_zh": "糖果师成品",
    },

    # Gourmand
    "gourmand_advanced_cheese_press_cream_cheese.txt": {
        "module": "gourmand",
        "module_zh": "美食家",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "cheese_press",
        "machine_name": "Cheese Press",
        "machine_zh": "奶酪压榨机",
        "subcategory": "Cream Cheese",
        "subcategory_zh": "奶油奶酪",
        "output_kind": "cream_cheese",
        "output_category": "Gourmand Product",
        "output_category_zh": "美食家成品",
    },
    "gourmand_advanced_distiller_syrups_and_caramel.txt": {
        "module": "gourmand",
        "module_zh": "美食家",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "distiller",
        "machine_name": "Distiller",
        "machine_zh": "蒸馏器",
        "subcategory": "Syrups and Caramel",
        "subcategory_zh": "糖浆与焦糖",
        "output_kind": "syrup",
        "output_category": "Gourmand Product",
        "output_category_zh": "美食家成品",
    },
    "gourmand_advanced_mayonnaise_machine_butters_curds_cream.txt": {
        "module": "gourmand",
        "module_zh": "美食家",
        "mode": "advanced",
        "mode_zh": "高级",
        "machine_id": "mayonnaise_machine",
        "machine_name": "Mayonnaise Machine",
        "machine_zh": "蛋黄酱机",
        "subcategory": "Butters Curds and Cream",
        "subcategory_zh": "黄油凝乳与奶油",
        "output_kind": "dairy_product",
        "output_category": "Gourmand Product",
        "output_category_zh": "美食家成品",
    },
}


# 已知不建议当前批量导入的文件。保留在 imports 里也会被跳过。
SKIP_REASONS = {
    "confectioner_advanced_candy_jar_jelly_beans_pick1.txt": "含 Pick (1)，当前前端/导入器还不能精准表达多选一材料。",
    "confectioner_advanced_sugar_boiler_hard_candy_pick1.txt": "含 Pick (1)，当前前端/导入器还不能精准表达多选一材料。",
    "gourmand_advanced_distiller_variable_flavored_syrup.txt": "售价为 Varies by Ingredients。",
    "gourmand_advanced_kitchen_mortar_basic_materials.txt": "含 Byproduct / Pick (1) / 输出随采集等级变化等复杂规则。",
    "gourmand_advanced_produce_packer_baskets_crates.txt": "含 Any Fish / or / 多种泛材料复杂规则。",
}


def to_cli_args(profile: dict[str, str], input_path: Path, output_path: Path, dry_run: bool) -> list[str]:
    args = [
        sys.executable,
        str(IMPORTER),
        "--input", str(input_path),
        "--output", str(output_path),
        "--merge-into", str(DB_PATH),
        "--module", profile["module"],
        "--module-zh", profile["module_zh"],
        "--mode", profile["mode"],
        "--mode-zh", profile["mode_zh"],
        "--machine-id", profile["machine_id"],
        "--machine-name", profile["machine_name"],
        "--machine-zh", profile["machine_zh"],
        "--subcategory", profile["subcategory"],
        "--subcategory-zh", profile["subcategory_zh"],
        "--output-kind", profile["output_kind"],
        "--output-category", profile["output_category"],
        "--output-category-zh", profile["output_category_zh"],
    ]
    if dry_run:
        args.append("--dry-run")
    return args


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="只预览解析结果，不写入数据库")
    parser.add_argument("--list", action="store_true", help="列出将导入、将跳过、未知的 txt 文件")
    parser.add_argument("--only", default="", help="只处理某一个 imports 里的 txt 文件名")
    parser.add_argument("--include-unsafe", action="store_true", help="仍然不会自动配置复杂文件；这里只用于显示警告")
    args = parser.parse_args()

    if not IMPORTER.exists():
        raise FileNotFoundError(f"找不到导入器：{IMPORTER}")
    if not IMPORTS_DIR.exists():
        raise FileNotFoundError(f"找不到 imports 文件夹：{IMPORTS_DIR}")

    all_txt = sorted(IMPORTS_DIR.glob("*.txt"))
    if args.only:
        all_txt = [IMPORTS_DIR / args.only]

    safe_files = [p for p in all_txt if p.name in SAFE_PROFILES]
    skipped_files = [p for p in all_txt if p.name in SKIP_REASONS]
    unknown_files = [p for p in all_txt if p.name not in SAFE_PROFILES and p.name not in SKIP_REASONS]

    if args.list:
        print("\n将导入：")
        for p in safe_files:
            print(f"  + {p.name}")
        print("\n将跳过：")
        for p in skipped_files:
            print(f"  - {p.name}: {SKIP_REASONS[p.name]}")
        print("\n未知文件：")
        for p in unknown_files:
            print(f"  ? {p.name}: 没有登记参数，需要手动加入 SAFE_PROFILES")
        return

    print(f"项目根目录：{ROOT}")
    print(f"输入目录：{IMPORTS_DIR}")
    print(f"默认数据库：{DB_PATH}")
    print(f"模式：{'dry-run 预览' if args.dry_run else '正式合并'}")
    print()

    if skipped_files:
        print("这些文件会跳过：")
        for p in skipped_files:
            print(f"  - {p.name}: {SKIP_REASONS[p.name]}")
        print()

    if unknown_files:
        print("这些文件没有登记参数，也会跳过：")
        for p in unknown_files:
            print(f"  ? {p.name}")
        print()

    if not safe_files:
        print("没有找到可自动导入的 txt。")
        return

    imports_json_dir = IMPORTS_DIR / "generated_json"
    imports_json_dir.mkdir(parents=True, exist_ok=True)

    success = 0
    failed = 0

    for index, input_path in enumerate(safe_files, start=1):
        profile = SAFE_PROFILES[input_path.name]
        output_path = imports_json_dir / input_path.with_suffix(".json").name

        print("=" * 80)
        print(f"[{index}/{len(safe_files)}] {input_path.name}")
        print(f"机器：{profile['machine_name']} / {profile['machine_zh']}")
        print(f"分类：{profile['subcategory']} / {profile['subcategory_zh']}")

        cmd = to_cli_args(profile, input_path, output_path, args.dry_run)
        result = subprocess.run(cmd, cwd=ROOT, text=True)

        if result.returncode == 0:
            success += 1
        else:
            failed += 1
            print(f"导入失败：{input_path.name}")

    print("=" * 80)
    print(f"完成。成功：{success}，失败：{failed}")
    if not args.dry_run:
        print(f"已合并到：{DB_PATH}")
        print("前端如果仍显示旧数据，请点击页面里的“清除本地保存”，再刷新。")


if __name__ == "__main__":
    main()
