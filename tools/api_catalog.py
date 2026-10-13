#!/usr/bin/env python3
"""Каталог API Kendr: збирає ендпоінти з backend/routes/*.js та backend/server.js
і рахує прямі SQL-виклики в backend/controllers/*.js.

Лише стандартна бібліотека Python 3.8+. Код проєкту не виконується, файли лише читаються.

Використання (з кореня репозиторію):
    python tools/api_catalog.py                       # Markdown у stdout
    python tools/api_catalog.py --out docs/01-reverse-engineering/api-catalog.md
    python tools/api_catalog.py --json                # лише підсумкові числа (для таблиці метрик)
"""
import argparse
import json
import re
import sys
from pathlib import Path

METHODS = ("get", "post", "put", "delete", "patch")
SQL_CALL = re.compile(r"\b(?:db|pool|connection|conn)\.(?:query|execute)\(")
MODEL_REQUIRE = re.compile(r"require\(\s*['\"]\.\./models/")
SERVICE_REQUIRE = re.compile(r"require\(\s*['\"]\.\./services/")
SQL_ANY = re.compile(r"\.(?:query|execute)\(")
LAYERS = ("controllers", "services", "repositories", "models", "middleware", "utils", "config")


def strip_comments(src):
    out, i, n, q = [], 0, len(src), None
    while i < n:
        c = src[i]
        if q:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(src[i + 1]); i += 2; continue
            if c == q:
                q = None
        elif c in "'\"`":
            q = c; out.append(c)
        elif src.startswith("//", i):
            while i < n and src[i] != "\n":
                i += 1
            continue
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        else:
            out.append(c)
        i += 1
    return "".join(out)


def split_args(text):
    """Розбиває список аргументів виклику за комами верхнього рівня."""
    args, depth, cur, q = [], 0, [], None
    i = 0
    while i < len(text):
        c = text[i]
        if q:
            cur.append(c)
            if c == "\\" and i + 1 < len(text):
                cur.append(text[i + 1]); i += 2; continue
            if c == q:
                q = None
        elif c in "'\"`":
            q = c; cur.append(c)
        elif c in "([{":
            depth += 1; cur.append(c)
        elif c in ")]}":
            depth -= 1; cur.append(c)
        elif c == "," and depth == 0:
            args.append("".join(cur).strip()); cur = []
        else:
            cur.append(c)
        i += 1
    tail = "".join(cur).strip()
    if tail:
        args.append(tail)
    return args


def call_body(src, start):
    """Повертає текст між дужками виклику, відкриваюча дужка — на позиції start."""
    depth, q, i = 0, None, start
    while i < len(src):
        c = src[i]
        if q:
            if c == "\\":
                i += 2; continue
            if c == q:
                q = None
        elif c in "'\"`":
            q = c
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return src[start + 1:i]
        i += 1
    raise ValueError("незбалансовані дужки")


def mw_names(arg):
    """Імена middleware з аргументу (одиночний вираз або масив)."""
    return [m.group(0) for m in re.finditer(r"[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\([^()]*\))?", arg)
            if not m.group(0).startswith(("function", "async", "req", "res", "next"))]


def mount_file(be):
    app_js = be / "app.js"
    return app_js if app_js.exists() else be / "server.js"


def parse_server(server_js):
    src = strip_comments(server_js.read_text(encoding="utf-8"))
    requires = {m.group(1): m.group(2) for m in
                re.finditer(r"const\s+(\w+)\s*=\s*require\(\s*['\"]\./routes/([\w]+)['\"]\s*\)", src)}
    mounts = {}
    for m in re.finditer(r"app\.use\(", src):
        a = split_args(call_body(src, m.end() - 1))
        if len(a) >= 2 and a[0][:1] in "'\"" and a[-1] in requires:
            mounts[requires[a[-1]]] = (a[0].strip("'\""), [x for arg in a[1:-1] for x in mw_names(arg)])
    return mounts


def classify(mws):
    s = set(mws)
    if "verifyStrictAdmin" in s:
        return "strict-admin"
    if "verifyAdmin" in s:
        return "admin"
    if "verifyToken" in s:
        return "token"
    return "public"


ACCESS_LABEL = {"public": "public", "token": "token", "admin": "admin / moderator", "strict-admin": "лише головний admin"}


def parse_routes(routes_dir, mounts):
    result = []
    for f in sorted(routes_dir.glob("*.js")):
        src = strip_comments(f.read_text(encoding="utf-8"))
        prefix, mount_mws = mounts.get(f.stem, (None, []))
        events = []
        for m in re.finditer(r"\brouter\.(use|get|post|put|delete|patch)\(", src):
            events.append((m.start(), m.group(1), split_args(call_body(src, m.end() - 1))))
        use_mws = []
        for _, kind, args in events:
            if kind == "use":
                use_mws += [x for a in args for x in mw_names(a)]
                continue
            path = args[0].strip("'\"`")
            *mid, handler = args[1:]
            route_mws = [x for a in mid for x in mw_names(a)]
            eff = mount_mws + use_mws + route_mws
            result.append({
                "file": f.name, "prefix": prefix, "mounted": prefix is not None, "method": kind.upper(),
                "path": (prefix or "") + ("" if path == "/" and prefix else path),
                "access": classify(eff),
                "middleware": [x for x in mount_mws + use_mws + route_mws if x not in ("verifyTokenOptional",)],
                "handler": re.sub(r"\s+", " ", handler),
            })
    return result


def parse_controllers(ctrl_dir):
    rows = []
    for f in sorted(ctrl_dir.glob("*.js")):
        src = strip_comments(f.read_text(encoding="utf-8"))
        rows.append({"controller": f.stem, "sql": len(SQL_CALL.findall(src)),
                     "model": bool(MODEL_REQUIRE.search(src)),
                     "service": bool(SERVICE_REQUIRE.search(src))})
    return rows


def layer_stats(be):
    sql, files = {}, {}
    for layer in LAYERS:
        d = be / layer
        found = sorted(d.glob("*.js")) if d.exists() else []
        files[layer] = len(found)
        sql[layer] = sum(len(SQL_ANY.findall(strip_comments(f.read_text(encoding="utf-8")))) for f in found)
    return files, sql


def summary(eps, ctrls, layers=None):
    acc = {k: sum(1 for e in eps if e["access"] == k) for k in ACCESS_LABEL}
    files = sorted({e["file"] for e in eps})
    with_sql = [c for c in ctrls if c["sql"] > 0]
    return {
        "endpoints": len(eps), "route_files": len(files),
        "mounted": sum(1 for e in eps if e["mounted"]),
        "unmounted": sum(1 for e in eps if not e["mounted"]),
        "access": acc,
        "controllers": len(ctrls), "controllers_with_sql": len(with_sql),
        "sql_calls": sum(c["sql"] for c in ctrls),
        "controllers_without_model": [c["controller"] for c in ctrls if not c["model"]],
        "controllers_using_services": sum(1 for c in ctrls if c["service"]),
        "layer_files": layers[0] if layers else {},
        "layer_sql_calls": layers[1] if layers else {},
    }


def render(eps, ctrls, s):
    L = []
    L.append("# Каталог API (v0)\n")
    L.append("Згенеровано скриптом [`tools/api_catalog.py`](../../tools/api_catalog.py) із `backend/routes/*.js` та `backend/server.js`; "
             "код не виконується, файли лише читаються. Заміри на інших тегах роблять тим самим скриптом.\n")
    L.append("Колонка «Доступ» визначена за middleware у маршрутах (`verifyToken`, `verifyAdmin`, `verifyStrictAdmin`) і за middleware, "
             "підключеним у `server.js` або через `router.use`. Перевірки всередині контролерів (власник сайту, права співавтора) не враховано. "
             "Глобальні `verifyTokenOptional` і `checkMaintenance` застосовуються до всіх маршрутів і в колонці middleware не показані. "
             "Кореневий `GET /` у `server.js` до каталогу не входить.\n")
    L.append("## Підсумок\n")
    L.append("| Показник | Значення |\n|---|---|")
    L.append(f"| Ендпоінтів усього | {s['endpoints']} ({s['mounted']} підключено в `server.js`, {s['unmounted']} у непідключеному файлі) |")
    L.append(f"| Файлів маршрутів | {s['route_files']} |")
    for k, label in ACCESS_LABEL.items():
        L.append(f"| Доступ: {label} | {s['access'][k]} |")
    L.append(f"| Контролерів | {s['controllers']} |")
    L.append(f"| Контролерів із прямими SQL-запитами | {s['controllers_with_sql']} з {s['controllers']} |")
    L.append(f"| Прямих SQL-викликів у контролерах | {s['sql_calls']} |")
    wm = ", ".join(f"`{c.replace('Controller', '')}`" for c in s["controllers_without_model"])
    L.append(f"| Контролерів без жодної моделі | {len(s['controllers_without_model'])} ({wm}) |\n")
    L.append("## Файли маршрутів\n")
    L.append("| Файл | Префікс | Ендпоінтів | public | token | admin / moderator | лише головний admin |\n|---|---|---|---|---|---|---|")
    for fn in sorted({e["file"] for e in eps}):
        sub = [e for e in eps if e["file"] == fn]
        prefix = sub[0]["prefix"] or "не підключено"
        cnt = [sum(1 for e in sub if e["access"] == k) for k in ACCESS_LABEL]
        L.append(f"| `{fn}` | `{prefix}` | {len(sub)} | " + " | ".join(map(str, cnt)) + " |")
    L.append("\n## Ендпоінти\n")
    for fn in sorted({e["file"] for e in eps}):
        sub = [e for e in eps if e["file"] == fn]
        L.append(f"### `{fn}`" + ("" if sub[0]["mounted"] else " (не підключено в `server.js`)") + "\n")
        L.append("| Метод | Шлях | Доступ | Middleware | Обробник |\n|---|---|---|---|---|")
        for e in sub:
            mw = ", ".join(f"`{x}`" for x in e["middleware"]) or "—"
            L.append(f"| {e['method']} | `{e['path']}` | {ACCESS_LABEL[e['access']]} | {mw} | `{e['handler']}` |")
        L.append("")
    L.append("## Контролери й прямий SQL\n")
    L.append("Лічильник: виклики `db.query(` та `connection.query(` у `backend/controllers/*.js`. «Модель» — чи підключає контролер хоча б один файл із `models/`.\n")
    L.append("| Контролер | SQL-викликів | Модель |\n|---|---|---|")
    for c in sorted(ctrls, key=lambda c: (-c["sql"], c["controller"])):
        L.append(f"| `{c['controller']}` | {c['sql']} | {'так' if c['model'] else 'ні'} |")
    return "\n".join(L).replace("\n\n\n", "\n\n") + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".", help="корінь репозиторію (де лежить backend/)")
    ap.add_argument("--out", help="файл для Markdown (за замовчуванням stdout)")
    ap.add_argument("--json", action="store_true", help="вивести лише підсумкові числа у JSON")
    a = ap.parse_args()
    be = Path(a.root) / "backend"
    mounts = parse_server(mount_file(be))
    eps = parse_routes(be / "routes", mounts)
    ctrls = parse_controllers(be / "controllers")
    s = summary(eps, ctrls, layer_stats(be))
    if a.json:
        print(json.dumps(s, ensure_ascii=False, indent=2)); return
    md = render(eps, ctrls, s)
    if a.out:
        Path(a.out).write_text(md, encoding="utf-8")
        print(f"Записано {a.out}: {s['endpoints']} ендпоінтів", file=sys.stderr)
    else:
        sys.stdout.write(md)


if __name__ == "__main__":
    main()
