import json
from pathlib import Path
import argparse
import shutil
import json5  # 支持 JSONC，pip install pyjson5

# 项目路径
ROOT = Path('.').resolve()
MODS_DIR = ROOT / 'inputs'
OUTPUT_DB = ROOT / 'src' / 'data' / 'wildflour-db.json'
BACKUP_DB = ROOT / 'src' / 'data' / 'wildflour-db.json.bak'

# 脚本参数解析
parser = argparse.ArgumentParser()
parser.add_argument('--dry-run', action='store_true', help='只解析不写入数据库')
args = parser.parse_args()

items = []
recipes = []

# 遍历 inputs 下每个 mod 文件夹
for mod_folder in MODS_DIR.iterdir():
    if not mod_folder.is_dir():
        continue
    for json_file in mod_folder.glob('*.json'):
        try:
            with json_file.open(encoding='utf-8') as f:
                data = json5.load(f)  # 支持 JSONC，自动忽略注释和尾逗号
        except Exception as e:
            print(f'[跳过] {json_file}: 解析失败 {e}')
            continue

        for change in data.get('Changes', []):
            target = change.get('Target')
            entries = change.get('Entries', {})

            if target == 'Data/ObjectInformation':
                for k, v in entries.items():
                    parts = v.split('/')
                    items.append({
                        'id': k,
                        'name': parts[0],
                        'sell_price': int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0,
                        'category': parts[3] if len(parts) > 3 else '',
                        'energy': 50,
                        'health': 22
                    })
            elif target == 'Data/CraftingRecipes':
                for k, v in entries.items():
                    recipe_parts = v.split('/')
                    inputs_raw = recipe_parts[0].split(' ')
                    inputs = [{'item': inputs_raw[i], 'qty': int(inputs_raw[i+1])} 
                              for i in range(0, len(inputs_raw)-1, 2)]
                    output_qty = int(recipe_parts[1]) if len(recipe_parts) > 1 and recipe_parts[1].isdigit() else 1
                    machine = recipe_parts[2] if len(recipe_parts) > 2 else ''
                    recipes.append({
                        'name': k,
                        'machine': machine,
                        'inputs': inputs,
                        'output': {'item': k, 'qty': output_qty},
                        'time': 1600,
                        'subcategory': machine
                    })

final_db = {'items': items, 'recipes': recipes}

if args.dry_run:
    print(json.dumps(final_db, ensure_ascii=False, indent=2))
else:
    if OUTPUT_DB.exists():
        shutil.copy2(OUTPUT_DB, BACKUP_DB)
        print(f'[备份] 旧数据库已备份到 {BACKUP_DB}')
    with OUTPUT_DB.open('w', encoding='utf-8') as f:
        json.dump(final_db, f, ensure_ascii=False, indent=2)
    print(f'[完成] 数据库已生成 {OUTPUT_DB}，共 {len(items)} items, {len(recipes)} recipes')
