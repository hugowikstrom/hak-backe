# Logotypen

`HAK-alpina.png` är klubbens egen logotyp, hämtad från
harnosandsalpina.se (2026-10-27). Den är originalet – allt annat är
härlett ur den.

`vektorisera.py` spårar en enfärgad PNG till SVG-banor. Logotypen är en
platt silhuett, så konturerna går att följa exakt: resultatet blir skarpt i
alla storlekar och går att färga om efter temat, vilket en PNG inte gör.

Så här gjordes märket i `web/delad/marke.jsx`:

```bash
# Skölden och ordmärket var för sig, tätt beskurna.
magick HAK-alpina.png -crop 158x190+28+0 +repage -trim +repage skold.png
magick HAK-alpina.png -crop 380x206+196+0 +repage -trim +repage ordmarke.png

# Spåra. Första talet är översampling, andra är hur hårt banan förenklas.
python3 vektorisera.py skold.png 2 0.45
python3 vektorisera.py ordmarke.png 2 0.45
```

Banorna klistras in i `SKOLD.bana` och `ORDMARKE.bana`. Kontrollera alltid
resultatet mot originalet innan du byter – `magick compare -metric RMSE`
ska ligga under några procent.

Appikonerna byggs ur samma banor, inte ur PNG:en:

```bash
magick -background none ikon.svg -resize 512x512 web/mobil/public/ikon-512.png
```

Får klubben fram vektorfilen från Alltid Marknadsbyrå är den att föredra
framför spårningen. Byt då banorna i `marke.jsx` och lämna resten orört.
