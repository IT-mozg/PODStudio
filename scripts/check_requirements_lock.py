"""Кожен пін із requirements.txt має бути присутній у requirements.lock.

Порівнювати файли цілком не можна: pip freeze на macOS і на Linux дає різні
набори транзитивних пакетів, тож дослівний diff падав би без причини.
"""
import re
import sys


def parse(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        name, _, version = line.partition("==")
        # PEP 503: Flask і flask, pydantic_core і pydantic-core — одне й те саме.
        out[re.sub(r"[-_.]+", "-", name).lower()] = version
    return out


direct = parse("requirements.txt")
locked = parse("requirements.lock")

problems = []
for name, version in direct.items():
    if name not in locked:
        problems.append(f"{name}=={version} є в requirements.txt, але не в lock")
    elif locked[name] != version:
        problems.append(f"{name}: .txt пінує {version}, lock — {locked[name]}")

if problems:
    print("requirements.lock розсинхронізований з requirements.txt:")
    for p in problems:
        print("  -", p)
    print("\nПерегенеруй його командами з шапки requirements.lock.")
    sys.exit(1)

print(f"lock у синхроні: {len(direct)} прямих залежностей, {len(locked)} всього")
