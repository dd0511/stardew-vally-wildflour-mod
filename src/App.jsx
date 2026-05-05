import React, { useEffect, useMemo, useState } from "react";
import { Search, Factory, Package, GitBranch, Coins, Clock, Upload, Download, Plus, Trash2, Database, AlertCircle } from "lucide-react";
import savedDb from "./data/wildflour-db.json";

const STORAGE_KEY = "wildflour_profit_planner_db_v1";

const starterDb = {
  items: [
    { id: "wheat", name: "Wheat", zh: "小麦", category: "作物", basePrice: 25, tags: ["grain", "crop"] },
    { id: "sugar", name: "Sugar", zh: "糖", category: "原料", basePrice: 50, tags: ["sweetener"] },
    { id: "milk", name: "Milk", zh: "牛奶", category: "动物产品", basePrice: 125, tags: ["milk"] },
    { id: "egg", name: "Egg", zh: "鸡蛋", category: "动物产品", basePrice: 50, tags: ["egg"] },
    { id: "honey", name: "Honey", zh: "蜂蜜", category: "工匠原料", basePrice: 100, tags: ["honey", "sweetener"] },
    { id: "rose", name: "Rose", zh: "玫瑰", category: "花", basePrice: 80, tags: ["flower"] },
    { id: "flour", name: "Flour", zh: "面粉", category: "半成品", basePrice: 100, tags: ["flour"] },
    { id: "cream", name: "Cream", zh: "奶油", category: "半成品", basePrice: 180, tags: ["cream"] },
    { id: "rose_syrup", name: "Rose Syrup", zh: "玫瑰糖浆", category: "半成品", basePrice: 260, tags: ["syrup"] },
    { id: "cake_batter", name: "Cake Batter", zh: "蛋糕糊", category: "半成品", basePrice: 360, tags: ["batter"] },
    { id: "honey_cake", name: "Honey Cake", zh: "蜂蜜蛋糕", category: "成品", basePrice: 720, tags: ["dessert"] },
    { id: "rose_cake", name: "Rose Cake", zh: "玫瑰蛋糕", category: "成品", basePrice: 860, tags: ["dessert"] },
    { id: "perfume", name: "Rose Perfume", zh: "玫瑰香水", category: "成品", basePrice: 980, tags: ["luxury"] }
  ],
  machines: [
    { id: "mill", name: "Mill", zh: "磨坊", defaultMinutes: 60 },
    { id: "creamery", name: "Creamery", zh: "奶油机", defaultMinutes: 90 },
    { id: "syrup_kettle", name: "Syrup Kettle", zh: "糖浆锅", defaultMinutes: 180 },
    { id: "mixer", name: "Mixer", zh: "搅拌机", defaultMinutes: 120 },
    { id: "oven", name: "Oven", zh: "烤箱", defaultMinutes: 240 },
    { id: "distiller", name: "Distiller", zh: "蒸馏器", defaultMinutes: 360 }
  ],
  recipes: [
    {
      id: "r_flour",
      name: "磨小麦粉",
      machineId: "mill",
      inputs: [{ itemId: "wheat", qty: 2 }],
      output: { itemId: "flour", qty: 1 },
      minutes: 60,
      notes: "示例：真实数值请替换为 mod 数据。"
    },
    {
      id: "r_cream",
      name: "制作奶油",
      machineId: "creamery",
      inputs: [{ itemId: "milk", qty: 1 }],
      output: { itemId: "cream", qty: 1 },
      minutes: 90,
      notes: "半成品示例。"
    },
    {
      id: "r_rose_syrup",
      name: "玫瑰糖浆",
      machineId: "syrup_kettle",
      inputs: [
        { itemId: "rose", qty: 1 },
        { itemId: "sugar", qty: 2 }
      ],
      output: { itemId: "rose_syrup", qty: 1 },
      minutes: 180,
      notes: "用于后续高级甜点。"
    },
    {
      id: "r_batter",
      name: "蛋糕糊",
      machineId: "mixer",
      inputs: [
        { itemId: "flour", qty: 1 },
        { itemId: "egg", qty: 1 },
        { itemId: "cream", qty: 1 }
      ],
      output: { itemId: "cake_batter", qty: 1 },
      minutes: 120,
      notes: "典型多阶段链路。"
    },
    {
      id: "r_honey_cake",
      name: "蜂蜜蛋糕",
      machineId: "oven",
      inputs: [
        { itemId: "cake_batter", qty: 1 },
        { itemId: "honey", qty: 1 }
      ],
      output: { itemId: "honey_cake", qty: 1 },
      minutes: 240,
      notes: "成品示例。"
    },
    {
      id: "r_rose_cake",
      name: "玫瑰蛋糕",
      machineId: "oven",
      inputs: [
        { itemId: "cake_batter", qty: 1 },
        { itemId: "rose_syrup", qty: 1 }
      ],
      output: { itemId: "rose_cake", qty: 1 },
      minutes: 300,
      notes: "高级成品示例。"
    },
    {
      id: "r_perfume",
      name: "玫瑰香水",
      machineId: "distiller",
      inputs: [
        { itemId: "rose", qty: 3 },
        { itemId: "honey", qty: 1 }
      ],
      output: { itemId: "perfume", qty: 1 },
      minutes: 360,
      notes: "与甜点争夺玫瑰/蜂蜜时，用利润排序判断优先级。"
    }
  ]
};

function getProjectDefaultDb() {
  if (
    savedDb
    && Array.isArray(savedDb.items)
    && Array.isArray(savedDb.machines)
    && Array.isArray(savedDb.recipes)
  ) {
    return savedDb;
  }
  return starterDb;
}

function loadSavedDb() {
  const projectDefaultDb = getProjectDefaultDb();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return projectDefaultDb;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.machines) || !Array.isArray(parsed.recipes)) return projectDefaultDb;
    return parsed;
  } catch {
    return projectDefaultDb;
  }
}

const emptyItem = { id: "", name: "", zh: "", category: "", basePrice: 0, tags: [] };
const emptyRecipe = {
  id: "",
  name: "",
  machineId: "",
  inputs: [{ itemId: "", qty: 1 }],
  output: { itemId: "", qty: 1 },
  minutes: 60,
  notes: ""
};

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function saveJsonWithPicker(data) {
  const jsonText = JSON.stringify(data, null, 2);

  if (!window.showSaveFilePicker) {
    downloadJson("wildflour-db.json", data);
    return "当前浏览器不支持直接选择保存位置，已改用普通下载。请把下载文件移动到 src/data/wildflour-db.json。";
  }

  const handle = await window.showSaveFilePicker({
    suggestedName: "wildflour-db.json",
    types: [
      {
        description: "JSON 数据库文件",
        accept: { "application/json": [".json"] }
      }
    ]
  });

  const writable = await handle.createWritable();
  await writable.write(jsonText);
  await writable.close();
  return "已保存文件。若你想让项目启动时默认读取它，请确认它保存到了 src/data/wildflour-db.json。";
}

function mergeById(oldList = [], newList = []) {
  const map = new Map();
  oldList.forEach((item) => item?.id && map.set(item.id, item));
  newList.forEach((item) => item?.id && map.set(item.id, { ...map.get(item.id), ...item }));
  return Array.from(map.values());
}

function mergeDb(oldDb, importedDb) {
  return {
    items: mergeById(oldDb.items, importedDb.items),
    machines: mergeById(oldDb.machines, importedDb.machines),
    recipes: mergeById(oldDb.recipes, importedDb.recipes)
  };
}

export default function WildflourProfitPlanner() {
  const [db, setDb] = useState(loadSavedDb);
  const [query, setQuery] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("all");
  const [sortMode, setSortMode] = useState("perHour");
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [selectedItem, setSelectedItem] = useState("rose_cake");
  const [selectedItemGroup, setSelectedItemGroup] = useState("all");
  const [chainQuery, setChainQuery] = useState("");
  const [costMode, setCostMode] = useState("recursive");
  const [inventory, setInventory] = useState({
    wheat: 40,
    sugar: 25,
    milk: 12,
    egg: 20,
    honey: 10,
    rose: 18
  });
  const [draftItem, setDraftItem] = useState(emptyItem);
  const [draftRecipe, setDraftRecipe] = useState(emptyRecipe);
  const [activeTab, setActiveTab] = useState("optimizer");
  const [importError, setImportError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (err) {
      console.warn("保存数据库到浏览器本地失败", err);
    }
  }, [db]);

  const itemMap = useMemo(() => Object.fromEntries(db.items.map((it) => [it.id, it])), [db.items]);
  const machineMap = useMemo(() => Object.fromEntries(db.machines.map((m) => [m.id, m])), [db.machines]);
  const recipesByOutput = useMemo(() => {
    const map = {};
    db.recipes.forEach((r) => {
      const id = r.output?.itemId;
      if (!id) return;
      map[id] = map[id] || [];
      map[id].push(r);
    });
    return map;
  }, [db.recipes]);

  const labelItem = (id) => {
    const it = itemMap[id];
    if (!it) return id || "未选择";
    return `${it.zh || it.name} / ${it.name || it.zh}`;
  };

  const labelMachine = (id) => {
    const m = machineMap[id];
    if (!m) return id || "未选择机器";
    return `${m.zh || m.name} / ${m.name || m.zh}`;
  };

  const baseValue = (itemId) => itemMap[itemId]?.basePrice || 0;

  const getItemGroup = (item) => {
    if (!item) return { id: "other", label: "其他 / Other" };
    const text = [
      item.id,
      item.name,
      item.zh,
      item.category,
      ...(Array.isArray(item.tags) ? item.tags : [])
    ].join(" ").toLowerCase();

    if (text.includes("smoothie") || text.includes("冰沙") || text.includes("果昔")) {
      return { id: "smoothie", label: "冰沙 / Smoothie" };
    }
    if (text.includes("milkshake") || text.includes("奶昔")) {
      return { id: "milkshake", label: "奶昔 / Milkshake" };
    }
    if (text.includes("ice cream") || text.includes("冰淇淋") || text.includes("冰 cream")) {
      return { id: "ice_cream", label: "冰淇淋 / Ice Cream" };
    }
    if (
      text.includes("basic material")
      || text.includes("ingredient")
      || text.includes("material")
      || text.includes("原料")
      || text.includes("基础材料")
      || text.includes("作物")
      || text.includes("动物产品")
    ) {
      return { id: "basic_material", label: "基础材料 / Basic Material" };
    }
    if (text.includes("半成品") || text.includes("semi") || text.includes("intermediate")) {
      return { id: "semi_product", label: "半成品 / Semi Product" };
    }
    if (text.includes("product") || text.includes("成品") || text.includes("dessert") || text.includes("luxury")) {
      return { id: "finished_product", label: "成品 / Finished Product" };
    }
    return { id: "other", label: "其他 / Other" };
  };

  const groupedItems = useMemo(() => {
    const groups = new Map();
    db.items.forEach((item) => {
      const group = getItemGroup(item);
      if (!groups.has(group.id)) groups.set(group.id, { ...group, items: [] });
      groups.get(group.id).items.push(item);
    });
    return Array.from(groups.values()).map((group) => ({
      ...group,
      items: group.items.sort((a, b) => (a.zh || a.name || a.id).localeCompare(b.zh || b.name || b.id))
    }));
  }, [db.items]);

  const chainSelectableItems = useMemo(() => {
    return db.items
      .filter((item) => selectedItemGroup === "all" || getItemGroup(item).id === selectedItemGroup)
      .filter((item) => {
        const text = [item.id, item.name, item.zh, item.category, ...(Array.isArray(item.tags) ? item.tags : [])]
          .join(" ")
          .toLowerCase();
        return text.includes(chainQuery.toLowerCase());
      })
      .sort((a, b) => (a.zh || a.name || a.id).localeCompare(b.zh || b.name || b.id));
  }, [db.items, selectedItemGroup, chainQuery]);

  const cheapestCost = (itemId, stack = new Set()) => {
    const base = baseValue(itemId);
    if (stack.has(itemId)) return base;
    const related = recipesByOutput[itemId] || [];
    if (related.length === 0) return base;
    const nextStack = new Set(stack);
    nextStack.add(itemId);
    const recipeCosts = related.map((recipe) => {
      const totalInput = recipe.inputs.reduce((sum, input) => sum + input.qty * cheapestCost(input.itemId, nextStack), 0);
      const qty = recipe.output?.qty || 1;
      return totalInput / qty;
    });
    return Math.min(base || Infinity, ...recipeCosts.filter(Number.isFinite));
  };

  const recipeCost = (recipe) => {
    return recipe.inputs.reduce((sum, input) => {
      const unit = costMode === "recursive" ? cheapestCost(input.itemId) : baseValue(input.itemId);
      return sum + unit * input.qty;
    }, 0);
  };

  const outputValue = (recipe) => {
    const unit = baseValue(recipe.output.itemId);
    return unit * (recipe.output.qty || 1);
  };

  const rawDependencyNeed = (itemId, qty = 1, stack = new Set()) => {
    const recipes = recipesByOutput[itemId] || [];
    if (recipes.length === 0 || stack.has(itemId)) return { [itemId]: qty };
    const cheapest = recipes
      .map((recipe) => ({ recipe, cost: recipeCost(recipe) / (recipe.output.qty || 1) }))
      .sort((a, b) => a.cost - b.cost)[0]?.recipe;
    if (!cheapest) return { [itemId]: qty };
    const multiplier = qty / (cheapest.output.qty || 1);
    const nextStack = new Set(stack);
    nextStack.add(itemId);
    return cheapest.inputs.reduce((acc, input) => {
      const sub = rawDependencyNeed(input.itemId, input.qty * multiplier, nextStack);
      Object.entries(sub).forEach(([k, v]) => {
        acc[k] = (acc[k] || 0) + v;
      });
      return acc;
    }, {});
  };

  const maxCraftableFromInventory = (recipe) => {
    const rawNeeds = {};
    recipe.inputs.forEach((input) => {
      const sub = costMode === "recursive" ? rawDependencyNeed(input.itemId, input.qty) : { [input.itemId]: input.qty };
      Object.entries(sub).forEach(([k, v]) => {
        rawNeeds[k] = (rawNeeds[k] || 0) + v;
      });
    });
    const entries = Object.entries(rawNeeds).filter(([, qty]) => qty > 0);
    if (entries.length === 0) return { max: 0, rawNeeds };
    const max = Math.floor(Math.min(...entries.map(([id, qty]) => (inventory[id] || 0) / qty)));
    return { max: Number.isFinite(max) ? Math.max(0, max) : 0, rawNeeds };
  };

  const rows = useMemo(() => {
    return db.recipes.map((recipe) => {
      const cost = recipeCost(recipe);
      const value = outputValue(recipe);
      const profit = value - cost;
      const hours = (recipe.minutes || machineMap[recipe.machineId]?.defaultMinutes || 60) / 60;
      const perHour = hours > 0 ? profit / hours : profit;
      const craftable = maxCraftableFromInventory(recipe);
      return { recipe, cost, value, profit, hours, perHour, craftable };
    });
  }, [db, inventory, costMode]);

  const filteredRows = rows
    .filter(({ recipe }) => selectedMachine === "all" || recipe.machineId === selectedMachine)
    .filter(({ recipe }) => {
      const text = [recipe.name, recipe.machineId, recipe.output?.itemId, labelItem(recipe.output?.itemId)]
        .join(" ")
        .toLowerCase();
      return text.includes(query.toLowerCase());
    })
    .filter((row) => !hideUnavailable || row.craftable.max > 0)
    .sort((a, b) => {
      if (sortMode === "stockTotalProfit") return (b.profit * b.craftable.max) - (a.profit * a.craftable.max);
      if (sortMode === "craftable") return b.craftable.max - a.craftable.max;
      if (sortMode === "singleProfit") return b.profit - a.profit;
      return b.perHour - a.perHour;
    });

  const chainLines = useMemo(() => {
    const lines = [];
    const walk = (itemId, depth = 0, qty = 1, stack = new Set()) => {
      const recipes = recipesByOutput[itemId] || [];
      const item = itemMap[itemId];
      if (recipes.length === 0 || stack.has(itemId)) {
        lines.push({ depth, type: "raw", text: `${qty} × ${item?.zh || item?.name || itemId}`, itemId });
        return;
      }
      const best = recipes
        .map((r) => ({ recipe: r, unitCost: recipeCost(r) / (r.output.qty || 1) }))
        .sort((a, b) => a.unitCost - b.unitCost)[0].recipe;
      lines.push({
        depth,
        type: "recipe",
        text: `${qty} × ${item?.zh || item?.name || itemId} ← ${best.name} ｜ ${labelMachine(best.machineId)} ｜ ${best.minutes} 分钟`,
        itemId
      });
      const next = new Set(stack);
      next.add(itemId);
      const multiplier = qty / (best.output.qty || 1);
      best.inputs.forEach((input) => walk(input.itemId, depth + 1, input.qty * multiplier, next));
    };
    if (selectedItem) walk(selectedItem);
    return lines;
  }, [selectedItem, db, costMode]);

  const topByMachine = useMemo(() => {
    return db.machines.map((machine) => {
      const best = rows.filter((r) => r.recipe.machineId === machine.id).sort((a, b) => b.perHour - a.perHour)[0];
      return { machine, best };
    });
  }, [rows, db.machines]);

  const addItem = () => {
    if (!draftItem.id.trim()) return;
    const item = {
      ...draftItem,
      id: draftItem.id.trim(),
      basePrice: numberOrZero(draftItem.basePrice),
      tags: typeof draftItem.tags === "string" ? draftItem.tags.split(",").map((s) => s.trim()).filter(Boolean) : draftItem.tags
    };
    setDb((prev) => ({ ...prev, items: [...prev.items.filter((x) => x.id !== item.id), item] }));
    setDraftItem(emptyItem);
  };

  const addRecipe = () => {
    if (!draftRecipe.id.trim() || !draftRecipe.output.itemId || !draftRecipe.machineId) return;
    const recipe = {
      ...draftRecipe,
      id: draftRecipe.id.trim(),
      minutes: numberOrZero(draftRecipe.minutes),
      inputs: draftRecipe.inputs.filter((i) => i.itemId).map((i) => ({ itemId: i.itemId, qty: numberOrZero(i.qty) || 1 })),
      output: { itemId: draftRecipe.output.itemId, qty: numberOrZero(draftRecipe.output.qty) || 1 }
    };
    setDb((prev) => ({ ...prev, recipes: [...prev.recipes.filter((x) => x.id !== recipe.id), recipe] }));
    setDraftRecipe(emptyRecipe);
  };

  const importJson = async (file, mode = "merge") => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.items) || !Array.isArray(parsed.machines) || !Array.isArray(parsed.recipes)) {
        throw new Error("JSON 需要包含 items、machines、recipes 三个数组。");
      }
      setDb((prev) => mode === "replace" ? parsed : mergeDb(prev, parsed));
      setImportError(mode === "replace" ? "已覆盖导入。" : "已合并导入。相同 ID 的物品、机器或配方会被新文件更新。");
    } catch (err) {
      setImportError(err.message || "导入失败。请检查 JSON 格式。");
    } finally {
      if (file) {
        // 允许连续导入同一个文件名的 JSON。
        const inputs = document.querySelectorAll('input[type="file"]');
        inputs.forEach((input) => { input.value = ""; });
      }
    }
  };

  const stat = {
    items: db.items.length,
    machines: db.machines.length,
    recipes: db.recipes.length,
    best: rows.sort((a, b) => b.perHour - a.perHour)[0]
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                <Database className="h-4 w-4" /> Wildflour 工艺链利润模型原型
              </div>
              <h1 className="text-3xl font-bold tracking-tight">星露谷 Mod 生产链数据库与利润优化器</h1>
              <p className="mt-2 max-w-3xl text-slate-600">
                这个原型用于录入物品、机器和配方，并自动计算净利润、每小时利润、库存可生产数量和上游原料链路。示例数据不是 Wildflour 的真实数值，正式使用时请替换成你的本地 mod 数据。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50">
                <Upload className="h-4 w-4" /> 合并导入 JSON
                <input type="file" accept="application/json" className="hidden" onChange={(e) => importJson(e.target.files?.[0], "merge")} />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-100">
                <Upload className="h-4 w-4" /> 覆盖导入 JSON
                <input type="file" accept="application/json" className="hidden" onChange={(e) => importJson(e.target.files?.[0], "replace")} />
              </label>
              <button
                onClick={() => downloadJson("wildflour-profit-db.json", db)}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
              >
                <Download className="h-4 w-4" /> 下载 JSON
              </button>
              <button
                onClick={async () => {
                  try {
                    const message = await saveJsonWithPicker(db);
                    setImportError(message);
                  } catch (err) {
                    setImportError(err?.name === "AbortError" ? "已取消保存。" : "保存失败，请改用下载 JSON。");
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
              >
                <Download className="h-4 w-4" /> 保存到项目 data 文件
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem(STORAGE_KEY);
                  setDb(getProjectDefaultDb());
                  setImportError("已清除浏览器本地保存，并恢复为项目默认数据库 src/data/wildflour-db.json。若该文件不可用，则恢复为内置示例数据库。");
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 shadow-sm hover:bg-rose-100"
              >
                清除本地保存
              </button>
            </div>
          </div>
          {importError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="h-4 w-4" /> {importError}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatCard icon={<Package />} label="物品" value={stat.items} />
          <StatCard icon={<Factory />} label="机器" value={stat.machines} />
          <StatCard icon={<GitBranch />} label="配方" value={stat.recipes} />
          <StatCard
            icon={<Coins />}
            label="当前最高每小时利润"
            value={stat.best ? `${Math.round(stat.best.perHour)}g/h` : "-"}
            sub={stat.best ? stat.best.recipe.name : "暂无配方"}
          />
        </section>

        <nav className="mt-6 flex flex-wrap gap-2">
          {[
            ["optimizer", "利润优化"],
            ["chain", "工艺链追踪"],
            ["inventory", "库存"],
            ["editor", "录入与编辑"],
            ["schema", "数据模型"]
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cls(
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                activeTab === id ? "bg-slate-900 text-white shadow" : "border bg-white hover:bg-slate-50"
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === "optimizer" && (
          <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">按机器查询最高利润配方</h2>
                  <p className="text-sm text-slate-500">默认按每小时利润排序。递归成本会把半成品拆成上游原料成本。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={costMode}
                    onChange={(e) => setCostMode(e.target.value)}
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                  >
                    <option value="recursive">递归原料成本</option>
                    <option value="base">物品基础价成本</option>
                  </select>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value)}
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                  >
                    <option value="perHour">按每小时利润排序</option>
                    <option value="stockTotalProfit">按当前库存总利润排序</option>
                    <option value="craftable">按库存可做数量排序</option>
                    <option value="singleProfit">按单件净利润排序</option>
                  </select>
                  <select
                    value={selectedMachine}
                    onChange={(e) => setSelectedMachine(e.target.value)}
                    className="rounded-xl border bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">全部机器</option>
                    {db.machines.map((m) => (
                      <option key={m.id} value={m.id}>{m.zh || m.name}</option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hideUnavailable}
                      onChange={(e) => setHideUnavailable(e.target.checked)}
                    />
                    隐藏当前做不了
                  </label>
                </div>
              </div>

              <div className="mb-4 flex items-center gap-2 rounded-xl border px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索物品、配方或机器……"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-3 pr-3">配方</th>
                      <th className="py-3 pr-3">机器</th>
                      <th className="py-3 pr-3">产出</th>
                      <th className="py-3 pr-3 text-right">售价</th>
                      <th className="py-3 pr-3 text-right">成本</th>
                      <th className="py-3 pr-3 text-right">净利润</th>
                      <th className="py-3 pr-3 text-right">每小时</th>
                      <th className="py-3 pr-3 text-right">库存可做</th>
                      <th className="py-3 pr-3 text-right">库存总利润</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(({ recipe, cost, value, profit, perHour, craftable }) => (
                      <tr key={recipe.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-3 pr-3">
                          <button
                            onClick={() => {
                              setSelectedItem(recipe.output.itemId);
                              setActiveTab("chain");
                            }}
                            className="font-medium text-slate-900 hover:underline"
                          >
                            {recipe.name}
                          </button>
                          <div className="mt-1 text-xs text-slate-500">
                            {recipe.inputs.map((i) => `${i.qty}×${itemMap[i.itemId]?.zh || i.itemId}`).join(" + ")}
                          </div>
                        </td>
                        <td className="py-3 pr-3">{labelMachine(recipe.machineId)}</td>
                        <td className="py-3 pr-3">{recipe.output.qty}×{labelItem(recipe.output.itemId)}</td>
                        <td className="py-3 pr-3 text-right">{Math.round(value)}g</td>
                        <td className="py-3 pr-3 text-right">{Math.round(cost)}g</td>
                        <td className={cls("py-3 pr-3 text-right font-semibold", profit >= 0 ? "text-emerald-700" : "text-rose-600")}>{Math.round(profit)}g</td>
                        <td className="py-3 pr-3 text-right font-semibold">{Math.round(perHour)}g/h</td>
                        <td className="py-3 pr-3 text-right">{craftable.max}</td>
                        <td className="py-3 pr-3 text-right font-semibold">{Math.round(profit * craftable.max)}g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <h3 className="mb-3 font-semibold">每台机器当前最佳</h3>
                <div className="space-y-3">
                  {topByMachine.map(({ machine, best }) => (
                    <div key={machine.id} className="rounded-xl border bg-slate-50 p-3">
                      <div className="text-sm font-medium">{machine.zh || machine.name}</div>
                      {best ? (
                        <div className="mt-1 text-sm text-slate-600">
                          {best.recipe.name} · <span className="font-semibold text-emerald-700">{Math.round(best.perHour)}g/h</span>
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-slate-400">暂无配方</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <h3 className="mb-2 font-semibold">计算说明</h3>
                <p className="text-sm leading-6 text-slate-600">
                  单件净利润 = 产出售价 - 输入成本。每小时利润 = 净利润 ÷ 加工小时数。库存可做数量会把半成品递归拆成原始材料，用于判断当前背包资源的瓶颈。现在库存变化会实时影响“库存可做”和“库存总利润”，你也可以切换为按当前库存总利润排序。
                </p>
              </div>
            </aside>
          </section>
        )}

        {activeTab === "chain" && (
          <section className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold">按分类选择物品</h2>
              <p className="mt-1 text-sm text-slate-500">先按 item 类型筛选，再选择要展开的工艺链。分类会根据名称、分类和标签自动判断。</p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedItemGroup("all")}
                  className={cls(
                    "rounded-xl border px-3 py-2 text-left text-sm",
                    selectedItemGroup === "all" ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"
                  )}
                >
                  全部 / All
                  <div className="text-xs opacity-70">{db.items.length} 个物品</div>
                </button>
                {groupedItems.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setSelectedItemGroup(group.id)}
                    className={cls(
                      "rounded-xl border px-3 py-2 text-left text-sm",
                      selectedItemGroup === group.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"
                    )}
                  >
                    {group.label}
                    <div className="text-xs opacity-70">{group.items.length} 个物品</div>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={chainQuery}
                  onChange={(e) => setChainQuery(e.target.value)}
                  placeholder="在当前分类中搜索物品……"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>

              <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
                {chainSelectableItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item.id)}
                    className={cls(
                      "w-full rounded-xl border px-3 py-2 text-left text-sm",
                      selectedItem === item.id ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "bg-white hover:bg-slate-50"
                    )}
                  >
                    <div className="font-medium">{item.zh || item.name || item.id}</div>
                    <div className="text-xs text-slate-500">{item.name || item.id} · {getItemGroup(item).label}</div>
                  </button>
                ))}
                {chainSelectableItems.length === 0 && (
                  <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-500">当前分类下没有匹配物品。</div>
                )}
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                当前物品：<span className="font-semibold">{labelItem(selectedItem)}</span><br />
                当前分类：<span className="font-semibold">{getItemGroup(itemMap[selectedItem]).label}</span><br />
                当前物品基础售价：<span className="font-semibold">{baseValue(selectedItem)}g</span><br />
                当前估算最低成本：<span className="font-semibold">{Math.round(cheapestCost(selectedItem))}g</span>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">工艺链</h2>
              <div className="space-y-2">
                {chainLines.map((line, index) => (
                  <div
                    key={`${line.itemId}-${index}`}
                    className={cls("rounded-xl border px-3 py-2 text-sm", line.type === "recipe" ? "bg-white" : "bg-amber-50")}
                    style={{ marginLeft: `${line.depth * 28}px` }}
                  >
                    <span className={cls("mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", line.type === "recipe" ? "bg-slate-900 text-white" : "bg-amber-200 text-amber-900")}>{line.depth}</span>
                    {line.text}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "inventory" && (
          <section className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="text-xl font-semibold">库存输入</h2>
            <p className="mt-1 text-sm text-slate-500">填写你当前愿意投入生产的原料数量。输入后会自动更新，无需确认按钮；变化会体现在利润优化页的“库存可做”和“库存总利润”列。</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {db.items.map((it) => (
                <label key={it.id} className="rounded-xl border bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-medium">{it.zh || it.name}</div>
                  <input
                    type="number"
                    min="0"
                    value={inventory[it.id] || ""}
                    onChange={(e) => setInventory((prev) => ({ ...prev, [it.id]: numberOrZero(e.target.value) }))}
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {activeTab === "editor" && (
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold">新增 / 覆盖物品</h2>
              <div className="mt-4 grid gap-3">
                <Input label="ID，例如 rose_syrup" value={draftItem.id} onChange={(v) => setDraftItem((p) => ({ ...p, id: v }))} />
                <Input label="英文名" value={draftItem.name} onChange={(v) => setDraftItem((p) => ({ ...p, name: v }))} />
                <Input label="中文名" value={draftItem.zh} onChange={(v) => setDraftItem((p) => ({ ...p, zh: v }))} />
                <Input label="分类" value={draftItem.category} onChange={(v) => setDraftItem((p) => ({ ...p, category: v }))} />
                <Input label="基础售价" type="number" value={draftItem.basePrice} onChange={(v) => setDraftItem((p) => ({ ...p, basePrice: v }))} />
                <Input label="标签，逗号分隔" value={Array.isArray(draftItem.tags) ? draftItem.tags.join(",") : draftItem.tags} onChange={(v) => setDraftItem((p) => ({ ...p, tags: v }))} />
                <button onClick={addItem} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" /> 保存物品
                </button>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold">新增 / 覆盖配方</h2>
              <div className="mt-4 grid gap-3">
                <Input label="配方 ID，例如 r_rose_cake" value={draftRecipe.id} onChange={(v) => setDraftRecipe((p) => ({ ...p, id: v }))} />
                <Input label="配方名称" value={draftRecipe.name} onChange={(v) => setDraftRecipe((p) => ({ ...p, name: v }))} />
                <Select label="机器" value={draftRecipe.machineId} onChange={(v) => setDraftRecipe((p) => ({ ...p, machineId: v }))} options={db.machines.map((m) => [m.id, m.zh || m.name])} />
                <Input label="加工分钟数" type="number" value={draftRecipe.minutes} onChange={(v) => setDraftRecipe((p) => ({ ...p, minutes: v }))} />

                <div className="rounded-xl border p-3">
                  <div className="mb-2 text-sm font-medium">输入材料</div>
                  {draftRecipe.inputs.map((input, idx) => (
                    <div key={idx} className="mb-2 grid grid-cols-[1fr_90px_36px] gap-2">
                      <select
                        value={input.itemId}
                        onChange={(e) => setDraftRecipe((p) => ({ ...p, inputs: p.inputs.map((x, i) => i === idx ? { ...x, itemId: e.target.value } : x) }))}
                        className="rounded-lg border bg-white px-2 py-2 text-sm"
                      >
                        <option value="">选择物品</option>
                        {db.items.map((it) => <option key={it.id} value={it.id}>{it.zh || it.name}</option>)}
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={input.qty}
                        onChange={(e) => setDraftRecipe((p) => ({ ...p, inputs: p.inputs.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x) }))}
                        className="rounded-lg border bg-white px-2 py-2 text-sm"
                      />
                      <button
                        onClick={() => setDraftRecipe((p) => ({ ...p, inputs: p.inputs.filter((_, i) => i !== idx) }))}
                        className="rounded-lg border bg-white p-2 hover:bg-slate-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setDraftRecipe((p) => ({ ...p, inputs: [...p.inputs, { itemId: "", qty: 1 }] }))}
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    添加输入材料
                  </button>
                </div>

                <div className="grid grid-cols-[1fr_100px] gap-2">
                  <Select label="产出物品" value={draftRecipe.output.itemId} onChange={(v) => setDraftRecipe((p) => ({ ...p, output: { ...p.output, itemId: v } }))} options={db.items.map((it) => [it.id, it.zh || it.name])} />
                  <Input label="数量" type="number" value={draftRecipe.output.qty} onChange={(v) => setDraftRecipe((p) => ({ ...p, output: { ...p.output, qty: v } }))} />
                </div>

                <Input label="备注" value={draftRecipe.notes} onChange={(v) => setDraftRecipe((p) => ({ ...p, notes: v }))} />
                <button onClick={addRecipe} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" /> 保存配方
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "schema" && (
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold">推荐 JSON 结构</h2>
              <pre className="mt-4 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{`{
  "items": [
    {
      "id": "rose_syrup",
      "name": "Rose Syrup",
      "zh": "玫瑰糖浆",
      "category": "半成品",
      "basePrice": 260,
      "tags": ["syrup"]
    }
  ],
  "machines": [
    {
      "id": "syrup_kettle",
      "name": "Syrup Kettle",
      "zh": "糖浆锅",
      "defaultMinutes": 180
    }
  ],
  "recipes": [
    {
      "id": "r_rose_syrup",
      "name": "玫瑰糖浆",
      "machineId": "syrup_kettle",
      "inputs": [
        { "itemId": "rose", "qty": 1 },
        { "itemId": "sugar", "qty": 2 }
      ],
      "output": { "itemId": "rose_syrup", "qty": 1 },
      "minutes": 180,
      "notes": "可选备注"
    }
  ]
}`}</pre>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold">下一步扩展点</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                <p><span className="font-semibold text-slate-900">1. 标签配方：</span>把 itemId 扩展为 tag，例如任意 flower、fruit、honey。</p>
                <p><span className="font-semibold text-slate-900">2. 动态售价公式：</span>支持 price = inputPrice × multiplier + fixedBonus。</p>
                <p><span className="font-semibold text-slate-900">3. 配置开关：</span>为 Simple / Advanced 难度、启用模块、跨 mod 兼容添加条件字段。</p>
                <p><span className="font-semibold text-slate-900">4. 多机器排程：</span>输入每种机器数量，计算一天内最优生产组合。</p>
                <p><span className="font-semibold text-slate-900">5. 本地导入器：</span>从 mod 文件解析 JSON / Content Patcher patch，自动生成 items 与 recipes。</p>
                <p><span className="font-semibold text-slate-900">6. 持久化保存：</span>当前版本会优先读取浏览器 localStorage；如果没有本地保存，则读取 src/data/wildflour-db.json 作为项目默认数据库；如果该文件无效，则回退到内置示例数据库。</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        {React.cloneElement(icon, { className: "h-5 w-5" })}
      </div>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
      >
        <option value="">请选择</option>
        {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
  );
}
