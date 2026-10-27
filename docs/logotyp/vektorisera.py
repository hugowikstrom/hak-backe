"""Spårar en enfärgad PNG till SVG-banor.

Logotypen är en platt silhuett: varje pixel är antingen med eller inte.
Då går konturerna att följa exakt, och resultatet blir skarpt i alla
storlekar och går att färga om efter temat – till skillnad från en PNG.
"""
import sys
from PIL import Image

TROSKEL = 128


def mask(bild, skala):
    im = Image.open(bild).convert('RGBA')
    if skala != 1:
        im = im.resize((im.width * skala, im.height * skala), Image.LANCZOS)
    a = im.getchannel('A').load()
    b, h = im.size
    return [[1 if a[x, y] >= TROSKEL else 0 for x in range(b)] for y in range(h)], b, h


def konturer(m, b, h):
    """Följer kanterna mellan fylld och tom med marching squares."""
    inne = lambda x, y: 0 <= x < b and 0 <= y < h and m[y][x]
    kanter = {}
    for y in range(h + 1):
        for x in range(b + 1):
            # Fyra hörn runt punkten (x, y) i pixelrutnätet.
            nv, no = inne(x - 1, y - 1), inne(x, y - 1)
            sv, so = inne(x - 1, y), inne(x, y)
            # Kanten går medurs runt det fyllda området.
            if no and not nv: kanter.setdefault((x, y), []).append((x, y - 1))
            if so and not no: kanter.setdefault((x, y), []).append((x + 1, y))
            if sv and not so: kanter.setdefault((x, y), []).append((x, y + 1))
            if nv and not sv: kanter.setdefault((x, y), []).append((x - 1, y))

    banor = []
    while kanter:
        start = next(iter(kanter))
        bana, p = [start], start
        while True:
            nasta = kanter.get(p)
            if not nasta:
                break
            q = nasta.pop()
            if not nasta:
                del kanter[p]
            bana.append(q)
            p = q
            if p == start:
                break
        if len(bana) > 8:
            banor.append(bana)
    return banor


def forenkla(punkter, tolerans):
    """Douglas–Peucker: behåll formen, kasta punkterna som inte bär den."""
    if len(punkter) < 3:
        return punkter
    (x1, y1), (x2, y2) = punkter[0], punkter[-1]
    dx, dy = x2 - x1, y2 - y1
    langd = (dx * dx + dy * dy) ** 0.5 or 1
    varst, index = 0, 0
    for i, (x, y) in enumerate(punkter[1:-1], 1):
        avst = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / langd
        if avst > varst:
            varst, index = avst, i
    if varst <= tolerans:
        return [punkter[0], punkter[-1]]
    return forenkla(punkter[:index + 1], tolerans)[:-1] + forenkla(punkter[index:], tolerans)


def forenkla_sluten(punkter, tolerans):
    """Douglas–Peucker på en sluten kurva.

    En sluten bana börjar och slutar i samma punkt, och då går det inte att
    mäta avstånd mot linjen mellan ändarna – den har ingen längd. Dela
    därför först vid den punkt som ligger längst från starten.
    """
    if len(punkter) < 4:
        return punkter
    p0 = punkter[0]
    langst = max(range(len(punkter)), key=lambda i: (punkter[i][0] - p0[0]) ** 2 + (punkter[i][1] - p0[1]) ** 2)
    forsta = forenkla(punkter[:langst + 1], tolerans)
    andra = forenkla(punkter[langst:], tolerans)
    return forsta[:-1] + andra


def svgbana(banor, skala, tolerans):
    delar = []
    for b in banor:
        p = forenkla_sluten(b, tolerans * skala)
        if len(p) < 3:
            continue
        d = f'M{p[0][0] / skala:.1f} {p[0][1] / skala:.1f}'
        for x, y in p[1:]:
            d += f'L{x / skala:.1f} {y / skala:.1f}'
        delar.append(d + 'Z')
    return ''.join(delar)


if __name__ == '__main__':
    kalla, skala, tolerans = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
    m, b, h = mask(kalla, skala)
    banor = konturer(m, b, h)
    banor.sort(key=len, reverse=True)
    d = svgbana(banor, skala, tolerans)
    print(f'<!-- {b // skala}x{h // skala}, {len(banor)} banor, {len(d)} tecken -->')
    print(d)
